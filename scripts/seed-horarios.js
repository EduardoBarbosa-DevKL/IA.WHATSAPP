const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const est = await prisma.establishment.findFirst({
    where: { whatsappPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID },
  });
  if (!est) {
    console.error('Establishment não encontrado.');
    process.exit(1);
  }

  // Seg (1) a Sáb (6), 09:00 às 18:00. Domingo (0) fechado.
  for (let weekday = 1; weekday <= 6; weekday++) {
    await prisma.businessHours.upsert({
      where: { establishmentId_weekday: { establishmentId: est.id, weekday } },
      update: { opensAt: '09:00', closesAt: '18:00' },
      create: { establishmentId: est.id, weekday, opensAt: '09:00', closesAt: '18:00' },
    });
  }

  const serv = await prisma.service.findFirst({ where: { establishmentId: est.id } });
  if (!serv) {
    await prisma.service.create({
      data: { establishmentId: est.id, name: 'Corte de cabelo', durationMins: 30 },
    });
  }

  console.log('Horários criados para', est.name);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
