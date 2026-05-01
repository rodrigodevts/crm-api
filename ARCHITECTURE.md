# ARCHITECTURE.md

> Documento vivo. Atualize a cada decisão arquitetural significativa. Em caso de conflito entre código e documento, o documento ganha — o código deve ser corrigido.
>
> **Versão:** 6 (stack atualizada: Fastify + Zod + nestjs-zod + Scalar + Kubb, naming camelCase)
> **Última atualização:** 27/04/2026

---

## Sumário

1. O produto
2. Princípios não-negociáveis
3. Arquitetura interna (3 camadas)
4. Stack técnica
5. Estrutura dos repositórios
6. Modelo de domínio
7. Multi-tenant
8. Channel Adapter
9. Realtime
10. Filas BullMQ
11. Bot Engine
12. Auth e segurança
13. Working Hours
14. Atendimentos / Tickets
15. Templates HSM
16. Webhooks de saída
17. Integrações externas (Gupshup, Chatwoot)
18. Observabilidade
19. Deploy
20. Decisões em aberto
21. Glossário

---

## 1. O produto

CRM omnichannel multi-tenant focado em WhatsApp, com filas de atendimento, chatbot avançado, kanban de leads e relatórios. Atende empresas brasileiras (foco inicial em prefeituras e PMEs) que precisam centralizar atendimento e automação de WhatsApp.

**Modelo de negócio:** SaaS open-source sob AGPLv3. Receita vem de hospedagem gerenciada, instalação on-premise, customização, suporte e integrações.

**Diferenciais:** código limpo, manutenção contínua, design moderno, Bot Engine genuinamente avançado, multi-canal real, métricas de resolução por bot, tickets em modo bot ocultos da fila.

---

## 2. Princípios não-negociáveis

### Princípios gerais

1. **Domínio limpo, transporte plugável.** A camada de domínio (Ticket, Message, Contact) não conhece canal. Adapters implementam interface comum.

2. **Multi-tenant em todas as camadas.** Toda query, cache, sala WebSocket e job BullMQ é isolado por `companyId`.

3. **Slices verticais.** Implementar feature completa (schema → service → controller → UI) antes da próxima.

4. **Tipos primeiro.** Schema Prisma e DTOs são fonte da verdade.

5. **Testes onde regra de negócio é complexa.** Domain services testáveis isoladamente.

6. **Filosofia médio-termo.** Bem feito, sem over-engineering. Sem CQRS, sem event sourcing, sem DDD ortodoxo.

7. **Código em inglês, documentação em pt-BR.**

8. **Working hours não bloqueia bot.** Bot responde sempre. Working hours aplica em transferência bot→humano e em ticket sem bot.

9. **Bot Engine resolve lógica conversacional internamente.** APIs externas só fazem o que é externo.

10. **Mensageria rica do WhatsApp é first-class.**

11. **Erros nunca são silenciosos.** Cada chamada externa tem mensagem específica por tipo.

12. **Tickets têm protocolo único humano-legível** (`#NNNNN`).

13. **Apenas um ticket OPEN/PENDING por (contact, channelConnection).**

14. **Bot e atendente humano não pisam um no outro.** Atendente assume → bot aborta.

15. **Histórico é append-only e auditável.**

16. **Tickets em bot ficam ocultos da fila padrão de AGENT por default.**

17. **Resolução do ticket é categorizada.** `Ticket.resolvedBy` (BOT/USER/SYSTEM).

18. **Read receipt é manual, não automático.**

### Princípios de arquitetura interna (NOVO na v5)

19. **3 camadas sempre.** Controller (HTTP), Application Service (orquestração), Domain Service (regras de negócio). Sem exceção, mesmo em CRUDs simples — consistência total.

20. **Sem repositórios separados de Prisma.** Domain services acessam Prisma diretamente. Sem dupla modelagem (entidade Prisma e entidade de domínio são a mesma).

21. **Eventos via EventEmitter** (`@nestjs/event-emitter`) pra comunicação entre features sem acoplamento direto.

22. **Sem Clean Architecture, sem Hexagonal, sem DDD ortodoxo.** As 3 camadas são pragmáticas, não dogmáticas.

---

## 3. Arquitetura interna (3 camadas)

> Esta é a arquitetura formal do backend NestJS. **Aplicada uniformemente em todos os módulos**, independente da complexidade.

### 3.1 As 3 camadas

**Controller** — camada de transporte HTTP:

- Recebe request, valida via schema Zod (`ZodValidationPipe`)
- Extrai contexto (`@CurrentUser`, `@CurrentCompany`)
- Chama application service
- Retorna response (DTO ou status code)
- **Nunca** tem regra de negócio
- **Nunca** acessa Prisma diretamente

**Application Service** — camada de orquestração:

