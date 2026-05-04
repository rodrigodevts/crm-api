# Sprint 0.6 — Departments CRUD (com working hours) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o CRUD completo de `Department` (multi-tenant tradicional, ADMIN+ pra escrita, qualquer autenticado pra leitura), com working hours/SLA/distributionMode persistidos, listagem com `?sort=createdAt|name`, soft-delete que limpa `UserDepartment` na mesma transação, e ponte com a Sprint 0.4 (`PATCH /users/:id { departmentIds }` continua sendo única fonte de escrita pro link user↔department).

**Architecture:** 3 camadas (Controller → Application Service → Domain Service) seguindo padrão Fase 0. `DepartmentsDomainService` recebe `companyId` em todos os métodos públicos (multi-tenant tradicional, NÃO o caso especial de Companies). Pré-passo em PR atômica separada: promover `WorkingHoursSchema` pra `src/common/schemas/` e generalizar `src/common/cursor.ts` pra suportar payloads heterogêneos (necessário pra `?sort=name`). Defesa-em-profundidade: `.strict()` + re-parse explícito no PATCH (padrão Sprint 0.4/0.5). `mapConflict` traduz P2002 do `@@unique([companyId, name])` pra 409.

**Tech Stack:** NestJS 11 + Fastify, Prisma 6, Zod 3 + `nestjs-zod`, Vitest, BullMQ não usado, Socket.IO não usado.

**Spec:** [`docs/superpowers/specs/2026-05-03-sprint-0-6-departments-crud-design.md`](../specs/2026-05-03-sprint-0-6-departments-crud-design.md).

**Branches:**

1. `refactor/common-extract-shared-helpers` — pré-passo, mergeada antes da branch principal.
2. `feat/sprint-0-6-departments-crud` — desta sprint, criada após PR 1 mergear no `main`.

---

## File Structure

### Phase 1 — `refactor/common-extract-shared-helpers` (PR 1)

**Move:**

```
src/modules/companies/schemas/working-hours.schema.ts
  → src/common/schemas/working-hours.schema.ts
```

**Modify:**

```
src/common/cursor.ts                                          # generalizar assinatura
src/common/__tests__/cursor.spec.ts                           # atualizar/expandir
src/modules/users/services/users.domain.service.ts            # consumir novo cursor
src/modules/companies/services/companies.domain.service.ts    # consumir novo cursor
src/modules/companies/schemas/create-company.schema.ts        # ajustar import
src/modules/companies/schemas/update-company-me.schema.ts     # ajustar import
src/modules/companies/schemas/update-company.schema.ts        # ajustar import
src/modules/companies/schemas/company-response.schema.ts      # ajustar import
```

### Phase 2 — `feat/sprint-0-6-departments-crud` (PR 2)

**Create:**

```
src/modules/departments/departments.module.ts
src/modules/departments/controllers/departments.controller.ts
src/modules/departments/services/departments.application.service.ts
src/modules/departments/services/departments.domain.service.ts
src/modules/departments/schemas/create-department.schema.ts
src/modules/departments/schemas/update-department.schema.ts
src/modules/departments/schemas/list-departments.schema.ts
src/modules/departments/schemas/department-response.schema.ts
src/modules/departments/schemas/department-detail-response.schema.ts
src/modules/departments/tests/departments.domain.service.spec.ts
src/modules/departments/tests/departments.controller.e2e-spec.ts
```

**Modify:**

```
src/app.module.ts                                             # registrar DepartmentsModule
test/e2e/factories.ts                                         # ampliar overrides em createDepartment
ROADMAP.md                                                    # [x] Departments (com working hours)
```

### Responsabilidades por arquivo

- **`src/common/schemas/working-hours.schema.ts`** — `WorkingHoursSchema` compartilhado entre Companies e Departments. Validação só estrutural (`HH:MM`, `.strict()`).
- **`src/common/cursor.ts`** — `encodeCursor(payload: Record<string, unknown>)` + `decodeCursor<T>(cursor)`. Stateless. Lança `BadRequestException('Cursor inválido')` em base64/JSON malformado. Validação de shape fica nos consumers (domain services).
- **`departments.domain.service.ts`** — regras de Department. Recebe `companyId` em todos os métodos públicos. Multi-tenant tradicional (filtra `companyId` em toda query). Asserções (`assertNameAvailable`). `softDelete` faz `userDepartment.deleteMany` antes de setar `deletedAt`.
- **`departments.application.service.ts`** — orquestra `prisma.$transaction`, re-parse do `UpdateDepartmentSchema`, mapeamento `P2002 → 409`, flatten + sort de `users` no detail DTO.
- **`departments.controller.ts`** — 5 endpoints. Roles: ADMIN+ pra escrita; sem `@Roles` pra leitura (`JwtAuthGuard` já garante auth). `@CurrentCompany()` extrai do JWT.
- **Schemas Zod** — single source of truth (validação + tipo + OpenAPI).
- **Testes** — unit cobre só asserções e shape de cursor; e2e cobre fluxos completos + multi-tenant + cross-feature com Users.

---

## Phase 1 — `refactor/common-extract-shared-helpers` (PR 1)

### Task 1.1: Criar branch a partir do `main` atualizado

**Files:**

- Working tree: branch `refactor/common-extract-shared-helpers`

- [ ] **Step 1: Garantir `main` atualizado**

```bash
git checkout main
git pull origin main
```

Expected: working tree limpo, no commit `e862085` ou mais recente (Sprint 0.5 mergeada).

- [ ] **Step 2: Criar branch**

```bash
git checkout -b refactor/common-extract-shared-helpers
```

Expected: `Switched to a new branch 'refactor/common-extract-shared-helpers'`.

---

### Task 1.2: Promover `WorkingHoursSchema` para `src/common/schemas/`

**Files:**

- Create: `src/common/schemas/working-hours.schema.ts`
- Delete: `src/modules/companies/schemas/working-hours.schema.ts`
- Modify: `src/modules/companies/schemas/create-company.schema.ts` (import)
- Modify: `src/modules/companies/schemas/update-company-me.schema.ts` (import)
- Modify: `src/modules/companies/schemas/update-company.schema.ts` (import)
- Modify: `src/modules/companies/schemas/company-response.schema.ts` (import)

- [ ] **Step 1: Criar `src/common/schemas/` se não existir**

```bash
mkdir -p src/common/schemas
```

- [ ] **Step 2: Mover o arquivo via `git mv` (preserva histórico)**

```bash
git mv src/modules/companies/schemas/working-hours.schema.ts src/common/schemas/working-hours.schema.ts
```

- [ ] **Step 3: Atualizar imports nos 4 arquivos de Companies**

Em cada um dos 4 arquivos abaixo, substituir:

```typescript
import { WorkingHoursSchema, ... } from './working-hours.schema';
```

por:

```typescript
import { WorkingHoursSchema, ... } from '@/common/schemas/working-hours.schema';
```

(Ou pelo path relativo `../../../common/schemas/working-hours.schema` se o tsconfig não suportar o alias `@/`. Verificar `tsconfig.json:paths`.)

Arquivos:

- `src/modules/companies/schemas/create-company.schema.ts`
- `src/modules/companies/schemas/update-company-me.schema.ts`
- `src/modules/companies/schemas/update-company.schema.ts`
- `src/modules/companies/schemas/company-response.schema.ts`

- [ ] **Step 4: Rodar typecheck**

```bash
pnpm typecheck
```

Expected: zero erros. Se reportar `Cannot find module './working-hours.schema'`, voltar e corrigir o import.

- [ ] **Step 5: Rodar suite de testes existentes**

```bash
pnpm test && pnpm test:schema && pnpm test:e2e
```

Expected: todos os ~86+ testes passam (Companies + Users + Auth).

- [ ] **Step 6: Commit**

```bash
git add src/common/schemas/working-hours.schema.ts \
        src/modules/companies/schemas/create-company.schema.ts \
        src/modules/companies/schemas/update-company-me.schema.ts \
        src/modules/companies/schemas/update-company.schema.ts \
        src/modules/companies/schemas/company-response.schema.ts
git commit -m "refactor(common): promote WorkingHoursSchema to src/common/schemas

Departamento (Sprint 0.6) também consome o shape — mover pra common/
evita import cross-module entre features (anti-pattern de
ARCHITECTURE.md §3.7). Sem mudança semântica."
```

---

### Task 1.3: Generalizar `src/common/cursor.ts` (TDD)

**Files:**

- Modify: `src/common/cursor.ts`
- Modify: `src/common/__tests__/cursor.spec.ts`

- [ ] **Step 1: Verificar conteúdo atual de `src/common/cursor.ts`**

```bash
cat src/common/cursor.ts
```

Expected: assinatura hardcoded `encodeCursor(createdAt: Date, id: string)` e `decodeCursor: DecodedCursor | null`.

- [ ] **Step 2: Atualizar o teste com casos pra payloads arbitrários (TDD primeiro)**

Substituir o conteúdo de `src/common/__tests__/cursor.spec.ts` por:

```typescript
import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { encodeCursor, decodeCursor } from '../cursor';

describe('cursor helper', () => {
  describe('encodeCursor', () => {
    it('codifica payload arbitrário em base64url', () => {
      const cursor = encodeCursor({ createdAt: '2026-05-03T00:00:00.000Z', id: 'abc' });
      expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('payloads diferentes produzem cursors diferentes', () => {
      const a = encodeCursor({ name: 'Alice', id: '1' });
      const b = encodeCursor({ name: 'Bob', id: '1' });
      expect(a).not.toEqual(b);
    });

    it('aceita shapes heterogêneos (sort=createdAt vs sort=name)', () => {
      const byCreatedAt = encodeCursor({ createdAt: '2026-05-03T00:00:00.000Z', id: 'a' });
      const byName = encodeCursor({ name: 'Suporte', id: 'a' });
      expect(byCreatedAt).not.toEqual(byName);
    });
  });

  describe('decodeCursor', () => {
    it('round-trip preserva o payload', () => {
      const original = { createdAt: '2026-05-03T00:00:00.000Z', id: 'abc' };
      const cursor = encodeCursor(original);
      const decoded = decodeCursor<{ createdAt: string; id: string }>(cursor);
      expect(decoded).toEqual(original);
    });

    it('retorna null quando cursor é undefined', () => {
      expect(decodeCursor<{ createdAt: string; id: string }>(undefined)).toBeNull();
    });

    it('lança BadRequestException pra base64 quebrado', () => {
      expect(() => decodeCursor<unknown>('!!!not-base64!!!')).toThrow(BadRequestException);
    });

    it('lança BadRequestException pra JSON malformado', () => {
      const broken = Buffer.from('not-json', 'utf8').toString('base64url');
      expect(() => decodeCursor<unknown>(broken)).toThrow(BadRequestException);
    });
  });
});
```

- [ ] **Step 3: Rodar teste pra verificar falhas (TDD)**

```bash
pnpm vitest run src/common/__tests__/cursor.spec.ts
```

Expected: falhas em "aceita shapes heterogêneos" e/ou no round-trip de payloads que não sejam `{createdAt, id}` exatos. (A implementação atual aceita `Date`, retorna `Date`, e tem shape fixo.)

- [ ] **Step 4: Substituir o conteúdo de `src/common/cursor.ts` pela versão genérica**

```typescript
import { BadRequestException } from '@nestjs/common';

export function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor<T>(cursor: string | undefined): T | null {
  if (cursor === undefined) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    return JSON.parse(decoded) as T;
  } catch {
    throw new BadRequestException('Cursor inválido');
  }
}
```

> Nota: removemos `DecodedCursor` (era hardcoded). Os consumers passam a definir o tipo via parâmetro genérico `T` no `decodeCursor<T>()`.

- [ ] **Step 5: Rodar testes novos pra verificar que passam**

```bash
pnpm vitest run src/common/__tests__/cursor.spec.ts
```

Expected: todos os 7 testes passam.

- [ ] **Step 6: Rodar typecheck (vai quebrar consumers — esperado)**

```bash
pnpm typecheck
```

Expected: erros em `users.domain.service.ts` e `companies.domain.service.ts` (eles usam a assinatura antiga). Próximas tasks corrigem.

- [ ] **Step 7: Commit (parcial — typecheck quebrado é esperado neste passo intermediário)**

```bash
git add src/common/cursor.ts src/common/__tests__/cursor.spec.ts
git commit -m "refactor(common): generalize cursor helper for arbitrary payloads

Permite cursors com shape variável (ex: {createdAt,id} para sort
default ou {name,id} para sort alfabético). Consumers passam a
parametrizar via decodeCursor<T>() e validam shape próprios."
```

---

### Task 1.4: Refatorar `UsersDomainService.list` para nova assinatura

**Files:**

- Modify: `src/modules/users/services/users.domain.service.ts`

- [ ] **Step 1: Ler o método `list` e funções auxiliares**

```bash
grep -n "encodeCursor\|decodeCursor" src/modules/users/services/users.domain.service.ts
```

Anotar números de linha pra modificar.

- [ ] **Step 2: Atualizar import e chamadas**

No topo do arquivo:

```typescript
import { encodeCursor, decodeCursor } from '@/common/cursor';
```

Trocar `decodeCursor(pagination.cursor)` por:

```typescript
const decoded = decodeCursor<{ createdAt: string; id: string }>(pagination.cursor);
```

Adicionar validação de shape logo após:

```typescript
if (decoded !== null) {
  if (typeof decoded.createdAt !== 'string' || typeof decoded.id !== 'string') {
    throw new BadRequestException('Cursor inválido');
  }
}
```

E onde o helper antigo retornava `Date`, agora `decoded.createdAt` é `string`. Converter na hora do uso:

```typescript
if (decoded) {
  conditions.push({
    OR: [
      { createdAt: { lt: new Date(decoded.createdAt) } },
      { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
    ],
  });
}
```

Trocar `encodeCursor(last.createdAt, last.id)` por:

```typescript
encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id });
```

- [ ] **Step 3: Verificar `BadRequestException` está importado**

```bash
grep "BadRequestException" src/modules/users/services/users.domain.service.ts
```

Se não, adicionar no `import { ... } from '@nestjs/common';`.

- [ ] **Step 4: Rodar typecheck**

```bash
pnpm typecheck
```

Expected: Users compila. Companies ainda quebra (próxima task).

- [ ] **Step 5: Rodar tests do Users**

```bash
pnpm vitest run src/modules/users/tests/users.domain.service.spec.ts
pnpm vitest run -c vitest.e2e.config.ts src/modules/users/tests/users.controller.e2e-spec.ts
```

Expected: todos os testes do Users passam (cursor pagination continua funcional).

---

### Task 1.5: Refatorar `CompaniesDomainService.list` para nova assinatura

**Files:**

- Modify: `src/modules/companies/services/companies.domain.service.ts`

- [ ] **Step 1: Aplicar mesmas mudanças do Step 2 da Task 1.4 em `companies.domain.service.ts`**

Mesmo padrão: import do `@/common/cursor`, `decodeCursor<{ createdAt: string; id: string }>`, validação de shape, conversão `new Date(decoded.createdAt)`, encode com `{ createdAt: x.toISOString(), id }`.

- [ ] **Step 2: Rodar typecheck**

```bash
pnpm typecheck
```

Expected: zero erros.

- [ ] **Step 3: Rodar suíte completa**

```bash
pnpm test && pnpm test:schema && pnpm test:e2e && pnpm build
```

Expected: todos verdes.

- [ ] **Step 4: Commit**

```bash
git add src/modules/users/services/users.domain.service.ts \
        src/modules/companies/services/companies.domain.service.ts
git commit -m "refactor(users,companies): adopt generalized cursor helper

Cursor agora valida shape no domain (defesa-em-profundidade contra
JSON arbitrário injetado pelo cliente). Sem mudança de comportamento
externo: round-trip do cursor opaco continua idêntico."
```

---

### Task 1.6: Verificação final + push + PR (PR 1)

- [ ] **Step 1: Gate completo**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:schema && pnpm test:e2e && pnpm build
```

Expected: tudo verde.

- [ ] **Step 2: Confirmar com o humano antes de pushar**

> Pergunta ao humano: "PR 1 (refactor) pronto. Posso pushar `refactor/common-extract-shared-helpers` e abrir o PR via `gh pr create`?"

(CLAUDE.md §4 regra 22 — não pushar sem confirmação.)

- [ ] **Step 3: Após confirmação, push e abrir PR**

```bash
git push -u origin refactor/common-extract-shared-helpers
gh pr create --title "refactor(common): extract WorkingHoursSchema and generalize cursor helper" --body "$(cat <<'EOF'
## Summary

Pré-passo da Sprint 0.6 — Departments CRUD (`docs/superpowers/specs/2026-05-03-sprint-0-6-departments-crud-design.md` §1.4 e §1.6).

- Move `WorkingHoursSchema` de `src/modules/companies/schemas/` pra `src/common/schemas/` (Departments também consome).
- Generaliza `src/common/cursor.ts` pra aceitar payloads arbitrários (`encodeCursor(payload)`, `decodeCursor<T>()`) — necessário pra suportar `?sort=name` na listagem de Departments com cursor `{ name, id }`.
- Refatora `UsersDomainService.list` e `CompaniesDomainService.list` pra consumir a nova assinatura, com validação de shape no domain (defesa-em-profundidade).

Sem mudança de comportamento externo. Sem migration.

## Test plan

- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm test` (unit Auth + Users + Companies)
- [x] `pnpm test:schema` (Sprint 0.2)
- [x] `pnpm test:e2e` (Auth + Users + Me + Companies + CompaniesMe)
- [x] `pnpm build`
EOF
)"
```

- [ ] **Step 4: Aguardar CI verde + merge**

Após CI verde, merge via interface do GitHub. Volta pra `main`:

```bash
git checkout main
git pull origin main
```

---

## Phase 2 — `feat/sprint-0-6-departments-crud` (PR 2)

### Task 2.1: Criar branch a partir do `main` atualizado

- [ ] **Step 1: Confirmar que PR 1 mergeou**

```bash
git log -1 --format='%H %s' origin/main | grep -i "WorkingHoursSchema\|cursor helper"
```

Expected: commit do PR 1 visível.

- [ ] **Step 2: Criar branch nova**

```bash
git checkout main
git pull origin main
git checkout -b feat/sprint-0-6-departments-crud
```

---

### Task 2.2: Gerar scaffold + renomear plurais + registrar módulo

**Files:**

- Create: `src/modules/departments/` (pasta inteira via scaffold)
- Modify: `src/app.module.ts`

- [ ] **Step 1: Rodar gerador**

```bash
pnpm g:feature departments
```

Expected: criou pasta `src/modules/departments/` com 5+ arquivos placeholder e atualizou `src/app.module.ts` automaticamente.

- [ ] **Step 2: Listar arquivos gerados**

```bash
find src/modules/departments -type f | sort
```

Expected (formato esperado pelo schematic, baseado em Sprint 0.5):

