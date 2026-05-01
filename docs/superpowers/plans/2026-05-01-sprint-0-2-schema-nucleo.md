# Sprint 0.2 — Schema do núcleo (Prisma) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modelar todo o schema Prisma do núcleo do DigiChat (~21 entidades reais + 6 stubs forward) com migration inicial, seed idempotente e testes Vitest cobrindo constraints multi-tenant críticos. Sem módulos NestJS — schema apenas.

**Architecture:** Schema único em `prisma/schema.prisma`, seguindo padrões obrigatórios (UUID v7 client-side via `@default(uuid(7))`, `companyId` em toda tabela exceto `Plan`, soft delete em entidades-chave, `@@unique([companyId, ...])` em todos os campos únicos por tenant). Stubs minimalistas (`/// STUB — expanded in Phase X`) para entidades de fases futuras (Fase 1 e 3a) que precisam aparecer agora porque outras entidades referenciam-nas via FK. Testes contra Postgres efêmero por suite via `@testcontainers/postgresql`.

**Tech Stack:** Prisma 6, @prisma/client, PostgreSQL 16 (já no docker-compose.yml), Vitest, @testcontainers/postgresql, bcrypt (para hash de senha do seed), tsx (runner do seed.ts).

**Spec aprovado:** [`docs/superpowers/specs/2026-05-01-sprint-0-2-schema-nucleo-design.md`](../specs/2026-05-01-sprint-0-2-schema-nucleo-design.md) — commit `0ed9986` na branch `feat/sprint-0-2-schema-nucleo`.

---

## File Structure

**Create:**

- `prisma/schema.prisma` — schema completo (~600 linhas, todos os models + enums)
- `prisma/seed.ts` — seed idempotente (~80 linhas)
- `prisma/migrations/<timestamp>_init_core_schema/migration.sql` — gerada por `prisma migrate dev`
- `prisma/migrations/migration_lock.toml` — gerada
- `vitest.schema.config.ts` — configuração Vitest dedicada para testes de schema
- `test/setup-prisma.ts` — helper de testcontainers (sobe Postgres efêmero, expõe `prisma` cliente)
- `test/schema/multi-tenant-uniques.spec.ts`
- `test/schema/soft-delete.spec.ts`
- `test/schema/cascade.spec.ts`
- `test/schema/forward-stubs.spec.ts`
- `test/schema/seed.spec.ts`
- `test/schema/enum-values.spec.ts`
- `.env.example` — template do `.env`

**Modify:**

- `package.json` — adicionar deps + scripts + bloco `prisma`
- `prisma/CLAUDE.md` — corrigir nota sobre extensão UUID v7
- `.gitignore` — garantir que `.env` está ignorado (provavelmente já está)
- `ROADMAP.md` — marcar 10 checkboxes da seção "Schema do núcleo (Prisma)" no commit final

**Não tocar:**

- `src/` — sem módulos NestJS nesta sprint
- `ARCHITECTURE.md` — schema vivo é a fonte da verdade
- `docker-compose.yml` — Postgres 16 já está lá

---

## Task 0: Pre-flight

- [ ] **Step 1: Commitar este plano (se ainda untracked)**

```bash
git status --short docs/superpowers/plans/
# Se aparecer ?? para o arquivo de plan:
git add docs/superpowers/plans/2026-05-01-sprint-0-2-schema-nucleo.md
git commit -m "docs(plans): add sprint 0.2 (core schema) implementation plan"
```

Expected: plano commitado na branch `feat/sprint-0-2-schema-nucleo`.

- [ ] **Step 2: Worktree (opcional, se usando subagent-driven-development)**

```bash
git worktree add /tmp/digichat-sprint-0-2 feat/sprint-0-2-schema-nucleo
cd /tmp/digichat-sprint-0-2
```

Para inline execution, pode prosseguir na branch `feat/sprint-0-2-schema-nucleo` no working tree atual (`/home/rodrigo-digigov/dev-space/digigov/digichat/crm-api`).

- [ ] **Step 3: Garantir infraestrutura local**

```bash
docker compose up -d postgres
```

Expected: `digichat-postgres` running.

---

## Task 1: Install dependencies

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (gerado)

- [ ] **Step 1: Adicionar deps de runtime**

Run:

```bash
pnpm add @prisma/client@^6 bcrypt@^5
```

Expected: `+ @prisma/client X.Y.Z`, `+ bcrypt X.Y.Z` no output.

- [ ] **Step 2: Adicionar deps de dev**

Run:

```bash
pnpm add -D prisma@^6 tsx@^4 @types/bcrypt@^5 @testcontainers/postgresql@^10
```

Expected: 4 pacotes adicionados em `devDependencies`.

- [ ] **Step 3: Verificar instalação**

Run:

```bash
pnpm prisma --version
```

Expected: `prisma                  : 6.X.Y` na saída.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add prisma, bcrypt, tsx, testcontainers"
```

---

## Task 2: Configurar Prisma e variáveis de ambiente

**Files:**

- Create: `prisma/schema.prisma` (header inicial)
- Create: `.env.example`
- Modify: `package.json` (scripts + bloco prisma)
- Modify: `.gitignore` (verificar)
- Modify: `prisma/CLAUDE.md` (corrigir nota UUID v7)

- [ ] **Step 1: Criar `.env.example`**

Conteúdo:

```
# PostgreSQL — usar credenciais do docker-compose.yml para dev local
DATABASE_URL="postgresql://digichat:digichat@localhost:5432/digichat?schema=public"

# Seed do SUPER_ADMIN inicial (apenas dev — em produção, definir senha forte)
SEED_SUPER_ADMIN_EMAIL="super@digichat.local"
SEED_SUPER_ADMIN_PASSWORD="changeme-only-for-dev"
```

- [ ] **Step 2: Garantir `.env` no `.gitignore`**

Verificar:

```bash
grep -E "^\.env$|^\.env\b" .gitignore || echo ".env" >> .gitignore
```

Expected: linha `.env` presente no `.gitignore` (adicionar se faltar).

- [ ] **Step 3: Criar `.env` local copiando do exemplo**

Run:

```bash
[ -f .env ] || cp .env.example .env
```

Expected: arquivo `.env` existe (não vai ser commitado).

- [ ] **Step 4: Criar `prisma/schema.prisma` com header**

Conteúdo inicial (todo o resto vem na Task 3):

```prisma
// DigiChat — schema central
// Convenções obrigatórias: ver prisma/CLAUDE.md
// Princípio multi-tenant: companyId em toda tabela exceto Plan.
// IDs: UUID v7 (ordenável temporalmente) via @default(uuid(7)).

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- [ ] **Step 5: Adicionar bloco `prisma` e scripts ao `package.json`**

Localize a chave top-level `"scripts"` em [package.json](package.json) e:

5a) **Adicionar bloco top-level `prisma`** (irmão de `scripts`):

```json
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  },
```

5b) **Adicionar scripts de db** dentro de `scripts`:

```json
    "db:migrate": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:seed": "prisma db seed",
    "db:reset": "prisma migrate reset",
    "db:studio": "prisma studio",
    "test:schema": "vitest run -c vitest.schema.config.ts",
```

- [ ] **Step 6: Validar schema vazio**

Run:

```bash
pnpm prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid`.

- [ ] **Step 7: Atualizar `prisma/CLAUDE.md`**

Localize em [prisma/CLAUDE.md](prisma/CLAUDE.md) o bloco da seção "IDs":

```markdown
### IDs

- UUID v7 (ordenável temporalmente)
- Default: `@default(uuid(7))` (precisa de extensão Prisma)
- Tipo: `String @id`
```

Substituir por:

```markdown
### IDs

- UUID v7 (ordenável temporalmente)
- Default: `@default(uuid(7))` — nativo no Prisma 5.14+, gerado client-side, **sem extensão Postgres necessária**
- Tipo: `String @id @db.Uuid`
```

- [ ] **Step 8: Validar formatação**

Run:

```bash
pnpm prisma format
```

Expected: sem mudanças (ou aplica formatação padrão do Prisma).

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/CLAUDE.md .env.example .gitignore package.json pnpm-lock.yaml
git commit -m "chore(prisma): bootstrap schema, env example, scripts"
```

---

## Task 3: Adicionar todos os models e enums ao schema

**Files:**

- Modify: `prisma/schema.prisma`

Esta task adiciona ~600 linhas de schema em um único commit. Ordem dentro do arquivo: enums primeiro, depois models do núcleo, cadastros, integrações, audit, e stubs forward por último.

- [ ] **Step 1: Adicionar enums ao final do `schema.prisma`**

Anexar ao arquivo (após o bloco `datasource`):

```prisma
// =============================================================================
// ENUMS
// =============================================================================

enum UserRole {
  SUPER_ADMIN
  ADMIN
  SUPERVISOR
  AGENT
}

enum DepartmentDistributionMode {
  MANUAL
  RANDOM
  BALANCED
  SEQUENTIAL
}

enum TagScope {
  CONTACT
  TICKET
  BOTH
}

enum QuickReplyScope {
  COMPANY
  PERSONAL
}

enum LeadStatusFinalKind {
  WON
  LOST
}

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

enum IntegrationOpenMode {
  NEW_TAB
  IFRAME
}

enum IntegrationVisibility {
  ALL_USERS
  ADMINS_ONLY
}

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

enum ApiAuthType {
  NONE
  BEARER_TOKEN
  API_KEY_HEADER
  BASIC_AUTH
  CUSTOM_HEADERS
}

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
```

- [ ] **Step 2: Adicionar models do núcleo (Plan, Company, CompanySettings, User, RefreshToken)**

Anexar ao arquivo:

```prisma
// =============================================================================
// CORE — tenant + auth
// =============================================================================

model Plan {
  id          String   @id @default(uuid(7)) @db.Uuid
  name        String   @unique
  description String?
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  companies Company[]
}

model Company {
  id        String  @id @default(uuid(7)) @db.Uuid
  planId    String  @db.Uuid
  name      String
  slug      String  @unique
  active    Boolean @default(true)

  defaultWorkingHours Json?
  outOfHoursMessage   String?
  timezone            String @default("America/Sao_Paulo")

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  plan     Plan             @relation(fields: [planId], references: [id], onDelete: Restrict)
  settings CompanySettings?

  users                  User[]
  refreshTokens          RefreshToken[]
  departments            Department[]
  tags                   Tag[]
  quickReplies           QuickReply[]
  closeReasons           CloseReason[]
  salesFunnels           SalesFunnel[]
  leadStatuses           LeadStatus[]
  customFieldDefinitions CustomFieldDefinition[]
  businessHolidays       BusinessHoliday[]
  integrationLinks       IntegrationLink[]
  messageTemplates       MessageTemplate[]
  botCredentials         BotCredential[]
  webhookSubscriptions   WebhookSubscription[]
  webhookDeliveries      WebhookDelivery[]
  auditLogs              AuditLog[]
  // stubs forward
  channelConnections ChannelConnection[]
  chatFlows          ChatFlow[]
  contacts           Contact[]
  tickets            Ticket[]

  @@index([planId])
  @@index([active])
}

model CompanySettings {
  id        String @id @default(uuid(7)) @db.Uuid
  companyId String @unique @db.Uuid

  // Visibilidade de tickets
  hideOtherUsersTickets                  Boolean @default(true)
  agentSeeOtherUsersTicketsOnSameChannel Boolean @default(false)
  agentSeeTicketsWithOtherDefaultAgents  Boolean @default(true)

  // Privacidade
  hidePhoneFromAgents Boolean @default(false)

  // Grupos
  ignoreGroupMessages Boolean @default(false)
  showAssignedGroups  Boolean @default(false)

  // Roteamento
  forceWalletRouting Boolean @default(false)

  // Permissões de AGENT
  agentCanDeleteContacts     Boolean @default(false)
  agentCanChangeDefaultAgent Boolean @default(false)
  agentCanEditTags           Boolean @default(false)
  agentCanToggleSignature    Boolean @default(false)

  // Bot — antecipado da Fase 2
  hideBotTicketsFromAgents Boolean @default(true)

  // Bot fallback (Fase 3a)
  defaultBotChatFlowId String? @db.Uuid

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  company            Company   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  defaultBotChatFlow ChatFlow? @relation(fields: [defaultBotChatFlowId], references: [id], onDelete: SetNull)

  @@index([companyId])
}

model User {
  id           String   @id @default(uuid(7)) @db.Uuid
  companyId    String   @db.Uuid
  name         String
  email        String
  passwordHash String
  role         UserRole

  absenceMessage String?
  absenceActive  Boolean   @default(false)
  lastSeenAt     DateTime?

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  company       Company          @relation(fields: [companyId], references: [id], onDelete: Restrict)
  departments   UserDepartment[]
  refreshTokens RefreshToken[]
  quickReplies  QuickReply[]
  auditLogs     AuditLog[]

  @@unique([companyId, email])
  @@index([companyId])
  @@index([companyId, role])
}

model RefreshToken {
  id        String    @id @default(uuid(7)) @db.Uuid
  companyId String    @db.Uuid
  userId    String    @db.Uuid
  tokenHash String    @unique // SHA-256(token), hex
  expiresAt DateTime
  revokedAt DateTime?
  ipAddress String?
  userAgent String?
  createdAt DateTime  @default(now())

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([companyId])
  @@index([userId, revokedAt])
  @@index([expiresAt])
}
```

- [ ] **Step 3: Adicionar models de cadastros**

Anexar ao arquivo:

```prisma
// =============================================================================
// CADASTROS
// =============================================================================

model Department {
  id     String  @id @default(uuid(7)) @db.Uuid
  companyId String @db.Uuid
  name      String
  active    Boolean @default(true)

  greetingMessage   String?
  outOfHoursMessage String?
  workingHours      Json?

  slaResponseMinutes   Int?
  slaResolutionMinutes Int?

  distributionMode DepartmentDistributionMode @default(MANUAL)

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  company      Company                 @relation(fields: [companyId], references: [id], onDelete: Restrict)
  users        UserDepartment[]
  closeReasons CloseReasonDepartment[]

  @@unique([companyId, name])
  @@index([companyId])
}

model UserDepartment {
  userId       String @db.Uuid
  departmentId String @db.Uuid

  user       User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  department Department @relation(fields: [departmentId], references: [id], onDelete: Cascade)

  @@id([userId, departmentId])
  @@index([departmentId])
}

model Tag {
  id        String   @id @default(uuid(7)) @db.Uuid
  companyId String   @db.Uuid
  name      String
  color     String   // hex #RRGGBB validado no app
  scope     TagScope @default(BOTH)
  active    Boolean  @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  company     Company      @relation(fields: [companyId], references: [id], onDelete: Restrict)
  contactTags ContactTag[]
  ticketTags  TicketTag[]

  @@unique([companyId, name])
  @@index([companyId, scope])
}

model QuickReply {
  id            String  @id @default(uuid(7)) @db.Uuid
  companyId     String  @db.Uuid
  shortcut      String
  message       String
  mediaUrl      String?
  mediaMimeType String?

  scope       QuickReplyScope
  ownerUserId String?         @db.Uuid

  active Boolean @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  company   Company @relation(fields: [companyId], references: [id], onDelete: Restrict)
  ownerUser User?   @relation(fields: [ownerUserId], references: [id], onDelete: Cascade)

  @@unique([companyId, scope, ownerUserId, shortcut])
  @@index([companyId, scope])
}