- Recebe input já validado do controller
- Chama domain service(s)
- Coordena transações (`prisma.$transaction`)
- Dispara eventos (`eventEmitter.emit`)
- Enfileira jobs BullMQ
- Chama outros application services se necessário
- Constrói DTOs de response
- **Pode** ter lógica de orquestração (chamar X depois Y)
- **Não tem** regras de negócio puras (essas vivem no domain)

**Domain Service** — camada de regras de negócio:

- Lógica do "o que pode/não pode acontecer"
- Validações de negócio (ex: "não pode aceitar ticket que já foi aceito")
- Cálculos (ex: "calcular `totalDurationSec`")
- Acessa Prisma diretamente (sem repository)
- **Recebe `companyId` explicitamente** (multi-tenant)
- **Pode** receber `tx: PrismaTx` para participar de transação coordenada pelo application service
- **Não dispara** eventos nem enfileira jobs (responsabilidade do application service)
- **Não retorna** DTO (retorna entidade Prisma)

### 3.2 Fluxo de uma request típica

```
HTTP request
   ↓
Controller
   - valida DTO
   - extrai @CurrentCompany, @CurrentUser
   ↓
Application Service
   - inicia transação se necessário
   - chama Domain Service(s) dentro da transação
   - dispara eventos após transação
   - enfileira jobs após transação
   - constrói DTO de response
   ↓
Domain Service
   - regras de negócio puras
   - acesso a Prisma (com companyId)
   ↓
Prisma → DB
   ↓
Resposta volta pra Controller
   ↓
Controller retorna DTO
```

### 3.3 Estrutura de arquivos por módulo

Cada módulo segue o mesmo padrão:

```
src/modules/feature-name/
├── feature-name.module.ts
├── controllers/
│   └── feature-name.controller.ts
├── services/
│   ├── feature-name.application.service.ts
│   └── feature-name.domain.service.ts
├── schemas/                                  # Schemas Zod (single source of truth)
│   ├── create-feature.schema.ts              # validação + tipo + OpenAPI
│   ├── update-feature.schema.ts
│   └── feature-response.schema.ts
├── events/                                   # opcional
│   ├── feature-name.events.ts                # definição dos eventos emitidos
│   └── feature-name.listener.ts              # listeners de eventos de outros módulos
├── processors/                               # opcional, se houver fila BullMQ
│   └── feature-name.processor.ts
└── tests/
    ├── feature-name.domain.service.spec.ts
    └── feature-name.controller.e2e-spec.ts
```

**Sobre os schemas Zod:** cada arquivo exporta um schema + um type inferido. Exemplo:

```typescript
// schemas/create-ticket.schema.ts
import { z } from 'zod';

export const CreateTicketSchema = z
  .object({
    contactId: z.string().uuid(),
    channelConnectionId: z.string().uuid(),
    initialMessage: z.string().min(1).max(4096).optional(),
  })
  .describe('Dados para criar novo ticket');

export type CreateTicketDto = z.infer<typeof CreateTicketSchema>;
```

O schema serve **três propósitos** simultaneamente:

1. **Validação** em runtime (via `ZodValidationPipe`)
2. **Tipo TypeScript** (via `z.infer`)
3. **OpenAPI** (gerado automaticamente via `@nestjs/swagger` + `nestjs-zod`)

### 3.4 Geração de boilerplate

Para mitigar o custo de boilerplate em CRUDs simples, usar **gerador de código customizado** baseado no NestJS CLI. Configurar `nest-cli.json` com schematics customizados que geram a estrutura completa de 3 camadas com vazios pré-preenchidos.

Comando alvo: `pnpm g:feature <nome>` (ou `pnpm nest g --collection ./schematics/collection.json feature <nome>`) cria toda a estrutura.

> Esse gerador é tarefa da Fase 0. Pequeno investimento que paga em todas as outras fases.

### 3.5 Exemplo concreto: aceitar ticket

**Schema (Zod):**

```typescript
// schemas/accept-ticket-response.schema.ts
import { z } from 'zod';

export const AcceptTicketResponseSchema = z
  .object({
    id: z.string().uuid(),
    protocol: z.string(),
    status: z.literal('OPEN'),
    assignedUserId: z.string().uuid(),
    acceptedAt: z.string().datetime(),
  })
  .describe('Resposta ao aceitar ticket');

export type AcceptTicketResponseDto = z.infer<typeof AcceptTicketResponseSchema>;
```

**Controller:**

```typescript
import { ZodSerializerDto } from 'nestjs-zod';

@Controller('tickets')
export class TicketsController {
  @Post(':id/accept')
  @ZodSerializerDto(AcceptTicketResponseSchema)
  async accept(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
    @CurrentUser() user: User,
  ): Promise<AcceptTicketResponseDto> {
    return this.ticketsApplicationService.accept(id, companyId, user.id);
  }
}
```

**Application Service:**