```
src/modules/departments/controllers/departments.controller.ts
src/modules/departments/departments.module.ts
src/modules/departments/schemas/create-departments.schema.ts        # PLURAL — renomear
src/modules/departments/schemas/department-response.schema.ts       # OK
src/modules/departments/schemas/update-departments.schema.ts        # PLURAL — renomear
src/modules/departments/services/departments.application.service.ts
src/modules/departments/services/departments.domain.service.ts
src/modules/departments/tests/departments.controller.e2e-spec.ts
src/modules/departments/tests/departments.domain.service.spec.ts
```

- [ ] **Step 3: Renomear schemas plurais → singulares (lição da Sprint 0.5)**

```bash
git mv src/modules/departments/schemas/create-departments.schema.ts \
       src/modules/departments/schemas/create-department.schema.ts

git mv src/modules/departments/schemas/update-departments.schema.ts \
       src/modules/departments/schemas/update-department.schema.ts
```

- [ ] **Step 4: Verificar que `src/app.module.ts` importa `DepartmentsModule`**

```bash
grep -n "DepartmentsModule" src/app.module.ts
```

Expected: 1 linha de import + 1 linha em `imports: [...]`. Se não, adicionar manualmente.

- [ ] **Step 5: Sanity check com typecheck**

```bash
pnpm typecheck
```

Expected: erros nos schemas (placeholders com nomes plurais que não batem com os imports). Vamos resolver nas próximas tasks com schemas reais.

- [ ] **Step 6: Commit do scaffold**

```bash
git add src/modules/departments/ src/app.module.ts
git commit -m "feat(departments): scaffold module with 3-layer skeleton

Gerado via pnpm g:feature departments. Schemas renomeados de plural
para singular (lição Sprint 0.5). DepartmentsModule registrado em
AppModule. Próximos commits preenchem implementação."
```

---

### Task 2.3: Schemas Zod (5 arquivos)

**Files:**

- Modify: `src/modules/departments/schemas/create-department.schema.ts`
- Modify: `src/modules/departments/schemas/update-department.schema.ts`
- Create: `src/modules/departments/schemas/list-departments.schema.ts`
- Modify: `src/modules/departments/schemas/department-response.schema.ts`
- Create: `src/modules/departments/schemas/department-detail-response.schema.ts`

> Os 5 schemas vêm prontos no spec (§3.3 a §3.7). Esta task é de transcrição direta + sanity check.

- [ ] **Step 1: Substituir conteúdo de `create-department.schema.ts` pelo do spec §3.3**

```typescript
import { DepartmentDistributionMode } from '@prisma/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { WorkingHoursSchema } from '@/common/schemas/working-hours.schema';

export const CreateDepartmentSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100),
    active: z.boolean().default(true),
    greetingMessage: z.string().max(2000).nullable().optional(),
    outOfHoursMessage: z.string().max(2000).nullable().optional(),
    workingHours: WorkingHoursSchema.nullable().optional(),
    slaResponseMinutes: z.number().int().min(1).max(43200).nullable().optional(),
    slaResolutionMinutes: z.number().int().min(1).max(43200).nullable().optional(),
    distributionMode: z.nativeEnum(DepartmentDistributionMode).default('MANUAL'),
  })
  .strict()
  .describe('Dados para criar departamento');

export type CreateDepartmentDto = z.infer<typeof CreateDepartmentSchema>;
export class CreateDepartmentDtoClass extends createZodDto(CreateDepartmentSchema) {}
```

- [ ] **Step 2: Substituir conteúdo de `update-department.schema.ts` pelo do spec §3.4**

```typescript
import { DepartmentDistributionMode } from '@prisma/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { WorkingHoursSchema } from '@/common/schemas/working-hours.schema';

export const UpdateDepartmentSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    active: z.boolean().optional(),
    greetingMessage: z.string().max(2000).nullable().optional(),
    outOfHoursMessage: z.string().max(2000).nullable().optional(),
    workingHours: WorkingHoursSchema.nullable().optional(),
    slaResponseMinutes: z.number().int().min(1).max(43200).nullable().optional(),
    slaResolutionMinutes: z.number().int().min(1).max(43200).nullable().optional(),
    distributionMode: z.nativeEnum(DepartmentDistributionMode).optional(),
  })
  .strict()
  .describe('Campos editáveis em departamento. Strict.');

export type UpdateDepartmentDto = z.infer<typeof UpdateDepartmentSchema>;
export class UpdateDepartmentDtoClass extends createZodDto(UpdateDepartmentSchema) {}
```

- [ ] **Step 3: Criar `list-departments.schema.ts` (spec §3.5)**

```typescript
import { z } from 'zod';

export const ListDepartmentsQuerySchema = z
  .object({
    active: z.coerce.boolean().optional().default(true),
    search: z.string().trim().min(1).max(100).optional(),
    sort: z.enum(['createdAt', 'name']).default('createdAt'),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .describe('Filtros para listagem de departamentos');

export type ListDepartmentsQueryDto = z.infer<typeof ListDepartmentsQuerySchema>;
```

- [ ] **Step 4: Substituir `department-response.schema.ts` pelo do spec §3.6**

```typescript
import { DepartmentDistributionMode } from '@prisma/client';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { WorkingHoursSchema } from '@/common/schemas/working-hours.schema';

export const DepartmentResponseSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid(),
    name: z.string(),
    active: z.boolean(),
    greetingMessage: z.string().nullable(),
    outOfHoursMessage: z.string().nullable(),
    workingHours: WorkingHoursSchema.nullable(),
    slaResponseMinutes: z.number().nullable(),
    slaResolutionMinutes: z.number().nullable(),
    distributionMode: z.nativeEnum(DepartmentDistributionMode),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .describe('Departamento. Sem deletedAt, sem users.');

export const DepartmentListResponseSchema = z.object({
  items: z.array(DepartmentResponseSchema),
  pagination: z.object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
});

export type DepartmentResponseDto = z.infer<typeof DepartmentResponseSchema>;
export type DepartmentListResponseDto = z.infer<typeof DepartmentListResponseSchema>;
export class DepartmentResponseDtoClass extends createZodDto(DepartmentResponseSchema) {}
export class DepartmentListResponseDtoClass extends createZodDto(DepartmentListResponseSchema) {}
```

- [ ] **Step 5: Criar `department-detail-response.schema.ts` (spec §3.7)**

```typescript
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DepartmentResponseSchema } from './department-response.schema';

const UserRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'AGENT']),
});

export const DepartmentDetailResponseSchema = DepartmentResponseSchema.extend({
  users: z.array(UserRefSchema),
}).describe('Departamento com lista mínima dos usuários atribuídos');

export type DepartmentDetailResponseDto = z.infer<typeof DepartmentDetailResponseSchema>;
export class DepartmentDetailResponseDtoClass extends createZodDto(
  DepartmentDetailResponseSchema,
) {}
```

- [ ] **Step 6: Rodar typecheck**

```bash
pnpm typecheck
```

Expected: zero erros nos schemas. Erros podem persistir nos services (placeholders), mas todos os schemas devem compilar.

- [ ] **Step 7: Commit**

```bash
git add src/modules/departments/schemas/
git commit -m "feat(departments): add Zod schemas (create/update/list/response/detail)

Schemas seguem padrão estabelecido em Sprint 0.4/0.5: strict, type
derivado via z.infer, classes geradas via createZodDto pra OpenAPI.
WorkingHours importado de src/common/schemas/. SLA com limites
sanitários (1..43200 min). distributionMode default MANUAL."
```

---

### Task 2.4: Domain service — `assertNameAvailable` + `findById` + `findByIdWithUsers` (TDD)

**Files:**

- Modify: `src/modules/departments/tests/departments.domain.service.spec.ts`
- Modify: `src/modules/departments/services/departments.domain.service.ts`

- [ ] **Step 1: Substituir o spec gerado pelo conteúdo TDD inicial**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaService } from '@/prisma/prisma.service';
import { DepartmentsDomainService } from '../services/departments.domain.service';

type Tx = {
  department: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  userDepartment: {
    deleteMany: ReturnType<typeof vi.fn>;
  };
};

function makeTx(): Tx {
  return {
    department: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    userDepartment: {
      deleteMany: vi.fn(),
    },
  };
}