model CloseReason {
  id        String  @id @default(uuid(7)) @db.Uuid
  companyId String  @db.Uuid
  name      String
  message   String?
  active    Boolean @default(true)
  sortOrder Int     @default(0)

  triggersCsat  Boolean @default(false)
  asksDealValue Boolean @default(false)

  funnelId String? @db.Uuid

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  company     Company                 @relation(fields: [companyId], references: [id], onDelete: Restrict)
  funnel      SalesFunnel?            @relation(fields: [funnelId], references: [id], onDelete: SetNull)
  departments CloseReasonDepartment[]

  @@unique([companyId, name])
  @@index([companyId])
}

model CloseReasonDepartment {
  closeReasonId String @db.Uuid
  departmentId  String @db.Uuid

  closeReason CloseReason @relation(fields: [closeReasonId], references: [id], onDelete: Cascade)
  department  Department  @relation(fields: [departmentId], references: [id], onDelete: Cascade)

  @@id([closeReasonId, departmentId])
  @@index([departmentId])
}

model SalesFunnel {
  id        String  @id @default(uuid(7)) @db.Uuid
  companyId String  @db.Uuid
  name      String
  active    Boolean @default(true)
  sortOrder Int     @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  company      Company       @relation(fields: [companyId], references: [id], onDelete: Restrict)
  leadStatuses LeadStatus[]
  closeReasons CloseReason[]

  @@unique([companyId, name])
  @@index([companyId])
}

model LeadStatus {
  id        String               @id @default(uuid(7)) @db.Uuid
  companyId String               @db.Uuid
  funnelId  String               @db.Uuid
  name      String
  color     String
  sortOrder Int                  @default(0)
  isInitial Boolean              @default(false)
  isFinal   Boolean              @default(false)
  finalKind LeadStatusFinalKind?
  active    Boolean              @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  company  Company     @relation(fields: [companyId], references: [id], onDelete: Restrict)
  funnel   SalesFunnel @relation(fields: [funnelId], references: [id], onDelete: Cascade)
  contacts Contact[]   @relation("ContactLeadStatus")

  @@unique([companyId, funnelId, name])
  @@index([companyId, funnelId])
}

model CustomFieldDefinition {
  id        String            @id @default(uuid(7)) @db.Uuid
  companyId String            @db.Uuid
  name      String
  key       String
  type      CustomFieldType
  required  Boolean           @default(false)
  options   Json?
  active    Boolean           @default(true)
  sortOrder Int               @default(0)
  appliesTo CustomFieldEntity

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  company Company @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@unique([companyId, key])
  @@index([companyId, appliesTo])
}

model BusinessHoliday {
  id            String   @id @default(uuid(7)) @db.Uuid
  companyId     String   @db.Uuid
  date          DateTime @db.Date
  name          String
  appliesToAll  Boolean  @default(true)
  departmentIds String[] @db.Uuid

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  company Company @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@index([companyId, date])
}
```

- [ ] **Step 4: Adicionar models de integrações**

Anexar ao arquivo:

```prisma
// =============================================================================
// INTEGRAÇÕES (schema-only, módulos vêm em fases futuras)
// =============================================================================

model IntegrationLink {
  id        String                @id @default(uuid(7)) @db.Uuid
  companyId String                @db.Uuid
  name      String
  url       String
  iconUrl   String?
  openMode  IntegrationOpenMode   @default(NEW_TAB)
  visibleTo IntegrationVisibility @default(ALL_USERS)
  active    Boolean               @default(true)
  sortOrder Int                   @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  company Company @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@index([companyId])
}

model MessageTemplate {
  id                  String              @id @default(uuid(7)) @db.Uuid
  companyId           String              @db.Uuid
  channelConnectionId String              @db.Uuid
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
  variables           Int                 @default(0)
  rejectionReason     String?
  lastSyncedAt        DateTime

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  company           Company           @relation(fields: [companyId], references: [id], onDelete: Restrict)
  channelConnection ChannelConnection @relation(fields: [channelConnectionId], references: [id], onDelete: Cascade)

  @@unique([channelConnectionId, externalId])
  @@unique([channelConnectionId, name, language])
  @@index([companyId, status])
}

model BotCredential {
  id          String      @id @default(uuid(7)) @db.Uuid
  companyId   String      @db.Uuid
  name        String
  description String?
  authType    ApiAuthType
  config      Bytes
  active      Boolean     @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  company Company @relation(fields: [companyId], references: [id], onDelete: Restrict)

  @@unique([companyId, name])
  @@index([companyId])
}

model WebhookSubscription {
  id        String  @id @default(uuid(7)) @db.Uuid
  companyId String  @db.Uuid
  name      String
  url       String
  active    Boolean @default(true)

  channelConnectionId String? @db.Uuid

  secret     String
  authType   WebhookAuthType @default(NONE)
  authConfig Bytes?

  events WebhookEvent[]

  maxRetries      Int @default(5)
  retryBackoffSec Int @default(60)

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  company           Company            @relation(fields: [companyId], references: [id], onDelete: Restrict)
  channelConnection ChannelConnection? @relation(fields: [channelConnectionId], references: [id], onDelete: SetNull)
  deliveries        WebhookDelivery[]

  @@unique([companyId, name])
  @@index([companyId])
}

model WebhookDelivery {
  id             String                @id @default(uuid(7)) @db.Uuid
  companyId      String                @db.Uuid
  subscriptionId String                @db.Uuid
  event          WebhookEvent
  payload        Json
  attempts       Int                   @default(0)
  status         WebhookDeliveryStatus
  lastAttemptAt  DateTime?
  nextRetryAt    DateTime?
  responseStatus Int?
  responseBody   String?
  errorMessage   String?
  createdAt      DateTime              @default(now())

  company      Company             @relation(fields: [companyId], references: [id], onDelete: Restrict)
  subscription WebhookSubscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)

  @@index([companyId])
  @@index([subscriptionId, status])
  @@index([nextRetryAt, status])
}
```

- [ ] **Step 5: Adicionar AuditLog**

Anexar:

```prisma
// =============================================================================
// AUDITORIA
// =============================================================================

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

  company   Company @relation(fields: [companyId], references: [id], onDelete: Restrict)
  actorUser User?   @relation(fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([companyId, resource, resourceId])
  @@index([companyId, action])
  @@index([companyId, createdAt])
}
```

- [ ] **Step 6: Adicionar stubs forward**

Anexar:

```prisma
// =============================================================================
// STUBS FORWARD — entidades de fases futuras, schema mínimo
// =============================================================================

/// STUB — expanded in Phase 1
model ChannelConnection {
  id        String @id @default(uuid(7)) @db.Uuid
  companyId String @db.Uuid
  name      String

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  company              Company               @relation(fields: [companyId], references: [id], onDelete: Restrict)
  messageTemplates     MessageTemplate[]
  webhookSubscriptions WebhookSubscription[]

  @@unique([companyId, name])
  @@index([companyId])
}

/// STUB — expanded in Phase 3a
model ChatFlow {
  id        String @id @default(uuid(7)) @db.Uuid
  companyId String @db.Uuid
  name      String

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  company         Company           @relation(fields: [companyId], references: [id], onDelete: Restrict)
  companySettings CompanySettings[]

  @@unique([companyId, name])
  @@index([companyId])
}

