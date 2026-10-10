import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

function fmt(d: Date, tz: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz, weekday: "short", day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(d);
}

export async function cancelAppointment(establishmentId: string, id: string) {
  const appt = await prisma.appointment.findFirst({ where: { id, establishmentId } });
  if (!appt) return { error: "Agendamento não encontrado.", status: 404 };
  if (appt.status !== "SCHEDULED") return { error: "Agendamento já não está ativo.", status: 409 };

  const est = await prisma.establishment.findUniqueOrThrow({ where: { id: establishmentId } });
  const offerClosesAt = new Date(Date.now() + est.notifyWindowMins * 60_000);

  // Cancela e libera o horário (Slot) na mesma transação.
  const [, slot] = await prisma.$transaction([
    prisma.appointment.update({ where: { id }, data: { status: "CANCELLED" } }),
    prisma.slot.create({
      data: { establishmentId, startsAt: appt.startsAt, endsAt: appt.endsAt, offerClosesAt },
    }),
  ]);

  // Só avisa quem pediu exatamente esse horário.
  const interested = await prisma.queueEntry.findMany({
    where: {
      establishmentId,
      status: "WAITING",
      desiredDate: appt.startsAt,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  let notified = 0;
  for (const e of interested) {
    try {
      await sendWhatsAppMessage(
        est.whatsappPhoneId,
        e.customerPhone,
        `Abriu o horário ${fmt(appt.startsAt, est.timezone)}! Responda SIM em até ${est.notifyWindowMins} minutos para ficar com ele.`
      );
      await prisma.slotOffer.create({ data: { slotId: slot.id, queueEntryId: e.id } });
      notified++;
    } catch (err) {
      console.error(`Falha ao avisar ${e.customerPhone}:`, err);
    }
  }

  return { ok: true as const, notified };
}