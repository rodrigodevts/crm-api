# CLAUDE.md — `src/modules/tickets/`

> Regras específicas do módulo de Tickets — coração do produto.

---

## Antes de modificar este módulo

**LEIA:** `crm-specs/audits/audit-06-atendimentos.md`

Esse audit é fonte da verdade. Tudo aqui deriva dele.

---

## State Machine de Ticket (não-negociável)

```
[PENDING] ──aceitar──▶ [OPEN] ──resolver──▶ [CLOSED]
    │                     │                     │
    └──transferir──▶ [PENDING] (novo dest)       │
                          │                      │
                          └──retornar──▶ [PENDING]│
                                                 │
[CLOSED] ──reabrir manual (ADMIN)──▶ [OPEN]     │
[CLOSED] ──nova mensagem──▶ NOVO ticket [PENDING]
```

**Apenas estes 3 estados:** `PENDING`, `OPEN`, `CLOSED`. Sem estado intermediário.

**Apenas um ticket OPEN/PENDING por (contact, channelConnection).** Validar antes de criar.

---

## Race conditions (CRÍTICO)

Aceite simultâneo de ticket pendente é race condition real. Solução obrigatória: **lock otimista**.

```typescript
const updated = await tx.ticket.updateMany({
  where: {
    id: ticketId,
    companyId,
    status: 'PENDING',
    assignedUserId: null,  // ← garante que não foi aceito por outro
  },
  data: { status: 'OPEN', assignedUserId: userId },
});

if (updated.count === 0) {
  throw new ConflictException('Ticket já foi aceito por outro atendente');
}
```

**NUNCA** usar `findFirst` + `update` sem proteção de concorrência. Race conditions são bug 409.

---

## Cálculo de `resolvedBy`

Ao fechar ticket:

- Atendente humano via API (`POST /:id/close`) → `resolvedBy = USER`
- Bot via node `end` E `assignedUserId` nunca foi populado durante vida do ticket → `resolvedBy = BOT`
- Worker auto-close → `resolvedBy = SYSTEM`
- Reabertura → `resolvedBy = null` (próximo fechamento recalcula)

Para detectar "assignedUserId nunca foi populado", verificar `TicketLog`: se nunca houve `ASSIGNED` ou `ACCEPTED`, foi resolvido só pelo bot.

---

## Geração de protocolo `#NNNNN`

Sequencial por tenant via `CompanyTicketProtocolSequence`. **Transacional** (lock + increment).

```typescript
async generateProtocol(companyId: string, tx: Prisma.TransactionClient): Promise<string> {
  const seq = await tx.companyTicketProtocolSequence.upsert({
    where: { companyId },
    update: { lastNumber: { increment: 1 } },
    create: { companyId, lastNumber: 1 },
  });
  return `#${String(seq.lastNumber).padStart(5, '0')}`;
}
```

Formato: `#` + número com padding zero a 5 dígitos. `#00001`, `#99999`, depois `#100000` (sem padding).

---

## TicketLog é append-only

Toda transição gera `TicketLog`. **Nunca atualizar** ou **deletar** entries de log.

Actions disponíveis (enum `TicketLogAction`):
- `CREATED`, `ACCESSED`, `ASSIGNED`, `ACCEPTED`
- `TRANSFERRED_TO_USER`, `TRANSFERRED_TO_DEPARTMENT`, `RETURNED_TO_DEPARTMENT`
- `RESOLVED`, `REOPENED`
- `TAG_ADDED`, `TAG_REMOVED`
- `STATUS_LEAD_CHANGED`, `CUSTOM_FIELD_UPDATED`
- `BOT_STARTED`, `BOT_ABORTED`, `BOT_COMPLETED`
- `CONTACT_EDITED`
- `AUTO_CLOSED`, `OUT_OF_HOURS_REPLY_SENT`

Implementar como domain service dedicado: `ticket-log.domain.service.ts`.

---

## Bot e atendente humano não pisam um no outro

- Atendente assume ticket → **bot aborta imediatamente** (`BotEngine.abort(flowExecutionId)`)
- Bot **não envia** mensagem se ticket está atribuído a humano
- `Ticket.flowExecutionId` é `null` quando bot terminou ou foi abortado

---

## Janela 24h

`Ticket.inWhatsappWindow` calculado a partir de `lastInboundAt`:
- `now() - lastInboundAt < 24h` → `true`
- Senão → `false`

Quando atualizar:
- Mensagem entrante chega: atualiza `lastInboundAt`
- Worker recorrente `recalc-whatsapp-window` (1h): tickets que cruzaram limite

Composer alterna entre livre e HSM conforme `inWhatsappWindow`.

---

## Visibilidade de tickets em modo bot

`CompanySettings.hideBotTicketsFromAgents` (default `true`):
- AGENT não vê tickets com `isBot=true` E `flowExecution.status=RUNNING`
- ADMIN/SUPERVISOR sempre veem
- AGENT pode ativar filtro avançado "Em fluxo de bot" pra ver

---

## Pin e ordenação

`UserTicketPreference` por usuário:
- `pinnedTicketIds: String[]` (até 10 pins)
- `queueSortOrder` (4 opções de ordenação)

Pinned ignoram ordenação e ficam no topo. Preferência local (não emite Socket.IO).

---

## Modo busca isolado

Atendente em modo busca: eventos `ticket:created` e `ticket:updated` **não modificam a lista exibida** (frontend gerencia, mas backend tem que enviar evento marcado como "search-mode-aware" se necessário).

Resolve bug do sistema atual.

---

## Read receipt manual

Atendente abrir ticket **NÃO envia "azul" automaticamente**. Read enviado junto da próxima mensagem outbound (WhatsApp manda implicitamente).

`PATCH /tickets/:id/messages/read` é manual.

---

## Endpoints críticos

Todos com lock otimista quando aplicável:
- `POST /tickets/:id/accept` ← race condition
- `POST /tickets/:id/transfer` ← race condition (transferência simultânea)
- `POST /tickets/:id/close` ← calcula resolvedBy
- `POST /tickets/:id/reopen` ← apenas ADMIN/SUPERVISOR

---

## Testes obrigatórios

Antes de mergear PR no módulo Tickets:

- [ ] Unit do `tickets.domain.service.ts` cobrindo state machine
- [ ] Unit de `ticket-log.domain.service.ts`
- [ ] Unit de `ticket-protocol.domain.service.ts`
- [ ] E2E de aceite com race condition (Promise.all 2 requests, 1 ganha)
- [ ] E2E de isolamento multi-tenant (user de A não vê ticket de B)
- [ ] E2E de fluxo completo: criar → aceitar → transferir → fechar → reabrir
- [ ] E2E de auto-close por inatividade