```typescript
async accept(
  ticketId: string,
  companyId: string,
  userId: string,
): Promise<AcceptTicketResponseDto> {
  const ticket = await this.prisma.$transaction(async (tx) => {
    const updated = await this.ticketsDomainService.accept(
      ticketId, companyId, userId, tx
    );
    await this.ticketLogDomainService.log(
      updated.id, 'ACCEPTED', userId, null, tx
    );
    return updated;
  });

  if (ticket.flowExecutionId) {
    this.eventEmitter.emit('ticket.accepted.with-bot', {
      ticketId: ticket.id, userId
    });
  }

  await this.webhookDispatcherQueue.add('dispatch', {
    event: 'TICKET_ASSIGNED',
    payload: ticket,
  });

  this.realtimeGateway.emitTicketUpdated(ticket);

  return {
    id: ticket.id,
    protocol: ticket.protocol,
    status: 'OPEN',
    assignedUserId: ticket.assignedUserId!,
    acceptedAt: ticket.updatedAt.toISOString(),
  };
}
```

**Domain Service:**

```typescript
async accept(
  ticketId: string,
  companyId: string,
  userId: string,
  tx: Prisma.TransactionClient,
): Promise<Ticket> {
  const updated = await tx.ticket.updateMany({
    where: {
      id: ticketId,
      companyId,
      status: 'PENDING',
      assignedUserId: null,
    },
    data: {
      status: 'OPEN',
      assignedUserId: userId,
    },
  });

  if (updated.count === 0) {
    throw new ConflictException(
      'Ticket já foi aceito por outro atendente ou não está pendente'
    );
  }

  return tx.ticket.findFirstOrThrow({
    where: { id: ticketId, companyId },
  });
}
```

### 3.6 Quando criar mais de um Domain Service por módulo

Permitido e recomendado quando o módulo tem múltiplas "áreas de responsabilidade":

- `tickets/services/tickets.domain.service.ts` — CRUD de Ticket
- `tickets/services/ticket-log.domain.service.ts` — operações de TicketLog
- `tickets/services/ticket-protocol.domain.service.ts` — geração de protocolo

Cada um expõe operações relacionadas. Application service compõe.

### 3.7 Comunicação entre módulos

**Síncrona:** Application service do módulo A pode injetar Application service do módulo B (DI normal). Use quando o resultado de B é necessário pra A continuar.

**Assíncrona:** Use eventos. Módulo A emite evento, listener do módulo B reage. Use quando A não precisa esperar resposta de B (ex: A criou ticket, B precisa atualizar dashboard).

**Cross-module job:** Application service de A enfileira job que worker de B processa. Use pra trabalho assíncrono pesado.

---

## 4. Stack técnica

### Backend (`crm-api`)

| Componente                     | Versão               | Justificativa                                                      |
| ------------------------------ | -------------------- | ------------------------------------------------------------------ |
| Node.js                        | 22 LTS               | Suporte longo                                                      |
| NestJS                         | 11+                  | Framework do projeto                                               |
| `@nestjs/platform-fastify`     | latest               | HTTP adapter (Fastify, não Express default) — 2-3x throughput      |
| TypeScript                     | 5+ estrito           | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Prisma                         | 6+                   | DX superior, schema declarativo                                    |
| PostgreSQL                     | 16                   | Banco principal                                                    |
| Redis                          | 7+                   | Cache + BullMQ + Socket.IO adapter                                 |
| BullMQ                         | latest               | Jobs assíncronos (equivalente Sidekiq do Chatwoot)                 |
| `@nestjs/bullmq`               | latest               | Integração BullMQ + NestJS                                         |
| `@nestjs/event-emitter`        | latest               | Eventos internos entre módulos                                     |
| Socket.IO                      | 4+ com Redis adapter | Realtime escalável                                                 |
| Zod                            | 3+                   | Schemas de validação (single source of truth)                      |
| `nestjs-zod`                   | latest               | Integração Zod + NestJS (pipe, decorators, OpenAPI)                |
| `@nestjs/swagger`              | latest               | Geração de OpenAPI a partir de schemas Zod                         |
| `@scalar/nestjs-api-reference` | latest               | UI Scalar para servir OpenAPI (substitui Swagger UI)               |
| Passport + JWT                 | latest               | Auth                                                               |
| Pino                           | latest               | Logs estruturados                                                  |
| Vitest                         | latest               | Test runner                                                        |
| jsonlogic-js                   | latest               | Expression engine do Bot                                           |

### Frontend (`crm-web`)

