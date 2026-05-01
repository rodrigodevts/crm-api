# Sprint 0.2 — Schema do núcleo (Prisma) — Design

> **Sprint:** Fase 0 → "Schema do núcleo (Prisma)" (ROADMAP §5)
> **Branch:** `feat/sprint-0-2-schema-nucleo`
> **Data:** 2026-05-01
> **Status:** approved (aguardando review do spec escrito)

---

## 1. Objetivo

Modelar todo o schema Prisma do núcleo do DigiChat e da preparação para integrações, conforme ROADMAP §5 → "Schema do núcleo (Prisma)". Sem módulos NestJS, sem services, sem endpoints. Apenas:

1. `prisma/schema.prisma` com todos os models do núcleo, dos cadastros, das integrações (schema-only) e dos stubs forward para FKs futuras.
2. Migration inicial `init_core_schema` aplicável em base limpa.
3. `prisma/seed.ts` idempotente (1 Plan, 1 Company, 1 CompanySettings, 1 SUPER_ADMIN).
4. Suite de testes Vitest cobrindo constraints multi-tenant críticos.
5. Atualização do `prisma/CLAUDE.md` corrigindo nota sobre UUID v7.

Tudo dentro do orçamento conceitual de "5-6 semanas" da Fase 0; este sub-passo cabe em ~5 dias.

## 2. Premissas e decisões prévias

| #   | Decisão                                                                                                                                                                                                                       | Origem                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| P1  | Multi-tenant row-level: `companyId` em toda tabela exceto `Plan`                                                                                                                                                              | CLAUDE.md regra 1, audit-03A                                  |
| P2  | UUID v7 nativo via `@default(uuid(7))` (Prisma 5.14+, sem extensão Postgres)                                                                                                                                                  | Prisma docs; `prisma/CLAUDE.md` desatualizado, será corrigido |
| P3  | Stubs minimalistas para entidades de fases futuras (FK forward)                                                                                                                                                               | confirmado durante brainstorming                              |
| P4  | Soft delete em entidades-chave; comportamento documentado por teste, sem índice parcial nesta sprint                                                                                                                          | `prisma/CLAUDE.md`, ARCH §6.2                                 |
| P5  | Schema único monolítico em `prisma/schema.prisma`                                                                                                                                                                             | `prisma/CLAUDE.md`                                            |
| P6  | Sem `EncryptionService` ainda — schema declara `BotCredential.config Bytes` (não-nullable), mas seed não cria nenhum `BotCredential` (só Plan/Company/Settings/User). Cifragem de fato vem na sprint "Services foundationais" | esta sprint é schema-only                                     |
| P7  | Migration única `init_core_schema` (primeira do projeto)                                                                                                                                                                      | confirmado durante brainstorming                              |
| P8  | Testes via Vitest + `@testcontainers/postgresql` (Postgres efêmero por suite)                                                                                                                                                 | confirmado: opção B do brainstorming                          |

## 3. Setup e ferramentas

### 3.1 Dependências a adicionar

**Runtime (`dependencies`):**

- `@prisma/client`@^6 — cliente Prisma
- `bcrypt`@^5 — hash de senha do seed (já vai entrar na sprint Auth de qualquer forma; antecipar evita placeholder)
- `@types/bcrypt`@^5 (devDep)

**Dev (`devDependencies`):**

- `prisma`@^6 — CLI/generator
- `tsx`@^4 — runner de `seed.ts` e dos testes que precisam de TS direto
- `@testcontainers/postgresql`@^10 — Postgres efêmero para testes de schema
- `testcontainers`@^10 (transitiva, mas explicito)

### 3.2 Configuração

**`prisma/schema.prisma` (header):**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**`package.json` — bloco `prisma` (chave top-level):**

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

**Scripts a adicionar:**

```json
{
  "scripts": {
    "db:migrate": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:seed": "prisma db seed",
    "db:reset": "prisma migrate reset",
    "db:studio": "prisma studio",
    "test:schema": "vitest run -c vitest.schema.config.ts"
  }
}
```

### 3.3 Variáveis de ambiente

`.env.example` (criar/atualizar):