/// STUB — expanded in Phase 1
model Contact {
  id           String  @id @default(uuid(7)) @db.Uuid
  companyId    String  @db.Uuid
  name         String?
  phoneNumber  String
  leadStatusId String? @db.Uuid

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  company     Company      @relation(fields: [companyId], references: [id], onDelete: Restrict)
  leadStatus  LeadStatus?  @relation("ContactLeadStatus", fields: [leadStatusId], references: [id], onDelete: SetNull)
  contactTags ContactTag[]

  @@unique([companyId, phoneNumber])
  @@index([companyId])
}

/// STUB — expanded in Phase 1
model Ticket {
  id        String @id @default(uuid(7)) @db.Uuid
  companyId String @db.Uuid

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  company    Company     @relation(fields: [companyId], references: [id], onDelete: Restrict)
  ticketTags TicketTag[]

  @@index([companyId])
}

model ContactTag {
  contactId String @db.Uuid
  tagId     String @db.Uuid

  contact Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  tag     Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([contactId, tagId])
  @@index([tagId])
}

model TicketTag {
  ticketId String @db.Uuid
  tagId    String @db.Uuid

  ticket Ticket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  tag    Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([ticketId, tagId])
  @@index([tagId])
}
```

- [ ] **Step 7: Validar schema completo**

Run:

```bash
pnpm prisma validate
```

Expected: `The schema at prisma/schema.prisma is valid`.

Se falhar, mensagem aponta o model/campo problemático — corrigir antes de prosseguir.

- [ ] **Step 8: Formatar schema**

Run:

```bash
pnpm prisma format
```

Expected: aplica indentação canônica do Prisma. Mudanças cosméticas são ok.

- [ ] **Step 9: Gerar Prisma Client (sanity check)**

Run:

```bash
pnpm prisma generate
```

Expected: `Generated Prisma Client (vX.Y.Z) to ./node_modules/@prisma/client`. Sem erros de tipo.

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): add core, cadastros, integrations, audit, and forward stubs"
```

---

## Task 4: Gerar migration `init_core_schema`

**Files:**

- Create: `prisma/migrations/<timestamp>_init_core_schema/migration.sql`
- Create: `prisma/migrations/migration_lock.toml`

- [ ] **Step 1: Garantir que Postgres está rodando**

Run:

```bash
docker compose up -d postgres
```

Expected: `digichat-postgres` running.

- [ ] **Step 2: Garantir base limpa**

Run:

```bash
docker compose exec -T postgres psql -U digichat -d postgres -c 'DROP DATABASE IF EXISTS digichat;' \
  && docker compose exec -T postgres psql -U digichat -d postgres -c 'CREATE DATABASE digichat;'
```

Expected: dropa e recria a base `digichat` limpa.

- [ ] **Step 3: Criar a migration inicial**

Run:

```bash
pnpm prisma migrate dev --name init_core_schema
```

Expected:

- Pasta `prisma/migrations/<timestamp>_init_core_schema/migration.sql` criada com DDL para todas as tabelas e enums
- `prisma/migrations/migration_lock.toml` criado (provider=postgresql)
- Output mostra "Your database is now in sync with your schema."

- [ ] **Step 4: Inspecionar a migration**

Run:

```bash
ls -la prisma/migrations/
head -50 prisma/migrations/*_init_core_schema/migration.sql
```

Expected: arquivo `.sql` começando com `CREATE TYPE "UserRole"...` ou semelhante. Sem `CREATE EXTENSION pg_uuidv7` (gerado client-side).

- [ ] **Step 5: Verificar que reset funciona em base limpa**

Run:

```bash
pnpm prisma migrate reset --force --skip-seed
```

Expected: dropa schema, recria, reaplica migration. Última linha: "Database reset successful".

- [ ] **Step 6: Commit**

```bash
git add prisma/migrations/
git commit -m "feat(prisma): generate init_core_schema migration"
```

---

## Task 5: Implementar `prisma/seed.ts`

**Files:**

- Create: `prisma/seed.ts`

- [ ] **Step 1: Criar `prisma/seed.ts`**

Conteúdo:

```typescript
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'super@digichat.local';
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'changeme-only-for-dev';

  if (!process.env.SEED_SUPER_ADMIN_PASSWORD) {
    console.warn(
      '[seed] SEED_SUPER_ADMIN_PASSWORD não definida — usando fallback de dev. NÃO use em produção.',
    );
  }

  const plan = await prisma.plan.upsert({
    where: { name: 'Default' },
    update: { active: true },
    create: {
      name: 'Default',
      description: 'Plano padrão MVP',
      active: true,
    },
  });
  console.log(`✓ Plan "${plan.name}" garantido (id=${plan.id})`);

  const company = await prisma.company.upsert({
    where: { slug: 'exemplo' },
    update: { planId: plan.id, active: true },
    create: {
      planId: plan.id,
      name: 'DigiChat — Empresa Exemplo',
      slug: 'exemplo',
      active: true,
      timezone: 'America/Sao_Paulo',
    },
  });
  console.log(`✓ Company "${company.slug}" garantida (id=${company.id})`);

  const settings = await prisma.companySettings.upsert({
    where: { companyId: company.id },
    update: {},
    create: { companyId: company.id },
  });
  console.log(`✓ CompanySettings garantido (id=${settings.id})`);

  const passwordHash = await bcrypt.hash(superAdminPassword, 12);

  const normalizedEmail = superAdminEmail.toLowerCase();

  const superAdmin = await prisma.user.upsert({
    where: { companyId_email: { companyId: company.id, email: normalizedEmail } },
    update: {
      passwordHash,
      role: 'SUPER_ADMIN',
    },
    create: {
      companyId: company.id,
      name: 'Super Admin',
      email: normalizedEmail,
      passwordHash,
      role: 'SUPER_ADMIN',
    },
  });
  console.log(`✓ SUPER_ADMIN ${superAdmin.email} garantido (id=${superAdmin.id})`);
}

main()
  .catch((error) => {
    console.error('[seed] erro:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Verificar que tsconfig aceita `prisma/seed.ts`**

Run:

```bash
pnpm tsc --noEmit -p tsconfig.json prisma/seed.ts
```

Se falhar com "tsconfig file include doesn't match", abrir [tsconfig.json](tsconfig.json) e garantir que `prisma/**/*.ts` está incluído OU rodar a verificação via tsx (que ignora tsconfig include):

```bash
pnpm tsx --check prisma/seed.ts
```

Expected: sem erros de tipo.

- [ ] **Step 3: Rodar o seed em base limpa**

Run:

```bash
pnpm prisma migrate reset --force
```

Expected: dropa, reaplica, **roda seed automaticamente** (porque `package.json` declara `"prisma.seed"`). Output mostra os 4 `✓`.

- [ ] **Step 4: Rodar o seed novamente para verificar idempotência**

Run:

```bash
pnpm db:seed
```

Expected: roda sem erro, mostra os 4 `✓`. Não duplica nada (verificar via `pnpm prisma studio` ou query manual).

- [ ] **Step 5: Verificar registros no banco**

Run:

```bash
docker compose exec -T postgres psql -U digichat -d digichat -c \
  "SELECT 'Plan' as t, count(*) FROM \"Plan\" UNION ALL \
   SELECT 'Company', count(*) FROM \"Company\" UNION ALL \
   SELECT 'CompanySettings', count(*) FROM \"CompanySettings\" UNION ALL \
   SELECT 'User', count(*) FROM \"User\";"
```

Expected: cada um com count = 1.

- [ ] **Step 6: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(prisma): add idempotent seed (1 Plan, 1 Company, 1 SUPER_ADMIN)"
```

---

## Task 6: Setup de testes (testcontainers + vitest config)

**Files:**