describe('DepartmentsDomainService', () => {
  let service: DepartmentsDomainService;
  let tx: Tx;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DepartmentsDomainService, { provide: PrismaService, useValue: makeTx() }],
    }).compile();
    service = module.get(DepartmentsDomainService);
    tx = makeTx();
  });

  describe('findById', () => {
    it('retorna o department quando existe e pertence ao tenant', async () => {
      const dept = { id: 'd1', companyId: 'c1', deletedAt: null };
      tx.department.findFirst.mockResolvedValue(dept);
      const result = await service.findById('d1', 'c1', tx as never);
      expect(result).toEqual(dept);
      expect(tx.department.findFirst).toHaveBeenCalledWith({
        where: { id: 'd1', companyId: 'c1', deletedAt: null },
      });
    });

    it('lança NotFoundException quando não existe', async () => {
      tx.department.findFirst.mockResolvedValue(null);
      await expect(service.findById('xxx', 'c1', tx as never)).rejects.toThrow(NotFoundException);
    });

    it('lança NotFoundException quando pertence a outro tenant (companyId no where)', async () => {
      // O mock retorna null porque o where filtra por companyId.
      tx.department.findFirst.mockResolvedValue(null);
      await expect(service.findById('d1', 'c2', tx as never)).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertNameAvailable', () => {
    it('passa quando nome livre', async () => {
      tx.department.findFirst.mockResolvedValue(null);
      await expect(
        service.assertNameAvailable('Suporte', 'c1', tx as never),
      ).resolves.not.toThrow();
    });

    it('lança ConflictException quando outro depto do mesmo tenant tem o nome', async () => {
      tx.department.findFirst.mockResolvedValue({ id: 'd1' });
      await expect(service.assertNameAvailable('Suporte', 'c1', tx as never)).rejects.toThrow(
        ConflictException,
      );
    });

    it('passa quando o único colidindo é o próprio (exceptId)', async () => {
      tx.department.findFirst.mockResolvedValue({ id: 'd1' });
      await expect(
        service.assertNameAvailable('Suporte', 'c1', tx as never, 'd1'),
      ).resolves.not.toThrow();
    });

    it('filtra deletedAt: null no where (intenção de reusar nome de soft-deletado)', async () => {
      tx.department.findFirst.mockResolvedValue(null);
      await service.assertNameAvailable('Suporte', 'c1', tx as never);
      expect(tx.department.findFirst).toHaveBeenCalledWith({
        where: { companyId: 'c1', name: 'Suporte', deletedAt: null },
      });
    });
  });
});
```

- [ ] **Step 2: Rodar testes — esperado falhar (`DepartmentsDomainService` não tem os métodos)**

```bash
pnpm vitest run src/modules/departments/tests/departments.domain.service.spec.ts
```

Expected: TypeError ou "method not found". É o sinal de TDD.

- [ ] **Step 3: Implementar métodos no domain service**

Substituir conteúdo de `departments.domain.service.ts` pelo:

```typescript
import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, Department } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class DepartmentsDomainService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    id: string,
    companyId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Department> {
    const db: Db = tx ?? this.prisma;
    const dept = await db.department.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!dept) {
      throw new NotFoundException('Departamento não encontrado');
    }
    return dept;
  }

  async assertNameAvailable(
    name: string,
    companyId: string,
    tx: Prisma.TransactionClient,
    exceptId?: string,
  ): Promise<void> {
    const existing = await tx.department.findFirst({
      where: { companyId, name, deletedAt: null },
    });
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('Já existe um departamento com este nome');
    }
  }
}
```

- [ ] **Step 4: Rodar testes — esperado passar**

```bash
pnpm vitest run src/modules/departments/tests/departments.domain.service.spec.ts
```

Expected: todos os testes do `findById` e `assertNameAvailable` passam.

- [ ] **Step 5: Adicionar `findByIdWithUsers` (sem TDD unit — coberto pelo e2e)**

Adicionar ao domain service:

```typescript
async findByIdWithUsers(
  id: string,
  companyId: string,
  tx?: Prisma.TransactionClient,
): Promise<
  Department & {
    users: Array<{
      user: { id: string; name: string; role: 'SUPER_ADMIN' | 'ADMIN' | 'SUPERVISOR' | 'AGENT' };
    }>;
  }
> {
  const db: Db = tx ?? this.prisma;
  const dept = await db.department.findFirst({
    where: { id, companyId, deletedAt: null },
    include: {
      users: {
        where: { user: { deletedAt: null } },
        include: {
          user: { select: { id: true, name: true, role: true } },
        },
      },
    },
  });
  if (!dept) {
    throw new NotFoundException('Departamento não encontrado');
  }
  return dept;
}
```

- [ ] **Step 6: Typecheck**

```bash
pnpm typecheck
```

Expected: zero erros.

- [ ] **Step 7: Commit**

```bash
git add src/modules/departments/services/departments.domain.service.ts \
        src/modules/departments/tests/departments.domain.service.spec.ts
git commit -m "feat(departments): domain findById, findByIdWithUsers, assertNameAvailable

