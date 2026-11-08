// scripts/test-webhook-full.js
// Simula uma mensagem de texto chegando no webhook, já com assinatura válida.
// Roda com: node scripts/test-webhook-full.js

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Lê o WHATSAPP_APP_SECRET direto do .env.local (sem precisar de dotenv)
const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const match = envContent.match(/WHATSAPP_APP_SECRET="(.+)"/);
if (!match) {
  console.error("WHATSAPP_APP_SECRET não encontrado no .env.local");
  process.exit(1);
}
const appSecret = match[1];

const payload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "1136285432086454",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID },
            contacts: [{ wa_id: "556233333333", profile: { name: "Teste RealTime9" } }],
            messages: [
              {
                from: "556233333333",
                id: "wamid.TESTE" + Date.now(),
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: "oi, quero entrar na fila" },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

const rawBody = JSON.stringify(payload);
const signature = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody, "utf-8").digest("hex");

fetch("http://localhost:3000/api/whatsapp/webhook", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-hub-signature-256": signature,
  },
  body: rawBody,
})
  .then(async (res) => {
    console.log("Status:", res.status);
    console.log("Resposta:", await res.text());
  })
  .catch((err) => console.error("Erro na requisição:", err));
