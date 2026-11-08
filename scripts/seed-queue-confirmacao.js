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

  const entry = await prisma.queueEntry.create({
    data: {
      establishmentId: establishment.id,
      customerPhone: process.env.TEST_PHONE,
      customerName: 'Teste Confirmação',
      status: 'WAITING',
    },
  });

  console.log('Cliente adicionado na fila:', entry);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