```
DATABASE_URL="postgresql://digichat:digichat@localhost:5432/digichat?schema=public"
SEED_SUPER_ADMIN_EMAIL="super@digichat.local"
SEED_SUPER_ADMIN_PASSWORD="changeme-only-for-dev"
```

`docker-compose.yml` — sem mudança (já tem Postgres 16).

## 4. Padrões aplicados a TODOS os models

| Padrão       | Implementação                                                                                |
| ------------ | -------------------------------------------------------------------------------------------- |
| ID           | `id String @id @default(uuid(7)) @db.Uuid`                                                   |
| Tenant       | `companyId String @db.Uuid` (exceto `Plan`); `@@index([companyId])`                          |
| Timestamps   | `createdAt DateTime @default(now())` + `updatedAt DateTime @updatedAt`                       |
| Soft delete  | `deletedAt DateTime?` em entidades-chave (lista §7.1)                                        |
| FK do tenant | `company Company @relation(fields: [companyId], references: [id], onDelete: Restrict)`       |
| Naming       | Models PascalCase singular; campos camelCase; enums PascalCase singular; valores UPPER_SNAKE |

**Soft delete é aplicado em:** `User`, `Department`, `CloseReason`, `WebhookSubscription` + os stubs forward (`Contact`, `Ticket`, `ChannelConnection`, `ChatFlow`).

## 5. Núcleo (5 models)

### 5.1 Plan

Único model **sem `companyId`**. Catálogo global.

```
model Plan {
  id          String   @id @default(uuid(7)) @db.Uuid
  name        String   @unique
  description String?
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  companies   Company[]
}
```

Sem campos de "limites de cobrança" (out-of-scope; billing é fase futura).

### 5.2 Company

Tenant. Campos do Audit 03B + `slug` único global para URLs amigáveis.

```
model Company {
  id                  String   @id @default(uuid(7)) @db.Uuid
  planId              String   @db.Uuid
  name                String
  slug                String   @unique
  active              Boolean  @default(true)

  defaultWorkingHours Json?
  outOfHoursMessage   String?
  timezone            String   @default("America/Sao_Paulo")

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  deletedAt           DateTime?

  plan                Plan     @relation(fields: [planId], references: [id], onDelete: Restrict)
  settings            CompanySettings?

  // Relações reversas (cada filha declara seu lado; aqui apenas o tipo de coleção):
  users                 User[]
  departments           Department[]
  tags                  Tag[]
  quickReplies          QuickReply[]
  closeReasons          CloseReason[]
  salesFunnels          SalesFunnel[]
  leadStatuses          LeadStatus[]
  customFieldDefinitions CustomFieldDefinition[]
  businessHolidays      BusinessHoliday[]
  integrationLinks      IntegrationLink[]
  messageTemplates      MessageTemplate[]
  botCredentials        BotCredential[]
  webhookSubscriptions  WebhookSubscription[]
  webhookDeliveries     WebhookDelivery[]
  auditLogs             AuditLog[]
  refreshTokens         RefreshToken[]
  // Stubs forward
  channelConnections    ChannelConnection[]
  chatFlows             ChatFlow[]
  contacts              Contact[]
  tickets               Ticket[]

  @@index([planId])
  @@index([active])
}
```

### 5.3 CompanySettings (13 flags)

1:1 com `Company`. **12 flags do Audit 03B** + **`hideBotTicketsFromAgents`** antecipado (CLAUDE.md menciona explicitamente "13 flags incluindo hideBotTicketsFromAgents").