- Create: `vitest.schema.config.ts`
- Create: `test/setup-prisma.ts`

- [ ] **Step 1: Criar `vitest.schema.config.ts`**

Conteúdo:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/schema/**/*.spec.ts'],
    setupFiles: ['test/setup-prisma.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000, // testcontainers pull pode demorar
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // 1 container compartilhado entre suites
      },
    },
  },
});
```

- [ ] **Step 2: Criar `test/setup-prisma.ts`**

Conteúdo:

```typescript
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { afterAll, beforeAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('digichat_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const url = container.getConnectionUri();
  process.env.DATABASE_URL = url;

  // Aplica todas as migrations existentes na base de teste
  execSync('pnpm prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  prisma = new PrismaClient({ datasourceUrl: url });
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await container?.stop();
});

export function getPrisma(): PrismaClient {
  return prisma;
}
```

> Nota: A função `getPrisma()` é exportada porque alguns testes precisam de acesso ao client. `setupFiles` do Vitest roda em escopo separado, então testes importam `getPrisma()` para obter o cliente já conectado. Se pares de configuração não compartilharem instância, alternativa é mover o `prisma` para um `beforeEach` em cada arquivo de teste.

- [ ] **Step 3: Sanity check — vitest config compila**

Run:

```bash
pnpm tsc --noEmit -p tsconfig.json
```

Expected: sem erros.

- [ ] **Step 4: Sanity check — testcontainers consegue subir Postgres**

Criar arquivo temporário `test/schema/_smoke.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getPrisma } from '../setup-prisma';

