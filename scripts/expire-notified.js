const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const establishment = await prisma.establishment.findFirst({
    where: { whatsappPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID },
  });

  if (!establishment) {
    console.error('Establishment não encontrado.');
    process.exit(1);
  }

  const result = await prisma.queueEntry.updateMany({
    where: {
      establishmentId: establishment.id,
      status: 'NOTIFIED',
    },
    data: {
      status: 'EXPIRED',
      respondedAt: new Date(),
    },
  });

  console.log(`${result.count} entrada(s) expirada(s) manualmente.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