```
model CompanySettings {
  id        String @id @default(uuid(7)) @db.Uuid
  companyId String @unique @db.Uuid

  // Visibilidade de tickets
  hideOtherUsersTickets                  Boolean @default(true)
  agentSeeOtherUsersTicketsOnSameChannel Boolean @default(false)
  agentSeeTicketsWithOtherDefaultAgents  Boolean @default(true)

  // Privacidade
  hidePhoneFromAgents                    Boolean @default(false)

  // Grupos
  ignoreGroupMessages                    Boolean @default(false)
  showAssignedGroups                     Boolean @default(false)

  // Roteamento
  forceWalletRouting                     Boolean @default(false)

  // Permissões de AGENT
  agentCanDeleteContacts                 Boolean @default(false)
  agentCanChangeDefaultAgent             Boolean @default(false)
  agentCanEditTags                       Boolean @default(false)
  agentCanToggleSignature                Boolean @default(false)

  // Bot — antecipado da Fase 2
  hideBotTicketsFromAgents               Boolean @default(true)

  // Bot fallback (Fase 3a)
  defaultBotChatFlowId                   String? @db.Uuid

  createdAt                              DateTime @default(now())
  updatedAt                              DateTime @updatedAt

  company            Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  defaultBotChatFlow ChatFlow? @relation(fields: [defaultBotChatFlowId], references: [id], onDelete: SetNull)

  @@index([companyId])
}
```

### 5.4 User

Audit 03A. Email normalizado lowercase no app antes de gravar (case-insensitive sem precisar de `Citext`).

```
enum UserRole {
  SUPER_ADMIN
  ADMIN
  SUPERVISOR
  AGENT
}

model User {
  id              String   @id @default(uuid(7)) @db.Uuid
  companyId       String   @db.Uuid
  name            String
  email           String
  passwordHash    String
  role            UserRole

  absenceMessage  String?
  absenceActive   Boolean  @default(false)
  lastSeenAt      DateTime?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  company         Company           @relation(fields: [companyId], references: [id], onDelete: Restrict)
  departments     UserDepartment[]
  refreshTokens   RefreshToken[]
  quickReplies    QuickReply[]
  auditLogs       AuditLog[]

  @@unique([companyId, email])
  @@index([companyId])
  @@index([companyId, role])
}
```

### 5.5 RefreshToken

Auth foundation (Audit 03A D-USER-3). Inclui `companyId` denormalizado para conformar com regra 1 e simplificar force-logout.

`tokenHash` é **SHA-256 do refresh token** (determinístico, permite lookup por hash). Bcrypt é o caminho errado aqui — refresh token tem entropia alta (≥32 bytes) e precisa de matching exato em milhões de requests; SHA-256 é o padrão da indústria para esse caso. Em runtime, o token bruto sai apenas para o cliente; o servidor só guarda o hash.

```
model RefreshToken {
  id         String   @id @default(uuid(7)) @db.Uuid
  companyId  String   @db.Uuid
  userId     String   @db.Uuid
  tokenHash  String   @unique  // SHA-256(token), hex
  expiresAt  DateTime
  revokedAt  DateTime?
  ipAddress  String?
  userAgent  String?
  createdAt  DateTime @default(now())

  company    Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([companyId])
  @@index([userId, revokedAt])
  @@index([expiresAt])
}
```

## 6. Cadastros (8 models)

Schema literalmente conforme audits 03A e 03B. Resumido aqui; spec exato fica em `prisma/schema.prisma` final.

### 6.1 Department + UserDepartment

```
enum DepartmentDistributionMode {
  MANUAL
  RANDOM
  BALANCED
  SEQUENTIAL
}

model Department {
  id                   String   @id @default(uuid(7)) @db.Uuid
  companyId            String   @db.Uuid
  name                 String
  active               Boolean  @default(true)

  greetingMessage      String?
  outOfHoursMessage    String?
  workingHours         Json?

  slaResponseMinutes   Int?
  slaResolutionMinutes Int?

  distributionMode     DepartmentDistributionMode @default(MANUAL)

  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  deletedAt            DateTime?

  company              Company  @relation(fields: [companyId], references: [id], onDelete: Restrict)
  users                UserDepartment[]
  closeReasons         CloseReasonDepartment[]

  @@unique([companyId, name])
  @@index([companyId])
}

model UserDepartment {
  userId       String @db.Uuid
  departmentId String @db.Uuid

  user         User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  department   Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)

  @@id([userId, departmentId])
  @@index([departmentId])
}
```

### 6.2 Tag (com scope) + ContactTag/TicketTag stubs

