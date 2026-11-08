const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.queueEntry.updateMany({
  where: { establishmentId: "cmuiumuod000011e9f4055iwk", customerPhone: process.env.TEST_PHONE },
  data: { status: "WAITING", notifiedAt: null, notifyExpiresAt: null, respondedAt: null },
}).then((r) => console.log(r.count + " entrada(s) voltaram para WAITING"))
  .finally(() => p.$disconnect());

