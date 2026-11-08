const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const entries = await prisma.queueEntry.findMany({
    where: { customerPhone: process.env.TEST_PHONE_BR },
  });
  console.log(entries);
}

main().finally(() => prisma.$disconnect());