<!-- prettier-ignore -->
| Componente                                   | Versão                                 | Justificativa                                                                        |
| -------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------ |
| Next.js                                      | 15+ App Router                         |                                                                                      |
| Tailwind CSS                                 | 4+                                     |                                                                                      |
| shadcn/ui                                    | latest                                 |                                                                                      |
| TanStack Query                               | 5+                                     |                                                                                      |
| Zustand                                      | latest                                 |                                                                                      |
| React Hook Form + Zod                        | latest (Zod compartilhado com backend) |                                                                                      |
| socket.io-client                             | 4+                                     |                                                                                      |
| React Flow                                   | 12+ (Fase 6)                           |                                                                                      |
| `@kubb/cli` + `@kubb/swagger-tanstack-query` | latest                                 | Geração automática de tipos TS e hooks TanStack Query a partir do OpenAPI do backend |

### Infraestrutura

Docker + Docker Compose (dev), Kubernetes (prod), S3-compatible (mídia), GitHub Actions (CI/CD), Prometheus + Grafana + Loki, Sentry.

### Integrações de canal

- **MVP:** Gupshup (WABA via BSP)
- **Fase 7:** Baileys (não-oficial)
- **Futuro sem fase definida:** outros canais (Telegram, Instagram, etc)

---

## 5. Estrutura dos repositórios

Três repos separados:

- `crm-api` — backend NestJS (público, AGPLv3)
- `crm-web` — frontend Next.js (público, AGPLv3)
- `crm-specs` — auditorias e referências (privado)

### 5.1 Estrutura de `crm-api`

```
crm-api/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/                    # utilitários transversais
│   │   ├── decorators/            # @CurrentUser, @CurrentCompany
│   │   ├── guards/                # JwtAuthGuard, RolesGuard
│   │   ├── interceptors/
│   │   ├── filters/               # AllExceptionsFilter
│   │   ├── pipes/
│   │   └── types/
│   ├── config/                    # configuração tipada (env)
│   ├── database/                  # PrismaModule + service
│   └── modules/                   # cada feature aqui (estrutura 3 camadas)
│       ├── auth/
│       ├── companies/
│       ├── users/
│       ├── tickets/
│       ├── messages/
│       ├── channels/
│       ├── chat-flows/
│       └── ...
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── docs/
│   ├── integrations/
│   │   ├── gupshup.md             # contratos críticos da API Gupshup
│   │   └── gupshup-webhook-payloads/  # exemplos reais de webhook
│   └── chatwoot-reference/        # opcional, traduções de Chatwoot
│       ├── inbox-vs-channelconnection.md
│       └── conversation-vs-ticket.md
├── test/                          # testes e2e
├── ARCHITECTURE.md                # este documento
├── ROADMAP.md
├── CLAUDE.md
└── README.md
```

### 5.2 Estrutura de `crm-web`

```
crm-web/
├── app/
│   ├── (auth)/
│   ├── (dashboard)/
│   │   ├── tickets/
│   │   ├── contacts/
│   │   ├── chat-flows/
│   │   └── ...
│   └── api/                       # BFF se necessário
├── components/
│   ├── ui/                        # shadcn/ui
│   ├── tickets/
│   ├── chat/
│   └── layout/
├── lib/
│   ├── api-client.ts
│   ├── socket-client.ts
│   ├── auth.ts
│   └── generated/                 # gerado pelo Kubb (NÃO EDITAR manualmente)
│       ├── types/                 # tipos TS de todos os DTOs do backend
│       ├── hooks/                 # hooks TanStack Query por endpoint
│       └── client/                # cliente HTTP tipado
├── hooks/                         # hooks customizados (não-gerados)
├── stores/                        # Zustand stores
├── kubb.config.ts                 # configuração do Kubb
└── public/
```

**Sobre a pasta `lib/generated/`:**

- Gerada por `pnpm generate:api` (script no `package.json`)
- Lê o OpenAPI spec do backend (URL ou arquivo local)
- Gera tipos TS, hooks TanStack Query, e cliente HTTP
- **Nunca editar manualmente** — é regenerada a cada mudança de API
- Comitada no repo (não está no `.gitignore`) para CI/CD funcionar sem rodar backend

### 5.3 Estrutura de `crm-specs` (privado)

```
crm-specs/
├── README.md
├── areas/                         # specs descritivas do sistema atual
│   ├── 01-dashboard.md
│   ├── 02-dashboard-abas.md
│   ├── 03-configuracoes.md
│   ├── 04-canais.md
│   ├── 05-bot-fluxo.md
│   ├── 05b-bot-fluxo-caso-real.md
│   ├── 06-atendimentos.md
│   ├── 06b-atendimentos-parte2.md
│   ├── 07-gestao-de-lead.md
│   └── 08-funil.md
├── audits/                        # nossos audits consolidados
│   ├── audit-04-canais.md
│   ├── audit-03A-cadastros-base.md
│   ├── audit-03B-comportamento-global.md
│   ├── audit-03C-integracoes.md
│   ├── audit-03-summary.md
│   ├── audit-05-bot-fluxo.md
│   └── audit-06-atendimentos.md
├── chatwoot-reference/            # opcional, expandir conforme necessidade
│   ├── overall-architecture.md
│   ├── inbox-modeling.md
│   └── conversation-lifecycle.md
└── decisions/                     # ADRs (Architecture Decision Records)
    ├── 0001-3-layer-architecture.md
    ├── 0002-prisma-direct-no-repository.md
    └── ...
```

