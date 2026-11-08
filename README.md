# Lista de Espera Inteligente

> App B2B (SaaS) para barbearias, salões, clínicas, tatuadores e manicures. O WhatsApp é a porta de entrada da agenda e o painel web espelha tudo, com controle manual para o estabelecimento.

🚧 **Status: em desenvolvimento.** O núcleo (agenda, lista de interesse, avisos de vaga e painel) está no ar. A conversa guiada completa pelo WhatsApp ainda está sendo construída (veja o [Roadmap](#roadmap)).

🔗 **Demo:** https://ia-whatsapp-seven.vercel.app

<!-- Coloque aqui 2 ou 3 prints do painel (ex.: docs/painel.png) -->
<!-- ![Painel](docs/painel.png) -->

---

## O problema

Horários cancelados em cima da hora viram dinheiro perdido. Filas gerais de espera não funcionam bem: o cliente nunca sabe se vai ser chamado, e o estabelecimento perde tempo avisando pessoas que nem podem naquele horário.

## A ideia

Em vez de uma fila geral, o cliente escolhe **um dia e um horário específicos** para ser avisado caso abra uma vaga.

1. O cliente chama no WhatsApp e escolhe o horário por mensagens interativas (botões e listas). Horários livres = horário de funcionamento menos os agendamentos ativos.
2. Se não há horário livre, ele vê os ocupados e pede aviso para um horário específico (lista de interesse).
3. Quando alguém cancela (pelo WhatsApp ou pelo painel), **só quem pediu exatamente aquele horário** é avisado, todos ao mesmo tempo.
4. O primeiro que responde **SIM** leva o horário, que vira agendamento automaticamente. Quem responde depois é informado de que o horário já foi preenchido.
5. Se ninguém responde no prazo, o horário volta a ficar livre para qualquer um marcar.

## Decisões técnicas

- **Lista de interesse por horário, em vez de fila geral.** Protege contra abuso (100 pessoas ou um ataque entrando na mesma fila) e só avisa quem realmente quer aquele horário. Limites planejados: uma entrada por cliente e horário, máximo de 3 horários por telefone, expiração quando o horário passa e rate limit por número.
- **Concorrência resolvida no banco.** Quando vários clientes respondem SIM ao mesmo tempo, só um vence: o claim do horário usa um `updateMany` condicional no Postgres, então a garantia vem do banco e não da aplicação. Se a criação do agendamento falha, o horário é devolvido.
- **Webhook com verificação de assinatura** das requisições da Meta e log do status de entrega das mensagens (foi o que permitiu diagnosticar falhas de entrega na conta de teste).
- **Conexões com o banco:** a aplicação usa o pooler do Supabase (porta 6543, `pgbouncer=true&connection_limit=1`) para evitar esgotar conexões em ambiente serverless; migrações do Prisma usam uma conexão direta (`DIRECT_URL`, porta 5432).
- **Multi-tenant:** todos os dados pertencem a um `Establishment`, e cada estabelecimento tem seu próprio número de WhatsApp, horários e serviços.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Framework | Next.js 14 (App Router) |
| Linguagem | TypeScript |
| Estilo | Tailwind CSS |
| Banco | PostgreSQL (Supabase) |
| ORM | Prisma 5 |
| Autenticação | NextAuth / Auth.js v5 (Credentials) |
| Tempo real | Supabase Realtime |
| WhatsApp | Meta Cloud API (Graph v21.0) |
| Testes | Vitest |
| Deploy | Vercel (deploy automático a cada push na `main`) |

## Modelo de dados (resumo)

```
Establishment
 ├── Staff             login do estabelecimento
 ├── Service           serviços e duração em minutos
 ├── BusinessHours     horário de funcionamento por dia da semana
 ├── Appointment       horário marcado (SCHEDULED / CANCELLED / DONE)
 ├── QueueEntry        lista de interesse (com desiredDate)
 ├── Slot              horário que vagou (oferta com prazo)
 ├── SlotOffer         quem foi avisado de qual vaga
 └── ConversationState etapa da conversa guiada (em construção)
```

## Estado atual

| Funcionalidade | Status |
| --- | --- |
| Webhook do WhatsApp (verificação, recebimento, status de entrega) | ✅ Pronto |
| Fluxo de confirmação por resposta "SIM" | ✅ Testado de ponta a ponta |
| Painel: login, lista, cancelar, liberar horário | ✅ Pronto |
| Agenda com cancelamento e aviso aos interessados | 🟡 No ar e coberta por testes, ainda não validada no WhatsApp real |
| Testes automatizados (40 testes, Prisma e WhatsApp mockados) | ✅ Passando |
| Conversa guiada no WhatsApp (menu, horários livres, interesse, cancelar) | ⬜ Planejado |

## Roadmap

- [ ] Conversa guiada no WhatsApp com botões e listas (usando `ConversationState`)
- [ ] Parar de enfileirar qualquer texto recebido no webhook
- [ ] Rollback do envio: se o aviso falhar, devolver a entrada para `WAITING` e liberar o horário
- [ ] Normalizar telefones brasileiros com e sem o 9º dígito
- [ ] Tela para o estabelecimento editar o horário de funcionamento
- [ ] Templates aprovados pela Meta para avisos fora da janela de 24h
- [ ] Token de System User (sem expiração) e número WhatsApp Business real
- [ ] Simplificar o painel (Agenda + Interessados)

## Como rodar localmente

Pré-requisitos: Node.js 18+, um banco PostgreSQL (ou projeto no Supabase) e, para testar o WhatsApp, um app na Meta com a Cloud API configurada.

```bash
git clone https://github.com/EduardoBarbosa-DevKL/IA.WHATSAPP.git
cd IA.WHATSAPP
npm install

cp .env.example .env     # preencha com seus valores
npx prisma db push       # cria as tabelas (usa DIRECT_URL)
npm run dev
```

Acesse http://localhost:3000.

### Testes

```bash
npm test
```

### Scripts utilitários

A pasta `scripts/` tem scripts de seed e diagnóstico para ambiente de desenvolvimento (por exemplo, `seed-horarios.js` e `seed-agenda.js`). Eles usam as variáveis `TEST_PHONE` e `TEST_PHONE_BR` do `.env`. Rode com `node scripts/nome-do-script.js`.

## Estrutura

```
├── app/            páginas, painel e rotas de API (incl. webhook do WhatsApp)
├── components/     componentes do painel
├── lib/            lógica de negócio (queue, appointments, whatsapp, auth)
├── prisma/         schema do banco
├── scripts/        seeds e diagnóstico
└── tests/          testes com Vitest
```

## Equipe

- **Eduardo Barbosa:** telas públicas e identidade visual, lógica de horários e agenda, modelagem do banco, testes automatizados e testes com WhatsApp real.
- **Enzo:** integração base com o WhatsApp, autenticação, base da fila, visual do painel, matching por duração e cron de expiração.

## Licença

Projeto em desenvolvimento, sem licença definida.
