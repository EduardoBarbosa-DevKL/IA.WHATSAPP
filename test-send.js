require('dotenv').config();

async function main() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = '1317136151489296';
  const to = '5562998341670';

  if (!token) {
    console.error('WHATSAPP_TOKEN não encontrado no .env');
    process.exit(1);
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: 'Teste direto via script - se você recebeu isso, funcionou!' },
    }),
  });

  console.log('Status HTTP:', res.status);
  const body = await res.text();
  console.log('Resposta completa:', body);
}

main();