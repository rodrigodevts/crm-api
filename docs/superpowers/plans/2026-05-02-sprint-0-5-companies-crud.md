# Sprint 0.5 — Companies CRUD (apenas SUPER_ADMIN) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o CRUD completo de `Company` (apenas SUPER_ADMIN, com `/me` para qualquer autenticado e `PATCH /me` restrito para ADMIN+ do próprio tenant), criando `Company + CompanySettings (defaults) + 1º ADMIN` em uma transação no `POST`, e bloqueando soft-delete enquanto houver usuário ativo no tenant.

**Architecture:** 3 camadas (Controller → Application Service → Domain Service) seguindo o padrão da Fase 0. Transações coordenadas pelo application service; `companies.domain.service` não recebe `companyId` (Company _é_ o tenant — o id da operação vem do path). Reuso de `UsersDomainService.create` injetado no application service do POST. Cursor pagination compartilhada via novo `src/common/cursor.ts` (extraído de `UsersDomainService` como pré-passo). Defesa-em-profundidade contra `ZodValidationPipe` global não enforçar `.strict()`: re-parse explícito nos PATCHs (mesmo padrão da Sprint 0.4).

**Tech Stack:** NestJS 11 + Fastify, Prisma 6, Zod 3 + `nestjs-zod`, Vitest, bcrypt 12, BullMQ não usado nesta sprint (sem fila), Socket.IO não usado.

**Spec:** [`docs/superpowers/specs/2026-05-02-sprint-0-5-companies-crud-design.md`](../specs/2026-05-02-sprint-0-5-companies-crud-design.md).

**Branch:** `feat/sprint-0-5-companies-crud` (worktree em `.worktrees/sprint-0-5-companies-crud`). Branch `fix/users-strict-validation` já mergeada (PR #14, commit `ff77cbf` em `origin/main`).

---

## File Structure

### Novos arquivos

```
src/common/cursor.ts                                      # Helper extraído de UsersDomainService
src/common/__tests__/cursor.spec.ts                       # Unit tests do cursor

src/modules/companies/companies.module.ts                 # Module
src/modules/companies/controllers/companies.controller.ts
src/modules/companies/controllers/companies-me.controller.ts
src/modules/companies/services/companies.application.service.ts
src/modules/companies/services/companies.domain.service.ts

src/modules/companies/schemas/working-hours.schema.ts
src/modules/companies/schemas/create-company.schema.ts
src/modules/companies/schemas/update-company-me.schema.ts
src/modules/companies/schemas/update-company.schema.ts
src/modules/companies/schemas/list-companies.schema.ts
src/modules/companies/schemas/company-response.schema.ts
src/modules/companies/schemas/company-with-admin-response.schema.ts

src/modules/companies/tests/companies.domain.service.spec.ts
src/modules/companies/tests/companies.controller.e2e-spec.ts
src/modules/companies/tests/companies-me.controller.e2e-spec.ts
```

### Arquivos modificados

```
src/app.module.ts                                          # registrar CompaniesModule
src/modules/users/services/users.domain.service.ts         # passar a usar src/common/cursor.ts
test/e2e/factories.ts                                      # createSuperAdmin helper
docs/conventions/multi-tenant-checklist.md                 # seção "entidade que É o tenant"
ROADMAP.md                                                 # marcar Companies como done
```

### Responsabilidades por arquivo

- **`src/common/cursor.ts`** — encode/decode de cursor opaco `{ createdAt, id }` em base64url. Stateless, sem dependência de Prisma. Lança `BadRequestException` em cursor malformado.
- **`companies.domain.service.ts`** — regras puras de Company. Não conhece `companyId` (Company _é_ o tenant). Recebe `tx` para operar dentro de transação coordenada. Asserções (`assertSlugAvailable`, `assertPlanIsActive`, `assertNoActiveUsers`).
- **`companies.application.service.ts`** — orquestra POST com `UsersDomainService` injetado, abre `prisma.$transaction`, faz bcrypt, autorização condicional do GET, re-parse strict dos PATCHs, mapeamento `P2002 → 409` (slug + email).
- **`companies.controller.ts`** — endpoints SUPER_ADMIN-only (POST/GET/GET:id/PATCH:id/DELETE:id). Resposta serializada via `@ZodSerializerDto`.
- **`companies-me.controller.ts`** — `GET /companies/me` (qualquer auth) e `PATCH /companies/me` (ADMIN+). Registrado **antes** de `CompaniesController` no module para resolver `me` antes de `:id` no Fastify.
- **Schemas Zod** — single source of truth (validação + tipo + OpenAPI).
- **Testes** — unit cobre só asserções do domain; e2e cobre fluxos completos + multi-tenant + autorização.

---

## Phase 0 — Setup

### Task 1: Extrair cursor helper para `src/common/cursor.ts`

**Files:**

- Create: `src/common/cursor.ts`
- Create: `src/common/__tests__/cursor.spec.ts`
- Modify: `src/modules/users/services/users.domain.service.ts:126-141` (substituir helpers locais por import do helper compartilhado)

**Por quê:** o `CompaniesDomainService.list` vai precisar do mesmo encode/decode de cursor que `UsersDomainService.list`. Extrair antes de tocar em Companies mantém o diff focado e a refatoração reversível em isolamento.

- [ ] **Step 1: Criar `src/common/cursor.ts`**

```typescript
import { BadRequestException } from '@nestjs/common';

export interface DecodedCursor {
  createdAt: Date;
  id: string;
}

export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), 'utf8').toString(
    'base64url',
  );
}

export function decodeCursor(cursor: string | undefined): DecodedCursor | null {
  if (cursor === undefined) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as { createdAt: string; id: string };
    return { createdAt: new Date(parsed.createdAt), id: parsed.id };
  } catch {
    throw new BadRequestException('Cursor inválido');
  }
}
```

- [ ] **Step 2: Criar `src/common/__tests__/cursor.spec.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { encodeCursor, decodeCursor } from '../cursor';

describe('cursor helper', () => {
  it('encodes and decodes round-trip', () => {
    const createdAt = new Date('2026-04-27T15:30:00.000Z');
    const id = '01934aaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const encoded = encodeCursor(createdAt, id);
    const decoded = decodeCursor(encoded);
    expect(decoded?.createdAt.toISOString()).toBe(createdAt.toISOString());
    expect(decoded?.id).toBe(id);
  });

  it('returns null when cursor is undefined', () => {
    expect(decodeCursor(undefined)).toBeNull();
  });

  it('throws BadRequestException on malformed cursor', () => {
    expect(() => decodeCursor('not-base64-json!!')).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 3: Rodar o teste novo, verificar que passa**

Run: `pnpm test src/common/__tests__/cursor.spec.ts`
Expected: 3 passed.

- [ ] **Step 4: Refatorar `users.domain.service.ts` para usar o helper**

Substituir os métodos `encodeCursor`/`decodeCursor` da classe por importação do helper. No arquivo `src/modules/users/services/users.domain.service.ts`:

Remover:

```typescript
  encodeCursor(createdAt: Date, id: string): string {
    return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), 'utf8').toString(
      'base64url',
    );
  }

  decodeCursor(cursor: string | undefined): { createdAt: Date; id: string } | null {
    if (cursor === undefined) return null;
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      const parsed = JSON.parse(decoded) as { createdAt: string; id: string };
      return { createdAt: new Date(parsed.createdAt), id: parsed.id };
    } catch {
      throw new BadRequestException('Cursor inválido');
    }
  }
```

Adicionar no topo do arquivo:

```typescript
import { decodeCursor, encodeCursor } from '../../../common/cursor';
```

Substituir as chamadas internas (`this.decodeCursor(...)` → `decodeCursor(...)`, `this.encodeCursor(...)` → `encodeCursor(...)`).

Remover do import de `@nestjs/common` o `BadRequestException` se não for mais usado em outro ponto do arquivo. Conferir grep antes:

```bash
grep -c "BadRequestException" src/modules/users/services/users.domain.service.ts
```

Se retornar 1 (só o import), remover. Se retornar 2+, manter.

- [ ] **Step 5: Rodar typecheck + unit + e2e de users para garantir refactor não-quebrante**

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
```

Expected: tudo passa (mesmo número de testes que antes — 69 unit, 50 e2e).

- [ ] **Step 6: Commit**

```bash
git add src/common/cursor.ts src/common/__tests__/cursor.spec.ts src/modules/users/services/users.domain.service.ts
git commit -m "refactor(common): extract cursor helper from users domain service"
```

---

### Task 2: Gerar scaffold do módulo `companies` via schematic

**Files:**

- Create (via gerador): toda a estrutura do módulo `src/modules/companies/`
- Modify: `src/app.module.ts` (auto-update do gerador adiciona `CompaniesModule` ao `imports`)

- [ ] **Step 1: Rodar o schematic**

```bash
pnpm g:feature companies
```

Expected: cria a estrutura completa em `src/modules/companies/` (módulo, controller, application service, domain service, schemas placeholder, testes placeholder com `it.skip`) e atualiza `src/app.module.ts` adicionando `CompaniesModule` ao array `imports: [...]`.

- [ ] **Step 2: Verificar a estrutura criada**

```bash
ls -1 src/modules/companies/
ls -1 src/modules/companies/controllers
ls -1 src/modules/companies/services
ls -1 src/modules/companies/schemas
ls -1 src/modules/companies/tests
```

Expected: arquivos `companies.module.ts`, `controllers/companies.controller.ts`, `services/companies.application.service.ts`, `services/companies.domain.service.ts`, schemas placeholder e testes placeholder.

- [ ] **Step 3: Apagar arquivos placeholder que não vamos usar (5-endpoint CRUD genérico)**

O gerador cria 5 endpoints `NotImplementedException` no controller padrão. Vamos reescrever esse controller do zero (e adicionar um segundo, `companies-me.controller.ts`). Os schemas placeholder (`create-company.schema.ts`, `update-company.schema.ts`, `company-response.schema.ts`) também serão substituídos por nossos 7 schemas reais. Apenas deletar o conteúdo dos arquivos placeholder não é suficiente — vamos sobrescrever inteiramente nas próximas tasks. Por ora, **deixar como o gerador colocou**; cada task seguinte vai sobrescrever o arquivo correspondente integralmente.

- [ ] **Step 4: Confirmar que o app ainda compila**

```bash
pnpm typecheck
```

Expected: 0 erros.

- [ ] **Step 5: Commit**

```bash
git add src/modules/companies src/app.module.ts
git commit -m "feat(companies): scaffold module via feature schematic"
```

---

### Task 3: Importar `UsersModule` no `CompaniesModule`

**Files:**

- Modify: `src/modules/companies/companies.module.ts`

**Por quê:** o `CompaniesApplicationService.create` precisa injetar `UsersDomainService` para criar o 1º ADMIN do tenant na mesma transação. `UsersModule` já exporta `UsersDomainService` (`src/modules/users/users.module.ts:12`).