describe('smoke', () => {
  it('connects to test postgres', async () => {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 as ok`;
    expect(result[0]?.ok).toBe(1);
  });
});
```

Run:

```bash
pnpm test:schema
```

Expected: 1 teste passa. Output mostra `✓ test/schema/_smoke.spec.ts (1)`.

- [ ] **Step 5: Remover smoke test**

Run:

```bash
rm test/schema/_smoke.spec.ts
```

- [ ] **Step 6: Commit**

```bash
git add vitest.schema.config.ts test/setup-prisma.ts
git commit -m "test(schema): setup vitest + testcontainers for schema tests"
```

---

## Task 7: Testes — multi-tenant uniques (TDD)

**Files:**

- Create: `test/schema/multi-tenant-uniques.spec.ts`

- [ ] **Step 1: Criar arquivo com testes**

Conteúdo:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { getPrisma } from '../setup-prisma';

describe('multi-tenant unique constraints', () => {
  beforeEach(async () => {
    const prisma = getPrisma();
    // Truncate em ordem reversa de FK
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "AuditLog", "WebhookDelivery", "WebhookSubscription", "BotCredential", "MessageTemplate", "IntegrationLink", "BusinessHoliday", "CustomFieldDefinition", "ContactTag", "TicketTag", "Contact", "Ticket", "ChatFlow", "ChannelConnection", "LeadStatus", "SalesFunnel", "CloseReasonDepartment", "CloseReason", "QuickReply", "Tag", "UserDepartment", "Department", "RefreshToken", "User", "CompanySettings", "Company", "Plan" RESTART IDENTITY CASCADE`,
    );
  });

  async function setupTwoCompanies(): Promise<{ companyA: string; companyB: string }> {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'Test' } });
    const a = await prisma.company.create({
      data: { planId: plan.id, name: 'A', slug: 'a' },
    });
    const b = await prisma.company.create({
      data: { planId: plan.id, name: 'B', slug: 'b' },
    });
    return { companyA: a.id, companyB: b.id };
  }

  it('User.email é único por company mas duplicável entre companies', async () => {
    const prisma = getPrisma();
    const { companyA, companyB } = await setupTwoCompanies();

    await prisma.user.create({
      data: {
        companyId: companyA,
        name: 'A1',
        email: 'agent@x.com',
        passwordHash: 'h',
        role: 'AGENT',
      },
    });

    // Mesmo email em outra company → ok
    await expect(
      prisma.user.create({
        data: {
          companyId: companyB,
          name: 'B1',
          email: 'agent@x.com',
          passwordHash: 'h',
          role: 'AGENT',
        },
      }),
    ).resolves.toBeDefined();

    // Mesmo email na mesma company → falha
    await expect(
      prisma.user.create({
        data: {
          companyId: companyA,
          name: 'A2',
          email: 'agent@x.com',
          passwordHash: 'h',
          role: 'AGENT',
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it('Tag.name é único por company', async () => {
    const prisma = getPrisma();
    const { companyA, companyB } = await setupTwoCompanies();

    await prisma.tag.create({
      data: { companyId: companyA, name: 'urgente', color: '#FF0000' },
    });

    // Outra company → ok
    await expect(
      prisma.tag.create({
        data: { companyId: companyB, name: 'urgente', color: '#FF0000' },
      }),
    ).resolves.toBeDefined();

    // Mesma company → falha
    await expect(
      prisma.tag.create({
        data: { companyId: companyA, name: 'urgente', color: '#00FF00' },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it('Department.name é único por company', async () => {
    const prisma = getPrisma();
    const { companyA, companyB } = await setupTwoCompanies();

    await prisma.department.create({ data: { companyId: companyA, name: 'Suporte' } });

    await expect(
      prisma.department.create({ data: { companyId: companyB, name: 'Suporte' } }),
    ).resolves.toBeDefined();

    await expect(
      prisma.department.create({ data: { companyId: companyA, name: 'Suporte' } }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it('BotCredential.name é único por company', async () => {
    const prisma = getPrisma();
    const { companyA, companyB } = await setupTwoCompanies();

    await prisma.botCredential.create({
      data: {
        companyId: companyA,
        name: 'API X',
        authType: 'NONE',
        config: Buffer.from(''),
      },
    });

    await expect(
      prisma.botCredential.create({
        data: {
          companyId: companyB,
          name: 'API X',
          authType: 'NONE',
          config: Buffer.from(''),
        },
      }),
    ).resolves.toBeDefined();

    await expect(
      prisma.botCredential.create({
        data: {
          companyId: companyA,
          name: 'API X',
          authType: 'NONE',
          config: Buffer.from(''),
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it('Company.slug é globalmente único (sem companyId scope)', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    await prisma.company.create({ data: { planId: plan.id, name: 'A', slug: 'shared' } });

    await expect(
      prisma.company.create({ data: { planId: plan.id, name: 'B', slug: 'shared' } }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });
});
```

- [ ] **Step 2: Rodar e ver passar (schema já existe da Task 3)**

Run:

```bash
pnpm test:schema test/schema/multi-tenant-uniques.spec.ts
```

Expected: 5 testes passam. Se algum falhar, é constraint faltando no schema — corrigir no `schema.prisma`, regerar migration via `pnpm prisma migrate dev --name fix_<descrição>` e rodar de novo.

- [ ] **Step 3: Commit**

```bash
git add test/schema/multi-tenant-uniques.spec.ts
git commit -m "test(schema): add multi-tenant uniqueness constraint tests"
```

---

## Task 8: Testes — soft delete

**Files:**

- Create: `test/schema/soft-delete.spec.ts`

- [ ] **Step 1: Criar arquivo**

Conteúdo:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { getPrisma } from '../setup-prisma';

describe('soft delete behavior', () => {
  beforeEach(async () => {
    const prisma = getPrisma();
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "Department", "Company", "Plan" RESTART IDENTITY CASCADE`,
    );
  });

  it('soft delete (deletedAt != null) NÃO libera unique — comportamento documentado', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    const company = await prisma.company.create({
      data: { planId: plan.id, name: 'C', slug: 'c' },
    });

    const dept = await prisma.department.create({
      data: { companyId: company.id, name: 'Suporte' },
    });

    // Soft delete
    await prisma.department.update({
      where: { id: dept.id },
      data: { deletedAt: new Date() },
    });

    // Tentar criar outro com mesmo nome — DEVE falhar (sem índice parcial)
    await expect(
      prisma.department.create({
        data: { companyId: company.id, name: 'Suporte' },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
  });

  it('Department soft-deleted ainda é retornado por findMany sem filtro', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    const company = await prisma.company.create({
      data: { planId: plan.id, name: 'C', slug: 'c' },
    });

    const dept = await prisma.department.create({
      data: { companyId: company.id, name: 'X' },
    });
    await prisma.department.update({
      where: { id: dept.id },
      data: { deletedAt: new Date() },
    });

    const all = await prisma.department.findMany({ where: { companyId: company.id } });
    // Sem filtro de deletedAt, soft-deleted aparece — services precisam filtrar manualmente
    expect(all).toHaveLength(1);
    expect(all[0]!.deletedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar**

Run:

```bash
pnpm test:schema test/schema/soft-delete.spec.ts
```

Expected: 2 testes passam. O primeiro documenta a decisão consciente (sem índice parcial nesta sprint).

- [ ] **Step 3: Commit**

```bash
git add test/schema/soft-delete.spec.ts
git commit -m "test(schema): document soft-delete + unique interaction"
```

---

## Task 9: Testes — cascade behavior

**Files:**

- Create: `test/schema/cascade.spec.ts`

- [ ] **Step 1: Criar arquivo**

Conteúdo:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { getPrisma } from '../setup-prisma';

describe('FK cascade behavior', () => {
  beforeEach(async () => {
    const prisma = getPrisma();
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "CloseReasonDepartment", "CloseReason", "Department", "UserDepartment", "User", "CompanySettings", "Company", "Plan" RESTART IDENTITY CASCADE`,
    );
  });

  it('Cascade: deletar Company remove CompanySettings (1:1)', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    const company = await prisma.company.create({
      data: {
        planId: plan.id,
        name: 'C',
        slug: 'c',
        settings: { create: {} },
      },
      include: { settings: true },
    });
    expect(company.settings).not.toBeNull();

    await prisma.company.delete({ where: { id: company.id } });

    const settings = await prisma.companySettings.findUnique({
      where: { companyId: company.id },
    });
    expect(settings).toBeNull();
  });

  it('Cascade: deletar CloseReason remove suas CloseReasonDepartment', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    const company = await prisma.company.create({
      data: { planId: plan.id, name: 'C', slug: 'c' },
    });
    const dept = await prisma.department.create({
      data: { companyId: company.id, name: 'D' },
    });
    const reason = await prisma.closeReason.create({
      data: {
        companyId: company.id,
        name: 'Resolvido',
        departments: { create: { departmentId: dept.id } },
      },
    });

    const before = await prisma.closeReasonDepartment.count();
    expect(before).toBe(1);

    await prisma.closeReason.delete({ where: { id: reason.id } });

    const after = await prisma.closeReasonDepartment.count();
    expect(after).toBe(0);

    // Department continua existindo
    const dpt = await prisma.department.findUnique({ where: { id: dept.id } });
    expect(dpt).not.toBeNull();
  });

  it('Restrict: deletar Department com User vinculado falha', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    const company = await prisma.company.create({
      data: { planId: plan.id, name: 'C', slug: 'c' },
    });
    const dept = await prisma.department.create({
      data: { companyId: company.id, name: 'D' },
    });
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        name: 'U',
        email: 'u@u.com',
        passwordHash: 'h',
        role: 'AGENT',
        departments: { create: { departmentId: dept.id } },
      },
    });

    await expect(prisma.department.delete({ where: { id: dept.id } })).rejects.toThrow(
      Prisma.PrismaClientKnownRequestError,
    );

    // User intacto
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u).not.toBeNull();
  });
});
```

- [ ] **Step 2: Rodar**

Run:

```bash
pnpm test:schema test/schema/cascade.spec.ts
```

Expected: 3 testes passam.

- [ ] **Step 3: Commit**

```bash
git add test/schema/cascade.spec.ts
git commit -m "test(schema): verify cascade and restrict FK behaviors"
```

---

## Task 10: Testes — forward stubs

**Files:**

- Create: `test/schema/forward-stubs.spec.ts`

- [ ] **Step 1: Criar arquivo**

Conteúdo:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { getPrisma } from '../setup-prisma';

describe('forward stubs', () => {
  beforeEach(async () => {
    const prisma = getPrisma();
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "MessageTemplate", "WebhookSubscription", "CompanySettings", "ChatFlow", "ChannelConnection", "Company", "Plan" RESTART IDENTITY CASCADE`,
    );
  });

  it('MessageTemplate referencia ChannelConnection stub', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    const company = await prisma.company.create({
      data: { planId: plan.id, name: 'C', slug: 'c' },
    });
    const channel = await prisma.channelConnection.create({
      data: { companyId: company.id, name: 'WhatsApp Principal' },
    });

    const tpl = await prisma.messageTemplate.create({
      data: {
        companyId: company.id,
        channelConnectionId: channel.id,
        externalId: 'ext-1',
        name: 'welcome',
        category: 'UTILITY',
        status: 'APPROVED',
        language: 'pt_BR',
        bodyText: 'Olá {{1}}',
        variables: 1,
        lastSyncedAt: new Date(),
      },
    });

    expect(tpl.channelConnectionId).toBe(channel.id);
  });

  it('CompanySettings.defaultBotChatFlowId aponta para ChatFlow stub e SetNull no delete', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    const company = await prisma.company.create({
      data: { planId: plan.id, name: 'C', slug: 'c' },
    });
    const flow = await prisma.chatFlow.create({
      data: { companyId: company.id, name: 'flow-default' },
    });
    const settings = await prisma.companySettings.create({
      data: { companyId: company.id, defaultBotChatFlowId: flow.id },
    });
    expect(settings.defaultBotChatFlowId).toBe(flow.id);

    await prisma.chatFlow.delete({ where: { id: flow.id } });

    const updated = await prisma.companySettings.findUnique({
      where: { companyId: company.id },
    });
    expect(updated?.defaultBotChatFlowId).toBeNull();
  });

  it('WebhookSubscription.channelConnectionId é opcional e SetNull no delete do channel', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    const company = await prisma.company.create({
      data: { planId: plan.id, name: 'C', slug: 'c' },
    });
    const channel = await prisma.channelConnection.create({
      data: { companyId: company.id, name: 'wpp' },
    });
    const sub = await prisma.webhookSubscription.create({
      data: {
        companyId: company.id,
        name: 'integration-x',
        url: 'https://example.com/hook',
        secret: 'shhh',
        channelConnectionId: channel.id,
        events: ['TICKET_CREATED'],
      },
    });

    await prisma.channelConnection.delete({ where: { id: channel.id } });

    const updated = await prisma.webhookSubscription.findUnique({ where: { id: sub.id } });
    expect(updated?.channelConnectionId).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar**

Run:

```bash
pnpm test:schema test/schema/forward-stubs.spec.ts
```

Expected: 3 testes passam.

- [ ] **Step 3: Commit**

```bash
git add test/schema/forward-stubs.spec.ts
git commit -m "test(schema): verify forward-stub FK behaviors"
```

---

## Task 11: Teste — seed idempotency

**Files:**

- Create: `test/schema/seed.spec.ts`

- [ ] **Step 1: Criar arquivo**

Conteúdo:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import { getPrisma } from '../setup-prisma';

describe('seed', () => {
  beforeEach(async () => {
    const prisma = getPrisma();
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "AuditLog", "WebhookDelivery", "WebhookSubscription", "BotCredential", "MessageTemplate", "IntegrationLink", "BusinessHoliday", "CustomFieldDefinition", "ContactTag", "TicketTag", "Contact", "Ticket", "ChatFlow", "ChannelConnection", "LeadStatus", "SalesFunnel", "CloseReasonDepartment", "CloseReason", "QuickReply", "Tag", "UserDepartment", "Department", "RefreshToken", "User", "CompanySettings", "Company", "Plan" RESTART IDENTITY CASCADE`,
    );
  });

  function runSeed(): void {
    execSync('pnpm tsx prisma/seed.ts', {
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL!,
        SEED_SUPER_ADMIN_EMAIL: 'test-super@digichat.local',
        SEED_SUPER_ADMIN_PASSWORD: 'test-password',
      },
      stdio: 'pipe',
    });
  }

  it('seed cria 1 Plan, 1 Company, 1 CompanySettings, 1 SUPER_ADMIN em base limpa', async () => {
    const prisma = getPrisma();

    runSeed();

    const planCount = await prisma.plan.count();
    const companyCount = await prisma.company.count();
    const settingsCount = await prisma.companySettings.count();
    const userCount = await prisma.user.count();

    expect(planCount).toBe(1);
    expect(companyCount).toBe(1);
    expect(settingsCount).toBe(1);
    expect(userCount).toBe(1);

    const user = await prisma.user.findFirst();
    expect(user?.role).toBe('SUPER_ADMIN');
    expect(user?.email).toBe('test-super@digichat.local');
  });

  it('seed é idempotente: rodar 2x mantém 1 de cada', async () => {
    const prisma = getPrisma();

    runSeed();
    runSeed();

    expect(await prisma.plan.count()).toBe(1);
    expect(await prisma.company.count()).toBe(1);
    expect(await prisma.companySettings.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar**

Run:

```bash
pnpm test:schema test/schema/seed.spec.ts
```

Expected: 2 testes passam.

- [ ] **Step 3: Commit**

```bash
git add test/schema/seed.spec.ts
git commit -m "test(schema): verify seed idempotency"
```

---

## Task 12: Teste — enum values sanity check

**Files:**

- Create: `test/schema/enum-values.spec.ts`

- [ ] **Step 1: Criar arquivo**

Conteúdo:

```typescript
import { describe, it, expect } from 'vitest';
import {
  UserRole,
  DepartmentDistributionMode,
  TagScope,
  QuickReplyScope,
  LeadStatusFinalKind,
  CustomFieldType,
  CustomFieldEntity,
  IntegrationOpenMode,
  IntegrationVisibility,
  TemplateCategory,
  TemplateStatus,
  TemplateHeaderType,
  ApiAuthType,
  WebhookAuthType,
  WebhookEvent,
  WebhookDeliveryStatus,
} from '@prisma/client';

/**
 * Sanity check de enums: pega remoção/renomeação acidental.
 * Se algum enum mudar intencionalmente, atualizar a lista esperada.
 */
describe('enum values', () => {
  it('UserRole tem 4 valores', () => {
    expect(Object.values(UserRole)).toEqual(['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'AGENT']);
  });

  it('DepartmentDistributionMode tem 4 valores', () => {
    expect(Object.values(DepartmentDistributionMode)).toEqual([
      'MANUAL',
      'RANDOM',
      'BALANCED',
      'SEQUENTIAL',
    ]);
  });

  it('TagScope tem 3 valores', () => {
    expect(Object.values(TagScope)).toEqual(['CONTACT', 'TICKET', 'BOTH']);
  });

  it('QuickReplyScope tem 2 valores', () => {
    expect(Object.values(QuickReplyScope)).toEqual(['COMPANY', 'PERSONAL']);
  });

  it('LeadStatusFinalKind tem 2 valores', () => {
    expect(Object.values(LeadStatusFinalKind)).toEqual(['WON', 'LOST']);
  });

  it('CustomFieldType tem 8 valores', () => {
    expect(Object.values(CustomFieldType)).toEqual([
      'TEXT',
      'NUMBER',
      'DATE',
      'BOOLEAN',
      'SELECT',
      'EMAIL',
      'PHONE',
      'URL',
    ]);
  });

  it('CustomFieldEntity tem 3 valores', () => {
    expect(Object.values(CustomFieldEntity)).toEqual(['CONTACT', 'TICKET', 'BOTH']);
  });

  it('IntegrationOpenMode tem 2 valores', () => {
    expect(Object.values(IntegrationOpenMode)).toEqual(['NEW_TAB', 'IFRAME']);
  });

  it('IntegrationVisibility tem 2 valores', () => {
    expect(Object.values(IntegrationVisibility)).toEqual(['ALL_USERS', 'ADMINS_ONLY']);
  });

  it('TemplateCategory tem 3 valores', () => {
    expect(Object.values(TemplateCategory)).toEqual(['MARKETING', 'UTILITY', 'AUTHENTICATION']);
  });

  it('TemplateStatus tem 5 valores', () => {
    expect(Object.values(TemplateStatus)).toEqual([
      'PENDING',
      'APPROVED',
      'REJECTED',
      'DISABLED',
      'PAUSED',
    ]);
  });

  it('TemplateHeaderType tem 4 valores', () => {
    expect(Object.values(TemplateHeaderType)).toEqual(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']);
  });

  it('ApiAuthType tem 5 valores', () => {
    expect(Object.values(ApiAuthType)).toEqual([
      'NONE',
      'BEARER_TOKEN',
      'API_KEY_HEADER',
      'BASIC_AUTH',
      'CUSTOM_HEADERS',
    ]);
  });

  it('WebhookAuthType tem 4 valores', () => {
    expect(Object.values(WebhookAuthType)).toEqual([
      'NONE',
      'BEARER_TOKEN',
      'HMAC_SHA256',
      'BASIC_AUTH',
    ]);
  });

  it('WebhookEvent tem 11 valores', () => {
    expect(Object.values(WebhookEvent)).toEqual([
      'CONTACT_CREATED',
      'CONTACT_UPDATED',
      'TICKET_CREATED',
      'TICKET_ASSIGNED',
      'TICKET_UPDATED',
      'TICKET_TRANSFERRED',
      'TICKET_CLOSED',
      'TICKET_ARCHIVED',
      'MESSAGE_CREATED',
      'MESSAGE_STATUS_CHANGED',
      'CHANNEL_STATUS_CHANGED',
    ]);
  });

  it('WebhookDeliveryStatus tem 5 valores', () => {
    expect(Object.values(WebhookDeliveryStatus)).toEqual([
      'PENDING',
      'SUCCESS',
      'RETRYING',
      'FAILED',
      'CANCELLED',
    ]);
  });
});
```

- [ ] **Step 2: Rodar**

Run:

```bash
pnpm test:schema test/schema/enum-values.spec.ts
```

Expected: 16 testes passam.

- [ ] **Step 3: Rodar todos os testes de schema juntos**

Run:

```bash
pnpm test:schema
```

Expected: ~30 testes passam (5 + 2 + 3 + 3 + 2 + 16).

- [ ] **Step 4: Commit**

```bash
git add test/schema/enum-values.spec.ts
git commit -m "test(schema): assert enum values to catch accidental changes"
```

---

## Task 13: Verificação final, ROADMAP, e PR

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Rodar verificação completa por evidência**

Capture o output de cada comando para reportar ao humano:

```bash
echo '=== prisma validate ==='
pnpm prisma validate

echo '=== prisma format (dry-run via diff) ==='
pnpm prisma format
git diff --exit-code prisma/schema.prisma  # esperado: zero diff

echo '=== migrate reset (base limpa + seed) ==='
pnpm prisma migrate reset --force

echo '=== schema tests ==='
pnpm test:schema

echo '=== typecheck ==='
pnpm typecheck

echo '=== lint ==='
pnpm lint

echo '=== build ==='
pnpm build
```

Expected: cada um retorna 0 (sucesso). Se qualquer um falhar, parar e corrigir.

- [ ] **Step 2: Marcar checkboxes do ROADMAP.md**

Editar [ROADMAP.md](ROADMAP.md) na seção "Schema do núcleo (Prisma)" (~linha 128-150). Trocar `- [ ]` por `- [x]` em **exatamente** os 10 itens da seção:

```diff
 ### Schema do núcleo (Prisma)

 **Entidades base:**

-- [ ] `Plan`, `Company`, `CompanySettings` (13 flags incluindo `hideBotTicketsFromAgents`)
-- [ ] `User` (4 perfis), `RefreshToken`
-- [ ] `Department` (workingHours, SLA, distributionMode preparados)
+- [x] `Plan`, `Company`, `CompanySettings` (13 flags incluindo `hideBotTicketsFromAgents`)
+- [x] `User` (4 perfis), `RefreshToken`
+- [x] `Department` (workingHours, SLA, distributionMode preparados)

 **Cadastros:**

-- [ ] `Tag` (com scope), `QuickReply` (escopo COMPANY/PERSONAL)
-- [ ] `CloseReason` + `CloseReasonDepartment`
-- [ ] `SalesFunnel`, `LeadStatus`
-- [ ] `CustomFieldDefinition` (8 tipos, schema preparado)
-- [ ] `BusinessHoliday` (schema preparado, fase 4+)
+- [x] `Tag` (com scope), `QuickReply` (escopo COMPANY/PERSONAL)
+- [x] `CloseReason` + `CloseReasonDepartment`
+- [x] `SalesFunnel`, `LeadStatus`
+- [x] `CustomFieldDefinition` (8 tipos, schema preparado)
+- [x] `BusinessHoliday` (schema preparado, fase 4+)

 **Integrações (schema apenas):**

-- [ ] `IntegrationLink`, `MessageTemplate`, `BotCredential`, `WebhookSubscription`, `WebhookDelivery`
+- [x] `IntegrationLink`, `MessageTemplate`, `BotCredential`, `WebhookSubscription`, `WebhookDelivery`

 **Auditoria:**

-- [ ] `AuditLog`
+- [x] `AuditLog`
```

Confirmar que **somente esses 10 boxes** mudaram:

```bash
git diff ROADMAP.md | grep -E "^[-+]- \[" | wc -l
```

Expected: 20 linhas (10 `-` + 10 `+`).

- [ ] **Step 3: Commit do ROADMAP**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): mark phase 0 core schema items as done"
```

- [ ] **Step 4: Verificar histórico antes de criar PR**

Run:

```bash
git log --oneline main..HEAD
```

Expected: 15 commits desta sprint visíveis em ordem (do mais antigo para o mais recente):

```
docs(specs): add sprint 0.2 (core schema) design
docs(plans): add sprint 0.2 (core schema) implementation plan
chore(deps): add prisma, bcrypt, tsx, testcontainers
chore(prisma): bootstrap schema, env example, scripts
feat(schema): add core, cadastros, integrations, audit, and forward stubs
feat(prisma): generate init_core_schema migration
feat(prisma): add idempotent seed (1 Plan, 1 Company, 1 SUPER_ADMIN)
test(schema): setup vitest + testcontainers for schema tests
test(schema): add multi-tenant uniqueness constraint tests
test(schema): document soft-delete + unique interaction
test(schema): verify cascade and restrict FK behaviors
test(schema): verify forward-stub FK behaviors
test(schema): verify seed idempotency
test(schema): assert enum values to catch accidental changes
docs(roadmap): mark phase 0 core schema items as done
```

- [ ] **Step 5: PARAR e pedir confirmação ao humano antes de push/PR**

A regra do projeto é: "Não fazer push pro remote sem confirmar comigo." (memória da sessão / CLAUDE.md). Não rodar `git push` ou `gh pr create` automaticamente.

Reportar ao humano:

- Tudo verde: 9 verificações de evidência passaram
- Branch `feat/sprint-0-2-schema-nucleo` com 14 commits prontos
- ROADMAP.md atualizado: 10 boxes marcados, nada mais
- Aguardando OK pra `git push -u origin feat/sprint-0-2-schema-nucleo` e abrir PR via `gh pr create`

- [ ] **Step 6 (após OK do humano): Push + abrir PR**

```bash
git push -u origin feat/sprint-0-2-schema-nucleo
gh pr create --title "Sprint 0.2 — Core Prisma schema" --body "$(cat <<'EOF'
## Summary
- Implementa schema Prisma completo do núcleo do DigiChat conforme ROADMAP §5 → "Schema do núcleo (Prisma)"
- 21 entidades reais + 6 stubs forward para FKs de fases futuras
- Migration única `init_core_schema` aplicável em base limpa
- Seed idempotente: 1 Plan, 1 Company, 1 CompanySettings, 1 SUPER_ADMIN
- 31 testes Vitest cobrindo constraints multi-tenant, soft delete, cascade, stubs forward, seed e enums

## Spec
[`docs/superpowers/specs/2026-05-01-sprint-0-2-schema-nucleo-design.md`](docs/superpowers/specs/2026-05-01-sprint-0-2-schema-nucleo-design.md)

## Plan
[`docs/superpowers/plans/2026-05-01-sprint-0-2-schema-nucleo.md`](docs/superpowers/plans/2026-05-01-sprint-0-2-schema-nucleo.md)

## Test plan
- [ ] `pnpm prisma validate` retorna ok
- [ ] `pnpm prisma migrate reset --force` aplica migration limpa + seed
- [ ] `pnpm test:schema` — 31 specs verdes
- [ ] `pnpm typecheck` — 0 erros
- [ ] `pnpm lint` — 0 erros
- [ ] `pnpm build` — sucesso
- [ ] Revisar `git diff ROADMAP.md` (10 boxes, nada mais)
EOF
)"
```

Expected: PR criado, URL retornado para o humano abrir.

---

## Resumo de tasks

| #   | Task                                                     | Steps | Tempo estimado |
| --- | -------------------------------------------------------- | ----- | -------------- |
| 0   | Pre-flight (commit do plano + worktree opcional + infra) | 3     | 5 min          |
| 1   | Install dependencies                                     | 4     | 10 min         |
| 2   | Configurar Prisma e env                                  | 9     | 20 min         |
| 3   | Adicionar todos os models                                | 10    | 90 min         |
| 4   | Gerar migration init_core_schema                         | 6     | 15 min         |
| 5   | Implementar seed.ts                                      | 6     | 30 min         |
| 6   | Setup testes (testcontainers)                            | 6     | 40 min         |
| 7   | Test multi-tenant uniques                                | 3     | 30 min         |
| 8   | Test soft-delete                                         | 3     | 15 min         |
| 9   | Test cascade                                             | 3     | 25 min         |
| 10  | Test forward stubs                                       | 3     | 25 min         |
| 11  | Test seed                                                | 3     | 25 min         |
| 12  | Test enum values                                         | 4     | 20 min         |
| 13  | Verificação + ROADMAP + PR                               | 6     | 30 min         |

**Total:** ~6h de trabalho ativo. Comparado com a estimativa de 5 dias do spec, há folga grande para imprevistos (testcontainers downloading imagem na primeira vez, debugging de constraints, ajustes de schema).
