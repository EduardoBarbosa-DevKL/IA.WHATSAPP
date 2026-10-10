// lib/queue.ts
// Responsabilidades deste arquivo (Parte A): entrar na fila, notificar o
// próximo cliente, confirmar/expirar notificações e reconhecer respostas
// de confirmação vindas do WhatsApp.
//
// A lógica de "achar o próximo cliente compatível" é Parte B — este arquivo
// só CONSOME findNextCompatibleEntry de ./queue-matching.ts, sem implementar
// nada dessa parte.

import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { findNextCompatibleEntry } from "@/lib/queue-matching";
import type { QueueEntry, QueueStatus } from "@prisma/client";

const ACTIVE_STATUSES: QueueStatus[] = ["WAITING", "NOTIFIED", "CONFIRMED"];

type EnterQueueParams = {
  establishmentId: string;
  customerPhone: string;
  customerName?: string;
  serviceId?: string;
};

/**
 * Adiciona um cliente à fila de um estabelecimento. Se o cliente já tiver
 * uma entrada ativa (esperando, notificado ou confirmado), não duplica —
 * retorna a entrada existente e avisa a posição atual dela.
 */
export async function enterQueue(params: EnterQueueParams): Promise<QueueEntry> {
  const { establishmentId, customerPhone, customerName, serviceId } = params;

  const establishment = await prisma.establishment.findUniqueOrThrow({
    where: { id: establishmentId },
  });

  const existing = await prisma.queueEntry.findFirst({
    where: {
      establishmentId,
      customerPhone,
      status: { in: ACTIVE_STATUSES },
    },
  });

  if (existing) {
    const position = await getPosition(existing);
    try {
      await sendWhatsAppMessage(
        establishment.whatsappPhoneId,
        customerPhone,
        `Você já está na fila! Sua posição atual é ${position}.`
      );
    } catch (err) {
      // A entrada na fila já existe e já foi encontrada — não deixamos uma
      // falha de envio (token expirado, rede, restrição da Meta) impedir
      // o retorno normal da função.
      console.error(`Falha ao enviar mensagem de "já está na fila" para ${customerPhone}:`, err);
    }
    return existing;
  }

  const entry = await prisma.queueEntry.create({
    data: {
      establishmentId,
      customerPhone,
      customerName,
      serviceId,
      status: "WAITING",
    },
  });

  const position = await getPosition(entry);
  try {
    await sendWhatsAppMessage(
      establishment.whatsappPhoneId,
      customerPhone,
      `Você entrou na fila! Sua posição é ${position}. Avisaremos por aqui quando chegar sua vez.`
    );
  } catch (err) {
    // O registro já foi criado no banco — uma falha só no envio da
    // confirmação não deve derrubar o fluxo de quem chamou enterQueue
    // (ex: o webhook, que processa várias mensagens em sequência).
    console.error(`Falha ao enviar mensagem de confirmação de entrada para ${customerPhone}:`, err);
  }

  return entry;
}

/**
 * Posição (1-indexed) de uma entrada dentro da fila de espera do seu
 * estabelecimento, contando só quem está WAITING antes dela.
 */
export async function getPosition(entry: QueueEntry): Promise<number> {
  if (entry.status !== "WAITING") return 0;

  const countBefore = await prisma.queueEntry.count({
    where: {
      establishmentId: entry.establishmentId,
      status: "WAITING",
      createdAt: { lt: entry.createdAt },
    },
  });

  return countBefore + 1;
}

/**
 * Chama o próximo cliente da fila, se ainda não houver ninguém NOTIFIED
 * aguardando confirmação (evita chamar dois clientes ao mesmo tempo).
 * Usa Establishment.notifyWindowMins como prazo de expiração.
 *
 * Quem decide QUEM é o próximo é a Parte B (findNextCompatibleEntry) —
 * este arquivo só orquestra notificação e expiração em cima do resultado.
 */
