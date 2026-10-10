import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { notifyNext } from "@/lib/queue";
import { requireStaff } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

// O establishmentId NÃO vem mais do corpo da requisição: ele sai da sessão do
// usuário logado. Se o navegador ainda enviar esse campo, o zod simplesmente
// o descarta (z.object ignora chaves desconhecidas).
const slotSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

export async function POST(req: NextRequest) {
  // 1. Só funcionário logado pode marcar cancelamento.
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  // O estabelecimento é sempre o do usuário logado (isolamento multi-tenant).
  const establishmentId = staff.establishmentId;

  // 2. Limite de uso: cada notificação dispara uma mensagem de WhatsApp.
  const limit = await rateLimit(`slots:staff:${staff.id}`, 30, 60 * 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfterSec);

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisição inválido (JSON malformado)." },
      { status: 400 }
    );
  }

  const parsed = slotSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { startsAt, endsAt } = parsed.data;
  const startDate = new Date(startsAt);
  const endDate = new Date(endsAt);

  if (endDate <= startDate) {
    return NextResponse.json(
      { error: "O horário de término deve ser depois do horário de início." },
      { status: 400 }
    );
  }

  // Registra o slot no histórico, mesmo que ninguém seja notificado.
  const slot = await prisma.slot.create({
    data: {
      establishmentId,
      startsAt: startDate,
      endsAt: endDate,
    },
  });

  try {
    const notifiedEntry = await notifyNext(establishmentId, slot.id);

    if (!notifiedEntry) {
      return NextResponse.json(
        {
          message: "Horário registrado, mas ninguém compatível na fila no momento (ou já há alguém aguardando confirmação).",
          slot,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        message: "Cliente notificado com sucesso.",
        slot,
        notifiedEntry,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[slots] falha ao notificar:", err);
    return NextResponse.json(
      { error: "Falha ao processar a notificação.", slot },
      { status: 502 }
    );
  }
}