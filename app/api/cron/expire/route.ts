// app/api/cron/expire/route.ts
// Expira quem foi chamado e não confirmou no prazo, e já chama o próximo.
// Protegida por CRON_SECRET: a Vercel envia "Authorization: Bearer <CRON_SECRET>"
// automaticamente quando a variável existe; um agendador externo pode mandar o
// mesmo cabeçalho.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { expireStaleNotifications } from "@/lib/queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: Request, secret: string): boolean {
  const received = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET não configurado.");
    return NextResponse.json({ error: "Servidor mal configurado." }, { status: 500 });
  }

  if (!isAuthorized(req, secret)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  try {
    const expired = await expireStaleNotifications();
    return NextResponse.json({ ok: true, expired });
  } catch (err) {
    console.error("Falha no cron de expiração:", err);
    return NextResponse.json({ error: "Falha ao expirar notificações." }, { status: 500 });
  }
}