---

## 6. Modelo de domínio

> O schema completo vive em `prisma/schema.prisma` no repo `crm-api`. Esta seção lista enums e decisões de modelagem cross-modular.

### 6.1 Visão geral

```
Company (tenant)
├── Plan, CompanySettings (13 flags)
├── User (4 perfis), RefreshToken
├── ChannelConnection (provider, defaults, auto-close)
├── MessageTemplate (HSM)
├── BotCredential (cifrada)
├── Department (workingHours, SLA, distribuição)
├── Contact (carteira, status lead, custom fields)
├── Ticket (protocolo, resolvedBy, modo bot, janela 24h)
├── Message (12 tipos polimórficos)
├── MessageAttachment, TicketLog, TicketTag
├── UserTicketPreference (pin, ordenação)
├── CompanyTicketProtocolSequence
├── Tag, QuickReply, CloseReason
├── ChatFlow, FlowExecution, ChatFlowTemplate
├── SalesFunnel, LeadStatus
├── CustomFieldDefinition
├── IntegrationLink (Fase 4)
├── WebhookSubscription, WebhookDelivery (Fase 5)
├── BusinessHoliday (Fase 4+)
└── AuditLog
```

### 6.2 Decisões importantes de modelagem

**Nomenclatura:** Ticket (não Conversation). Departamento (não Queue/Fila). ChannelConnection (não Sessão).

**Mensagens são imutáveis.** Edição gera novo registro com `replacesMessageId`.

**Soft delete** em entidades-chave (`Contact`, `Ticket`, `User`, `ChannelConnection`, `CloseReason`).

**`companyId` em TODA tabela** exceto `Plan` e `_PrismaMigrations`.

**IDs:** UUID v7 (ordenável temporalmente).

**Constraints únicos:**

- `Contact` único por `(companyId, phoneNumber)`
- `ChannelConnection` único por `(companyId, phoneNumber)` e `(companyId, name)`
- 1 Ticket OPEN/PENDING por `(contact, channelConnection)` — enforce no app
- `Ticket.protocol` único por tenant
- `BotCredential.name` único por tenant

**`SalesFunnel` vs `MessageCampaign` (fase 5):** entidades distintas, nomes claros.

### 6.3 Enums e models principais

> Detalhes nos audits específicos. Esta seção é resumo.

Enums principais: `UserRole`, `ChannelProvider`, `ChannelStatus`, `TicketStatus`, `TicketResolutionSource`, `MessageType`, `MessageDirection`, `MessageStatus`, `TicketLogAction`, `DepartmentDistributionMode`, `TagScope`, `QueueSortOrder`, `QuickReplyScope`, `CustomFieldType`, `TemplateCategory`, `TemplateStatus`, `ApiAuthType`, `ChatFlowTriggerType`, `FlowExecutionStatus`, `WebhookEvent`, etc.

Models principais cobertos pelos audits 04, 03A/B/C, 05, 06.

---

## 7. Multi-tenant: row-level

Toda query Prisma filtra por `companyId`. Domain service recebe `companyId` como argumento explícito.

**Convenção manual no MVP.** Cada query carrega `where: { companyId, ... }`.

**Code review valida.** Toda PR é validada antes de merge.

**Cache, sockets, jobs:** sempre prefixados com `companyId`.

**Guard automático em fase futura.** Prisma extension via AsyncLocalStorage. Não é prioridade do MVP.

---

## 8. Channel Adapter

### 8.1 Interface

```typescript
export interface ChannelAdapter {
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

export interface ChannelCapabilities {
  requiresQrAuth: boolean;
  supportsTemplates: boolean;
  supportsCallRejection: boolean;
  has24hWindow: boolean;
  hasMonetaryBalance: boolean;
}
```

### 8.2 Capabilities por provider

| Capability            | GUPSHUP | BAILEYS |
| --------------------- | ------- | ------- |
| requiresQrAuth        | false   | true    |
| supportsTemplates     | true    | false   |
| supportsCallRejection | false   | true    |
| has24hWindow          | true    | false   |
| hasMonetaryBalance    | true    | false   |

### 8.3 Fluxos

**Mensagem entrante:** webhook → HMAC → adapter parseia → BullMQ `process-incoming` → resolve Contact/Ticket → cria Message → eventos.

**Mensagem saindo:** atendente envia → cria Message PENDING → BullMQ `send-message` → adapter envia → atualiza status.

### 8.4 Cifragem de credenciais

`ChannelConnection.config: Bytes` cifrado AES-256-GCM com chave em env var (`CHANNEL_CONFIG_ENCRYPTION_KEY`). Mascaramento por padrão. Endpoint de revelação dedicado.

