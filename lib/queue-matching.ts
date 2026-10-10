// lib/queue-matching.ts
// 👉 Parte B (amigo): "achar o próximo cliente compatível".
//
// Regra atual:
//  - Sem horário informado: FIFO simples (quem chegou primeiro), como antes.
//  - Com horário (Slot): só é compatível quem entrou sem escolher serviço
//    (serve para qualquer horário) ou quem escolheu um serviço cuja duração
//    (Service.durationMins) cabe no horário liberado. Quem não cabe é
//    PULADO, mas continua WAITING, mantendo o lugar para o próximo horário.
//
// Ainda não existe "profissional" no schema, então esse critério fica de fora.

import { prisma } from "@/lib/prisma";
import type { QueueEntry } from "@prisma/client";

export type SlotWindow = { startsAt: Date; endsAt: Date };

/**
 * Retorna a próxima QueueEntry (status WAITING) que pode ser chamada agora
 * nesse estabelecimento, ou null se não houver ninguém compatível.
 * `slot` é opcional: sem ele, vale a ordem de chegada.
 */
export async function findNextCompatibleEntry(
  establishmentId: string,
  slot?: SlotWindow | null
): Promise<QueueEntry | null> {
  if (!slot) {
    return prisma.queueEntry.findFirst({
      where: { establishmentId, status: "WAITING" },
      orderBy: { createdAt: "asc" },
    });
  }

  const slotMins = Math.floor((slot.endsAt.getTime() - slot.startsAt.getTime()) / 60_000);
  if (slotMins <= 0) return null;

  return prisma.queueEntry.findFirst({
    where: {
      establishmentId,
      status: "WAITING",
      OR: [
        { serviceId: null },
        { service: { is: { durationMins: { lte: slotMins } } } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
}