- [ ] **Step 1: Substituir `companies.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { CompaniesController } from './controllers/companies.controller';
import { CompaniesMeController } from './controllers/companies-me.controller';
import { CompaniesApplicationService } from './services/companies.application.service';
import { CompaniesDomainService } from './services/companies.domain.service';

@Module({
  imports: [AuthModule, UsersModule],
  // CompaniesMeController declarado ANTES — Fastify resolve rotas pela ordem
  // de registro: precisamos de /me antes de /:id em GET.
  controllers: [CompaniesMeController, CompaniesController],
  providers: [CompaniesApplicationService, CompaniesDomainService],
  exports: [CompaniesApplicationService, CompaniesDomainService],
})
export class CompaniesModule {}
```

> O arquivo `companies-me.controller.ts` ainda não existe — o typecheck vai quebrar até a Task 18. Tudo bem; deixe assim. Próximas tasks resolvem.

- [ ] **Step 2: Não rodar typecheck ainda — vai falhar até `CompaniesMeController` existir.**

- [ ] **Step 3: Commit**

```bash
git add src/modules/companies/companies.module.ts
git commit -m "feat(companies): wire UsersModule and Me controller in module"
```

---

### Task 4: Adicionar `createSuperAdmin` em `test/e2e/factories.ts`

**Files:**

- Modify: `test/e2e/factories.ts`

- [ ] **Step 1: Adicionar `createSuperAdmin` ao final do arquivo (antes do `truncateAll`)**

```typescript
export async function createSuperAdmin(
  prisma: PrismaClient,
  companyId: string,
  options: { email?: string; password?: string; name?: string } = {},
): Promise<{ user: User; password: string }> {
  return createUser(prisma, companyId, {
    role: 'SUPER_ADMIN',
    email: options.email ?? `super-${nextId()}@test.local`,
    password: options.password ?? 'valid-password-1234',
    name: options.name ?? `SuperAdmin ${nextId()}`,
  });
}
```

> Wrapper sobre `createUser` — o helper genérico já aceita `role`. O sentido é tornar o setup de testes legível (`createSuperAdmin(...)` é mais óbvio que `createUser(..., { role: 'SUPER_ADMIN' })`).

- [ ] **Step 2: Rodar typecheck**

```bash
pnpm typecheck
```

Expected: ainda quebra em `companies.module.ts` (até Task 18). Mas a mudança em `factories.ts` deve estar limpa — qualquer erro novo nela é regressão.

- [ ] **Step 3: Commit**

```bash
git add test/e2e/factories.ts
git commit -m "test(factories): add createSuperAdmin helper"
```

---

## Phase 1 — Schemas Zod

### Task 5: Escrever os 7 schemas Zod

**Files:**

- Create: `src/modules/companies/schemas/working-hours.schema.ts`
- Create/Overwrite: `src/modules/companies/schemas/create-company.schema.ts`
- Create: `src/modules/companies/schemas/update-company-me.schema.ts`
- Create/Overwrite: `src/modules/companies/schemas/update-company.schema.ts`
- Create: `src/modules/companies/schemas/list-companies.schema.ts`
- Create/Overwrite: `src/modules/companies/schemas/company-response.schema.ts`
- Create: `src/modules/companies/schemas/company-with-admin-response.schema.ts`

> Schemas Zod não exigem TDD per se — são tipos. Vamos validá-los pela e2e nas próximas fases. A Sprint 0.4 fez igual (Task 4 do plano dela criou todos os schemas em batch).

- [ ] **Step 1: `working-hours.schema.ts`**

```typescript
import { z } from 'zod';

const TimeRangeSchema = z
  .object({
    from: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
    to: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:MM'),
  })
  .strict();

export const WorkingHoursSchema = z
  .object({
    monday: z.array(TimeRangeSchema).default([]),
    tuesday: z.array(TimeRangeSchema).default([]),
    wednesday: z.array(TimeRangeSchema).default([]),
    thursday: z.array(TimeRangeSchema).default([]),
    friday: z.array(TimeRangeSchema).default([]),
    saturday: z.array(TimeRangeSchema).default([]),
    sunday: z.array(TimeRangeSchema).default([]),
    holiday: z.array(TimeRangeSchema).default([]),
  })
  .strict()
  .describe('Horário de funcionamento por dia da semana (e feriado).');

export type WorkingHoursDto = z.infer<typeof WorkingHoursSchema>;
```

- [ ] **Step 2: `create-company.schema.ts`**

Sobrescrever placeholder do gerador:

```typescript
import { z } from 'zod';
import { WorkingHoursSchema } from './working-hours.schema';

const SlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Slug deve ter no mínimo 3 caracteres')
  .max(63, 'Slug deve ter no máximo 63 caracteres')
  .regex(
    /^[a-z0-9](-?[a-z0-9]+)*$/,
    'Slug deve conter apenas letras minúsculas, números e hífens, sem hífens consecutivos ou nas pontas',
  );

export const CreateCompanySchema = z
  .object({
    company: z
      .object({
        name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100),
        slug: SlugSchema,
        planId: z.string().uuid('planId em formato UUID inválido'),
        timezone: z.string().min(1).max(64).default('America/Sao_Paulo'),
        defaultWorkingHours: WorkingHoursSchema.nullable().optional(),
        outOfHoursMessage: z.string().max(2000).nullable().optional(),
      })
      .strict()
      .describe('Dados da empresa (tenant) sendo criada'),
    admin: z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.string().trim().toLowerCase().email('Email em formato inválido'),
        password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres').max(128),
      })
      .strict()
      .describe('Primeiro ADMIN do tenant — criado junto com a empresa'),
  })
  .strict()
  .describe('Cria empresa + CompanySettings (defaults) + 1º ADMIN do tenant em uma transação');

export type CreateCompanyDto = z.infer<typeof CreateCompanySchema>;
```

- [ ] **Step 3: `update-company-me.schema.ts`**

```typescript
import { z } from 'zod';
import { WorkingHoursSchema } from './working-hours.schema';

export const UpdateCompanyMeSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    timezone: z.string().min(1).max(64).optional(),
    defaultWorkingHours: WorkingHoursSchema.nullable().optional(),
    outOfHoursMessage: z.string().max(2000).nullable().optional(),
  })
  .strict()
  .describe('Campos editáveis pelo ADMIN do próprio tenant');

export type UpdateCompanyMeDto = z.infer<typeof UpdateCompanyMeSchema>;
```

- [ ] **Step 4: `update-company.schema.ts`**

Sobrescrever placeholder:

```typescript
import { z } from 'zod';
import { WorkingHoursSchema } from './working-hours.schema';

export const UpdateCompanySchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    timezone: z.string().min(1).max(64).optional(),
    defaultWorkingHours: WorkingHoursSchema.nullable().optional(),
    outOfHoursMessage: z.string().max(2000).nullable().optional(),
    planId: z.string().uuid().optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .describe('Campos editáveis pelo SUPER_ADMIN. Não inclui slug (imutável).');

export type UpdateCompanyDto = z.infer<typeof UpdateCompanySchema>;
```

- [ ] **Step 5: `list-companies.schema.ts`**

```typescript
import { z } from 'zod';

export const ListCompaniesQuerySchema = z
  .object({
    active: z.coerce.boolean().optional().default(true),
    search: z.string().trim().min(1).max(100).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .describe('Filtros para listagem de empresas (SUPER_ADMIN)');

export type ListCompaniesQueryDto = z.infer<typeof ListCompaniesQuerySchema>;
```

- [ ] **Step 6: `company-response.schema.ts`**

Sobrescrever placeholder:

```typescript
import { z } from 'zod';
import { WorkingHoursSchema } from './working-hours.schema';

export const CompanyResponseSchema = z
  .object({
    id: z.string().uuid(),
    planId: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
    active: z.boolean(),
    timezone: z.string(),
    defaultWorkingHours: WorkingHoursSchema.nullable(),
    outOfHoursMessage: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .describe('Empresa (tenant). Sem settings, sem deletedAt.');

export const CompanyListResponseSchema = z.object({
  items: z.array(CompanyResponseSchema),
  pagination: z.object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
});

export type CompanyResponseDto = z.infer<typeof CompanyResponseSchema>;
export type CompanyListResponseDto = z.infer<typeof CompanyListResponseSchema>;
```

- [ ] **Step 7: `company-with-admin-response.schema.ts`**

```typescript
import { z } from 'zod';
import { UserResponseSchema } from '../../users/schemas/user-response.schema';
import { CompanyResponseSchema } from './company-response.schema';

export const CompanyWithAdminResponseSchema = z
  .object({
    company: CompanyResponseSchema,
    admin: UserResponseSchema,
  })
  .describe('Resposta de POST /companies — empresa criada + 1º ADMIN');

export type CompanyWithAdminResponseDto = z.infer<typeof CompanyWithAdminResponseSchema>;
```

- [ ] **Step 8: Não rodar typecheck ainda — domain/app/controllers ainda quebram. Commit dos schemas.**

```bash
git add src/modules/companies/schemas
git commit -m "feat(companies): add zod schemas for company crud"
```

---

## Phase 2 — Domain service (TDD)

> Padrão da Sprint 0.4: cada método público com regra de negócio tem 1 unit test que cobre o caminho específico. Métodos puramente CRUD (`findById`, `list`, `create`/`update` happy path) ficam para a e2e cobrir.

### Task 6: `assertSlugAvailable`

**Files:**

- Modify: `src/modules/companies/services/companies.domain.service.ts` (sobrescrever placeholder do gerador)
- Modify: `src/modules/companies/tests/companies.domain.service.spec.ts` (sobrescrever placeholder)

- [ ] **Step 1: Sobrescrever `companies.domain.service.ts` com a versão mínima da Task 6**

```typescript
import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class CompaniesDomainService {
  constructor(private readonly prisma: PrismaService) {}

  async assertSlugAvailable(
    slug: string,
    tx: Prisma.TransactionClient,
    exceptId?: string,
  ): Promise<void> {
    const existing = await tx.company.findFirst({ where: { slug } });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('Slug já em uso');
    }
  }
}
```

> Mantemos `Prisma.TransactionClient` no parâmetro mesmo nas asserções porque elas vivem dentro da transação coordenada pelo app service. `findFirst` (sem filtrar `deletedAt`) é proposital: slug é unique global, não respeita soft-delete.

- [ ] **Step 2: Escrever o teste em `companies.domain.service.spec.ts`** (sobrescrever placeholder)

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { CompaniesDomainService } from '../services/companies.domain.service';
import type { PrismaService } from '../../../database/prisma.service';

const fakeTx = (overrides: Record<string, unknown> = {}): unknown => ({
  company: {
    findFirst: vi.fn(),
    ...overrides,
  },
  user: {
    count: vi.fn(),
  },
  plan: {
    findFirst: vi.fn(),
  },
});