### 8.5 Documentação Gupshup

Contratos críticos documentados em `crm-api/docs/integrations/gupshup.md`:

- Formato de webhook entrante (request body, headers de assinatura)
- Endpoint de envio de mensagem (todos os tipos: text, media, interactive, template)
- Endpoint de listagem de templates
- Códigos de erro e seus significados

Doc oficial: https://docs.gupshup.io/

---

## 9. Realtime: Socket.IO + Redis adapter

### 9.1 Estrutura de salas

```
company:{companyId}                     # broadcast geral
company:{companyId}:user:{userId}       # eventos pessoais
company:{companyId}:ticket:{ticketId}   # mensagens do ticket
company:{companyId}:department:{deptId} # eventos do departamento
company:{companyId}:channels            # status dos canais
```

### 9.2 Eventos principais

`ticket:created`, `ticket:updated`, `ticket:assigned`, `ticket:transferred`, `ticket:closed`, `ticket:reopened`, `ticket:viewing`, `ticket:typing`, `ticket:contact_typing`, `ticket:read`, `message:new`, `message:status`, `channel:status`.

### 9.3 Auth do socket

JWT no handshake.

### 9.4 Modo busca isolado de realtime

Atendente em modo busca: Socket.IO `ticket:created`/`ticket:updated` **não modificam a lista exibida**. Resolve bug do sistema atual.

---

## 10. Filas BullMQ

### 10.1 Por que BullMQ (e nota sobre Chatwoot)

Chatwoot usa **Sidekiq** (lib Ruby) com Redis. Como nosso stack é Node.js, usamos **BullMQ**, equivalente Node do mesmo padrão. Conceitualmente intercambiáveis: ambos Redis-backed, retry policy, dead-letter, scheduled jobs, dashboard.

**Quando consultar Chatwoot:** classes `*Job` deles são equivalentes a Processors do BullMQ. Padrões de design valem; sintaxe muda.

**Integração NestJS:** `@nestjs/bullmq` com decoradores `@Processor()` e `@Process()`.

### 10.2 Filas

| Fila                          | Propósito         | Frequência               | Fase    |
| ----------------------------- | ----------------- | ------------------------ | ------- |
| `process-incoming`            | Webhook entrante  | sob demanda              | Fase 1  |
| `send-message`                | Mensagem outbound | sob demanda              | Fase 1  |
| `download-media`              | Mídia → S3        | sob demanda              | Fase 1  |
| `auto-close-inactive-tickets` | Fechar inativos   | recorrente, configurável | Fase 1  |
| `sync-templates`              | Templates HSM     | recorrente, diário       | Fase 1  |
| `recalc-whatsapp-window`      | Janela 24h        | recorrente, 1h           | Fase 2  |
| `bot-execute`                 | Passo de bot      | sob demanda              | Fase 3a |
| `bot-resume-delays`           | `WAITING_DELAY`   | recorrente, 30s          | Fase 3a |
| `bot-schedule-trigger`        | Fluxos agendados  | recorrente, 1min         | Fase 3b |
| `webhook-delivery`            | Webhook saída     | sob demanda + retry      | Fase 5  |

### 10.3 Configuração via env vars

```env
AUTO_CLOSE_WORKER_INTERVAL_MINUTES=15
TEMPLATE_SYNC_CRON="0 3 * * *"
WEBHOOK_DELIVERY_MAX_RETRIES=5
CHANNEL_CONFIG_ENCRYPTION_KEY=<hex 32 bytes>
```

### 10.4 Convenções

- Todo job tem `companyId` no payload
- Idempotente
- Retry: 3 tentativas com backoff exponencial (genérico)
- Failed jobs → Bull Board

---

## 11. Bot Engine

> Detalhes em `crm-specs/audits/audit-05-bot-fluxo.md`. Esta seção é resumo.

### 11.1 Tipos de node

**Fase 3a:** `start`, `end`, `send_message`, `capture` (validators), `menu`, `condition`, `set_variable`, `api_request`, `transfer`, `delay`, `loop`.

**Fase 3b:** `subflow`, `schedule`, `branch_jump`, `webhook_trigger`.

### 11.2 Validators built-in

`cpf`, `cnpj`, `cpf_or_cnpj`, `email`, `phone`, `url`, `number`, `date`, `length`, `regex`, `enum`, `custom_api`.

### 11.3 Variáveis built-in

`{{contact.*}}`, `{{ticket.*}}`, `{{company.*}}`, `{{message.*}}`, `{{datetime.*}}`, `{{flow.*}}`. Variáveis customizadas declaradas no fluxo.

### 11.4 Mensageria rica WhatsApp

Texto, image, video, audio, document, location, contact_card, sticker, interactive_buttons, interactive_list, interactive_cta_url, template (HSM).

### 11.5 API HTTP elevada

