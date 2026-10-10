import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { notifyNext, releaseSlotOf } from "@/lib/queue";

const patchSchema = z.object({
  action: z.enum(["confirm", "cancel"]),
});

// Libera o horário reservado por uma entrada que saiu da fila e oferece
// o horário ao próximo compatível. Nunca derruba a resposta da rota:
// se algo falhar aqui, a entrada já foi atualizada e só logamos o erro.
async function releaseAndOfferNext(
  establishmentId: string,
  entryId: string,
  alwaysCallNext: boolean
) {
  try {
    const slotId = await releaseSlotOf(entryId);
    if (slotId || alwaysCallNext) {
      await notifyNext(establishmentId, slotId);
    }
  } catch (err) {
    console.error("Erro ao liberar horário / chamar próximo:", err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Só funcionário logado pode alterar a fila.
  let staff;
  try {
    staff = await requireStaff();
  } catch {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { id } = params;
  const establishmentId = staff.establishmentId;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisição inválido (JSON malformado)." },
      { status: 400 }
    );
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ação inválida. Use 'confirm' ou 'cancel'." },
      { status: 400 }
    );
  }

  // 2. A entrada tem que ser do estabelecimento de quem está logado.
  // Se não existir OU for de outro salão, a resposta é a mesma (404), para
  // não revelar que aquele id existe em outro estabelecimento.
  const entry = await prisma.queueEntry.findFirst({
    where: { id, establishmentId },
  });

  if (!entry) {
    return NextResponse.json(
      { error: "Entrada da fila não encontrada." },
      { status: 404 }
    );
  }

  const { action } = parsed.data;

  if (action === "cancel") {
    if (entry.status === "CANCELLED") {
      return NextResponse.json(
        { error: `Não é possível cancelar uma entrada com status ${entry.status}.` },
        { status: 409 }
      );
    }

    const updated = await prisma.queueEntry.update({
      where: { id, establishmentId },
      data: { status: "CANCELLED" },
    });

    // Se a entrada já tinha sido chamada ou confirmada, o horário reservado
    // para ela volta a ficar livre e é oferecido ao próximo compatível.
    // NOTIFIED sempre destrava a fila (chama o próximo mesmo sem horário);
    // CONFIRMED só chama alguém se havia um horário reservado.
    if (entry.status === "NOTIFIED" || entry.status === "CONFIRMED") {
      await releaseAndOfferNext(
        establishmentId,
        entry.id,
        entry.status === "NOTIFIED"
      );
    }

    return NextResponse.json({ message: "Entrada cancelada.", entry: updated });
  }

  // action === "confirm"
  if (entry.status !== "NOTIFIED") {
    return NextResponse.json(
      { error: "Só é possível confirmar uma entrada que foi notificada." },
      { status: 409 }
    );
  }

  if (entry.notifyExpiresAt && entry.notifyExpiresAt < new Date()) {
    const expired = await prisma.queueEntry.update({
      where: { id, establishmentId },
      data: { status: "EXPIRED" },
    });

    // Mesmo tratamento da expiração automática: libera o horário e chama o próximo.
    await releaseAndOfferNext(establishmentId, entry.id, true);

    return NextResponse.json(
      { error: "O prazo para confirmar esse horário já expirou.", entry: expired },
      { status: 410 }
    );
  }

  const confirmed = await prisma.queueEntry.update({
    where: { id, establishmentId },
    data: { status: "CONFIRMED", respondedAt: new Date() },
  });

  return NextResponse.json({ message: "Entrada confirmada.", entry: confirmed });
}
