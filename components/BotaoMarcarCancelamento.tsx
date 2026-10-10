"use client";

import { useState } from "react";

type Resultado =
  | { tipo: "sucesso-notificado"; mensagem: string }
  | { tipo: "sucesso-sem-fila"; mensagem: string }
  | { tipo: "erro"; mensagem: string };

interface BotaoMarcarCancelamentoProps {
  establishmentId: string;
  onResult?: (resultado: Resultado) => void;
}

// Durações que o salão pode oferecer ao liberar um horário.
const DURACOES_MIN = [30, 45, 60, 90] as const;

// O horário liberado começa daqui a quantos minutos (mesmo valor usado antes).
const ANTECEDENCIA_MIN = 30;

// Classes por tipo de resultado (escritas por extenso para o Tailwind enxergar).
const RESULTADO_STYLE: Record<Resultado["tipo"], string> = {
  "sucesso-notificado": "bg-successSoft text-success",
  "sucesso-sem-fila": "bg-warningSoft text-warning",
  erro: "bg-dangerSoft text-danger",
};

// Classes dos botões de duração (também por extenso para o Tailwind).
const FOCO =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70";
const DURACAO_ATIVA =
  "rounded-lg border border-accent bg-accentSoft px-3 py-1.5 text-sm font-semibold text-accent " +
  FOCO;
const DURACAO_INATIVA =
  "rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-inkSecondary transition-colors hover:bg-surfaceMuted " +
  FOCO;

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </svg>
  );
}

function IconSpinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 motion-safe:animate-spin" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}

export default function BotaoMarcarCancelamento({
  establishmentId,
  onResult,
}: BotaoMarcarCancelamentoProps) {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [duracao, setDuracao] = useState<number>(30);

  async function handleClick() {
    if (loading) return; // evita clique duplo

    setLoading(true);
    setResultado(null);

    // O horário é calculado no momento do clique, não quando a página abre.
    const inicio = new Date(Date.now() + ANTECEDENCIA_MIN * 60 * 1000);
    const fim = new Date(inicio.getTime() + duracao * 60 * 1000);

    try {
      const res = await fetch("/api/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          establishmentId,
          startsAt: inicio.toISOString(),
          endsAt: fim.toISOString(),
        }),
      });

      const data = await res.json();

      let novoResultado: Resultado;

      if (!res.ok) {
        novoResultado = {
          tipo: "erro",
          mensagem: data.error || "Erro ao liberar o horário.",
        };
      } else if (data.notifiedEntry) {
        novoResultado = {
          tipo: "sucesso-notificado",
          mensagem: `Cliente ${data.notifiedEntry.customerName || data.notifiedEntry.customerPhone} foi notificado.`,
        };
      } else {
        novoResultado = {
          tipo: "sucesso-sem-fila",
          mensagem: "Horário registrado, mas ninguém compatível na fila no momento.",
        };
      }

      setResultado(novoResultado);
      onResult?.(novoResultado);
    } catch {
      const erroResultado: Resultado = {
        tipo: "erro",
        mensagem: "Falha de conexão. Tente novamente.",
      };
      setResultado(erroResultado);
      onResult?.(erroResultado);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accentSoft text-accent">
<IconCalendar />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">
              Um horário vagou?
            </p>
            <p className="text-sm text-inkSecondary">
              Escolha a duração do horário vago e o próximo da fila que couber é avisado no WhatsApp.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 sm:items-end">
          <div
            role="radiogroup"
            aria-label="Duração do horário vago"
            className="flex gap-2"
          >
            {DURACOES_MIN.map((min) => (
              <button
                key={min}
                type="button"
                role="radio"
                aria-checked={duracao === min}
                disabled={loading}
                onClick={() => setDuracao(min)}
                className={duracao === min ? DURACAO_ATIVA : DURACAO_INATIVA}
              >
                {min} min
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleClick}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accentHover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading && <IconSpinner />}
            {loading ? "Liberando..." : "Liberar horário"}
          </button>
        </div>
      </div>

      {resultado && (
        <p
          role={resultado.tipo === "erro" ? "alert" : "status"}
          className={`mt-4 rounded-lg px-3 py-2 text-sm font-medium ${RESULTADO_STYLE[resultado.tipo]}`}
        >
          {resultado.mensagem}
        </p>
      )}
    </div>
  );
}