Node `api_request` com retry policy, response mapping (JSONPath), tratamento granular de erros (timeout/4xx/5xx/parsing/any), referência a `BotCredential` por nome.

### 11.6 GlobalIntent

Avaliados antes de condições locais. Resolvem gambiarra de "replicar Voltar/Sair em cada node".

### 11.7 Wait/resume

`WAITING_FOR_INPUT`, `WAITING_DELAY`, `WAITING_FOR_API`. Workers BullMQ resumem.

### 11.8 Atendente humano assume

Aborta `FlowExecution`. Bot para imediatamente.

### 11.9 Fechamento pelo bot

Calcula `Ticket.resolvedBy = BOT` se humano nunca foi atribuído.

---

## 12. Auth e segurança

### 12.1 Tokens e senhas

- Access JWT: 15min
- Refresh: 7 dias, persistido com `revokedAt`
- bcrypt cost 12, mínimo 8 caracteres
- Force-logout: revoga refresh tokens

### 12.2 Hierarquia de roles

`SUPER_ADMIN` (sistema) > `ADMIN` (tenant) > `SUPERVISOR` (depto) > `AGENT` (próprios tickets).

### 12.3 Webhooks

- Entrada (Gupshup): HMAC-SHA256 com secret do canal
- Saída: HMAC-SHA256 obrigatório, secret único por subscription

### 12.4 Cifragem

AES-256-GCM com chave em env var. Aplicado em `ChannelConnection.config`, `BotCredential.config`, `WebhookSubscription.authConfig`.

### 12.5 Mascaramento

GET retorna últimos 4 chars. Endpoints dedicados de revelação por entidade (apenas ADMIN, com audit log).

### 12.6 LGPD

Soft delete, exportação de Contact, anonimização. Audit log mínimo (`*_credentials_revealed`).

---

## 13. Working Hours

Por departamento (fallback Company). Estrutura JSON com array de ranges. **Não bloqueia bot.** Aplica em transferência bot→humano e ticket sem bot.

`BusinessHoursService.isOpen(departmentId, at?)` e `nextOpenAt()`.

---

## 14. Atendimentos / Tickets

> Detalhes em `crm-specs/audits/audit-06-atendimentos.md`.

### 14.1 Estados

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

### 14.2 Workflows

Mensagem entrante, aceite (lock otimista), transferência, fechamento (com `resolvedBy`), reabertura, auto-close, fechamento pelo bot, janela 24h, pin de ticket.

### 14.3 Composer polimórfico

Conforme `inWhatsappWindow`: composer livre vs HSM.

### 14.4 Distinção visual

3 variantes de bolha de saída: bot, atendente, sistema.

### 14.5 Pin e ordenação

`UserTicketPreference` por usuário. Pin até 10. Ordenação: 4 opções de `QueueSortOrder`.

### 14.6 Visibilidade de bot

`CompanySettings.hideBotTicketsFromAgents` (default true). AGENT não vê tickets em bot.

### 14.7 Painel lateral — 5 abas

Info, Custom Fields, Funil, ChatBot manual, Histórico.

### 14.8 Read receipt manual

Atendente lê sem enviar "azul" automaticamente. Read enviado junto da próxima mensagem outbound.

---

## 15. Templates HSM

`MessageTemplate` por `ChannelConnection`. Sync manual + worker recorrente diário. Sintaxe numerada (`{{1}}`, `{{2}}`).

`HsmTemplateRenderer` separado do `TemplateRenderer` interno (nomeado).

---

## 16. Webhooks de saída

`WebhookSubscription` + `WebhookDelivery` (Fase 5). HMAC-SHA256 obrigatório. Retry exponencial (60s, 120s, 300s, 900s, 3600s). 11 eventos suportados.

---

## 17. Integrações externas

### 17.1 Documentação Gupshup

Contratos críticos documentados em **`crm-api/docs/integrations/gupshup.md`** com exemplos reais. Linka pra doc oficial em `https://docs.gupshup.io/` para detalhes secundários.

Tópicos cobertos:

- Webhook entrante (formato, assinatura, headers)
- API de envio (todos os tipos de mensagem)
- API de listagem de templates HSM
- Códigos de erro
- Limites de rate

Pasta `crm-api/docs/integrations/gupshup-webhook-payloads/` contém exemplos JSON reais (anonimizados) de cada tipo de webhook recebido. Útil pra parser.

### 17.2 Referência Chatwoot

Chatwoot é referência arquitetural (não fork, não código). Estratégia:

1. **Clonar Chatwoot localmente uma vez.** Repo em `~/projects/chatwoot/` ou similar. VS Code aberto ao lado quando codar.

2. **Documentar entidades críticas em `crm-specs/chatwoot-reference/`** quando a tradução não for trivial.