```
enum TagScope {
  CONTACT
  TICKET
  BOTH
}

model Tag {
  id          String   @id @default(uuid(7)) @db.Uuid
  companyId   String   @db.Uuid
  name        String
  color       String   // hex #RRGGBB validado no app
  scope       TagScope @default(BOTH)
  active      Boolean  @default(true)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  company     Company      @relation(fields: [companyId], references: [id], onDelete: Restrict)
  contactTags ContactTag[]
  ticketTags  TicketTag[]

  @@unique([companyId, name])
  @@index([companyId, scope])
}
```

`ContactTag` e `TicketTag` são tabelas m:n minimalistas (PK composta `[contactId, tagId]` / `[ticketId, tagId]`); detalhes "addedByUserId" da Fase 2 são out-of-scope desta sprint.

### 6.3 QuickReply (com escopo COMPANY/PERSONAL)

```
enum QuickReplyScope {
  COMPANY
  PERSONAL
}

model QuickReply {
  id            String   @id @default(uuid(7)) @db.Uuid
  companyId     String   @db.Uuid
  shortcut      String
  message       String
  mediaUrl      String?
  mediaMimeType String?

  scope         QuickReplyScope
  ownerUserId   String?  @db.Uuid

  active        Boolean  @default(true)

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  company       Company  @relation(fields: [companyId], references: [id], onDelete: Restrict)
  ownerUser     User?    @relation(fields: [ownerUserId], references: [id], onDelete: Cascade)

  @@unique([companyId, scope, ownerUserId, shortcut])
  @@index([companyId, scope])
}
```

### 6.4 CloseReason + CloseReasonDepartment

```
model CloseReason {
  id              String   @id @default(uuid(7)) @db.Uuid
  companyId       String   @db.Uuid
  name            String
  message         String?
  active          Boolean  @default(true)
  sortOrder       Int      @default(0)

  triggersCsat    Boolean  @default(false)
  asksDealValue   Boolean  @default(false)

  funnelId        String?  @db.Uuid

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  company         Company       @relation(fields: [companyId], references: [id], onDelete: Restrict)
  funnel          SalesFunnel?  @relation(fields: [funnelId], references: [id], onDelete: SetNull)
  departments     CloseReasonDepartment[]

  @@unique([companyId, name])
  @@index([companyId])
}

model CloseReasonDepartment {
  closeReasonId String @db.Uuid
  departmentId  String @db.Uuid

  closeReason   CloseReason @relation(fields: [closeReasonId], references: [id], onDelete: Cascade)
  department    Department  @relation(fields: [departmentId], references: [id], onDelete: Cascade)

  @@id([closeReasonId, departmentId])
  @@index([departmentId])
}
```

### 6.5 SalesFunnel + LeadStatus

```
enum LeadStatusFinalKind {
  WON
  LOST
}

model SalesFunnel {
  id           String   @id @default(uuid(7)) @db.Uuid
  companyId    String   @db.Uuid
  name         String
  active       Boolean  @default(true)
  sortOrder    Int      @default(0)

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  company      Company       @relation(fields: [companyId], references: [id], onDelete: Restrict)
  leadStatuses LeadStatus[]
  closeReasons CloseReason[]

  @@unique([companyId, name])
  @@index([companyId])
}

model LeadStatus {
  id          String   @id @default(uuid(7)) @db.Uuid
  companyId   String   @db.Uuid
  funnelId    String   @db.Uuid
  name        String
  color       String
  sortOrder   Int      @default(0)
  isInitial   Boolean  @default(false)
  isFinal     Boolean  @default(false)
  finalKind   LeadStatusFinalKind?
  active      Boolean  @default(true)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  company     Company     @relation(fields: [companyId], references: [id], onDelete: Restrict)
  funnel      SalesFunnel @relation(fields: [funnelId], references: [id], onDelete: Cascade)
  contacts    Contact[]   @relation("ContactLeadStatus")

  @@unique([companyId, funnelId, name])
  @@index([companyId, funnelId])
}
```

### 6.6 CustomFieldDefinition

```
enum CustomFieldType {
  TEXT
  NUMBER
  DATE
  BOOLEAN
  SELECT
  EMAIL
  PHONE
  URL
}

enum CustomFieldEntity {
  CONTACT
  TICKET
  BOTH
}

model CustomFieldDefinition {
  id        String   @id @default(uuid(7)) @db.Uuid
  companyId String   @db.Uuid
  name      String
  key       String
  type      CustomFieldType
  required  Boolean  @default(false)
  options   Json?
  active    Boolean  @default(true)
  sortOrder Int      @default(0)
  appliesTo CustomFieldEntity

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  company   Company  @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@unique([companyId, key])
  @@index([companyId, appliesTo])
}
```

