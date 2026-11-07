import { describe, it, expect, vi, beforeEach } from "vitest";

const prisma = vi.hoisted(() => ({
  queueEntry: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  slot: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  establishment: { findUniqueOrThrow: vi.fn() },
  $transaction: vi.fn(),
}));
const send = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/whatsapp", () => ({ sendWhatsAppMessage: send }));

import { notifyNext, expireStaleNotifications, releaseSlotOf } from "@/lib/queue";
import { findNextCompatibleEntry } from "@/lib/queue-matching";

const EST = { whatsappPhoneId: "pid", notifyWindowMins: 15, timezone: "America/Sao_Paulo" };
const entry = { id: "e1", customerPhone: "5511", status: "WAITING" };

describe("findNextCompatibleEntry", () => {
  beforeEach(() => vi.resetAllMocks());

  it("FIFO ignora quem tem desiredDate (lista de interesse)", async () => {
    prisma.queueEntry.findFirst.mockResolvedValue(null);
    await findNextCompatibleEntry("est1");
    const where = prisma.queueEntry.findFirst.mock.calls[0][0].where;
    expect(where.status).toBe("WAITING");
    expect(where.desiredDate).toBeNull();
  });

  it("com horário: também ignora desiredDate e filtra por duração", async () => {
    prisma.queueEntry.findFirst.mockResolvedValue(null);
    await findNextCompatibleEntry("est1", {
      startsAt: new Date("2030-01-01T14:00:00Z"),
      endsAt: new Date("2030-01-01T14:30:00Z"),
    });
    const where = prisma.queueEntry.findFirst.mock.calls[0][0].where;
    expect(where.desiredDate).toBeNull();
    expect(JSON.stringify(where.OR)).toContain('"lte":30');
  });

  it("horário com duração zero ou negativa: ninguém é chamado", async () => {
    const t = new Date("2030-01-01T14:00:00Z");
    expect(await findNextCompatibleEntry("est1", { startsAt: t, endsAt: t })).toBeNull();
    expect(prisma.queueEntry.findFirst).not.toHaveBeenCalled();
  });
});

describe("notifyNext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.establishment.findUniqueOrThrow.mockResolvedValue(EST);
    send.mockResolvedValue(undefined);
  });

  it("não chama ninguém se já há alguém NOTIFIED", async () => {
    prisma.queueEntry.findFirst.mockResolvedValueOnce({ id: "x" });
    expect(await notifyNext("est1")).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("fila vazia: retorna null sem enviar nada", async () => {
    prisma.queueEntry.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    expect(await notifyNext("est1")).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("slot inexistente ou já reservado: ninguém é chamado", async () => {
    prisma.queueEntry.findFirst.mockResolvedValueOnce(null);
    prisma.slot.findFirst.mockResolvedValue(null);
    expect(await notifyNext("est1", "s1")).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("fluxo feliz: marca NOTIFIED e envia o aviso", async () => {
    prisma.queueEntry.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(entry);
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({
        slot: { updateMany: vi.fn() },
        queueEntry: { update: vi.fn().mockResolvedValue({ ...entry, status: "NOTIFIED" }) },
      })
    );
    const r = await notifyNext("est1");
    expect(r?.status).toBe("NOTIFIED");
    expect(send).toHaveBeenCalledWith("pid", "5511", expect.stringContaining("Chegou sua vez"));
  });

  it("falha no envio do WhatsApp NÃO derruba, mas a entrada fica NOTIFIED (bug conhecido)", async () => {
    prisma.queueEntry.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(entry);
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({ queueEntry: { update: vi.fn().mockResolvedValue({ ...entry, status: "NOTIFIED" }) } })
    );
    send.mockRejectedValue(new Error("401"));
    const r = await notifyNext("est1");
    expect(r?.status).toBe("NOTIFIED");
    // Quando o rollback for implementado, troque a linha acima por:
    // expect(prisma.queueEntry.update).toHaveBeenCalledWith(... status: "WAITING")
  });

  it("slot já pego por outra chamada (count 0): ninguém é chamado", async () => {
    prisma.queueEntry.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(entry);
    prisma.slot.findFirst.mockResolvedValue({
      id: "s1",
      startsAt: new Date("2030-01-01T14:00:00Z"),
      endsAt: new Date("2030-01-01T14:30:00Z"),
    });
    prisma.$transaction.mockImplementation(async (fn: any) =>
      fn({ slot: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }, queueEntry: { update: vi.fn() } })
    );
    expect(await notifyNext("est1", "s1")).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("transação falha (entrada cancelada no meio): retorna null", async () => {
    prisma.queueEntry.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(entry);
    prisma.$transaction.mockRejectedValue(new Error("not found"));
    expect(await notifyNext("est1")).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("releaseSlotOf", () => {
  beforeEach(() => vi.resetAllMocks());

  it("sem slot reservado: retorna undefined", async () => {
    prisma.slot.findFirst.mockResolvedValue(null);
    expect(await releaseSlotOf("e1")).toBeUndefined();
    expect(prisma.slot.update).not.toHaveBeenCalled();
  });

  it("com slot: libera e devolve o id", async () => {
    prisma.slot.findFirst.mockResolvedValue({ id: "s1" });
    expect(await releaseSlotOf("e1")).toBe("s1");
    expect(prisma.slot.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { claimedByEntry: null },
    });
  });
});

describe("expireStaleNotifications", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.establishment.findUniqueOrThrow.mockResolvedValue(EST);
  });

  it("sem vencidos: retorna 0", async () => {
    prisma.queueEntry.findMany.mockResolvedValue([]);
    expect(await expireStaleNotifications()).toBe(0);
    expect(prisma.queueEntry.update).not.toHaveBeenCalled();
  });

  it("expira só NOTIFIED vencidos e filtra por estabelecimento", async () => {
    prisma.queueEntry.findMany.mockResolvedValue([]);
    await expireStaleNotifications("est1");
    const where = prisma.queueEntry.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("NOTIFIED");
    expect(where.establishmentId).toBe("est1");
    expect(where.notifyExpiresAt.lt).toBeInstanceOf(Date);
  });

  it("marca EXPIRED, libera o horário e tenta chamar o próximo", async () => {
    prisma.queueEntry.findMany.mockResolvedValue([{ id: "e1", establishmentId: "est1" }]);
    prisma.slot.findFirst.mockResolvedValue(null); // releaseSlotOf -> undefined
    prisma.queueEntry.findFirst.mockResolvedValue({ id: "ja-chamado" }); // notifyNext sai cedo
    expect(await expireStaleNotifications()).toBe(1);
    expect(prisma.queueEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "e1" }, data: expect.objectContaining({ status: "EXPIRED" }) })
    );
  });
});
