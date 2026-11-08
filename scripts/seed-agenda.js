const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const est = await prisma.establishment.findFirst({ where: { whatsappPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID } });
  if (!est) { console.error('Establishment não encontrado.'); process.exit(1); }

  const slotAt = (h) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(h, 0, 0, 0);
    return d;
  };

  for (const h of [10, 11, 14]) {
    const startsAt = slotAt(h);
    await prisma.appointment.create({
      data: {
        establishmentId: est.id,
        customerName: `Cliente das ${h}h`,
        customerPhone: '5511900000000',
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60000),
      },
    });
  }

  // Interessado no horário das 14h
  const desired = slotAt(14);
  await prisma.queueEntry.create({
    data: {
      establishmentId: est.id,
      customerPhone: '556298341670',
      customerName: 'Teste Interesse',
      status: 'WAITING',
      desiredDate: desired,
      expiresAt: desired,
    },
  });

  console.log('Agenda de teste criada para amanhã (10h, 11h, 14h).');
}

main().catch(console.error).finally(() => prisma.$disconnect());