describe('CompaniesDomainService', () => {
  let service: CompaniesDomainService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {} as PrismaService;
    service = new CompaniesDomainService(prisma);
  });

  describe('assertSlugAvailable', () => {
    it('passes when no company has the slug', async () => {
      const tx = fakeTx();
      (
        tx as { company: { findFirst: ReturnType<typeof vi.fn> } }
      ).company.findFirst.mockResolvedValue(null);
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        service.assertSlugAvailable('acme', tx as any),
      ).resolves.toBeUndefined();
    });

    it('throws ConflictException when slug is already taken by another company', async () => {
      const tx = fakeTx();
      (
        tx as { company: { findFirst: ReturnType<typeof vi.fn> } }
      ).company.findFirst.mockResolvedValue({
        id: 'existing-uuid',
        slug: 'acme',
      });
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        service.assertSlugAvailable('acme', tx as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('passes when slug is taken but exceptId matches the existing row', async () => {
      const tx = fakeTx();
      (
        tx as { company: { findFirst: ReturnType<typeof vi.fn> } }
      ).company.findFirst.mockResolvedValue({
        id: 'self-uuid',
        slug: 'acme',
      });
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        service.assertSlugAvailable('acme', tx as any, 'self-uuid'),
      ).resolves.toBeUndefined();
    });
  });
});
```

- [ ] **Step 3: Rodar o teste**

```bash
pnpm test src/modules/companies/tests/companies.domain.service.spec.ts
```

Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add src/modules/companies/services/companies.domain.service.ts src/modules/companies/tests/companies.domain.service.spec.ts
git commit -m "feat(companies): add assertSlugAvailable to domain service"
```

---

### Task 7: `assertPlanIsActive`

**Files:**

- Modify: `src/modules/companies/services/companies.domain.service.ts`
- Modify: `src/modules/companies/tests/companies.domain.service.spec.ts`

- [ ] **Step 1: Adicionar o teste antes da implementação**

Adicionar dentro do `describe('CompaniesDomainService', ...)`:

```typescript
describe('assertPlanIsActive', () => {
  it('passes when plan exists and is active', async () => {
    const tx = fakeTx();
    (tx as { plan: { findFirst: ReturnType<typeof vi.fn> } }).plan.findFirst.mockResolvedValue({
      id: 'plan-uuid',
      active: true,
    });
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.assertPlanIsActive('plan-uuid', tx as any),
    ).resolves.toBeUndefined();
  });

  it('throws UnprocessableEntityException when plan is inactive', async () => {
    const tx = fakeTx();
    (tx as { plan: { findFirst: ReturnType<typeof vi.fn> } }).plan.findFirst.mockResolvedValue(
      null,
    );
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.assertPlanIsActive('plan-uuid', tx as any),
    ).rejects.toMatchObject({
      constructor: expect.objectContaining({ name: 'UnprocessableEntityException' }),
    });
  });

  it('throws UnprocessableEntityException when plan does not exist', async () => {
    const tx = fakeTx();
    (tx as { plan: { findFirst: ReturnType<typeof vi.fn> } }).plan.findFirst.mockResolvedValue(
      null,
    );
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.assertPlanIsActive('missing-uuid', tx as any),
    ).rejects.toMatchObject({
      constructor: expect.objectContaining({ name: 'UnprocessableEntityException' }),
    });
  });
});
```

Importar o helper de assertion no topo do arquivo de teste:

```typescript
import { UnprocessableEntityException } from '@nestjs/common';
```

E trocar o `expect.objectContaining({ name: 'UnprocessableEntityException' })` matcher por `toBeInstanceOf(UnprocessableEntityException)` para consistência:

```typescript
await expect(...).rejects.toBeInstanceOf(UnprocessableEntityException);
```

- [ ] **Step 2: Rodar — esperar falha**

```bash
pnpm test src/modules/companies/tests/companies.domain.service.spec.ts
```

Expected: 3 PASS (assertSlug...) + 3 FAIL (assertPlanIsActive — método não existe).

- [ ] **Step 3: Implementar o método em `companies.domain.service.ts`**

Adicionar:

```typescript
import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
```

E o método:

```typescript
  async assertPlanIsActive(planId: string, tx: Prisma.TransactionClient): Promise<void> {
    const plan = await tx.plan.findFirst({ where: { id: planId, active: true } });
    if (!plan) {
      throw new UnprocessableEntityException('Plano não encontrado ou inativo');
    }
  }
```

- [ ] **Step 4: Rodar — esperar 6 PASS**

```bash
pnpm test src/modules/companies/tests/companies.domain.service.spec.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/modules/companies/services/companies.domain.service.ts src/modules/companies/tests/companies.domain.service.spec.ts
git commit -m "feat(companies): add assertPlanIsActive to domain service"
```

---

### Task 8: `assertNoActiveUsers`

**Files:**

- Modify: `src/modules/companies/services/companies.domain.service.ts`
- Modify: `src/modules/companies/tests/companies.domain.service.spec.ts`

- [ ] **Step 1: Adicionar o teste**

```typescript
describe('assertNoActiveUsers', () => {
  it('passes when count of active users is zero', async () => {
    const tx = fakeTx();
    (tx as { user: { count: ReturnType<typeof vi.fn> } }).user.count.mockResolvedValue(0);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.assertNoActiveUsers('company-uuid', tx as any),
    ).resolves.toBeUndefined();
  });

  it('throws ConflictException when at least one active user exists', async () => {
    const tx = fakeTx();
    (tx as { user: { count: ReturnType<typeof vi.fn> } }).user.count.mockResolvedValue(1);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.assertNoActiveUsers('company-uuid', tx as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('filters by companyId and deletedAt: null in the count query', async () => {
    const tx = fakeTx();
    const countMock = (tx as { user: { count: ReturnType<typeof vi.fn> } }).user.count;
    countMock.mockResolvedValue(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await service.assertNoActiveUsers('company-uuid', tx as any);
    expect(countMock).toHaveBeenCalledWith({
      where: { companyId: 'company-uuid', deletedAt: null },
    });
  });
});
```

- [ ] **Step 2: Rodar — esperar falha**

```bash
pnpm test src/modules/companies/tests/companies.domain.service.spec.ts
```

Expected: 6 PASS + 3 FAIL.

- [ ] **Step 3: Implementar o método**

```typescript
  async assertNoActiveUsers(companyId: string, tx: Prisma.TransactionClient): Promise<void> {
    const count = await tx.user.count({
      where: { companyId, deletedAt: null },
    });
    if (count > 0) {
      throw new ConflictException(
        'Não é possível excluir empresa com usuários ativos. Remova-os primeiro.',
      );
    }
  }
```

- [ ] **Step 4: Rodar — esperar 9 PASS**

```bash
pnpm test src/modules/companies/tests/companies.domain.service.spec.ts
```

Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/modules/companies/services/companies.domain.service.ts src/modules/companies/tests/companies.domain.service.spec.ts
git commit -m "feat(companies): add assertNoActiveUsers to domain service"
```

---

### Task 9: `findById`

**Files:**

- Modify: `src/modules/companies/services/companies.domain.service.ts`

> Sem unit test — comportamento "filtra deletedAt + companyId, throws 404" é trivial e ortogonal a regra de negócio. E2E cobre.

- [ ] **Step 1: Implementar `findById`**

Adicionar `NotFoundException` ao import:

```typescript
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
```

E o método:

```typescript
  async findById(
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Awaited<ReturnType<typeof this.prisma.company.findFirstOrThrow>>> {
    const db = tx ?? this.prisma;
    const company = await db.company.findFirst({
      where: { id, deletedAt: null },
    });
    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }
    return company;
  }
