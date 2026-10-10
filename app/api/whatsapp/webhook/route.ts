// app/api/whatsapp/webhook/route.ts
//
// POST: recebido toda vez que um cliente manda mensagem no WhatsApp.
// A verificação GET (usada só na configuração do webhook no Meta Developers)
// fica a cargo do seu amigo, no mesmo arquivo.
//
// IMPORTANTE: para validar a assinatura (X-Hub-Signature-256) precisamos do
// corpo BRUTO da requisição, então lemos com `request.text()` antes de
// fazer JSON.parse — nunca use request.json() diretamente aqui.

import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, parseIncomingMessages } from "@/lib/whatsapp";
import { enterQueue, confirmNotifiedEntryByPhone, isConfirmationText, claimOfferedSlotByPhone } from "@/lib/queue";
import { prisma } from "@/lib/prisma";
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error("Webhook WhatsApp: WHATSAPP_VERIFY_TOKEN ausente do ambiente.");
    return new NextResponse("erro interno de configuração", { status: 500 });
  }

  if (mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("token de verificação inválido", { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  // A validação em si pode lançar exceção se WHATSAPP_APP_SECRET estiver
  // ausente do ambiente — isolamos isso num try/catch próprio pra não
  // derrubar o handler inteiro sem resposta (a Meta reenviaria o evento
  // repetidamente achando que falhou por timeout).
  let signatureValid: boolean;
  try {
    signatureValid = verifyWebhookSignature(rawBody, signature);
  } catch (err) {
    console.error("Webhook WhatsApp: erro ao validar assinatura (env var ausente?):", err);
    return NextResponse.json({ error: "erro interno de configuração" }, { status: 500 });
  }

  if (!signatureValid) {
    console.warn("Webhook WhatsApp: assinatura inválida, requisição ignorada.");
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

    let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  // Log dos status de entrega que a Meta manda de volta (sent/delivered/failed)
  try {
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        for (const status of change?.value?.statuses ?? []) {
          if (status.status === "failed" || status.errors) {
            console.error(
              "WhatsApp ENTREGA FALHOU:",
              JSON.stringify({ para: status.recipient_id, errors: status.errors })
            );
          } else {
            console.log(`WhatsApp status: ${status.status} para ${status.recipient_id}`);
          }
        }
      }
    }
  } catch (err) {
    console.error("Erro ao ler statuses do WhatsApp:", err);
  }

  const messages = parseIncomingMessages(payload);
  for (const message of messages) {
    try {
      // Cada número da Meta pertence a UM estabelecimento (whatsappPhoneId é @unique).
      const establishment = await prisma.establishment.findUnique({
        where: { whatsappPhoneId: message.phoneNumberId },
      });

      if (!establishment) {
        console.warn(`Webhook WhatsApp: nenhum estabelecimento para phone_number_id ${message.phoneNumberId}`);
        continue;
      }

      // Se o texto parece uma confirmação ("sim", "confirmo", etc.) e existe
      // uma entrada NOTIFIED esperando resposta desse telefone, trata como
      // confirmação de horário e NÃO entra na fila de novo. Se não havia
      // nada pra confirmar (ex: "sim" fora de contexto), cai no fluxo normal.
      if (isConfirmationText(message.text)) {
                const handled = await claimOfferedSlotByPhone(establishment.id, message.from);
        if (handled) continue;
        const confirmResult = await confirmNotifiedEntryByPhone(establishment.id, message.from);
        if (confirmResult) {
          continue;
        }
      }

      // Regra inicial simples: qualquer outra mensagem de texto entra na fila.
      // Ajuste esse gatilho depois (ex: só entra se mandar "oi"/"entrar",
      // ou perguntar antes qual serviço o cliente quer).
      await enterQueue({
        establishmentId: establishment.id,
        customerPhone: message.from,
        customerName: message.name,
      });
    } catch (err) {
      console.error("Erro ao processar mensagem do WhatsApp:", err);
      // Não interrompe o loop nem retorna erro pra Meta — ela reenviaria a
      // mesma mensagem várias vezes. Só logamos e seguimos.
    }
  }

  // A Meta exige resposta 200 rápida; se demorar demais ela reenvia o evento.
  return NextResponse.json({ ok: true });
}