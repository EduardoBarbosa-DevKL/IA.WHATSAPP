
import { describe, it, expect, vi, beforeEach } from "vitest";

const prisma = vi.hoisted(() => ({
  queueEntry: { findMany: vi.fn(), update: vi.fn() },
  slotOffer: { findFirst: vi.fn() },
  slot: { findUniqueOrThrow: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
  establishment: { findUniqueOrThrow: vi.fn() },
  appointment: { findFirst: vi.fn(), create: vi.fn() },
}));
const send = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/whatsapp", () => ({ sendWhatsAppMessage: send }));
vi.mock("@/lib/queue-matching", () => ({ findNextCompatibleEntry: vi.fn() }));

import {
  normalizeConfirmationText,
  isConfirmationText,
  claimOfferedSlotByPhone,
} from "@/lib/queue";

describe("normalizeConfirmationText", () => {
  it("remove acento, caixa e pontuação final", () => {
    expect(normalizeConfirmationText("  SIM!! ")).toBe("sim");
    expect(normalizeConfirmationText("Sim.")).toBe("sim");
    expect(normalizeConfirmationText("Não")).toBe("nao");
  });
});

describe("isConfirmationText", () => {
  it.each(["sim", "Sim!", " SIM ", "ok", "Beleza", "1"])("aceita %s", (t) => {
    expect(isConfirmationText(t)).toBe(true);
  });
  it.each(["talvez", "não", "", "sim quero outro", "2"])("rejeita '%s'", (t) => {
    expect(isConfirmationText(t)).toBe(false);
  });
});

describe("claimOfferedSlotByPhone", () => {
  const EST = "est1";
  const PHONE = "5511999999999";
  const entry = { id: "e1", serviceId: null, customerName: "Ana" };
  const slot = {
    id: "s1",
    startsAt: new Date("2030-01-01T14:00:00Z"),
    endsAt: new Date("2030-01-01T14:30:00Z"),
    offerClosesAt: new Date(Date.now() + 10 * 60_000),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    prisma.queueEntry.findMany.mockResolvedValue([entry]);
    prisma.slotOffer.findFirst.mockResolvedValue({ queueEntryId: "e1", slotId: "s1" });
    prisma.slot.findUniqueOrThrow.mockResolvedValue(slot);
    prisma.establishment.findUniqueOrThrow.mockResolvedValue({ whatsappPhoneId: "pid" });
    prisma.appointment.findFirst.mockResolvedValue(null);
    prisma.slot.updateMany.mockResolvedValue({ count: 1 });
    prisma.appointment.create.mockResolvedValue({ id: "a1" });
    send.mockResolvedValue(undefined);
  });

  it("retorna false se o cliente não tem entrada de interesse", async () => {
    prisma.queueEntry.findMany.mockResolvedValue([]);
    expect(await claimOfferedSlotByPhone(EST, PHONE)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("retorna false se nunca recebeu oferta", async () => {
    prisma.slotOffer.findFirst.mockResolvedValue(null);
    expect(await claimOfferedSlotByPhone(EST, PHONE)).toBe(false);
  });

  it("fluxo feliz: cria agendamento, confirma a entrada e avisa", async () => {
    expect(await claimOfferedSlotByPhone(EST, PHONE)).toBe(true);
    expect(prisma.appointment.create).toHaveBeenCalledOnce();
    expect(prisma.queueEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "e1" }, data: expect.objectContaining({ status: "CONFIRMED" }) })
    );
    expect(send).toHaveBeenCalledWith("pid", PHONE, expect.stringContaining("Confirmado"));
  });

  it("prazo vencido: avisa e não cria agendamento", async () => {
    prisma.slot.findUniqueOrThrow.mockResolvedValue({ ...slot, offerClosesAt: new Date(Date.now() - 1000) });
    expect(await claimOfferedSlotByPhone(EST, PHONE)).toBe(true);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("pid", PHONE, expect.stringContaining("prazo"));
  });

  it("horário já marcado por outra pessoa: diz que foi preenchido", async () => {
    prisma.appointment.findFirst.mockResolvedValue({ id: "outro" });
    expect(await claimOfferedSlotByPhone(EST, PHONE)).toBe(true);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("pid", PHONE, expect.stringContaining("preenchido"));
  });

  it("corrida: se o updateMany não pega o horário, perde e é avisado", async () => {
    prisma.slot.updateMany.mockResolvedValue({ count: 0 });
    expect(await claimOfferedSlotByPhone(EST, PHONE)).toBe(true);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("pid", PHONE, expect.stringContaining("preenchido"));
  });

  it("falha ao criar o agendamento: libera o horário de volta", async () => {
    prisma.appointment.create.mockRejectedValue(new Error("db caiu"));
    expect(await claimOfferedSlotByPhone(EST, PHONE)).toBe(true);
    expect(prisma.slot.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { claimedByEntry: null } })
    );
    expect(send).toHaveBeenCalledWith("pid", PHONE, expect.stringContaining("Tente"));
  });

  it("falha no envio do WhatsApp não derruba o fluxo", async () => {
    send.mockRejectedValue(new Error("401"));
    await expect(claimOfferedSlotByPhone(EST, PHONE)).resolves.toBe(true);
  });
});