3. **Equivalências mentais:**
   - Chatwoot Account → nosso Company
   - Chatwoot Inbox → nosso ChannelConnection
   - Chatwoot Conversation → nosso Ticket
   - Chatwoot Team → nosso Department
   - Chatwoot Wisper events → nosso EventEmitter
   - Chatwoot Sidekiq Jobs → nossos BullMQ Processors
   - Chatwoot Service Objects → nossos Application/Domain Services
   - Chatwoot Builder Pattern → nossos Application Services

Repo Chatwoot: https://github.com/chatwoot/chatwoot

DeepWiki documentação: https://deepwiki.com/chatwoot/chatwoot

### 17.3 Padrões herdados de Chatwoot

Validados durante auditorias:

<!-- prettier-ignore -->
- Multi-tenancy via foreign key (Account/companyId)
- Polimorfismo de canais (Channel::* / Channel adapters)
- Pub-sub interno (Wisper / EventEmitter)
- State machine de Conversation (mapeada em nosso Ticket)
- Namespacing de API por escopo (Platform/Application/Public)

### 17.4 Padrões NÃO herdados (deliberadamente diferentes)

- Builder Pattern (`AccountBuilder`) → preferimos Application Service direto
- ActiveRecord callbacks (lógica em models) → preferimos Domain Services explícitos
- Concerns Ruby → preferimos composição via DI no NestJS
- Rails Engines pra plugins → fora de escopo MVP

---

## 18. Observabilidade

- **Logs:** Pino estruturado em JSON, com `companyId`, `userId`, `requestId`, `ticketId`
- **Métricas:** Prometheus
- **Errors:** Sentry com `companyId` e `userId`
- **Traces:** OpenTelemetry (fase futura)

---

## 19. Deploy

- **CI:** GitHub Actions
- **CD:** GitHub Actions → registry → K8s
- **Ambientes:** dev, staging, production
- **Migrations:** Prisma migrate deploy em job init do K8s
- **Rollback:** rollback do deployment + migration de rollback se necessário

---

## 20. Decisões em aberto

- [ ] Lib de upload para S3
- [ ] Estratégia exata de sessão Baileys (Fase 7)
- [ ] Stack de billing (fase futura)
- [ ] Gerador de tipos do backend para o frontend
- [ ] **IA / agente conversacional:** sessão dedicada quando priorizada
- [ ] **CSAT:** sessão dedicada na Fase 4
- [ ] **Feriados:** fase 4+
- [ ] **Reply/quote em mensagens:** fase futura
- [ ] **Snooze de ticket:** fase 4 ou futura
- [ ] **App mobile:** sem fase definida
- [ ] **Multi-canal além de Gupshup/Baileys:** sem fase definida

---

## 21. Glossário

**Tenant / Company:** unidade de isolamento.

**Ticket:** atendimento (= Conversation no Chatwoot).

**Departamento:** fila (= Team no Chatwoot, = Queue no Whaticket).

**Canal:** tipo de transporte.

**ChannelConnection:** instância configurada (= Inbox no Chatwoot).

**Carteira:** atendente "dono" de um contato (`Contact.walletUserId`).

**Atendente Padrão / Departamento Padrão:** roteamento default (mutuamente exclusivos).

**Bot Context:** contexto de execução — vive em `FlowExecution`.

**FlowExecution:** instância de execução de ChatFlow.

**BotCredential:** credencial cifrada referenciada por nome.

**GlobalIntent:** intent que interrompe qualquer node aguardando input.

**Expression engine:** sintaxe declarativa (JSONLogic).

**BSP:** Business Solution Provider (Gupshup).

**HSM:** template aprovado pela Meta.

**Janela 24h:** período WhatsApp pra mensagens livres.

**Capability flags:** propriedades expostas pelo adapter pra UI.

**CloseReason:** motivo de fechamento configurável.

**Auto-close:** fechamento por inatividade.

**CompanySettings:** 13 flags de comportamento global.

**SalesFunnel:** funil de CRM (estágios).

**MessageCampaign:** funil de cadência de mensagens (Fase 5+).

**Working hours:** horário de atendimento por departamento.

**WebhookSubscription:** integração de saída (Fase 5).

**IntegrationLink:** atalho pra sistema externo na sidebar (Fase 4).

**TicketLog:** registro append-only.

**MessageAttachment:** anexo com metadata.

**Composer livre / HSM:** dentro vs fora da janela 24h.

**Protocolo:** identificador humano-legível (`#NNNNN`).

**Pin:** ticket fixado no topo da fila por usuário.

**Resolução de ticket:** `BOT/USER/SYSTEM` ao fechar.

**Read receipt manual:** sem "azul" automático ao abrir ticket.

**Modo busca isolado:** eventos não modificam lista durante busca.

**Application Service:** orquestração HTTP-livre (camada 2).

**Domain Service:** regras de negócio (camada 3).

**3 camadas:** controller + application service + domain service. Aplicado uniformemente.