### 6.7 BusinessHoliday

```
model BusinessHoliday {
  id            String   @id @default(uuid(7)) @db.Uuid
  companyId     String   @db.Uuid
  date          DateTime @db.Date
  name          String
  appliesToAll  Boolean  @default(true)
  departmentIds String[] @db.Uuid

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  company       Company  @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@index([companyId, date])
}
```

Sem CRUD/módulo — Fase 4+.

## 7. Integrações (5 models — schema-only)

Audit 03C + Audit 05 (BotCredential).

### 7.1 IntegrationLink

```
enum IntegrationOpenMode {
  NEW_TAB
  IFRAME
}

enum IntegrationVisibility {
  ALL_USERS
  ADMINS_ONLY
}

model IntegrationLink {
  id        String   @id @default(uuid(7)) @db.Uuid
  companyId String   @db.Uuid
  name      String
  url       String
  iconUrl   String?
  openMode  IntegrationOpenMode  @default(NEW_TAB)
  visibleTo IntegrationVisibility @default(ALL_USERS)
  active    Boolean  @default(true)
  sortOrder Int      @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  company   Company  @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@index([companyId])
}
```

### 7.2 MessageTemplate

```
enum TemplateCategory {
  MARKETING
  UTILITY
  AUTHENTICATION
}

enum TemplateStatus {
  PENDING
  APPROVED
  REJECTED
  DISABLED
  PAUSED
}

enum TemplateHeaderType {
  TEXT
  IMAGE
  VIDEO
  DOCUMENT
}

model MessageTemplate {
  id                  String   @id @default(uuid(7)) @db.Uuid
  companyId           String   @db.Uuid
  channelConnectionId String   @db.Uuid
  externalId          String
  name                String
  category            TemplateCategory
  status              TemplateStatus
  language            String
  bodyText            String
  headerType          TemplateHeaderType?
  headerText          String?
  footerText          String?
  buttons             Json?
  variables           Int      @default(0)
  rejectionReason     String?
  lastSyncedAt        DateTime

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  company             Company           @relation(fields: [companyId], references: [id], onDelete: Restrict)
  channelConnection   ChannelConnection @relation(fields: [channelConnectionId], references: [id], onDelete: Cascade)

  @@unique([channelConnectionId, externalId])
  @@unique([channelConnectionId, name, language])
  @@index([companyId, status])
}
```

### 7.3 BotCredential

```
enum ApiAuthType {
  NONE
  BEARER_TOKEN
  API_KEY_HEADER
  BASIC_AUTH
  CUSTOM_HEADERS
}

model BotCredential {
  id          String   @id @default(uuid(7)) @db.Uuid
  companyId   String   @db.Uuid
  name        String
  description String?
  authType    ApiAuthType
  config      Bytes
  active      Boolean  @default(true)

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  company     Company  @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@unique([companyId, name])
  @@index([companyId])
}
```

`config` é `Bytes` cifrado AES-256-GCM em runtime (Fase 3a). Nesta sprint, só schema.

### 7.4 WebhookSubscription + WebhookDelivery

