const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.queueEntry.deleteMany({
    where: {
      establishmentId: "cmuiumuod000011e9f4055iwk",
      customerPhone: process.env.TEST_PHONE_BR,
    },
  });
  console.log(result.count + " entrada(s) removida(s).");

  const remaining = await prisma.queueEntry.findMany({
    where: { establishmentId: "cmuiumuod000011e9f4055iwk" },
  });
  console.log("Fila restante:", remaining);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

