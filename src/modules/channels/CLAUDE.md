# CLAUDE.md — `src/modules/channels/`

> Regras específicas do módulo de Canais (ChannelConnection + adapters).

---

## Antes de modificar este módulo

**LEIA:** `crm-specs/audits/audit-04-canais.md`

Para integração com Gupshup: **`docs/integrations/gupshup.md`** + doc oficial Gupshup.

---

## Channel Adapter pattern

Toda comunicação com canais externos passa pela interface `ChannelAdapter`:

```typescript
interface ChannelAdapter {
  getProvider(): ChannelProvider;
  getCapabilities(): ChannelCapabilities;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  restart(): Promise<void>;
  getStatus(): ChannelStatus;
  sendMessage(params: SendMessageParams): Promise<SendMessageResult>;
  parseInboundWebhook?(payload: unknown): InboundMessage[];
  verifyWebhookSignature?(payload: unknown, signature: string): boolean;
  fetchTemplates?(): Promise<TemplateData[]>;
}
```

Implementações:
- `GupshupAdapter` (Fase 1)
- `BaileysAdapter` (Fase 7)

---

## Capabilities por provider

| Capability            | GUPSHUP | BAILEYS |
| --------------------- | ------- | ------- |
| requiresQrAuth        | false   | true    |
| supportsTemplates     | true    | false   |
| supportsCallRejection | false   | true    |
| has24hWindow          | true    | false   |
| hasMonetaryBalance    | true    | false   |

Frontend usa capabilities pra decidir quais campos mostrar. **Nunca hardcode tipo no frontend.**

---

## Cifragem de credenciais (CRÍTICO)

`ChannelConnection.config: Bytes` cifrado AES-256-GCM com `CHANNEL_CONFIG_ENCRYPTION_KEY` (env var).

**Backend NUNCA retorna `config` em texto plano em GET endpoints.**

GET retorna mascarado:
```json
{
  "config": {
    "apiKey": "***xyz9",
    "appId": "***ddee"
  }
}
```

Endpoint dedicado de revelação:
- `POST /channels/:id/reveal-credentials`
- Apenas role `ADMIN`
- Retorna valor completo
- **Registra em `AuditLog`** com `action="channel_credentials_revealed"`

---

## Webhook entrante

Endpoint público: `POST /webhooks/channel/:connectionId`

Sem JWT (webhook vem do provider externo). Validação por **HMAC-SHA256** com secret específico do canal.

```typescript
async processWebhook(channelId: string, payload: unknown, signature: string) {
  const channel = await this.prisma.channelConnection.findUnique({
    where: { id: channelId },
  });
  if (!channel) throw new NotFoundException();

  const adapter = this.buildAdapter(channel);
  if (!adapter.verifyWebhookSignature(payload, signature)) {
    throw new UnauthorizedException();
  }

  // Daqui pra frente, USA channel.companyId em TUDO
  await this.processIncomingQueue.add('process', {
    companyId: channel.companyId,
    channelId: channel.id,
    payload,
  });
}
```

---

## State machine de canal

```
INACTIVE ──activate──▶ CONNECTING ──ok──▶ CONNECTED
                              │              │
                              │ erro         │ heartbeat falha
                              ▼              ▼
                            ERROR ◀───── DISCONNECTED ──reconnect──▶ CONNECTING

Para Baileys (fase 7):
CONNECTING ──aguardando QR──▶ AWAITING_QR ──QR scaneado──▶ CONNECTED
```

Eventos Socket.IO em mudanças críticas: `channel:status` e `channel:error`.

---

## Auto-close por inatividade

Worker recorrente `auto-close-inactive-tickets`:
- Intervalo configurável via `AUTO_CLOSE_WORKER_INTERVAL_MINUTES` (default 15)
- Para cada `ChannelConnection` com `inactivityTimeoutMinutes != null`:
  - Busca tickets `OPEN` com `lastInboundAt < now() - inactivityTimeoutMinutes`
  - **Pula tickets em modo bot** (`isBot=true` E `flowExecution.status=RUNNING`)
  - Envia `CloseReason.message` antes de fechar (se houver)
  - `Ticket.resolvedBy = SYSTEM`
  - Cria `TicketLog.AUTO_CLOSED`

---

## Fluxo de mensagem entrante

```
Webhook → POST /webhooks/channel/:id
   ↓
Verifica HMAC-SHA256
   ↓
Adapter.parseInboundWebhook → InboundMessage[]
   ↓
Para cada mensagem:
   ↓
   Job BullMQ "process-incoming" com companyId
   ↓
ProcessIncomingWorker:
   1. Aplica CompanySettings.ignoreGroupMessages se aplicável
   2. Resolve/cria Contact por (companyId, phoneNumber)
   3. Resolve/cria Ticket:
      - Existe OPEN/PENDING para (contact, channel)? → agrega
      - Senão, cria novo (regra de roteamento)
      - Sem bot configurado? → BusinessHoursService.isOpen() decide
   4. Atualiza Ticket.lastInboundAt
   5. Cria Message INBOUND
   6. Aplica forceWalletRouting se configurado
   7. Inicia/continua FlowExecution se aplicável
   8. Eventos Socket.IO + WebhookDispatcher
```

---

## Fluxo de mensagem outbound

```
Atendente envia → POST /tickets/:id/messages
   ↓
Cria Message com status PENDING
   ↓
Enfileira "send-message" no BullMQ
   ↓
SendMessageWorker:
   1. Carrega Ticket + ChannelConnection
   2. Constrói adapter via factory
   3. adapter.sendMessage()
   4. Atualiza Message com externalId e status SENT
   5. Emite evento via Socket.IO

WhatsApp envia DELIVERED/READ via webhook → atualiza Message.status
```

---

## Roteamento de novo ticket

Quando cria ticket sem bot configurado:

1. Se `Contact.defaultUserId` existe → atribui ao usuário, nasce `OPEN`
2. Se `Contact.defaultDepartmentId` existe → vincula depto, nasce `PENDING`
3. Se `ChannelConnection.defaultDepartmentId` existe → vincula depto, nasce `PENDING`
4. Senão → sem vínculo, `PENDING` visível só a `ADMIN`

Aplicar `BusinessHoursService.isOpen()` em ticket sem bot:
- Aberto → cria normal
- Fechado → envia `outOfHoursMessage` se configurada, ticket fica `OPEN` na fila do depto

---

## Testes obrigatórios

- Unit do `GupshupAdapter` com mock de HTTP
- Unit de cifragem/decifragem de `config`
- Unit de mascaramento (GET retorna `***last4`)
- E2E de criação de canal com revelação de credenciais (audit log gerado)
- E2E de webhook entrante (assinatura válida + inválida)
- E2E de race condition em criação simultânea de tickets do mesmo contato

---

## NÃO fazer

- ❌ Hardcode credenciais Gupshup em qualquer arquivo
- ❌ Logar `config` cifrado ou decifrado
- ❌ Permitir mudança de `provider` em PATCH (imutável após criação)
- ❌ Permitir 2 canais com mesmo `(companyId, phoneNumber)` — constraint do DB
- ❌ Esquecer de invalidar adapter cache quando `config` muda em PATCH