```
enum WebhookAuthType {
  NONE
  BEARER_TOKEN
  HMAC_SHA256
  BASIC_AUTH
}

enum WebhookEvent {
  CONTACT_CREATED
  CONTACT_UPDATED
  TICKET_CREATED
  TICKET_ASSIGNED
  TICKET_UPDATED
  TICKET_TRANSFERRED
  TICKET_CLOSED
  TICKET_ARCHIVED
  MESSAGE_CREATED
  MESSAGE_STATUS_CHANGED
  CHANNEL_STATUS_CHANGED
}

enum WebhookDeliveryStatus {
  PENDING
  SUCCESS
  RETRYING
  FAILED
  CANCELLED
}

model WebhookSubscription {
  id                  String   @id @default(uuid(7)) @db.Uuid
  companyId           String   @db.Uuid
  name                String
  url                 String
  active              Boolean  @default(true)

  channelConnectionId String?  @db.Uuid

  secret              String
  authType            WebhookAuthType  @default(NONE)
  authConfig          Bytes?

  events              WebhookEvent[]

  maxRetries          Int      @default(5)
  retryBackoffSec     Int      @default(60)

  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  deletedAt           DateTime?

  company             Company             @relation(fields: [companyId], references: [id], onDelete: Restrict)
  channelConnection   ChannelConnection?  @relation(fields: [channelConnectionId], references: [id], onDelete: SetNull)
  deliveries          WebhookDelivery[]

  @@unique([companyId, name])
  @@index([companyId])
}

model WebhookDelivery {
  id             String   @id @default(uuid(7)) @db.Uuid
  companyId      String   @db.Uuid
  subscriptionId String   @db.Uuid
  event          WebhookEvent
  payload        Json
  attempts       Int      @default(0)
  status         WebhookDeliveryStatus
  lastAttemptAt  DateTime?
  nextRetryAt    DateTime?
  responseStatus Int?
  responseBody   String?
  errorMessage   String?
  createdAt      DateTime @default(now())

  company        Company             @relation(fields: [companyId], references: [id], onDelete: Restrict)
  subscription   WebhookSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  @@index([companyId])
  @@index([subscriptionId, status])
  @@index([nextRetryAt, status])
}
```

`WebhookDelivery` recebe `companyId` denormalizado (deriva de `subscription.companyId`) para acelerar relatórios e cumprir regra "todas tabelas têm companyId".

## 8. AuditLog

Append-only. Sem `updatedAt`, sem soft delete.

```
model AuditLog {
  id          String   @id @default(uuid(7)) @db.Uuid
  companyId   String   @db.Uuid
  actorUserId String?  @db.Uuid
  action      String
  resource    String
  resourceId  String   @db.Uuid
  metadata    Json?
  ipAddress   String?
  userAgent   String?
  createdAt   DateTime @default(now())

  company    Company @relation(fields: [companyId], references: [id], onDelete: Restrict)
  actorUser  User?   @relation(fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([companyId, resource, resourceId])
  @@index([companyId, action])
  @@index([companyId, createdAt])
}
```

## 9. Stubs forward (4 models + 2 m:n)

### 9.1 Marcação no schema

Cada stub tem comentário inline `/// STUB — expanded in Phase X` para sinalizar que campos virão depois.

### 9.2 ChannelConnection (Fase 1)

```
/// STUB — expanded in Phase 1
model ChannelConnection {
  id        String   @id @default(uuid(7)) @db.Uuid
  companyId String   @db.Uuid
  name      String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  company              Company               @relation(fields: [companyId], references: [id], onDelete: Restrict)
  messageTemplates     MessageTemplate[]
  webhookSubscriptions WebhookSubscription[]

  @@unique([companyId, name])
  @@index([companyId])
}
```

### 9.3 ChatFlow (Fase 3a)

```
/// STUB — expanded in Phase 3a
model ChatFlow {
  id        String   @id @default(uuid(7)) @db.Uuid
  companyId String   @db.Uuid
  name      String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  company           Company           @relation(fields: [companyId], references: [id], onDelete: Restrict)
  companySettings   CompanySettings[]

  @@unique([companyId, name])
  @@index([companyId])
}
```

### 9.4 Contact (Fase 1)

```
/// STUB — expanded in Phase 1
model Contact {
  id           String   @id @default(uuid(7)) @db.Uuid
  companyId    String   @db.Uuid
  name         String?
  phoneNumber  String
  leadStatusId String?  @db.Uuid

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deletedAt    DateTime?

  company    Company     @relation(fields: [companyId], references: [id], onDelete: Restrict)
  leadStatus LeadStatus? @relation("ContactLeadStatus", fields: [leadStatusId], references: [id], onDelete: SetNull)
  contactTags ContactTag[]

  @@unique([companyId, phoneNumber])
  @@index([companyId])
}
```

### 9.5 Ticket (Fase 1)