```

> Tipo de retorno explícito via `Awaited<ReturnType<typeof ...>>` evita ter que importar `Company` do `@prisma/client` (já indireto). Se o linter reclamar, trocar por:
>
> ```typescript
> import type { Company } from '@prisma/client';
> ...
> async findById(id: string, tx?: Prisma.TransactionClient): Promise<Company> {
> ```

- [ ] **Step 2: Rodar typecheck**

```bash
pnpm typecheck
```

Expected: ainda quebra em `companies.module.ts` por causa do `CompaniesMeController` ausente, mas o domain service em si deve estar limpo.

- [ ] **Step 3: Commit**

```bash
git add src/modules/companies/services/companies.domain.service.ts
git commit -m "feat(companies): add findById to domain service"
```

---

### Task 10: `list` com cursor pagination

**Files:**

- Modify: `src/modules/companies/services/companies.domain.service.ts`

- [ ] **Step 1: Adicionar interfaces e o método `list`**

Adicionar no topo do arquivo (após o import de `PrismaService`):

```typescript
import { decodeCursor, encodeCursor } from '../../../common/cursor';

export interface ListCompaniesFilters {
  active?: boolean;
  search?: string;
}

export interface ListCompaniesPagination {
  cursor?: string;
  limit: number;
}

export interface ListCompaniesResult {
  items: Awaited<ReturnType<typeof prismaCompanyFindMany>>;
  nextCursor: string | null;
  hasMore: boolean;
}
// type-only helper for ListCompaniesResult.items inference
declare const prismaCompanyFindMany: () => Promise<
  Array<{
    id: string;
    planId: string;
    name: string;
    slug: string;
    active: boolean;
    timezone: string;
    defaultWorkingHours: unknown;
    outOfHoursMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
  }>
>;
```

> Esse `declare const prismaCompanyFindMany` é ginástica de tipos para evitar importar `Company` direto. Se o lint reclamar, use:
>
> ```typescript
> import type { Company } from '@prisma/client';
>
> export interface ListCompaniesResult {
>   items: Company[];
>   nextCursor: string | null;
>   hasMore: boolean;
> }
> ```
>
> e remova o `declare const`. Mantenha o que produzir typecheck limpo.

E o método:

```typescript
  async list(
    filters: ListCompaniesFilters,
    pagination: ListCompaniesPagination,
  ): Promise<ListCompaniesResult> {
    const decoded = decodeCursor(pagination.cursor);
    const conditions: Prisma.CompanyWhereInput[] = [];

    if (filters.search) {
      conditions.push({
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { slug: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }

    if (decoded) {
      conditions.push({
        OR: [
          { createdAt: { lt: decoded.createdAt } },
          { createdAt: decoded.createdAt, id: { lt: decoded.id } },
        ],
      });
    }

    const where: Prisma.CompanyWhereInput = {
      ...(filters.active !== false ? { deletedAt: null, active: true } : {}),
      ...(conditions.length > 0 ? { AND: conditions } : {}),
    };

    const items = await this.prisma.company.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.limit + 1,
    });

    const hasMore = items.length > pagination.limit;
    const trimmed = hasMore ? items.slice(0, pagination.limit) : items;
    const last = trimmed[trimmed.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

    return { items: trimmed, nextCursor, hasMore };
  }
```

> `active=true` (default da query) exclui tanto `deletedAt != null` quanto `active=false` — comportamento documentado no spec §2 nota 2.

- [ ] **Step 2: Rodar typecheck**

```bash
pnpm typecheck
```

Expected: `companies.module.ts` ainda quebra (controller ausente), domain limpo.

- [ ] **Step 3: Commit**

```bash
git add src/modules/companies/services/companies.domain.service.ts
git commit -m "feat(companies): add list with cursor pagination to domain service"
```

---

### Task 11: `create` (com nested settings)

**Files:**

- Modify: `src/modules/companies/services/companies.domain.service.ts`

- [ ] **Step 1: Adicionar interface `CreateCompanyInput` e método `create`**

Adicionar:

```typescript
export interface CreateCompanyInput {
  name: string;
  slug: string;
  planId: string;
  timezone: string;
  defaultWorkingHours: unknown | null; // Json
  outOfHoursMessage: string | null;
}
```

E o método:

```typescript
  async create(
    input: CreateCompanyInput,
    tx: Prisma.TransactionClient,
  ): Promise<Awaited<ReturnType<typeof this.prisma.company.findFirstOrThrow>>> {
    await this.assertSlugAvailable(input.slug, tx);
    await this.assertPlanIsActive(input.planId, tx);

    return tx.company.create({
      data: {
        name: input.name,
        slug: input.slug,
        planId: input.planId,
        timezone: input.timezone,
        defaultWorkingHours:
          input.defaultWorkingHours === null
            ? Prisma.DbNull
            : (input.defaultWorkingHours as Prisma.InputJsonValue),
        outOfHoursMessage: input.outOfHoursMessage,
        // Nested write: cria CompanySettings com defaults na mesma chamada
        settings: {
          create: {},
        },
      },
    });
  }
```

> O `Prisma.DbNull` é necessário porque `defaultWorkingHours` é `Json?` no schema; passar `null` direto setaria como JSON `null` (string `"null"` no DB), não como SQL `NULL`. Documentação Prisma: https://www.prisma.io/docs/orm/reference/prisma-client-reference#null-and-jsonnull
>
> `Prisma` import precisa ser ampliado para incluir o namespace value (não só type):

Trocar:

```typescript
import type { Prisma } from '@prisma/client';
```

Por:

```typescript
import { Prisma } from '@prisma/client';
```

> Isso porque `Prisma.DbNull` é um runtime value, não só tipo. Verificar se o resto do arquivo só usava `Prisma` como type — se sim, está OK essa troca.

- [ ] **Step 2: Rodar typecheck**

```bash
pnpm typecheck
```

Expected: ainda quebra em `companies.module.ts`, domain service limpo.

- [ ] **Step 3: Commit**

```bash
git add src/modules/companies/services/companies.domain.service.ts
git commit -m "feat(companies): add create with nested settings to domain service"
```

---

### Task 12: `update` (com defesa-em-profundidade contra slug)

**Files:**

- Modify: `src/modules/companies/services/companies.domain.service.ts`
- Modify: `src/modules/companies/tests/companies.domain.service.spec.ts`

- [ ] **Step 1: Adicionar teste de defesa-em-profundidade**

```typescript
describe('update', () => {
  it('ignores patch.slug even if present (defense in depth)', async () => {
    const existing = {
      id: 'company-uuid',
      slug: 'original-slug',
      name: 'Original',
      planId: 'plan-uuid',
      active: true,
      timezone: 'America/Sao_Paulo',
      defaultWorkingHours: null,
      outOfHoursMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    const updateMock = vi.fn().mockResolvedValue({ ...existing, name: 'Renamed' });
    const findFirstMock = vi.fn().mockResolvedValue(existing);
    const tx = {
      company: {
        findFirst: findFirstMock,
        update: updateMock,
      },
      plan: { findFirst: vi.fn() },
      user: { count: vi.fn() },
    };

    // Forçar slug via cast: simula um caller fora do app service
    const patch = { name: 'Renamed', slug: 'malicious-new-slug' } as Prisma.CompanyUpdateInput;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await service.update('company-uuid', patch, tx as any);

    // Assert: o update foi chamado SEM slug no data
    expect(updateMock).toHaveBeenCalledTimes(1);
    const call = updateMock.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(call.data).not.toHaveProperty('slug');
    expect(call.data).toHaveProperty('name', 'Renamed');
  });
});
```

Adicionar import:

```typescript
import type { Prisma } from '@prisma/client';
```

(no arquivo de teste, se ainda não tiver).

- [ ] **Step 2: Rodar — esperar falha (método não existe)**

```bash
pnpm test src/modules/companies/tests/companies.domain.service.spec.ts
```

Expected: 9 PASS + 1 FAIL.

- [ ] **Step 3: Implementar `update`**

```typescript
  async update(
    id: string,
    patch: Prisma.CompanyUpdateInput,
    tx: Prisma.TransactionClient,
  ): Promise<Awaited<ReturnType<typeof this.prisma.company.findFirstOrThrow>>> {
    const existing = await this.findById(id, tx);

    // Defesa em profundidade: schema do PATCH não aceita slug, mas se vazar,
    // o domain ignora.
    const sanitizedPatch: Prisma.CompanyUpdateInput = { ...patch };
    if ('slug' in sanitizedPatch) {
      delete (sanitizedPatch as Record<string, unknown>).slug;
    }

    // Se planId mudou, validar que o novo plano está ativo
    const planRef = sanitizedPatch.plan;
    if (planRef && typeof planRef === 'object' && 'connect' in planRef) {
      const planId = (planRef.connect as { id: string }).id;
      if (planId !== existing.planId) {
        await this.assertPlanIsActive(planId, tx);
      }
    }

    return tx.company.update({
      where: { id: existing.id },
      data: sanitizedPatch,
    });
  }
```

- [ ] **Step 4: Rodar — esperar 10 PASS**

```bash
pnpm test src/modules/companies/tests/companies.domain.service.spec.ts
```

Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add src/modules/companies/services/companies.domain.service.ts src/modules/companies/tests/companies.domain.service.spec.ts
git commit -m "feat(companies): add update with slug defense-in-depth to domain service"
```

---

### Task 13: `softDelete`

**Files:**

- Modify: `src/modules/companies/services/companies.domain.service.ts`
- Modify: `src/modules/companies/tests/companies.domain.service.spec.ts`

- [ ] **Step 1: Adicionar teste**

```typescript
describe('softDelete', () => {
  it('throws ConflictException when active users exist', async () => {
    const existing = { id: 'company-uuid', deletedAt: null };
    const tx = {
      company: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn(),
      },
      user: {
        count: vi.fn().mockResolvedValue(1),
      },
      plan: { findFirst: vi.fn() },
    };
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.softDelete('company-uuid', tx as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.company.update).not.toHaveBeenCalled();
  });

  it('sets deletedAt when no active users exist', async () => {
    const existing = { id: 'company-uuid', deletedAt: null };
    const updateMock = vi.fn().mockResolvedValue({ ...existing, deletedAt: new Date() });
    const tx = {
      company: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: updateMock,
      },
      user: {
        count: vi.fn().mockResolvedValue(0),
      },
      plan: { findFirst: vi.fn() },
    };
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.softDelete('company-uuid', tx as any),
    ).resolves.toBeUndefined();

    expect(updateMock).toHaveBeenCalledTimes(1);
    const call = updateMock.mock.calls[0]![0] as {
      where: { id: string };
      data: { deletedAt: Date };
    };
    expect(call.where.id).toBe('company-uuid');
    expect(call.data.deletedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Rodar — esperar falha**

```bash
pnpm test src/modules/companies/tests/companies.domain.service.spec.ts
```

Expected: 10 PASS + 2 FAIL.

- [ ] **Step 3: Implementar**

```typescript
  async softDelete(id: string, tx: Prisma.TransactionClient): Promise<void> {
    const existing = await this.findById(id, tx);
    await this.assertNoActiveUsers(existing.id, tx);
    await tx.company.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
  }
```

- [ ] **Step 4: Rodar — 12 PASS**

```bash
pnpm test src/modules/companies/tests/companies.domain.service.spec.ts
```

Expected: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add src/modules/companies/services/companies.domain.service.ts src/modules/companies/tests/companies.domain.service.spec.ts
git commit -m "feat(companies): add softDelete with active-user guard to domain service"
```

---

## Phase 3 — Application service + controllers (e2e por endpoint)

> Padrão da Sprint 0.4 para esta fase: implementar 1 endpoint por task, com seu controller, application method e e2e juntos. Reduz idas e voltas.

### Task 14: Application service skeleton (sem métodos públicos ainda) + helpers privados

**Files:**

- Modify: `src/modules/companies/services/companies.application.service.ts` (sobrescrever placeholder)

- [ ] **Step 1: Sobrescrever o arquivo**

```typescript
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type Company, type User } from '@prisma/client';
import { ZodError } from 'zod';
import { PrismaService } from '../../../database/prisma.service';
import { UsersDomainService } from '../../users/services/users.domain.service';
import type { CompanyResponseDto } from '../schemas/company-response.schema';
import { WorkingHoursSchema, type WorkingHoursDto } from '../schemas/working-hours.schema';
import { CompaniesDomainService } from './companies.domain.service';

const SLUG_DUPLICATED = 'Slug já em uso';
const EMAIL_DUPLICATED = 'Email já cadastrado';

@Injectable()
export class CompaniesApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companiesDomain: CompaniesDomainService,
    private readonly usersDomain: UsersDomainService,
  ) {}

  // public methods added in subsequent tasks

  protected toDto(company: Company): CompanyResponseDto {
    return {
      id: company.id,
      planId: company.planId,
      name: company.name,
      slug: company.slug,
      active: company.active,
      timezone: company.timezone,
      defaultWorkingHours: this.parseWorkingHours(company.defaultWorkingHours),
      outOfHoursMessage: company.outOfHoursMessage,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    };
  }

  private parseWorkingHours(value: Prisma.JsonValue): WorkingHoursDto | null {
    if (value === null || value === undefined) return null;
    try {
      return WorkingHoursSchema.parse(value);
    } catch {
      // Banco contém Json malformado — não deveria acontecer porque escrevemos
      // sempre via WorkingHoursSchema. Se vier corrompido, retorna null em vez
      // de explodir. Aviso para futuro: investigar AuditLog quando ocorrer.
      return null;
    }
  }

  protected mapConflict(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined) ?? [];
      if (target.includes('slug')) return new ConflictException(SLUG_DUPLICATED);
      if (target.includes('email')) return new ConflictException(EMAIL_DUPLICATED);
    }
    return err;
  }

  protected assertStrict(schema: { parse: (value: unknown) => unknown }, input: unknown): void {
    try {
      schema.parse(input);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'Validação falhou',
          errors: error.issues.map((issue) => ({
            field: issue.path.join('.') || '<root>',
            message: issue.message,
            code: issue.code,
          })),
        });
      }
      throw error;
    }
  }
}
```

> Os helpers `toDto`/`mapConflict`/`assertStrict` ficam como `protected` para deixar claro que são reutilizáveis e podem virar utilitário compartilhado se outra Sprint precisar. `parseWorkingHours` faz double-parse defensivo do JSON do banco.

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: `companies.module.ts` ainda quebra (controller ausente), application service em si limpo.

- [ ] **Step 3: Commit**

```bash
git add src/modules/companies/services/companies.application.service.ts
git commit -m "feat(companies): scaffold application service with dto/conflict helpers"
```

---

### Task 15: `POST /companies` (cria tenant + admin + settings em transação)

**Files:**

- Modify: `src/modules/companies/services/companies.application.service.ts`
- Modify: `src/modules/companies/controllers/companies.controller.ts` (sobrescrever placeholder)
- Create: `src/modules/companies/tests/companies.controller.e2e-spec.ts` (sobrescrever placeholder vazio do gerador)

- [ ] **Step 1: Adicionar `create` no application service**

Adicionar imports:

```typescript
import * as bcrypt from 'bcrypt';
import type { CreateCompanyDto } from '../schemas/create-company.schema';
import type { CompanyWithAdminResponseDto } from '../schemas/company-with-admin-response.schema';

const BCRYPT_COST = 12;
```

Adicionar o método (depois do construtor, antes de `toDto`):

```typescript
  async create(input: CreateCompanyDto): Promise<CompanyWithAdminResponseDto> {
    const passwordHash = await bcrypt.hash(input.admin.password, BCRYPT_COST);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const company = await this.companiesDomain.create(
          {
            name: input.company.name,
            slug: input.company.slug,
            planId: input.company.planId,
            timezone: input.company.timezone,
            defaultWorkingHours: input.company.defaultWorkingHours ?? null,
            outOfHoursMessage: input.company.outOfHoursMessage ?? null,
          },
          tx,
        );

        const admin = await this.usersDomain.create(
          {
            name: input.admin.name,
            email: input.admin.email,
            passwordHash,
            role: 'ADMIN',
            departmentIds: [],
          },
          company.id,
          tx,
        );

        return { company, admin };
      });

      return {
        company: this.toDto(result.company),
        admin: {
          id: result.admin.id,
          companyId: result.admin.companyId,
          name: result.admin.name,
          email: result.admin.email,
          role: result.admin.role,
          absenceMessage: result.admin.absenceMessage,
          absenceActive: result.admin.absenceActive,
          lastSeenAt: result.admin.lastSeenAt
            ? result.admin.lastSeenAt.toISOString()
            : null,
          departments: result.admin.departments.map((ud) => ({
            id: ud.department.id,
            name: ud.department.name,
          })),
          createdAt: result.admin.createdAt.toISOString(),
          updatedAt: result.admin.updatedAt.toISOString(),
        },
      };
    } catch (err) {
      throw this.mapConflict(err);
    }
  }
```

- [ ] **Step 2: Sobrescrever `companies.controller.ts`**

```typescript
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CreateCompanyDto } from '../schemas/create-company.schema';
import {
  CompanyWithAdminResponseDto,
  CompanyWithAdminResponseSchema,
} from '../schemas/company-with-admin-response.schema';
import { CompaniesApplicationService } from '../services/companies.application.service';

@ApiTags('companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesApplicationService) {}

  @Post()
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ZodSerializerDto(CompanyWithAdminResponseSchema)
  async create(@Body() body: CreateCompanyDto): Promise<CompanyWithAdminResponseDto> {
    return this.companies.create(body);
  }
}
```

- [ ] **Step 3: Criar o `companies-me.controller.ts` mínimo (stub) para destravar typecheck**

```typescript
import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('companies')
@Controller('companies/me')
export class CompaniesMeController {}
```

> Vai ganhar handlers nas Tasks 17 e 19. Por enquanto, controller vazio resolve o import do module.

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: 0 erros.

- [ ] **Step 5: Sobrescrever `companies.controller.e2e-spec.ts` com a estrutura inicial + happy path do POST**

```typescript
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapTestApp, getPrisma } from '../../../../test/e2e/setup-app';
import {
  createCompany,
  createPlan,
  createSuperAdmin,
  createUser,
  loginAs,
  truncateAll,
} from '../../../../test/e2e/factories';

interface CompanyDto {
  id: string;
  planId: string;
  name: string;
  slug: string;
  active: boolean;
  timezone: string;
  defaultWorkingHours: unknown | null;
  outOfHoursMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CompanyWithAdminDto {
  company: CompanyDto;
  admin: { id: string; email: string; role: string; companyId: string };
}

interface ErrorBody {
  message: string;
  errors?: Array<{ field: string; message: string; code: string }>;
}

async function setupSuperAdmin(app: NestFastifyApplication) {
  const company = await createCompany(getPrisma());
  const { user: super_, password } = await createSuperAdmin(getPrisma(), company.id, {
    email: `super-${Date.now()}@x.com`,
  });
  const tokens = await loginAs(app, super_.email, password);
  return { hostCompany: company, super_, tokens };
}

describe('CompaniesController POST /companies (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
  });

  it('SUPER_ADMIN creates a new tenant with first ADMIN and settings (happy path)', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const plan = await createPlan(getPrisma(), 'Default');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: {
          name: 'Acme Inc',
          slug: 'acme',
          planId: plan.id,
          timezone: 'America/Sao_Paulo',
        },
        admin: {
          name: 'Beth',
          email: 'beth@acme.com',
          password: 'valid-pass-1234',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<CompanyWithAdminDto>();
    expect(body.company.slug).toBe('acme');
    expect(body.company.active).toBe(true);
    expect(body.admin.email).toBe('beth@acme.com');
    expect(body.admin.role).toBe('ADMIN');

    // Verifica no banco: Company + CompanySettings + 1 ADMIN
    const inDb = await getPrisma().company.findFirst({ where: { slug: 'acme' } });
    expect(inDb).not.toBeNull();
    const settings = await getPrisma().companySettings.findUnique({
      where: { companyId: inDb!.id },
    });
    expect(settings).not.toBeNull();
    const admin = await getPrisma().user.findFirst({
      where: { companyId: inDb!.id, role: 'ADMIN' },
    });
    expect(admin?.email).toBe('beth@acme.com');

    // passwordHash não vaza no response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((body.admin as any).passwordHash).toBeUndefined();
  });
});
```

- [ ] **Step 6: Rodar e2e**

```bash
pnpm test:e2e src/modules/companies/tests/companies.controller.e2e-spec.ts
```

Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add src/modules/companies
git commit -m "feat(companies): add POST /companies (combo: tenant + settings + first admin)"
```

---

### Task 16: `GET /companies` (list, SUPER_ADMIN)

**Files:**

- Modify: `src/modules/companies/services/companies.application.service.ts`
- Modify: `src/modules/companies/controllers/companies.controller.ts`
- Modify: `src/modules/companies/tests/companies.controller.e2e-spec.ts`

- [ ] **Step 1: Adicionar `list` no application service**

```typescript
import type { CompanyListResponseDto } from '../schemas/company-response.schema';
import type { ListCompaniesQueryDto } from '../schemas/list-companies.schema';
```

Método:

```typescript
  async list(query: ListCompaniesQueryDto): Promise<CompanyListResponseDto> {
    const filters: { active?: boolean; search?: string } = {};
    if (query.active !== undefined) filters.active = query.active;
    if (query.search !== undefined) filters.search = query.search;

    const pagination: { cursor?: string; limit: number } = { limit: query.limit };
    if (query.cursor !== undefined) pagination.cursor = query.cursor;

    const result = await this.companiesDomain.list(filters, pagination);

    return {
      items: result.items.map((c) => this.toDto(c)),
      pagination: {
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      },
    };
  }
```

- [ ] **Step 2: Adicionar handler no controller**

```typescript
import { Get, Query } from '@nestjs/common';
import {
  CompanyListResponseDto,
  CompanyListResponseSchema,
} from '../schemas/company-response.schema';
import { ListCompaniesQueryDto } from '../schemas/list-companies.schema';
```

Handler dentro do `CompaniesController`:

```typescript
  @Get()
  @Roles('SUPER_ADMIN')
  @ZodSerializerDto(CompanyListResponseSchema)
  async list(@Query() query: ListCompaniesQueryDto): Promise<CompanyListResponseDto> {
    return this.companies.list(query);
  }
```

- [ ] **Step 3: Adicionar suite de e2e em `companies.controller.e2e-spec.ts`**

Adicionar antes do `describe` existente (ou abaixo):

```typescript
describe('CompaniesController GET /companies (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
  });

  it('SUPER_ADMIN lists all tenants', async () => {
    const { tokens, hostCompany } = await setupSuperAdmin(app);
    const second = await createCompany(getPrisma(), { slug: 'beta-co' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/companies?limit=20',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: CompanyDto[]; pagination: { hasMore: boolean } }>();
    const slugs = body.items.map((c) => c.slug);
    expect(slugs).toContain(hostCompany.slug);
    expect(slugs).toContain(second.slug);
  });

  it('returns 403 when ADMIN tries to list', async () => {
    const company = await createCompany(getPrisma());
    const { user: admin, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@x.com',
    });
    const tokens = await loginAs(app, admin.email, password);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('excludes soft-deleted companies by default (active=true)', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const deleted = await createCompany(getPrisma(), { slug: 'deleted-co' });
    await getPrisma().company.update({
      where: { id: deleted.id },
      data: { deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: CompanyDto[] }>();
    expect(body.items.find((c) => c.slug === 'deleted-co')).toBeUndefined();
  });
});
```

- [ ] **Step 4: Rodar**

```bash
pnpm test:e2e src/modules/companies/tests/companies.controller.e2e-spec.ts
```

Expected: 4 passed (1 da Task 15 + 3 desta).

- [ ] **Step 5: Commit**

```bash
git add src/modules/companies
git commit -m "feat(companies): add GET /companies list (SUPER_ADMIN, cursor pagination)"
```

---

### Task 17: `GET /companies/me` (qualquer auth)

**Files:**

- Modify: `src/modules/companies/services/companies.application.service.ts`
- Modify: `src/modules/companies/controllers/companies-me.controller.ts`
- Create: `src/modules/companies/tests/companies-me.controller.e2e-spec.ts`

- [ ] **Step 1: Adicionar `findMine` no application service**

```typescript
  async findMine(currentUser: User): Promise<CompanyResponseDto> {
    const company = await this.companiesDomain.findById(currentUser.companyId);
    return this.toDto(company);
  }
```

- [ ] **Step 2: Sobrescrever `companies-me.controller.ts`**

```typescript
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CompanyResponseDto, CompanyResponseSchema } from '../schemas/company-response.schema';
import { CompaniesApplicationService } from '../services/companies.application.service';

@ApiTags('companies')
@Controller('companies/me')
export class CompaniesMeController {
  constructor(private readonly companies: CompaniesApplicationService) {}

  @Get()
  @ZodSerializerDto(CompanyResponseSchema)
  async findMine(@CurrentUser() currentUser: User): Promise<CompanyResponseDto> {
    return this.companies.findMine(currentUser);
  }
}
```

> O handler do `Patch()` chega na Task 19. Por ora só GET.

- [ ] **Step 3: Criar `companies-me.controller.e2e-spec.ts`**

```typescript
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapTestApp, getPrisma } from '../../../../test/e2e/setup-app';
import { createCompany, createUser, loginAs, truncateAll } from '../../../../test/e2e/factories';

interface CompanyDto {
  id: string;
  slug: string;
  name: string;
}

describe('CompaniesMeController GET /companies/me (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
  });

  it('returns the JWT-bound tenant for any authenticated role', async () => {
    const company = await createCompany(getPrisma(), { slug: 'home-co' });
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
      email: 'agent@x.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/companies/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<CompanyDto>();
    expect(body.id).toBe(company.id);
    expect(body.slug).toBe('home-co');
  });

  it('returns 401 without JWT', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/companies/me',
    });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 4: Rodar**

```bash
pnpm test:e2e src/modules/companies/tests/companies-me.controller.e2e-spec.ts
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/modules/companies
git commit -m "feat(companies): add GET /companies/me (any auth)"
```

---

### Task 18: `GET /companies/:id` (autorização condicional)

**Files:**

- Modify: `src/modules/companies/services/companies.application.service.ts`
- Modify: `src/modules/companies/controllers/companies.controller.ts`
- Modify: `src/modules/companies/tests/companies.controller.e2e-spec.ts`

- [ ] **Step 1: Adicionar `findByIdAuthorized` no application service**

```typescript
import { NotFoundException } from '@nestjs/common';
```

(adicionar ao import existente de `@nestjs/common`)

```typescript
  async findByIdAuthorized(id: string, currentUser: User): Promise<CompanyResponseDto> {
    if (currentUser.role !== 'SUPER_ADMIN' && id !== currentUser.companyId) {
      // Não vaza existência cross-tenant — mesmo se a Company exista, retorna 404
      throw new NotFoundException('Empresa não encontrada');
    }
    const company = await this.companiesDomain.findById(id);
    return this.toDto(company);
  }
```

- [ ] **Step 2: Adicionar handler no controller**

```typescript
import { Param } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { CompanyResponseDto, CompanyResponseSchema } from '../schemas/company-response.schema';
```

Handler:

```typescript
  @Get(':id')
  @Roles('ADMIN')
  @ZodSerializerDto(CompanyResponseSchema)
  async findById(
    @Param('id') id: string,
    @CurrentUser() currentUser: User,
  ): Promise<CompanyResponseDto> {
    return this.companies.findByIdAuthorized(id, currentUser);
  }
```

> `@Roles('ADMIN')` pelo peso libera ADMIN+ (incluindo SUPER_ADMIN). A validação cross-tenant fica no app service.

- [ ] **Step 3: Adicionar suite e2e**

```typescript
describe('CompaniesController GET /companies/:id (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
  });

  it('SUPER_ADMIN reads any tenant', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const target = await createCompany(getPrisma(), { slug: 'target-co' });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<CompanyDto>().slug).toBe('target-co');
  });

  it('ADMIN reads its own tenant', async () => {
    const company = await createCompany(getPrisma(), { slug: 'self-co' });
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@self.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${company.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it('ADMIN of company A gets 404 (not 403) when reading company B', async () => {
    const a = await createCompany(getPrisma(), { slug: 'aa-co' });
    const b = await createCompany(getPrisma(), { slug: 'bb-co' });
    const { user, password } = await createUser(getPrisma(), a.id, {
      role: 'ADMIN',
      email: 'a@aa.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${b.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(404);
  });

  it('AGENT gets 403 (RolesGuard barra antes do app service)', async () => {
    const company = await createCompany(getPrisma(), { slug: 'ag-co' });
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${company.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('SUPER_ADMIN gets 404 when company is soft-deleted', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const target = await createCompany(getPrisma(), { slug: 'soft-co' });
    await getPrisma().company.update({
      where: { id: target.id },
      data: { deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 4: Rodar**

```bash
pnpm test:e2e src/modules/companies/tests/companies.controller.e2e-spec.ts
```

Expected: 4 anteriores + 5 = 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/modules/companies
git commit -m "feat(companies): add GET /companies/:id with conditional auth"
```

---

### Task 19: `PATCH /companies/me` (ADMIN+, schema restrito, re-parse)

**Files:**

- Modify: `src/modules/companies/services/companies.application.service.ts`
- Modify: `src/modules/companies/controllers/companies-me.controller.ts`
- Modify: `src/modules/companies/tests/companies-me.controller.e2e-spec.ts`

- [ ] **Step 1: Adicionar `updateMine` no app service**

```typescript
import {
  UpdateCompanyMeSchema,
  type UpdateCompanyMeDto,
} from '../schemas/update-company-me.schema';
```

Método:

```typescript
  async updateMine(
    currentUser: User,
    input: UpdateCompanyMeDto,
  ): Promise<CompanyResponseDto> {
    this.assertStrict(UpdateCompanyMeSchema, input);

    const patch: Prisma.CompanyUpdateInput = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if ('defaultWorkingHours' in input) {
      patch.defaultWorkingHours =
        input.defaultWorkingHours === null || input.defaultWorkingHours === undefined
          ? Prisma.DbNull
          : (input.defaultWorkingHours as Prisma.InputJsonValue);
    }
    if ('outOfHoursMessage' in input) {
      patch.outOfHoursMessage = input.outOfHoursMessage ?? null;
    }

    const company = await this.prisma.$transaction((tx) =>
      this.companiesDomain.update(currentUser.companyId, patch, tx),
    );
    return this.toDto(company);
  }
```

- [ ] **Step 2: Adicionar handler no `companies-me.controller.ts`**

```typescript
import { UpdateCompanyMeDto } from '../schemas/update-company-me.schema';
```

Handler:

```typescript
  @Patch()
  @Roles('ADMIN')
  @ZodSerializerDto(CompanyResponseSchema)
  async updateMine(
    @CurrentUser() currentUser: User,
    @Body() body: UpdateCompanyMeDto,
  ): Promise<CompanyResponseDto> {
    return this.companies.updateMine(currentUser, body);
  }
```

Adicionar ao import:

```typescript
import { Roles } from '../../../common/decorators/roles.decorator';
```

- [ ] **Step 3: Adicionar suite e2e**

Adicionar dentro de `companies-me.controller.e2e-spec.ts`:

```typescript
interface ErrorBody {
  message: string;
  errors?: Array<{ field: string; message: string; code: string }>;
}

describe('CompaniesMeController PATCH /companies/me (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
  });

  it('ADMIN updates name and timezone of own tenant', async () => {
    const company = await createCompany(getPrisma(), { name: 'Old', slug: 'edit-co' });
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@edit.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/companies/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'New', timezone: 'America/Recife' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<CompanyDto>().name).toBe('New');

    const db = await getPrisma().company.findUnique({ where: { id: company.id } });
    expect(db?.name).toBe('New');
    expect(db?.timezone).toBe('America/Recife');
  });

  it('returns 400 when ADMIN tries to set planId via /me (strict)', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@b.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/companies/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { planId: 'some-uuid', name: 'Hijack' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json<ErrorBody>();
    expect(body.errors?.map((e) => e.code)).toContain('unrecognized_keys');

    // Garantia de que `name` NÃO foi persistido (defesa-em-profundidade efetiva)
    const db = await getPrisma().company.findUnique({ where: { id: company.id } });
    expect(db?.name).not.toBe('Hijack');
  });

  it('returns 400 when ADMIN sends slug or active', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@c.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res1 = await app.inject({
      method: 'PATCH',
      url: '/api/v1/companies/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { slug: 'new-slug' },
    });
    expect(res1.statusCode).toBe(400);

    const res2 = await app.inject({
      method: 'PATCH',
      url: '/api/v1/companies/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { active: false },
    });
    expect(res2.statusCode).toBe(400);
  });

  it('returns 403 when AGENT or SUPERVISOR tries to PATCH /me', async () => {
    const company = await createCompany(getPrisma());
    const { user: agent, password } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
    });
    const tokens = await loginAs(app, agent.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/companies/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('clears outOfHoursMessage when null is sent', async () => {
    const company = await createCompany(getPrisma());
    await getPrisma().company.update({
      where: { id: company.id },
      data: { outOfHoursMessage: 'Old message' },
    });
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@n.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/companies/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { outOfHoursMessage: null },
    });

    expect(res.statusCode).toBe(200);
    const db = await getPrisma().company.findUnique({ where: { id: company.id } });
    expect(db?.outOfHoursMessage).toBeNull();
  });
});
```

- [ ] **Step 4: Rodar**

```bash
pnpm test:e2e src/modules/companies/tests/companies-me.controller.e2e-spec.ts
```

Expected: 7 passed (2 anteriores + 5).

- [ ] **Step 5: Commit**

```bash
git add src/modules/companies
git commit -m "feat(companies): add PATCH /companies/me (ADMIN+, strict schema)"
```

---

### Task 20: `PATCH /companies/:id` (SUPER_ADMIN, schema completo, re-parse)

**Files:**

- Modify: `src/modules/companies/services/companies.application.service.ts`
- Modify: `src/modules/companies/controllers/companies.controller.ts`
- Modify: `src/modules/companies/tests/companies.controller.e2e-spec.ts`

- [ ] **Step 1: Adicionar `updateById` no app service**

```typescript
import { UpdateCompanySchema, type UpdateCompanyDto } from '../schemas/update-company.schema';
```

Método:

```typescript
  async updateById(
    id: string,
    input: UpdateCompanyDto,
  ): Promise<CompanyResponseDto> {
    this.assertStrict(UpdateCompanySchema, input);

    const patch: Prisma.CompanyUpdateInput = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if ('defaultWorkingHours' in input) {
      patch.defaultWorkingHours =
        input.defaultWorkingHours === null || input.defaultWorkingHours === undefined
          ? Prisma.DbNull
          : (input.defaultWorkingHours as Prisma.InputJsonValue);
    }
    if ('outOfHoursMessage' in input) {
      patch.outOfHoursMessage = input.outOfHoursMessage ?? null;
    }
    if (input.planId !== undefined) {
      patch.plan = { connect: { id: input.planId } };
    }
    if (input.active !== undefined) {
      patch.active = input.active;
    }

    const company = await this.prisma.$transaction((tx) =>
      this.companiesDomain.update(id, patch, tx),
    );
    return this.toDto(company);
  }
```

- [ ] **Step 2: Adicionar handler no `companies.controller.ts`**

```typescript
import { Patch } from '@nestjs/common';
import { UpdateCompanyDto } from '../schemas/update-company.schema';
```

Handler:

```typescript
  @Patch(':id')
  @Roles('SUPER_ADMIN')
  @ZodSerializerDto(CompanyResponseSchema)
  async updateById(
    @Param('id') id: string,
    @Body() body: UpdateCompanyDto,
  ): Promise<CompanyResponseDto> {
    return this.companies.updateById(id, body);
  }
```

- [ ] **Step 3: Adicionar suite e2e**

```typescript
describe('CompaniesController PATCH /companies/:id (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
  });

  it('SUPER_ADMIN updates name, planId and active', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const newPlan = await createPlan(getPrisma(), 'Pro');
    const target = await createCompany(getPrisma(), { slug: 'tg-co' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'Renamed', planId: newPlan.id, active: false },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<CompanyDto>();
    expect(body.name).toBe('Renamed');
    expect(body.active).toBe(false);
    expect(body.planId).toBe(newPlan.id);
  });

  it('returns 422 when planId points to inactive plan', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const inactivePlan = await getPrisma().plan.create({
      data: { name: 'Old', active: false },
    });
    const target = await createCompany(getPrisma(), { slug: 'inactive-plan-co' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { planId: inactivePlan.id },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json<ErrorBody>().message).toBe('Plano não encontrado ou inativo');
  });

  it('returns 400 when SUPER_ADMIN tries to send slug', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const target = await createCompany(getPrisma(), { slug: 'orig' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { slug: 'new-slug' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().errors?.map((e) => e.code)).toContain('unrecognized_keys');

    // slug não mudou no banco
    const db = await getPrisma().company.findUnique({ where: { id: target.id } });
    expect(db?.slug).toBe('orig');
  });

  it('returns 403 when ADMIN tries PATCH /companies/:id', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@d.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/companies/${company.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when target is soft-deleted', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const target = await createCompany(getPrisma(), { slug: 'sd-co' });
    await getPrisma().company.update({
      where: { id: target.id },
      data: { deletedAt: new Date() },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 4: Rodar**

```bash
pnpm test:e2e src/modules/companies/tests/companies.controller.e2e-spec.ts
```

Expected: 9 anteriores + 5 = 14 passed.

- [ ] **Step 5: Commit**

```bash
git add src/modules/companies
git commit -m "feat(companies): add PATCH /companies/:id (SUPER_ADMIN, full schema)"
```

---

### Task 21: `DELETE /companies/:id` (SUPER_ADMIN, soft-delete)

**Files:**

- Modify: `src/modules/companies/services/companies.application.service.ts`
- Modify: `src/modules/companies/controllers/companies.controller.ts`
- Modify: `src/modules/companies/tests/companies.controller.e2e-spec.ts`

- [ ] **Step 1: Adicionar `softDelete` no app service**

```typescript
  async softDelete(id: string): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.companiesDomain.softDelete(id, tx),
    );
  }
