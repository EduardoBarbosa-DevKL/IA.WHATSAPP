"use client";

import { useCallback, useEffect, useState } from "react";

type Appt = {
  id: string;
  customerName: string | null;
  customerPhone: string;
  startsAt: string;
  endsAt: string;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export default function Agenda() {
  const [items, setItems] = useState<Appt[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/appointments");
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.appointments);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  async function cancelar(id: string) {
    if (!window.confirm("Cancelar este horário? Quem estava esperando por ele será avisado.")) return;
    const res = await fetch(`/api/appointments/${id}`, { method: "PATCH" });
    const data = await res.json();
    window.alert(
      res.ok
        ? `Horário cancelado. Pessoas avisadas: ${data.notified}.`
        : data.error ?? "Erro ao cancelar."
    );
    load();
  }

  return (
    <div className="mb-6">
      <h2 className="mb-3 text-xl font-semibold text-ink">Agenda</h2>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-borderStrong bg-surface px-6 py-8 text-center text-sm text-inkMuted">
          Nenhum horário marcado.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {a.customerName || a.customerPhone}
                </p>
                <p className="text-xs text-inkMuted">{fmt(a.startsAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => cancelar(a.id)}
                className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-danger transition-colors hover:bg-dangerSoft"
              >
                Cancelar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}