export async function notifyNext(establishmentId: string): Promise<QueueEntry | null> {
  const alreadyNotified = await prisma.queueEntry.findFirst({
    where: { establishmentId, status: "NOTIFIED" },
  });
  if (alreadyNotified) return null;

  const next = await findNextCompatibleEntry(establishmentId);
  if (!next) return null;

  const establishment = await prisma.establishment.findUniqueOrThrow({
    where: { id: establishmentId },
  });

  const notifiedAt = new Date();
  const notifyExpiresAt = new Date(notifiedAt.getTime() + establishment.notifyWindowMins * 60_000);

  const updated = await prisma.queueEntry.update({
    where: { id: next.id },
    data: { status: "NOTIFIED", notifiedAt, notifyExpiresAt },
  });

  try {
    await sendWhatsAppMessage(
      establishment.whatsappPhoneId,
      updated.customerPhone,
      `Chegou sua vez! Você tem ${establishment.notifyWindowMins} minutos para confirmar, ou perderá a vez.`
    );
  } catch (err) {
    // O status já mudou pra NOTIFIED no banco antes disso — mesmo que o
    // envio da mensagem falhe (token expirado, rede, restrição da Meta),
    // não queremos que isso derrube quem chamou notifyNext (ex: um loop
    // de expireStaleNotifications processando vários clientes).
    console.error(`Falha ao enviar notificação WhatsApp para ${updated.customerPhone}:`, err);
  }

  return updated;
}

/**
 * Expira quem foi notificado e não confirmou dentro do prazo, e já chama o
 * próximo em seguida. Pensado para ser chamado periodicamente (Vercel Cron).
 * Sem establishmentId, roda para todos os estabelecimentos de uma vez.
 */
export async function expireStaleNotifications(establishmentId?: string): Promise<number> {
  const now = new Date();

  const stale = await prisma.queueEntry.findMany({
    where: {
      status: "NOTIFIED",
      notifyExpiresAt: { lt: now },
      ...(establishmentId ? { establishmentId } : {}),
    },
  });

  for (const entry of stale) {
    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: "EXPIRED", respondedAt: now },
    });

    // Libera vaga pro próximo dessa mesma fila.
    await notifyNext(entry.establishmentId);
  }

  return stale.length;
}

// ---------------------------------------------------------------------
// Confirmação de horário via resposta no WhatsApp
// ---------------------------------------------------------------------

const CONFIRMATION_WORDS = new Set([
  "sim", "s", "ss", "confirmo", "confirma", "confirmar",
  "quero", "aceito", "ok", "okay", "blz", "beleza",
  "claro", "positivo", "concordo", "yes", "y", "1",
]);

/**
 * Normaliza um texto recebido do cliente para comparar com palavras de
 * confirmação: sem acento, minúsculo, sem espaço/pontuação nas pontas.
 * Ex: "Sim!!" , " SIM ", "Sim." -> "sim"
 */
export function normalizeConfirmationText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .trim()
    .replace(/[.!?,;:]+$/g, "")
    .trim();
}

export function isConfirmationText(text: string): boolean {
  return CONFIRMATION_WORDS.has(normalizeConfirmationText(text));
}

/**
 * Confirma a entrada NOTIFIED de um cliente, identificado pelo telefone,
 * a partir de uma resposta recebida no WhatsApp. Espelha a mesma regra do
 * PATCH /api/queue/[id] (action: "confirm"), localizando a entrada pelo
 * telefone em vez do id, já que é isso que o webhook tem disponível.
 *
 * Retorna null se não havia entrada NOTIFIED pendente pra esse telefone
 * (ex: cliente mandou "sim" sem ter sido chamado, ou já confirmou antes) -
 * quem chamar deve tratar isso como mensagem comum (cair no enterQueue).
 */