```

- [ ] **Step 2: Adicionar handler no controller**

```typescript
import { Delete } from '@nestjs/common';
```

Handler:

```typescript
  @Delete(':id')
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string): Promise<void> {
    await this.companies.softDelete(id);
  }
```

- [ ] **Step 3: Adicionar suite e2e**

```typescript
describe('CompaniesController DELETE /companies/:id (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
  });

  it('returns 409 when target tenant has active users', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const target = await createCompany(getPrisma(), { slug: 'busy-co' });
    await createUser(getPrisma(), target.id, { role: 'ADMIN', email: 'busy-admin@x.com' });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toBe(
      'Não é possível excluir empresa com usuários ativos. Remova-os primeiro.',
    );
  });

  it('soft-deletes empty tenant and subsequent GET returns 404', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const target = await createCompany(getPrisma(), { slug: 'empty-co' });

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(del.statusCode).toBe(204);

    const inDb = await getPrisma().company.findUnique({ where: { id: target.id } });
    expect(inDb?.deletedAt).not.toBeNull();

    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(get.statusCode).toBe(404);
  });

  it('returns 403 when ADMIN tries DELETE', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@d2.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/companies/${company.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('soft-delete keeps slug occupied (POST with same slug returns 409 after DELETE)', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const plan = await createPlan(getPrisma(), 'Default');

    const create1 = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: { name: 'X', slug: 'reused', planId: plan.id },
        admin: { name: 'A', email: 'reused-a@x.com', password: 'valid-1234' },
      },
    });
    expect(create1.statusCode).toBe(201);
    const id = create1.json<CompanyWithAdminDto>().company.id;
    const adminId = create1.json<CompanyWithAdminDto>().admin.id;

    // Limpa o ADMIN para destravar DELETE
    await getPrisma().user.update({
      where: { id: adminId },
      data: { deletedAt: new Date() },
    });

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/companies/${id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(del.statusCode).toBe(204);

    // Recriar com mesmo slug → 409
    const create2 = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: { name: 'Y', slug: 'reused', planId: plan.id },
        admin: { name: 'B', email: 'reused-b@x.com', password: 'valid-1234' },
      },
    });
    expect(create2.statusCode).toBe(409);
    expect(create2.json<ErrorBody>().message).toBe('Slug já em uso');
  });
});
```

- [ ] **Step 4: Adicionar suite de **multi-tenant isolation** (caso especial — Companies É o tenant)**

```typescript
describe('CompaniesController multi-tenant isolation (Companies as tenant root)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
  });

  it('ADMIN of A reading /:idDeB returns 404, not 403 (no existence leak)', async () => {
    const a = await createCompany(getPrisma(), { slug: 'mt-a' });
    const b = await createCompany(getPrisma(), { slug: 'mt-b' });
    const { user, password } = await createUser(getPrisma(), a.id, {
      role: 'ADMIN',
      email: 'a@mt.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/companies/${b.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('ADMIN of A cannot list (403, RolesGuard barra)', async () => {
    const a = await createCompany(getPrisma(), { slug: 'mt-a2' });
    const { user, password } = await createUser(getPrisma(), a.id, {
      role: 'ADMIN',
      email: 'a@mt2.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /companies/me returns A, not B', async () => {
    const a = await createCompany(getPrisma(), { slug: 'me-a' });
    const b = await createCompany(getPrisma(), { slug: 'me-b' });
    void b; // garantir que B existe na lista, mas /me não deve vê-lo
    const { user, password } = await createUser(getPrisma(), a.id, {
      role: 'AGENT',
      email: 'a-agent@me.com',
    });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/companies/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<CompanyDto>().slug).toBe('me-a');
  });
});
```

- [ ] **Step 5: Adicionar suite de **POST sad paths** (slug, email, planId, ADMIN/AGENT)**

```typescript
describe('CompaniesController POST /companies sad paths (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
  });

  it('returns 400 with invalid slug formats', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const plan = await createPlan(getPrisma(), 'Default');

    const cases = ['Acme Co', 'acme-', '--acme--', 'a'];
    for (const slug of cases) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/companies',
        headers: { authorization: `Bearer ${tokens.accessToken}` },
        payload: {
          company: { name: 'X', slug, planId: plan.id },
          admin: { name: 'A', email: `a-${Date.now()}@x.com`, password: 'valid-1234' },
        },
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('returns 409 on duplicated slug', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const plan = await createPlan(getPrisma(), 'Default');
    await createCompany(getPrisma(), { slug: 'taken' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: { name: 'X', slug: 'taken', planId: plan.id },
        admin: { name: 'A', email: 'taken-a@x.com', password: 'valid-1234' },
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toBe('Slug já em uso');
  });

  it('returns 409 on duplicated admin email (global unique)', async () => {
    const { tokens, super_ } = await setupSuperAdmin(app);
    const plan = await createPlan(getPrisma(), 'Default');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: { name: 'X', slug: 'dup-email', planId: plan.id },
        admin: { name: 'A', email: super_.email, password: 'valid-1234' },
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toBe('Email já cadastrado');
  });

  it('returns 422 on inactive planId', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const inactive = await getPrisma().plan.create({
      data: { name: 'Old', active: false },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: { name: 'X', slug: 'inactive-co', planId: inactive.id },
        admin: { name: 'A', email: 'inactive-a@x.com', password: 'valid-1234' },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json<ErrorBody>().message).toBe('Plano não encontrado ou inativo');
  });

  it('returns 422 on non-existent planId', async () => {
    const { tokens } = await setupSuperAdmin(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: { name: 'X', slug: 'no-plan', planId: '01999999-9999-9999-9999-999999999999' },
        admin: { name: 'A', email: 'no-plan-a@x.com', password: 'valid-1234' },
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it('returns 403 when ADMIN tries POST', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'a@p.com',
    });
    const tokens = await loginAs(app, user.email, password);
    const plan = await createPlan(getPrisma(), 'Default');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: { name: 'X', slug: 'forbid', planId: plan.id },
        admin: { name: 'A', email: 'fa@x.com', password: 'valid-1234' },
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when body missing admin section', async () => {
    const { tokens } = await setupSuperAdmin(app);
    const plan = await createPlan(getPrisma(), 'Default');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/companies',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        company: { name: 'X', slug: 'no-admin', planId: plan.id },
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 6: Rodar**

```bash
pnpm test:e2e src/modules/companies/tests/companies.controller.e2e-spec.ts
```

Expected: 14 anteriores + 4 (DELETE) + 3 (multi-tenant) + 7 (POST sad) = 28 passed.

- [ ] **Step 7: Commit**

```bash
git add src/modules/companies
git commit -m "feat(companies): add DELETE /companies/:id with active-user guard and full sad/isolation suite"
```

---

## Phase 4 — Cleanup + verificação final

### Task 22: Atualizar `multi-tenant-checklist.md` com seção do caso especial

**Files:**

- Modify: `docs/conventions/multi-tenant-checklist.md`

- [ ] **Step 1: Adicionar seção no fim do arquivo (antes da seção "Quando vazar (incidente)")**

```markdown
## Caso especial — entidade que É o tenant (Company)

Operações sobre `Company` (tenant root) **não filtram por `@CurrentCompany()`**
da forma tradicional, porque o tenant **é** o objeto da operação, não o contexto.
Ver `docs/superpowers/specs/2026-05-02-sprint-0-5-companies-crud-design.md` §1.7
e §2.

Invariantes mantidas:

- ADMIN+ só acessa a própria Company (`:id === currentUser.companyId` ou
  `/companies/me`); cross-tenant retorna **404** (não 403 — não vaza
  existência).
- Listagem (`GET /companies`) e criação (`POST /companies`) são SUPER_ADMIN-only.
- Demais entidades de tenant (User, Department, Tag, etc.) continuam seguindo
  o padrão tradicional do checklist (toda query filtra `companyId`).

Esta exceção se aplica **somente** ao módulo `companies`. Se outra entidade
do schema vier a representar o tenant root no futuro, atualizar esta seção.

---
```

(O texto acima vai antes da linha `## Quando vazar (incidente)`. Use `Read` + `Edit` para inserir no lugar certo.)

- [ ] **Step 2: Commit**

```bash
git add docs/conventions/multi-tenant-checklist.md
git commit -m "docs(conventions): document Company as tenant-root special case"
```

---

### Task 23: Gates de qualidade + ROADMAP + smoke manual + push + PR

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Rodar todos os gates em ordem**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:schema
pnpm test:e2e
pnpm build
```

Expected: tudo verde. Em caso de falha, **não** prosseguir; investigar e fixar antes do PR.

- [ ] **Step 2: Smoke manual com `curl`**

Em outro terminal, deixar o app rodando: `pnpm start:dev`.

> Lembrete: o spec §10 lista 17 passos. Como referência rápida, executar pelo menos:

```bash
# 1. Login SUPER_ADMIN do seed
TOKEN=$(curl -s -X POST localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"super@digichat.local","password":"changeme-only-for-dev"}' \
  | jq -r .accessToken)

# 2. Pegar planId do "Default"
PLAN=$(docker exec digichat-postgres psql -U postgres -d digichat -t -c \
  "SELECT id FROM \"Plan\" WHERE name = 'Default' LIMIT 1;" | tr -d ' \n')

# 3. POST /companies → 201 esperado
curl -s -X POST localhost:3000/api/v1/companies \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"company\":{\"name\":\"Acme\",\"slug\":\"acme\",\"planId\":\"$PLAN\"},\"admin\":{\"name\":\"Beth\",\"email\":\"beth@acme.com\",\"password\":\"valid-pass-1234\"}}" \
  | jq .

# 4. GET /companies → 200 com 2 (exemplo + acme)
curl -s localhost:3000/api/v1/companies \
  -H "Authorization: Bearer $TOKEN" | jq '.items | length'
```

Se algo retornar 4xx/5xx inesperado, investigar antes de seguir.

- [ ] **Step 3: Atualizar `ROADMAP.md`**

```bash
sed -i 's/- \[ \] Companies (apenas SUPER_ADMIN)/- [x] Companies (apenas SUPER_ADMIN)/' ROADMAP.md
git diff ROADMAP.md
```

Expected: 1 linha mudada de `[ ]` para `[x]`.

- [ ] **Step 4: Commit final**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): mark companies crud as done (sprint 0.5)"
```

- [ ] **Step 5: Push branch**

```bash
git push -u origin feat/sprint-0-5-companies-crud
```

- [ ] **Step 6: Abrir PR**

```bash
gh pr create --base main --head feat/sprint-0-5-companies-crud \
  --title "feat: sprint 0.5 companies crud (super_admin)" \
  --body "$(cat <<'EOF'
## Summary

- Sprint 0.5 from Phase 0 of `ROADMAP.md`: full CRUD for `Company` (SUPER_ADMIN-only) + `/companies/me` (any auth) + `PATCH /companies/me` (ADMIN+, restricted body), mirroring the `/users` ↔ `/me` split from Sprint 0.4.
- `POST /companies` creates Company + CompanySettings (defaults) + first ADMIN of the tenant in one transaction. Reuses `UsersDomainService.create` injected from `UsersModule`.
- `slug` is required, validated by regex `^[a-z0-9](-?[a-z0-9]+)*$`, 3–63 chars, **immutable** (PATCH schemas don't accept it; domain service ignores `patch.slug` as defense-in-depth). Soft-delete does not free the slug — global unique stays global.
- `planId` is required and validated as `active: true` on POST and on PATCH `:id`.
- Soft-delete is blocked when the tenant has any active user (`User.count({ companyId, deletedAt: null }) > 0`). Critério expandirá nas próximas sprints conforme novas entidades ganharem CRUD.
- `GET /companies/:id` cross-tenant for ADMIN returns **404**, not 403 (consistent with Sprint 0.4 — no existence leakage).
- New shared helper `src/common/cursor.ts` (extracted from `UsersDomainService`); both modules now share encode/decode of opaque cursors.
- Adds the "entidade que É o tenant" special-case section to `docs/conventions/multi-tenant-checklist.md`.

**Spec:** [`docs/superpowers/specs/2026-05-02-sprint-0-5-companies-crud-design.md`](docs/superpowers/specs/2026-05-02-sprint-0-5-companies-crud-design.md)
**Plan:** [`docs/superpowers/plans/2026-05-02-sprint-0-5-companies-crud.md`](docs/superpowers/plans/2026-05-02-sprint-0-5-companies-crud.md)

## Verification

Local (worktree at `.worktrees/sprint-0-5-companies-crud`):

- `pnpm typecheck` ✓
- `pnpm lint` ✓
- `pnpm test` ✓ (cursor unit + companies domain + auth/users carry-over)
- `pnpm test:schema` ✓ (Sprint 0.2 não quebra)
- `pnpm test:e2e` ✓ (auth + users + me + companies + companies-me)
- `pnpm build` ✓
- Smoke manual via curl (POST → GET → /me → PATCH → DELETE) ✓
- Multi-tenant isolation cobertos: ADMIN cross-tenant → 404, AGENT no detalhe → 403, ADMIN listing → 403.

## Test plan

- [ ] CI green
- [ ] Reviewer ran the smoke from the spec §10
- [ ] `ROADMAP.md` reflects Companies as `[x]`
EOF
)"
```

> Quando o PR for aberto, anotar URL no chat e aguardar CI verde antes de mergear.

- [ ] **Step 7: Aguardar feedback / merge**

Se CI vermelho: investigar localmente, corrigir, push, repetir.
Se CI verde: usuário decide merge strategy (squash sugerido — manter histórico de fix + 23 tasks como 1 commit em `main`).

---

## Summary

Total de tasks: **23**, distribuídas em 4 fases:

- **Phase 0 (Setup, 4 tasks):** cursor helper extraction (com refactor de Users), schematic do módulo, wire-up do `UsersModule` no `CompaniesModule`, factory de SUPER_ADMIN.
- **Phase 1 (Schemas, 1 task com 7 steps):** os 7 schemas Zod em batch.
- **Phase 2 (Domain TDD, 8 tasks):** 4 asserções com unit tests + `findById`/`list`/`create`/`update`/`softDelete` (com `update` testado para defesa-em-profundidade contra slug e `softDelete` testado contra usuários ativos).
- **Phase 3 (App service + controllers + e2e, 8 tasks):** application service skeleton, depois 1 endpoint por task (`POST`, `GET`, `GET /me`, `GET /:id`, `PATCH /me`, `PATCH /:id`, `DELETE /:id`), com testes happy + sad + multi-tenant em sequência.
- **Phase 4 (Cleanup, 2 tasks):** documentar caso especial no checklist + gates + ROADMAP + smoke + PR.

## Test plan

Antes de aprovar PR:

- [ ] `pnpm typecheck` ✓
- [ ] `pnpm lint` ✓
- [ ] `pnpm test` ✓ (cursor unit + companies domain unit + auth + users)
- [ ] `pnpm test:schema` ✓
- [ ] `pnpm test:e2e` ✓ (auth + users + me + companies + companies-me; expected ~78 e2e total: 50 prévios + ~28 novos)
- [ ] `pnpm build` ✓
- [ ] Smoke curl: cria 1 tenant → vê em /companies → ADMIN do novo tenant lê /me → ADMIN PATCH /me com `name` (200) e `planId` (400) → SUPER_ADMIN PATCH /:id com `slug` (400) → DELETE com user (409) → DELETE user → DELETE tenant (204) → GET → 404
- [ ] Multi-tenant isolation reverificada manualmente

## Self-Review (do plano)

**Spec coverage:**

- §1.1 combo POST → Tasks 11 (domain), 15 (app+e2e). ✓
- §1.2 settings só com defaults → Task 11 nested write. ✓
- §1.3 slug imutável + regex → Tasks 5 (schema), 6 (assert), 12 (defense-in-depth). ✓
- §1.4 planId obrigatório + active → Tasks 7 (assert), 11 (create), 20 (update). ✓
- §1.5 soft-delete bloqueia user ativo → Tasks 8 (assert), 13 (impl), 21 (e2e). ✓
- §1.6 PATCH split em 2 rotas → Tasks 19 (`/me`), 20 (`/:id`). ✓
- §1.7 active no body só em PATCH `/:id` → Task 20. ✓
- §2 superfície completa de 7 endpoints → Tasks 15, 16, 17, 18, 19, 20, 21. ✓
- §3 7 schemas → Task 5. ✓
- §4 domain methods → Tasks 6–13. ✓
- §5 application methods → Tasks 14, 15, 16, 17, 18, 19, 20, 21. ✓
- §6 mapa de erros completo → e2e em todas as tasks da Phase 3. ✓
- §7 estrutura de arquivos → Tasks 2 (gerador), 3 (module), 14–21 (preencher). ✓
- §8 unit + e2e + factory → Tasks 4 (factory), 6/7/8/12/13 (unit), 15–21 (e2e). ✓
- §9 verificação por evidência → Task 23. ✓
- §10 smoke curl → Task 23 step 2. ✓
- §11 sem migration → confirmado, nenhuma task de migration. ✓
- §12 plano de branches (já fechado pré-passo do fix) → Task 23 step 5–6. ✓
- §13 ROADMAP update → Task 23 step 3. ✓
- §14 multi-tenant-checklist append → Task 22. ✓

**Placeholder scan:** zero `TBD`/`TODO`/`XXX`/`???`. Steps que mencionam "exemplo" sempre incluem código completo; nenhuma referência a tipo/método não definido em task anterior.

**Type consistency:**

- `CreateCompanyInput` (Task 11) ↔ `CompaniesDomainService.create` (Task 11) ↔ `CompaniesApplicationService.create` (Task 15): ✓
- `UpdateCompanyMeDto` schema (Task 5) ↔ `updateMine` (Task 19): ✓
- `UpdateCompanyDto` schema (Task 5) ↔ `updateById` (Task 20): ✓
- `WorkingHoursDto` (Task 5) ↔ `parseWorkingHours` (Task 14) ↔ `CompanyResponseSchema.defaultWorkingHours` (Task 5): ✓
- `encodeCursor`/`decodeCursor` (Task 1) ↔ `CompaniesDomainService.list` (Task 10) ↔ `UsersDomainService.list` (Task 1 refactor): ✓
- `CompanyWithAdminResponseDto` (Task 5) ↔ `CompaniesApplicationService.create` retorno (Task 15) ↔ controller serializer (Task 15): ✓
- `assertSlugAvailable` ↔ `assertPlanIsActive` ↔ `assertNoActiveUsers` — naming consistente em domain/spec. ✓