Multi-tenant tradicional — todos os métodos recebem companyId. Soft-
deleted nunca volta. assertNameAvailable filtra deletedAt:null no
where (permite intenção de reusar nome de depto deletado, embora o
constraint global @@unique([companyId,name]) possa rejeitar via
P2002 na hora do INSERT — limitação documentada no spec §6.3)."
```

---

### Task 2.5: Domain service — `list` com multi-sort (TDD)

**Files:**

- Modify: `src/modules/departments/tests/departments.domain.service.spec.ts`
- Modify: `src/modules/departments/services/departments.domain.service.ts`

- [ ] **Step 1: Adicionar tests pra `list` no spec**

Adicionar dentro do `describe('DepartmentsDomainService', ...)`:

```typescript
describe('list', () => {
  it('lança BadRequestException pra cursor com shape errado quando sort=name', async () => {
    await expect(
      service.list(
        'c1',
        { active: true, sort: 'name' },
        { cursor: encodeBadCursor({ createdAt: '2026-05-03T00:00:00.000Z', id: 'a' }), limit: 20 },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('lança BadRequestException pra cursor com shape errado quando sort=createdAt', async () => {
    await expect(
      service.list(
        'c1',
        { active: true, sort: 'createdAt' },
        { cursor: encodeBadCursor({ name: 'Suporte', id: 'a' }), limit: 20 },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('lança BadRequestException pra cursor base64 quebrado', async () => {
    await expect(
      service.list(
        'c1',
        { active: true, sort: 'createdAt' },
        { cursor: '!!!quebrado!!!', limit: 20 },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
```

E adicionar helper no topo do arquivo:

```typescript
function encodeBadCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}
```

> Nota: como `service.list` chama Prisma só DEPOIS da validação de cursor, não precisamos mockar `findMany` nesses casos — o erro é levantado antes.

- [ ] **Step 2: Rodar — esperado falhar (`list` não existe)**

```bash
pnpm vitest run src/modules/departments/tests/departments.domain.service.spec.ts
```

- [ ] **Step 3: Implementar `list` no domain service**

Adicionar ao `departments.domain.service.ts`:

```typescript
import { BadRequestException } from '@nestjs/common';
import { decodeCursor } from '@/common/cursor';

type ListFilters = { active?: boolean; search?: string; sort: 'createdAt' | 'name' };
type ListPagination = { cursor?: string; limit: number };
type ListResult = { items: Department[]; hasMore: boolean };

// dentro da classe:
async list(
  companyId: string,
  filters: ListFilters,
  pagination: ListPagination,
): Promise<ListResult> {
  const where: Prisma.DepartmentWhereInput = {
    companyId,
    deletedAt: null,
    ...(filters.active !== undefined ? { active: filters.active } : {}),
    ...(filters.search
      ? { name: { contains: filters.search, mode: 'insensitive' as const } }
      : {}),
  };

  if (filters.sort === 'name') {
    const decoded = decodeCursor<{ name: string; id: string }>(pagination.cursor);
    if (decoded !== null) {
      if (typeof decoded.name !== 'string' || typeof decoded.id !== 'string') {
        throw new BadRequestException('Cursor inválido');
      }
      where.OR = [
        { name: { gt: decoded.name } },
        { name: decoded.name, id: { gt: decoded.id } },
      ];
    }
    const items = await this.prisma.department.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: pagination.limit + 1,
    });
    const hasMore = items.length > pagination.limit;
    return { items: hasMore ? items.slice(0, pagination.limit) : items, hasMore };
  }

  // sort === 'createdAt'
  const decoded = decodeCursor<{ createdAt: string; id: string }>(pagination.cursor);
  if (decoded !== null) {
    if (typeof decoded.createdAt !== 'string' || typeof decoded.id !== 'string') {
      throw new BadRequestException('Cursor inválido');
    }
    const cursorDate = new Date(decoded.createdAt);
    where.OR = [
      { createdAt: { lt: cursorDate } },
      { createdAt: cursorDate, id: { lt: decoded.id } },
    ];
  }
  const items = await this.prisma.department.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: pagination.limit + 1,
  });
  const hasMore = items.length > pagination.limit;
  return { items: hasMore ? items.slice(0, pagination.limit) : items, hasMore };
}
```

- [ ] **Step 4: Rodar tests — todos os 3 do `list` passam**

```bash
pnpm vitest run src/modules/departments/tests/departments.domain.service.spec.ts
```

Expected: testes de `list` passam.

- [ ] **Step 5: Commit**

```bash
git add src/modules/departments/services/departments.domain.service.ts \
        src/modules/departments/tests/departments.domain.service.spec.ts
git commit -m "feat(departments): domain list with multi-sort (createdAt|name)

Cursor validado por shape contra o sort solicitado — defesa-em-
profundidade contra cliente injetando JSON arbitrário. take: limit+1
para detectar hasMore. Happy path coberto via e2e (Task 2.10)."
```

---

### Task 2.6: Domain service — `create` + `update` + `softDelete` (TDD)

**Files:**

- Modify: `src/modules/departments/tests/departments.domain.service.spec.ts`
- Modify: `src/modules/departments/services/departments.domain.service.ts`

- [ ] **Step 1: Adicionar tests pros 3 métodos no spec**

```typescript
describe('softDelete', () => {
  it('chama userDepartment.deleteMany ANTES de update (atomicidade da $transaction)', async () => {
    const dept = { id: 'd1', companyId: 'c1', deletedAt: null };
    tx.department.findFirst.mockResolvedValue(dept);
    tx.userDepartment.deleteMany.mockResolvedValue({ count: 2 });
    tx.department.update.mockResolvedValue({ ...dept, deletedAt: new Date() });

    const callOrder: string[] = [];
    tx.userDepartment.deleteMany.mockImplementation(async () => {
      callOrder.push('deleteMany');
      return { count: 2 };
    });
    tx.department.update.mockImplementation(async () => {
      callOrder.push('update');
      return { ...dept, deletedAt: new Date() };
    });

    await service.softDelete('d1', 'c1', tx as never);
    expect(callOrder).toEqual(['deleteMany', 'update']);
  });

  it('lança NotFoundException quando depto não existe ou é de outro tenant', async () => {
    tx.department.findFirst.mockResolvedValue(null);
    await expect(service.softDelete('d1', 'c1', tx as never)).rejects.toThrow(NotFoundException);
    expect(tx.userDepartment.deleteMany).not.toHaveBeenCalled();
  });
});

describe('update', () => {
  it('skipa assertNameAvailable quando patch.name === existing.name', async () => {
    const dept = { id: 'd1', companyId: 'c1', name: 'Suporte', deletedAt: null };
    tx.department.findFirst.mockResolvedValueOnce(dept); // findById
    tx.department.update.mockResolvedValue({ ...dept });

    await service.update('d1', 'c1', { name: 'Suporte' }, tx as never);
    // assertNameAvailable não foi chamado: findFirst só rodou 1x (do findById)
    expect(tx.department.findFirst).toHaveBeenCalledTimes(1);
  });

  it('chama assertNameAvailable quando patch.name é diferente', async () => {
    const dept = { id: 'd1', companyId: 'c1', name: 'Suporte', deletedAt: null };
    tx.department.findFirst
      .mockResolvedValueOnce(dept) // findById
      .mockResolvedValueOnce(null); // assertNameAvailable
    tx.department.update.mockResolvedValue({ ...dept, name: 'Atendimento' });

    await service.update('d1', 'c1', { name: 'Atendimento' }, tx as never);
    expect(tx.department.findFirst).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Rodar — esperado falhar**

```bash
pnpm vitest run src/modules/departments/tests/departments.domain.service.spec.ts
```

- [ ] **Step 3: Implementar `create`, `update`, `softDelete` no domain service**

Adicionar à classe:

```typescript
async create(
  input: Prisma.DepartmentUncheckedCreateInput,
  companyId: string,
  tx: Prisma.TransactionClient,
): Promise<Department> {
  await this.assertNameAvailable(input.name, companyId, tx);
  return tx.department.create({ data: { ...input, companyId } });
}

async update(
  id: string,
  companyId: string,
  patch: Prisma.DepartmentUpdateInput,
  tx: Prisma.TransactionClient,
): Promise<Department> {
  const existing = await this.findById(id, companyId, tx);
  if (typeof patch.name === 'string' && patch.name !== existing.name) {
    await this.assertNameAvailable(patch.name, companyId, tx, id);
  }
  return tx.department.update({ where: { id }, data: patch });
}

async softDelete(
  id: string,
  companyId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  await this.findById(id, companyId, tx);
  await tx.userDepartment.deleteMany({ where: { departmentId: id } });
  await tx.department.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
```

- [ ] **Step 4: Rodar — todos os tests passam**

```bash
pnpm vitest run src/modules/departments/tests/departments.domain.service.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/departments/services/departments.domain.service.ts \
        src/modules/departments/tests/departments.domain.service.spec.ts
git commit -m "feat(departments): domain create, update, softDelete

create: assertNameAvailable então insere; P2002 propaga pro app
service via mapConflict. update: skipa assert quando name não
mudou. softDelete: deleteMany em UserDepartment antes do update
(atomicidade da \$transaction; decisão 1.2 do spec)."
```

---

### Task 2.7: Application service — `create`, `list`, `findById`

**Files:**

- Modify: `src/modules/departments/services/departments.application.service.ts`

- [ ] **Step 1: Substituir o conteúdo placeholder pelo real**

```typescript
import { Injectable, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { encodeCursor } from '@/common/cursor';
import type { CreateDepartmentDto } from '../schemas/create-department.schema';
import type { ListDepartmentsQueryDto } from '../schemas/list-departments.schema';
import type {
  DepartmentResponseDto,
  DepartmentListResponseDto,
} from '../schemas/department-response.schema';
import type { DepartmentDetailResponseDto } from '../schemas/department-detail-response.schema';
import type { WorkingHoursDto } from '@/common/schemas/working-hours.schema';
import { DepartmentsDomainService } from './departments.domain.service';

type DepartmentEntity = Awaited<ReturnType<DepartmentsDomainService['findById']>>;
type DepartmentWithUsers = Awaited<ReturnType<DepartmentsDomainService['findByIdWithUsers']>>;

@Injectable()
export class DepartmentsApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domain: DepartmentsDomainService,
  ) {}

  async create(input: CreateDepartmentDto, companyId: string): Promise<DepartmentResponseDto> {
    try {
      const department = await this.prisma.$transaction((tx) =>
        this.domain.create(input, companyId, tx),
      );
      return this.toDto(department);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  async list(
    companyId: string,
    query: ListDepartmentsQueryDto,
  ): Promise<DepartmentListResponseDto> {
    const { items, hasMore } = await this.domain.list(
      companyId,
      { active: query.active, search: query.search, sort: query.sort },
      { cursor: query.cursor, limit: query.limit },
    );

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1]!;
      nextCursor =
        query.sort === 'name'
          ? encodeCursor({ name: last.name, id: last.id })
          : encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id });
    }

    return {
      items: items.map((d) => this.toDto(d)),
      pagination: { nextCursor, hasMore },
    };
  }

  async findById(id: string, companyId: string): Promise<DepartmentDetailResponseDto> {
    const dept = await this.domain.findByIdWithUsers(id, companyId);
    return this.toDetailDto(dept);
  }

  private toDto(d: DepartmentEntity): DepartmentResponseDto {
    return {
      id: d.id,
      companyId: d.companyId,
      name: d.name,
      active: d.active,
      greetingMessage: d.greetingMessage,
      outOfHoursMessage: d.outOfHoursMessage,
      workingHours: d.workingHours as WorkingHoursDto | null,
      slaResponseMinutes: d.slaResponseMinutes,
      slaResolutionMinutes: d.slaResolutionMinutes,
      distributionMode: d.distributionMode,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }

  private toDetailDto(d: DepartmentWithUsers): DepartmentDetailResponseDto {
    const users = d.users
      .map((ud) => ({ id: ud.user.id, name: ud.user.name, role: ud.user.role }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ...this.toDto(d), users };
  }

  private mapConflict(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined) ?? [];
      if (
        target.includes('name') ||
        target.some((t) => t.includes('companyId') && t.includes('name'))
      ) {
        return new ConflictException('Já existe um departamento com este nome');
      }
    }
    return err;
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: zero erros.

- [ ] **Step 3: Commit (parcial — update e softDelete vêm em seguida)**

```bash
git add src/modules/departments/services/departments.application.service.ts
git commit -m "feat(departments): application service for create, list, findById

create: \$transaction + mapConflict P2002. list: encode cursor por
shape (createdAt|name). findById: flatten users + sort por name.
update e softDelete vêm na próxima task."
```

---

### Task 2.8: Application service — `update` (com re-parse) + `softDelete`

**Files:**

- Modify: `src/modules/departments/services/departments.application.service.ts`

- [ ] **Step 1: Adicionar imports e métodos**

No topo, adicionar:

```typescript
import { BadRequestException } from '@nestjs/common';
import { ZodError } from 'zod';
import {
  UpdateDepartmentSchema,
  type UpdateDepartmentDto,
} from '../schemas/update-department.schema';
```

Dentro da classe, adicionar:

```typescript
async update(
  id: string,
  companyId: string,
  input: UpdateDepartmentDto,
): Promise<DepartmentResponseDto> {
  // Re-parse explícito (defesa-em-profundidade contra ZodValidationPipe global
  // não enforçar .strict() quando o schema é consumido via createZodDto).
  // Padrão Sprint 0.4 (PATCH /me) e 0.5 (PATCH /companies/me + PATCH /:id).
  try {
    UpdateDepartmentSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new BadRequestException({
        message: 'Validação falhou',
        errors: error.issues.map((i) => ({
          field: i.path.join('.') || '<root>',
          message: i.message,
          code: i.code,
        })),
      });
    }
    throw error;
  }

  const patch: Prisma.DepartmentUpdateInput = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.active !== undefined) patch.active = input.active;
  if ('greetingMessage' in input) patch.greetingMessage = input.greetingMessage ?? null;
  if ('outOfHoursMessage' in input) patch.outOfHoursMessage = input.outOfHoursMessage ?? null;
  if ('workingHours' in input) {
    patch.workingHours = input.workingHours ?? Prisma.DbNull;
  }
  if ('slaResponseMinutes' in input) {
    patch.slaResponseMinutes = input.slaResponseMinutes ?? null;
  }
  if ('slaResolutionMinutes' in input) {
    patch.slaResolutionMinutes = input.slaResolutionMinutes ?? null;
  }
  if (input.distributionMode !== undefined) patch.distributionMode = input.distributionMode;

  try {
    const department = await this.prisma.$transaction((tx) =>
      this.domain.update(id, companyId, patch, tx),
    );
    return this.toDto(department);
  } catch (err) {
    throw this.mapConflict(err);
  }
}

async softDelete(id: string, companyId: string): Promise<void> {
  await this.prisma.$transaction((tx) => this.domain.softDelete(id, companyId, tx));
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: zero erros.

- [ ] **Step 3: Commit**

```bash
git add src/modules/departments/services/departments.application.service.ts
git commit -m "feat(departments): application update (re-parse strict) and softDelete

Padrão de Sprint 0.4/0.5: re-parse de UpdateDepartmentSchema na
camada de aplicação como defesa-em-profundidade. workingHours: null
vira Prisma.DbNull pra zerar JSON. softDelete delega pra domain."
```

---

### Task 2.9: Controller — 5 endpoints

**Files:**

- Modify: `src/modules/departments/controllers/departments.controller.ts`

- [ ] **Step 1: Substituir o controller placeholder pelo real**

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ZodSerializerDto } from 'nestjs-zod';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentCompany } from '@/common/decorators/current-company.decorator';
import {
  CreateDepartmentDtoClass,
  type CreateDepartmentDto,
} from '../schemas/create-department.schema';
import {
  UpdateDepartmentDtoClass,
  type UpdateDepartmentDto,
} from '../schemas/update-department.schema';
import {
  ListDepartmentsQuerySchema,
  type ListDepartmentsQueryDto,
} from '../schemas/list-departments.schema';
import {
  DepartmentResponseDtoClass,
  DepartmentListResponseDtoClass,
} from '../schemas/department-response.schema';
import { DepartmentDetailResponseDtoClass } from '../schemas/department-detail-response.schema';
import { DepartmentsApplicationService } from '../services/departments.application.service';

@Controller('departments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DepartmentsController {
  constructor(private readonly app: DepartmentsApplicationService) {}

  @Post()
  @Roles('ADMIN')
  @ZodSerializerDto(DepartmentResponseDtoClass)
  async create(@Body() body: CreateDepartmentDtoClass, @CurrentCompany() companyId: string) {
    return this.app.create(body as CreateDepartmentDto, companyId);
  }

  @Get()
  @ZodSerializerDto(DepartmentListResponseDtoClass)
  async list(@Query() rawQuery: Record<string, string>, @CurrentCompany() companyId: string) {
    const query: ListDepartmentsQueryDto = ListDepartmentsQuerySchema.parse(rawQuery);
    return this.app.list(companyId, query);
  }

  @Get(':id')
  @ZodSerializerDto(DepartmentDetailResponseDtoClass)
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentCompany() companyId: string) {
    return this.app.findById(id, companyId);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ZodSerializerDto(DepartmentResponseDtoClass)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDepartmentDtoClass,
    @CurrentCompany() companyId: string,
  ) {
    return this.app.update(id, companyId, body as UpdateDepartmentDto);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(204)
  async softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentCompany() companyId: string,
  ): Promise<void> {
    await this.app.softDelete(id, companyId);
  }
}
```

> Notas:
>
> - **Sem `@Roles` no GET (list e findById)** → qualquer autenticado do tenant (decisão 1.3 do spec).
> - **`@Roles('ADMIN')`** já cobre `SUPER_ADMIN` via hierarquia (decorator implementado na Sprint 0.3).
> - **`Query()` cru + `parse` manual**: o `ZodValidationPipe` global injetado pelo `nestjs-zod` valida `Body` automaticamente quando temos `@Body() body: SomeDtoClass`, mas Query precisa ser parseado pelo schema diretamente porque os tipos primitivos vêm como string (ex: `?active=true` vira string `"true"`). `z.coerce.boolean()` no schema cuida da coerção.

- [ ] **Step 2: Verificar imports do `JwtAuthGuard`, `RolesGuard`, decorators**

```bash
grep -r "JwtAuthGuard\|RolesGuard\|@CurrentCompany\|@Roles" src/common/guards src/common/decorators 2>/dev/null | head -20
```

Conferir paths reais e ajustar imports do controller.

- [ ] **Step 3: Garantir que `DepartmentsModule` injeta corretamente**

Verificar `src/modules/departments/departments.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { DepartmentsController } from './controllers/departments.controller';
import { DepartmentsApplicationService } from './services/departments.application.service';
import { DepartmentsDomainService } from './services/departments.domain.service';

@Module({
  controllers: [DepartmentsController],
  providers: [DepartmentsApplicationService, DepartmentsDomainService],
})
export class DepartmentsModule {}
```

(Sem `imports` extra — `PrismaService` é global em `AppModule`.)

- [ ] **Step 4: Typecheck + build**

```bash
pnpm typecheck && pnpm build
```

Expected: zero erros.

- [ ] **Step 5: Commit**

```bash
git add src/modules/departments/controllers/departments.controller.ts \
        src/modules/departments/departments.module.ts
git commit -m "feat(departments): controller with 5 endpoints

Roles: GET aberto a qualquer auth do tenant (decisão 1.3); POST/
PATCH/DELETE ADMIN+ via @Roles('ADMIN') + hierarquia Sprint 0.3.
@CurrentCompany() do JWT em todas as rotas (multi-tenant tradicional).
Query parseado manualmente pelo schema Zod (coerce de booleans/numbers)."
```

---

### Task 2.10: Atualizar factory `createDepartment` com overrides

**Files:**

- Modify: `test/e2e/factories.ts`

- [ ] **Step 1: Substituir `createDepartment` pela versão extendida**

Localizar a função em `test/e2e/factories.ts:50-62` e substituir por:

```typescript
export async function createDepartment(
  prisma: PrismaClient,
  companyId: string,
  overrides: Partial<{
    name: string;
    active: boolean;
    distributionMode: DepartmentDistributionMode;
    workingHours: Prisma.JsonValue;
    slaResponseMinutes: number;
    slaResolutionMinutes: number;
    greetingMessage: string;
    outOfHoursMessage: string;
  }> = {},
): Promise<Department> {
  return prisma.department.create({
    data: {
      companyId,
      name: overrides.name ?? `Dept ${nextId()}`,
      active: overrides.active ?? true,
      distributionMode: overrides.distributionMode,
      workingHours: overrides.workingHours,
      slaResponseMinutes: overrides.slaResponseMinutes,
      slaResolutionMinutes: overrides.slaResolutionMinutes,
      greetingMessage: overrides.greetingMessage,
      outOfHoursMessage: overrides.outOfHoursMessage,
    },
  });
}
```

Adicionar imports no topo se ainda não estiverem:

```typescript
import { DepartmentDistributionMode, Prisma } from '@prisma/client';
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: zero erros.

- [ ] **Step 3: Rodar testes existentes que usam `createDepartment`**

```bash
pnpm test:e2e
```

Expected: testes do Users (que já usam `createDepartment` sem overrides) continuam verdes — função é backwards-compatible.

- [ ] **Step 4: Commit**

```bash
git add test/e2e/factories.ts
git commit -m "test(factories): extend createDepartment with full overrides

Adiciona distributionMode, workingHours, SLA, mensagens nos
overrides — necessário pros e2e da Sprint 0.6. Backwards-compatible:
chamadas existentes (Sprint 0.4) continuam válidas."
```

---

### Task 2.11: E2E tests — happy paths

**Files:**

- Modify: `src/modules/departments/tests/departments.controller.e2e-spec.ts`

> O e2e é grande. Vou dividir em 3 commits: happy paths (Task 2.11), sad paths (Task 2.12), multi-tenant + cross-feature (Task 2.13).

- [ ] **Step 1: Substituir o spec gerado pelo cabeçalho + happy paths**

```typescript
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setupApp } from '@/../test/e2e/setup-app';
import {
  createCompany,
  createUser,
  createDepartment,
  createSuperAdmin,
  loginAs,
  truncateAll,
} from '@/../test/e2e/factories';
import type { PrismaClient, Company, User, Department } from '@prisma/client';

describe('DepartmentsController (e2e) — happy paths', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let company: Company;
  let admin: { user: User; password: string };
  let agent: { user: User; password: string };
  let tokenAdmin: string;
  let tokenAgent: string;

  beforeAll(async () => {
    ({ app, prisma } = await setupApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    company = await createCompany(prisma);
    admin = await createUser(prisma, company.id, { role: 'ADMIN' });
    agent = await createUser(prisma, company.id, { role: 'AGENT' });
    ({ accessToken: tokenAdmin } = await loginAs(app, admin.user.email, admin.password));
    ({ accessToken: tokenAgent } = await loginAs(app, agent.user.email, agent.password));
  });

  it('POST /departments como ADMIN cria depto (201)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/departments',
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      payload: {
        name: 'Suporte',
        workingHours: {
          monday: [{ from: '09:00', to: '18:00' }],
          tuesday: [],
          wednesday: [],
          thursday: [],
          friday: [],
          saturday: [],
          sunday: [],
          holiday: [],
        },
        slaResponseMinutes: 30,
        distributionMode: 'RANDOM',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({
      name: 'Suporte',
      companyId: company.id,
      slaResponseMinutes: 30,
      distributionMode: 'RANDOM',
      active: true,
    });
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/i);

    const count = await prisma.department.count({ where: { companyId: company.id } });
    expect(count).toBe(1);
  });

  it('GET /departments como AGENT lista deptos do tenant (200)', async () => {
    await createDepartment(prisma, company.id, { name: 'Suporte' });
    await createDepartment(prisma, company.id, { name: 'Vendas' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/departments',
      headers: { Authorization: `Bearer ${tokenAgent}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(2);
    expect(body.pagination.hasMore).toBe(false);
    expect(body.pagination.nextCursor).toBeNull();
  });

  it('GET /departments?sort=name ordena alfabeticamente', async () => {
    await createDepartment(prisma, company.id, { name: 'Vendas' });
    await createDepartment(prisma, company.id, { name: 'Atendimento' });
    await createDepartment(prisma, company.id, { name: 'Suporte' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/departments?sort=name',
      headers: { Authorization: `Bearer ${tokenAgent}` },
    });

    expect(res.statusCode).toBe(200);
    const names = res.json().items.map((d: { name: string }) => d.name);
    expect(names).toEqual(['Atendimento', 'Suporte', 'Vendas']);
  });

  it('GET /departments paginates com cursor (limit=1)', async () => {
    await createDepartment(prisma, company.id, { name: 'Suporte' });
    await createDepartment(prisma, company.id, { name: 'Vendas' });

    const page1 = await app.inject({
      method: 'GET',
      url: '/api/v1/departments?limit=1&sort=name',
      headers: { Authorization: `Bearer ${tokenAgent}` },
    });
    expect(page1.statusCode).toBe(200);
    expect(page1.json().items).toHaveLength(1);
    expect(page1.json().pagination.hasMore).toBe(true);
    const cursor: string = page1.json().pagination.nextCursor;

    const page2 = await app.inject({
      method: 'GET',
      url: `/api/v1/departments?limit=1&sort=name&cursor=${encodeURIComponent(cursor)}`,
      headers: { Authorization: `Bearer ${tokenAgent}` },
    });
    expect(page2.statusCode).toBe(200);
    expect(page2.json().items).toHaveLength(1);
    expect(page2.json().pagination.hasMore).toBe(false);
  });

  it('GET /departments/:id retorna users associados', async () => {
    const dept = await createDepartment(prisma, company.id, { name: 'Suporte' });
    await prisma.userDepartment.create({
      data: { userId: agent.user.id, departmentId: dept.id },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/departments/${dept.id}`,
      headers: { Authorization: `Bearer ${tokenAgent}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(dept.id);
    expect(body.users).toHaveLength(1);
    expect(body.users[0]).toMatchObject({
      id: agent.user.id,
      name: agent.user.name,
      role: 'AGENT',
    });
    // Sem email no payload (decisão 1.3)
    expect(body.users[0]).not.toHaveProperty('email');
  });

  it('PATCH /departments/:id como ADMIN atualiza campos (200)', async () => {
    const dept = await createDepartment(prisma, company.id, { name: 'Suporte' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/departments/${dept.id}`,
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      payload: {
        name: 'Suporte 24h',
        slaResponseMinutes: 60,
        distributionMode: 'BALANCED',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      name: 'Suporte 24h',
      slaResponseMinutes: 60,
      distributionMode: 'BALANCED',
    });

    const fromDb = await prisma.department.findUnique({ where: { id: dept.id } });
    expect(fromDb?.name).toBe('Suporte 24h');
  });

  it('DELETE /departments/:id em depto vazio (204)', async () => {
    const dept = await createDepartment(prisma, company.id);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/departments/${dept.id}`,
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });

    expect(res.statusCode).toBe(204);

    const fromDb = await prisma.department.findUnique({ where: { id: dept.id } });
    expect(fromDb?.deletedAt).not.toBeNull();

    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/departments/${dept.id}`,
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    expect(get.statusCode).toBe(404);
  });

  it('DELETE /departments/:id com 2 AGENTs assigned limpa UserDepartment (204)', async () => {
    const dept = await createDepartment(prisma, company.id);
    const agent2 = await createUser(prisma, company.id, { role: 'AGENT' });
    await prisma.userDepartment.createMany({
      data: [
        { userId: agent.user.id, departmentId: dept.id },
        { userId: agent2.user.id, departmentId: dept.id },
      ],
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/departments/${dept.id}`,
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    expect(res.statusCode).toBe(204);

    const links = await prisma.userDepartment.count({ where: { departmentId: dept.id } });
    expect(links).toBe(0);

    // Os AGENTs continuam existindo
    const a1 = await prisma.user.findUnique({ where: { id: agent.user.id } });
    const a2 = await prisma.user.findUnique({ where: { id: agent2.user.id } });
    expect(a1?.deletedAt).toBeNull();
    expect(a2?.deletedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e2e parcial**

```bash
pnpm test:e2e -- src/modules/departments/tests/departments.controller.e2e-spec.ts
```

Expected: 8 happy paths passam.

- [ ] **Step 3: Commit**

```bash
git add src/modules/departments/tests/departments.controller.e2e-spec.ts
git commit -m "test(departments): e2e happy paths (8 cenários)

POST/GET/GET\:id/PATCH/DELETE em ADMIN e AGENT cobertos. Paginação
com cursor sort=name validada. DELETE com UserDepartment cascade
verificado (links removidos, users intactos)."
```

---

### Task 2.12: E2E tests — sad paths

**Files:**

- Modify: `src/modules/departments/tests/departments.controller.e2e-spec.ts`

- [ ] **Step 1: Adicionar bloco `describe` separado**

Acrescentar no final do arquivo (mesmo `setupApp` reaproveitado, mas um `describe` novo pra separar lógica):

```typescript
describe('DepartmentsController (e2e) — sad paths', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let company: Company;
  let admin: { user: User; password: string };
  let agent: { user: User; password: string };
  let tokenAdmin: string;
  let tokenAgent: string;

  beforeAll(async () => {
    ({ app, prisma } = await setupApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(prisma);
    company = await createCompany(prisma);
    admin = await createUser(prisma, company.id, { role: 'ADMIN' });
    agent = await createUser(prisma, company.id, { role: 'AGENT' });
    ({ accessToken: tokenAdmin } = await loginAs(app, admin.user.email, admin.password));
    ({ accessToken: tokenAgent } = await loginAs(app, agent.user.email, agent.password));
  });

  it('POST como AGENT → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/departments',
      headers: { Authorization: `Bearer ${tokenAgent}` },
      payload: { name: 'Suporte' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST como SUPERVISOR → 403', async () => {
    const sup = await createUser(prisma, company.id, { role: 'SUPERVISOR' });
    const { accessToken: tokenSup } = await loginAs(app, sup.user.email, sup.password);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/departments',
      headers: { Authorization: `Bearer ${tokenSup}` },
      payload: { name: 'Suporte' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST com name colidindo no tenant → 409', async () => {
    await createDepartment(prisma, company.id, { name: 'Suporte' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/departments',
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      payload: { name: 'Suporte' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/Já existe um departamento/i);
  });

  it('POST com chave extra (companyId) → 400 Unrecognized key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/departments',
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      payload: { name: 'Suporte', companyId: 'forge-id' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST com distributionMode inválido → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/departments',
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      payload: { name: 'Suporte', distributionMode: 'NOPE' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST com slaResponseMinutes negativo → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/departments',
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      payload: { name: 'Suporte', slaResponseMinutes: -5 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST com slaResponseMinutes > 43200 → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/departments',
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      payload: { name: 'Suporte', slaResponseMinutes: 99999 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST com workingHours formato fora HH:MM → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/departments',
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      payload: {
        name: 'Suporte',
        workingHours: {
          monday: [{ from: '09', to: '18:00' }],
          tuesday: [],
          wednesday: [],
          thursday: [],
          friday: [],
          saturday: [],
          sunday: [],
          holiday: [],
        },
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH como AGENT → 403', async () => {
    const dept = await createDepartment(prisma, company.id);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/departments/${dept.id}`,
      headers: { Authorization: `Bearer ${tokenAgent}` },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('PATCH com chave extra (companyId) → 400 Unrecognized key', async () => {
    const dept = await createDepartment(prisma, company.id);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/departments/${dept.id}`,
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      payload: { companyId: 'forge-id' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH com name colidindo com outro depto do tenant → 409', async () => {
    await createDepartment(prisma, company.id, { name: 'Vendas' });
    const dept = await createDepartment(prisma, company.id, { name: 'Suporte' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/departments/${dept.id}`,
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      payload: { name: 'Vendas' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('PATCH em depto inexistente → 404', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/departments/00000000-0000-0000-0000-000000000000`,
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      payload: { name: 'Outro' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE como AGENT → 403', async () => {
    const dept = await createDepartment(prisma, company.id);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/departments/${dept.id}`,
      headers: { Authorization: `Bearer ${tokenAgent}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE em depto inexistente → 404', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/departments/00000000-0000-0000-0000-000000000000`,
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /:id em depto soft-deletado → 404', async () => {
    const dept = await createDepartment(prisma, company.id);
    await prisma.department.update({
      where: { id: dept.id },
      data: { deletedAt: new Date() },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/departments/${dept.id}`,
      headers: { Authorization: `Bearer ${tokenAgent}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET com cursor base64 quebrado → 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/departments?cursor=${encodeURIComponent('!!!quebrado!!!')}`,
      headers: { Authorization: `Bearer ${tokenAgent}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET sort=name + cursor de sort=createdAt → 400 Cursor inválido', async () => {
    const badCursor = Buffer.from(
      JSON.stringify({ createdAt: '2026-05-03T00:00:00.000Z', id: 'a' }),
      'utf8',
    ).toString('base64url');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/departments?sort=name&cursor=${encodeURIComponent(badCursor)}`,
      headers: { Authorization: `Bearer ${tokenAgent}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/Cursor inválido/i);
  });
});
```

- [ ] **Step 2: Rodar e2e**

```bash
pnpm test:e2e -- src/modules/departments/tests/departments.controller.e2e-spec.ts
```

Expected: 17 sad paths passam.

- [ ] **Step 3: Commit**

```bash
git add src/modules/departments/tests/departments.controller.e2e-spec.ts
git commit -m "test(departments): e2e sad paths (17 cenários)

403 em escrita por AGENT/SUPERVISOR. 400 em chave extra (Unrecognized
key — defesa do re-parse strict). 409 em colisão de name (POST e
PATCH). 404 em soft-deleted e inexistente. 400 em cursor quebrado e
shape ≠ sort."
```

---

### Task 2.13: E2E tests — multi-tenant isolation + cross-feature

**Files:**

- Modify: `src/modules/departments/tests/departments.controller.e2e-spec.ts`

- [ ] **Step 1: Adicionar bloco final**

```typescript
describe('DepartmentsController (e2e) — multi-tenant isolation', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let companyA: Company;
  let companyB: Company;
  let adminA: { user: User; password: string };
  let adminB: { user: User; password: string };
  let agentB: { user: User; password: string };
  let deptA: Department;
  let tokenAdminA: string;
  let tokenAdminB: string;
  let tokenAgentB: string;

  beforeAll(async () => {
    ({ app, prisma } = await setupApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(prisma);
    companyA = await createCompany(prisma);
    companyB = await createCompany(prisma);
    adminA = await createUser(prisma, companyA.id, { role: 'ADMIN' });
    adminB = await createUser(prisma, companyB.id, { role: 'ADMIN' });
    agentB = await createUser(prisma, companyB.id, { role: 'AGENT' });
    deptA = await createDepartment(prisma, companyA.id, { name: 'Suporte A' });
    ({ accessToken: tokenAdminA } = await loginAs(app, adminA.user.email, adminA.password));
    ({ accessToken: tokenAdminB } = await loginAs(app, adminB.user.email, adminB.password));
    ({ accessToken: tokenAgentB } = await loginAs(app, agentB.user.email, agentB.password));
  });

  it('ADMIN do tenant B não vê depto do tenant A no GET /:id (404)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/departments/${deptA.id}`,
      headers: { Authorization: `Bearer ${tokenAdminB}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('ADMIN do tenant B não consegue PATCH em depto do tenant A (404)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/departments/${deptA.id}`,
      headers: { Authorization: `Bearer ${tokenAdminB}` },
      payload: { name: 'Hijack' },
    });
    expect(res.statusCode).toBe(404);
    // Confirmar que o name não mudou no banco
    const fromDb = await prisma.department.findUnique({ where: { id: deptA.id } });
    expect(fromDb?.name).toBe('Suporte A');
  });

  it('ADMIN do tenant B não consegue DELETE em depto do tenant A (404)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/departments/${deptA.id}`,
      headers: { Authorization: `Bearer ${tokenAdminB}` },
    });
    expect(res.statusCode).toBe(404);
    const fromDb = await prisma.department.findUnique({ where: { id: deptA.id } });
    expect(fromDb?.deletedAt).toBeNull();
  });

  it('AGENT do tenant B não vê depto do tenant A na listagem', async () => {
    await createDepartment(prisma, companyB.id, { name: 'Vendas B' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/departments',
      headers: { Authorization: `Bearer ${tokenAgentB}` },
    });
    expect(res.statusCode).toBe(200);
    const names = res.json().items.map((d: { name: string }) => d.name);
    expect(names).toEqual(['Vendas B']);
    expect(names).not.toContain('Suporte A');
  });
});

describe('DepartmentsController (e2e) — cross-feature with Users (Sprint 0.4 bridge)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaClient;
  let company: Company;
  let admin: { user: User; password: string };
  let agent: { user: User; password: string };
  let tokenAdmin: string;
  let tokenAgent: string;

  beforeAll(async () => {
    ({ app, prisma } = await setupApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(prisma);
    company = await createCompany(prisma);
    admin = await createUser(prisma, company.id, { role: 'ADMIN' });
    agent = await createUser(prisma, company.id, { role: 'AGENT' });
    ({ accessToken: tokenAdmin } = await loginAs(app, admin.user.email, admin.password));
    ({ accessToken: tokenAgent } = await loginAs(app, agent.user.email, agent.password));
  });

  it('PATCH /users/:id { departmentIds } → GET /departments/:id retorna o user', async () => {
    const dept = await createDepartment(prisma, company.id, { name: 'Suporte' });

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${agent.user.id}`,
      headers: { Authorization: `Bearer ${tokenAdmin}` },
      payload: { departmentIds: [dept.id] },
    });
    expect(patchRes.statusCode).toBe(200);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/v1/departments/${dept.id}`,
      headers: { Authorization: `Bearer ${tokenAgent}` },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().users).toEqual([
      { id: agent.user.id, name: agent.user.name, role: 'AGENT' },
    ]);
  });

  it('DELETE /departments/:id → GET /users/:id não inclui o depto removido', async () => {
    const dept = await createDepartment(prisma, company.id);
    await prisma.userDepartment.create({
      data: { userId: agent.user.id, departmentId: dept.id },
    });

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/departments/${dept.id}`,
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    expect(delRes.statusCode).toBe(204);

    const userRes = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${agent.user.id}`,
      headers: { Authorization: `Bearer ${tokenAdmin}` },
    });
    expect(userRes.statusCode).toBe(200);
    expect(userRes.json().departments).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e2e**

```bash
pnpm test:e2e -- src/modules/departments/tests/departments.controller.e2e-spec.ts
```

Expected: 6 cenários (4 multi-tenant + 2 cross-feature) passam. Total do e2e de Departments: 8 + 17 + 6 = 31 testes.

- [ ] **Step 3: Commit**

```bash
git add src/modules/departments/tests/departments.controller.e2e-spec.ts
git commit -m "test(departments): e2e multi-tenant isolation + cross-feature

Multi-tenant: GET/PATCH/DELETE de depto cross-tenant retorna 404
sem mutação no banco. Listagem só mostra deptos do tenant.
Cross-feature: PATCH /users {departmentIds} reflete em GET
/departments/:id.users[]; DELETE /departments limpa o link em
GET /users/:id.departments[]."
```

---

### Task 2.14: Verificação por evidência (gate completo)

- [ ] **Step 1: Rodar todos os checks**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:schema && pnpm test:e2e && pnpm build
```

Expected: zero erros. Anotar contagem de testes (deveria ser ~117 = 86 anteriores + 31 novos do e2e + alguns do unit do domain).

- [ ] **Step 2: Confirmar que sprints anteriores não quebraram**

```bash
pnpm test:e2e -- --reporter=verbose 2>&1 | grep -E "^\s*✓|✗|✘"  | wc -l
```

Compara com baseline. Se algum teste antigo virar vermelho, investigar antes de prosseguir.

---

### Task 2.15: Smoke test manual com curl

> Executar o roteiro do spec §10. Documentar saída no PR.

- [ ] **Step 1: Subir o app local**

```bash
pnpm start:dev
```

(Em paralelo, rodar `docker-compose up -d` se Postgres/Redis não estiverem ativos.)

- [ ] **Step 2: Executar os 21 passos do §10 do spec**

Para cada passo, registrar request + status + body resumido.

- [ ] **Step 3: Salvar log do smoke num arquivo temporário (não commitar)**

```bash
# Exemplo: salvar em /tmp/sprint-0-6-smoke.log
# Anexar conteúdo no corpo do PR (descrição).
```

---

### Task 2.16: Marcar ROADMAP + commit final

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 1: Editar ROADMAP.md §5 "CRUD básico"**

Trocar:

```markdown
- [ ] Departments (com working hours)
```

por:

```markdown
- [x] Departments (com working hours)
```

- [ ] **Step 2: Commit final**

```bash
git add ROADMAP.md
git commit -m "chore(roadmap): mark Departments CRUD complete (Sprint 0.6)"
```

- [ ] **Step 3: Confirmar com o humano antes de pushar**

> Pergunta: "Sprint 0.6 pronta. Posso pushar `feat/sprint-0-6-departments-crud` e abrir o PR via `gh pr create`?"

- [ ] **Step 4: Após confirmação, push e abrir PR**

```bash
git push -u origin feat/sprint-0-6-departments-crud
gh pr create --title "feat: sprint 0.6 departments crud (com working hours)" --body "$(cat <<'EOF'
## Summary

Implementa o item "Departments (com working hours)" da Fase 0 (`ROADMAP.md` §5). Spec: `docs/superpowers/specs/2026-05-03-sprint-0-6-departments-crud-design.md`.

**Decisões consolidadas no spec:**
- Sem endpoints de assignment user↔department dedicados; PATCH /users/:id continua sendo única fonte (decisão 1.1).
- softDelete limpa UserDepartment na mesma transação antes de setar deletedAt (decisão 1.2).
- Leitura aberta a qualquer auth do tenant; escrita ADMIN+ (decisão 1.3).
- WorkingHoursSchema promovido pra src/common/schemas/ + cursor.ts generalizado (decisão 1.4 + 1.6) — pré-passo já mergeado em PR separado.
- distributionMode valida só enum + default MANUAL; SLA livre com limites sanitários 1..43200 min (decisão 1.5).
- Sem Department.sortOrder; ?sort=createdAt|name opcional na listagem (decisão 1.6).

**Limitação documentada (§6.3):** constraint Postgres @@unique([companyId, name]) é global — reusar nome de depto soft-deletado pode disparar P2002. Mantém 409 com mensagem clara via mapConflict; ADR futura se virar dor real.

## Test plan

- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm test` (unit Auth + Users + Companies + Departments)
- [x] `pnpm test:schema` (Sprint 0.2 — sem mudança de schema)
- [x] `pnpm test:e2e` (todos + 31 novos em departments)
- [x] `pnpm build`
- [x] Smoke test manual (21 passos do spec §10): ver log abaixo.

<!-- Anexar log do smoke aqui -->

## Notas

- Sem migration nesta sprint (schema já existe desde Sprint 0.2).
- Sem atualização de convenções (Departments segue padrão multi-tenant tradicional).
- Pré-passo `refactor/common-extract-shared-helpers` já mergeado em #N (PR 1).
EOF
)"
```

- [ ] **Step 5: Aguardar CI verde + merge**

Após CI verde, merge via GitHub. Voltar pra `main`.

---

## Self-Review checklist (executor)

Antes de declarar a sprint pronta, confirmar manualmente:

- [ ] Toda query Prisma de Department filtra `companyId` (multi-tenant checklist).
- [ ] `companyId` vem de `@CurrentCompany()` (JWT), nunca do body.
- [ ] Schemas Zod usam `.strict()`.
- [ ] Application Service faz re-parse do `UpdateDepartmentSchema` (defesa-em-profundidade).
- [ ] `mapConflict` traduz P2002 do `(companyId, name)` pra 409.
- [ ] `softDelete` chama `userDepartment.deleteMany` antes do `update`.
- [ ] `findById` rejeita soft-deleted (`deletedAt: null` no where).
- [ ] Cross-tenant retorna 404 (não 403).
- [ ] GET /:id retorna users sem email.
- [ ] Tests cross-feature com Users passam.
- [ ] ROADMAP.md marcado.
- [ ] Spec referenciado no PR.