export async function confirmNotifiedEntryByPhone(
  establishmentId: string,
  customerPhone: string
): Promise<QueueEntry | null> {
  const entry = await prisma.queueEntry.findFirst({
    where: { establishmentId, customerPhone, status: "NOTIFIED" },
  });
  if (!entry) return null;

  const establishment = await prisma.establishment.findUniqueOrThrow({
    where: { id: establishmentId },
  });

  // Mesma checagem de expiração do PATCH /api/queue/[id]: se o prazo já
  // passou, expira em vez de confirmar, e libera o próximo da fila.
  if (entry.notifyExpiresAt && entry.notifyExpiresAt < new Date()) {
    const expired = await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: "EXPIRED", respondedAt: new Date() },
    });
    try {
      await sendWhatsAppMessage(
        establishment.whatsappPhoneId,
        customerPhone,
        "O prazo para confirmar esse horário já passou. Assim que abrir outro, avisamos de novo."
      );
    } catch (err) {
      console.error(`Falha ao avisar expiração para ${customerPhone}:`, err);
    }
    await notifyNext(establishmentId);
    return expired;
  }

  const confirmed = await prisma.queueEntry.update({
    where: { id: entry.id },
    data: { status: "CONFIRMED", respondedAt: new Date() },
  });

  try {
    await sendWhatsAppMessage(
      establishment.whatsappPhoneId,
      customerPhone,
      "Confirmado! Seu horário está garantido. Até já."
    );
  } catch (err) {
    console.error(`Falha ao enviar confirmação de horário para ${customerPhone}:`, err);
  }

  return confirmed;
}
/**
 * Resposta "sim" a uma oferta de horário. Só o primeiro leva o horário.
 * Retorna true se tratou a mensagem (mesmo que seja "já preenchido").
 */
export async function claimOfferedSlotByPhone(
  establishmentId: string,
  customerPhone: string
): Promise<boolean> {
  const entries = await prisma.queueEntry.findMany({
    where: { establishmentId, customerPhone, status: "WAITING", desiredDate: { not: null } },
  });
  if (entries.length === 0) return false;

  const offer = await prisma.slotOffer.findFirst({
    where: { queueEntryId: { in: entries.map((e) => e.id) } },
    orderBy: { sentAt: "desc" },
  });
  if (!offer) return false;

  const entry = entries.find((e) => e.id === offer.queueEntryId)!;
  const slot = await prisma.slot.findUniqueOrThrow({ where: { id: offer.slotId } });
  const est = await prisma.establishment.findUniqueOrThrow({ where: { id: establishmentId } });

  const reply = async (text: string) => {
    try {
      await sendWhatsAppMessage(est.whatsappPhoneId, customerPhone, text);
    } catch (err) {
      console.error(`Falha ao responder ${customerPhone}:`, err);
    }
  };

  if (slot.offerClosesAt && slot.offerClosesAt < new Date()) {
    await reply("O prazo para esse horário já passou.");
    return true;
  }

  // Alguém já marcou esse horário normalmente?
  const taken = await prisma.appointment.findFirst({
    where: { establishmentId, status: "SCHEDULED", startsAt: slot.startsAt },
  });
  if (taken) {
    await reply("Esse horário já foi preenchido.");
    return true;
  }

  // Corrida: só um updateMany consegue trocar null por um valor.
  const claim = await prisma.slot.updateMany({
    where: { id: slot.id, claimedByEntry: null },
    data: { claimedByEntry: entry.id },
  });
  if (claim.count === 0) {
    await reply("Esse horário já foi preenchido.");
    return true;
  }

  try {
    const appt = await prisma.appointment.create({
      data: {
        establishmentId,
        serviceId: entry.serviceId,
        customerPhone,
        customerName: entry.customerName,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
      },
    });
    await prisma.slot.update({ where: { id: slot.id }, data: { claimedByAppointmentId: appt.id } });
    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: "CONFIRMED", respondedAt: new Date() },
    });
  } catch (err) {
    console.error("Falha ao criar agendamento, liberando o horário:", err);
    await prisma.slot.update({ where: { id: slot.id }, data: { claimedByEntry: null } });
    await reply("Não consegui confirmar agora. Tente responder SIM de novo.");
    return true;
  }

  await reply("Confirmado! O horário é seu. Até lá.");
  return true;
}