```
/// STUB — expanded in Phase 1
model Ticket {
  id        String   @id @default(uuid(7)) @db.Uuid
  companyId String   @db.Uuid

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  company    Company     @relation(fields: [companyId], references: [id], onDelete: Restrict)
  ticketTags TicketTag[]

  @@index([companyId])
}
```

### 9.6 ContactTag e TicketTag (m:n minimalistas)

```
model ContactTag {
  contactId String @db.Uuid
  tagId     String @db.Uuid

  contact   Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  tag       Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([contactId, tagId])
  @@index([tagId])
}

model TicketTag {
  ticketId String @db.Uuid
  tagId    String @db.Uuid

  ticket   Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  tag      Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([ticketId, tagId])
  @@index([tagId])
}
```

`addedByUserId` (Fase 2) será adicionado em sprint futura.

## 10. Seed inicial (`prisma/seed.ts`)

### 10.1 Comportamento

1. Lê `SEED_SUPER_ADMIN_EMAIL` e `SEED_SUPER_ADMIN_PASSWORD` do env. Se não definidos, fallback `super@digichat.local` / `changeme-only-for-dev` (loga warning).
2. **Plan default** — `upsert` por `name: "Default"`.
3. **Company exemplo** — `upsert` por `slug: "exemplo"`. Define `planId` da default.
4. **CompanySettings** — `upsert` por `companyId`. Defaults conforme schema.
5. **SUPER_ADMIN User** — `upsert` por `[companyId, email]`. `passwordHash` via `bcrypt.hash(senha, 12)`. `companyId` = company exemplo (super admin precisa de FK válido — distinção é via `role`, não ausência de tenant).

### 10.2 Idempotência

- Rodar duas vezes não duplica nem falha.
- Se `SEED_SUPER_ADMIN_PASSWORD` mudou entre runs, o user é atualizado.

### 10.3 Output

```
✓ Plan "Default" garantido
✓ Company "exemplo" garantida
✓ CompanySettings garantido
✓ SUPER_ADMIN <email> garantido
```

## 11. Plano de testes (Vitest + testcontainers)

### 11.1 Configuração

Arquivo separado `vitest.schema.config.ts` para isolar de futuros testes unitários/E2E:

- `test/setup-prisma.ts` — sobe container Postgres por suite, roda `prisma migrate deploy`, exporta `prisma` cliente conectado.
- `beforeEach`: `truncate` em todas as tabelas relevantes do teste (mais rápido que recriar container).
- `afterAll`: stop container.

### 11.2 Testes (6 arquivos em `test/schema/`)

| Arquivo                        | Cobertura                                                                                                                                                                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `multi-tenant-uniques.spec.ts` | `User.email` único por company; permite duplicado entre companies. Idem `Tag.name`, `Department.name`, `BotCredential.name`, `Company.slug` (esse é global)                                                                         |
| `soft-delete.spec.ts`          | Documenta: `deletedAt != null` **NÃO libera** unique. Inserir novo registro com mesmo `[companyId, name]` que registro soft-deleted falha. Decisão: manter, índice parcial fica para sprint futura se necessário                    |
| `cascade.spec.ts`              | Deletar Company cascateia para CompanySettings (1:1 `onDelete: Cascade`); CloseReasonDepartment é deletado quando seu CloseReason é deletado; deletar Department com User vinculado falha (`Restrict`)                              |
| `forward-stubs.spec.ts`        | Inserir MessageTemplate referenciando ChannelConnection stub funciona; inserir CompanySettings com defaultBotChatFlowId apontando para ChatFlow stub funciona; deletar ChatFlow stub seta `defaultBotChatFlowId = null` (`SetNull`) |
| `seed.spec.ts`                 | Roda `tsx prisma/seed.ts` em base limpa; assert: 1 Plan, 1 Company com slug "exemplo", 1 CompanySettings, 1 User com role=SUPER_ADMIN; rodar segunda vez é idempotente                                                              |
| `enum-values.spec.ts`          | Sanity check do número e nomes exatos de cada enum (pega remoção/renomeação acidental). Lista esperada hardcoded                                                                                                                    |

### 11.3 O que NÃO testar

