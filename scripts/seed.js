const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const establishment = await prisma.establishment.upsert({
    where: { whatsappPhoneId: '12345' },
    update: {},
    create: {
      name: 'Meu Salão Teste',
      whatsappPhoneId: '12345',
      whatsappNumber: '5511999999999',
    },
  });

  const passwordHash = bcrypt.hashSync('senha123', 10);

  const staff = await prisma.staff.upsert({
    where: {
      establishmentId_email: {
        establishmentId: establishment.id,
        email: 'teste@teste.com',
      },
    },
    update: { passwordHash },
    create: {
      establishmentId: establishment.id,
      email: 'teste@teste.com',
      passwordHash,
      role: 'OWNER',
    },
  });

  console.log('Establishment criado:', establishment);
  console.log('Staff criado:', staff);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
