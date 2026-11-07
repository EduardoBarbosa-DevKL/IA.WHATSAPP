import { describe, it, expect, vi, beforeEach } from "vitest";

const prisma = vi.hoisted(() => ({
  appointment: { findFirst: vi.fn(), update: vi.fn() },
  slot: { create: vi.fn() },
  slotOffer: { create: vi.fn() },
  queueEntry: { findMany: vi.fn() },
  establishment: { findUniqueOrThrow: vi.fn() },
  $transaction: vi.fn(),
}));
const send = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/whatsapp", () => ({ sendWhatsAppMessage: send }));

import { cancelAppointment } from "@/lib/appointments";

const appt = {
  id: "a1",
  status: "SCHEDULED",
  startsAt: new Date("2030-01-01T14:00:00Z"),
  endsAt: new Date("2030-01-01T14:30:00Z"),
};

describe("cancelAppointment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.appointment.findFirst.mockResolvedValue(appt);
    prisma.establishment.findUniqueOrThrow.mockResolvedValue({
      whatsappPhoneId: "pid",
      notifyWindowMins: 15,
      timezone: "America/Sao_Paulo",
    });
    prisma.$transaction.mockResolvedValue([{}, { id: "s1" }]);
    prisma.queueEntry.findMany.mockResolvedValue([]);
    send.mockResolvedValue(undefined);
  });

  it("404 se o agendamento não existe (ou é de outro estabelecimento)", async () => {
    prisma.appointment.findFirst.mockResolvedValue(null);
    expect(await cancelAppointment("est1", "x")).toEqual(
      expect.objectContaining({ status: 404 })
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("409 se o agendamento já foi cancelado", async () => {
    prisma.appointment.findFirst.mockResolvedValue({ ...appt, status: "CANCELLED" });
    expect(await cancelAppointment("est1", "a1")).toEqual(
      expect.objectContaining({ status: 409 })
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("sem interessados: cancela, libera o horário e avisa 0 pessoas", async () => {
    const r = await cancelAppointment("est1", "a1");
    expect(r).toEqual({ ok: true, notified: 0 });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });

  it("avisa só quem pediu exatamente aquele horário e registra a oferta", async () => {
    prisma.queueEntry.findMany.mockResolvedValue([
      { id: "e1", customerPhone: "551111" },
      { id: "e2", customerPhone: "552222" },
    ]);
    const r = await cancelAppointment("est1", "a1");

    const where = prisma.queueEntry.findMany.mock.calls[0][0].where;
    expect(where.desiredDate).toEqual(appt.startsAt);
    expect(where.status).toBe("WAITING");
    expect(where.establishmentId).toBe("est1");

    expect(send).toHaveBeenCalledTimes(2);
    expect(prisma.slotOffer.create).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ ok: true, notified: 2 });
  });

  it("falha ao avisar um cliente não impede de avisar os outros", async () => {
    prisma.queueEntry.findMany.mockResolvedValue([
      { id: "e1", customerPhone: "551111" },
      { id: "e2", customerPhone: "552222" },
    ]);
    send.mockRejectedValueOnce(new Error("130497")).mockResolvedValueOnce(undefined);
    const r = await cancelAppointment("est1", "a1");
    expect(r).toEqual({ ok: true, notified: 1 });
    expect(prisma.slotOffer.create).toHaveBeenCalledOnce();
  });
});