- Campos individuais — ruído, valor zero.
- Regras de negócio — sem services nesta sprint.
- Performance/índices — ferramenta errada.

## 12. Arquivos a tocar / criar

**Criar:**

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `prisma/migrations/<timestamp>_init_core_schema/migration.sql` (gerado por `prisma migrate dev`)
- `prisma/migrations/migration_lock.toml` (gerado)
- `test/schema/multi-tenant-uniques.spec.ts`
- `test/schema/soft-delete.spec.ts`
- `test/schema/cascade.spec.ts`
- `test/schema/forward-stubs.spec.ts`
- `test/schema/seed.spec.ts`
- `test/schema/enum-values.spec.ts`
- `test/setup-prisma.ts`
- `vitest.schema.config.ts`
- `.env.example` (se ainda não existir)

**Editar:**

- `package.json` — deps + scripts + bloco `prisma`
- `prisma/CLAUDE.md` — corrigir nota desatualizada sobre extensão UUID v7
- `.gitignore` — garantir que `.env` está ignorado
- `ROADMAP.md` — marcar os 10 checkboxes da seção "Schema do núcleo (Prisma)" no commit final da PR

**Não editar nesta sprint:**

- `src/` — sem módulos NestJS
- `ARCHITECTURE.md` — schema vivo é a fonte da verdade
- `docker-compose.yml` — Postgres 16 já está lá

## 13. Critério de "pronto" — verificação por evidência

Rodar e capturar output antes de declarar PR pronta para review:

1. `pnpm prisma validate` — 0 erros
2. `pnpm prisma format` — sem mudanças
3. `pnpm db:reset --force && pnpm db:migrate --name init_core_schema` — migration aplica em base limpa
4. `pnpm db:seed` — output esperado mostra criação dos 4 registros
5. `pnpm test:schema` — 6 specs todos verdes
6. `pnpm typecheck` — 0 erros
7. `pnpm lint` — 0 erros
8. `pnpm build` — sucesso
9. `git diff ROADMAP.md` mostra os **10 checkboxes** da seção "Schema do núcleo (Prisma)" marcados, nada fora disso

## 14. Riscos e mitigações

| Risco                                                   | Probabilidade | Impacto | Mitigação                                                                                                                                 |
| ------------------------------------------------------- | ------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `@@unique` interage de forma inesperada com soft delete | média         | médio   | Teste `soft-delete.spec.ts` documenta comportamento atual. Decisão consciente: índice parcial fica para sprint futura quando dor aparecer |
| UUID v7 client-side gera ids no Node, não no banco      | baixa         | baixo   | Aceito para esta sprint. Se quisermos id-no-banco depois, adicionamos `pg_uuidv7` em sprint dedicada                                      |
| Container Postgres em CI consome tempo                  | média         | baixo   | testcontainers reutiliza imagem em layers; CI pode fallback para `services.postgres` do GitHub Actions se tempo estourar                  |
| Esquecer `companyId` em FK de tabela nova               | baixa         | crítico | Auto-revisão usando `multi-tenant-checklist.md` antes de commit; teste `multi-tenant-uniques.spec.ts` pega muitos casos                   |
| Stub forward fica esquecido na expansão                 | baixa         | médio   | Comentário `/// STUB — expanded in Phase X` em cada stub; Plan da Fase 1 vai citar explicitamente                                         |

## 15. Out-of-scope explícito

- Módulos NestJS (controllers, application/domain services)
- `EncryptionService`, `BusinessHoursService`, `TemplateRenderer`
- Atualização de `ARCHITECTURE.md` §6 (schema vivo é a fonte da verdade)
- Frontend (`crm-web`)
- Migration de produção (não há ambiente ainda)
- Geração de OpenAPI / tipos do frontend (não há endpoint nesta sprint)
- ADRs (pode aparecer um para soft-delete vs índice parcial se tópico ficar acalorado, mas não é exigido)

## 16. Próximo passo

Depois deste spec aprovado pelo usuário: invocar `superpowers:writing-plans` para gerar plano de execução detalhado em `docs/superpowers/plans/`. O plano vai quebrar essas 13 seções em tarefas TDD-shaped, executáveis sequencialmente em `git worktree` isolado.
