# Sprint 0.7 — Tags CRUD (com escopo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entrega CRUD completo de Tag com escopo (CONTACT/TICKET/BOTH), seguindo padrão 3 camadas das Sprints 0.4–0.6, com soft delete (`active=false`), hard delete via `?hard=true` para ADMIN+ bloqueado se houver pivôs, e filtro de listagem com semântica de aplicabilidade.

**Architecture:** Módulo NestJS `tags/` com controller → application service → domain service. Schemas Zod via `createZodDto` com `.strict()`. Multi-tenant por `companyId` em toda query. Tag não recebe migration nova — usa `active` boolean já no schema. Único side-effect fora do módulo: exportar `WEIGHT` de `roles.guard.ts` para reutilizar no check programático de permissão do hard delete.

**Tech Stack:** NestJS 11 + Fastify, Prisma, Zod + nestjs-zod, Vitest (unit + e2e), Postgres real (não mocka Prisma).

**Spec:** `docs/superpowers/specs/2026-05-04-sprint-0-7-tags-crud-design.md`

---

## File Structure

**Criar:**

- `src/modules/tags/tags.module.ts`
- `src/modules/tags/controllers/tags.controller.ts`
- `src/modules/tags/services/tags.application.service.ts`
- `src/modules/tags/services/tags.domain.service.ts`
- `src/modules/tags/schemas/create-tag.schema.ts`
- `src/modules/tags/schemas/update-tag.schema.ts`
- `src/modules/tags/schemas/list-tags.schema.ts`
- `src/modules/tags/schemas/delete-tag.schema.ts`
- `src/modules/tags/schemas/tag-response.schema.ts`
- `src/modules/tags/tests/tags.domain.service.spec.ts`
- `src/modules/tags/tests/tags.controller.e2e-spec.ts`

**Modificar:**

- `src/app.module.ts` — adicionar `TagsModule` em `imports`.
- `src/common/guards/roles.guard.ts` — exportar `WEIGHT`.
- `test/e2e/factories.ts` — adicionar função `createTag`.
- `ROADMAP.md` — marcar `[x] Tags (com escopo)`.

**NÃO criar:**

- Migration Prisma (schema Tag já existe da Sprint 0.2).
- Endpoints `/contacts/:id/tags` ou `/tickets/:id/tags` (Phase 2).

---

## Convenções obrigatórias (releia antes de cada task)

1. **Multi-tenant:** TODA query Prisma do domain tem `where: { companyId, ... }`. Sem exceção.
2. **Sem `companyId` em DTOs de input** — vem do `@CurrentCompany()` no controller.
3. **Mensagens de erro em pt-BR.**
4. **Conventional Commits em inglês, imperativo** (ex: `feat(tags): add domain service create method`).
5. **Pre-commit hook (lefthook)** roda prettier/eslint/typecheck — **deixa rodar**, não use `--no-verify`.
6. **Branch protection ativa em `main`** — todo trabalho em branch separada.

---

## Task 1: Setup — branch + worktree + leitura do spec

**Files:**

- Read: `docs/superpowers/specs/2026-05-04-sprint-0-7-tags-crud-design.md`
- Read: `prisma/schema.prisma` (linhas 33-37, 318-335, 700-720)
- Read: `src/modules/departments/` (referência de padrão)

- [ ] **Step 1.1: Verificar que o spec existe e está acessível**

```bash
ls docs/superpowers/specs/2026-05-04-sprint-0-7-tags-crud-design.md
```

Expected: arquivo listado.

- [ ] **Step 1.2: Criar branch a partir de `main` atualizada**

```bash
git checkout main
git pull --ff-only origin main
git checkout -b feat/sprint-0-7-tags-com-escopo
```

Expected: branch criada e checked out.

- [ ] **Step 1.3: Confirmar tooling**

```bash
pnpm --version && node --version
```

- [ ] **Step 1.4: Commit do spec (ainda untracked em main)**

```bash
git add docs/superpowers/specs/2026-05-04-sprint-0-7-tags-crud-design.md docs/superpowers/plans/2026-05-04-sprint-0-7-tags-crud.md
git commit -m "docs(tags): add sprint 0.7 design and plan"
```

---

## Task 2: Pré-requisito — exportar `WEIGHT` de `roles.guard.ts`

Necessário para que o `TagsApplicationService` reutilize a hierarquia de roles ao validar o hard delete (decisão D-2.6 do spec).

**Files:**

- Modify: `src/common/guards/roles.guard.ts`

- [ ] **Step 2.1: Editar `roles.guard.ts` — adicionar `export` em `WEIGHT`**

Mudar:

```ts
const WEIGHT: Record<UserRole, number> = {
  AGENT: 1,
  SUPERVISOR: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};
```

Para:

```ts
export const ROLE_WEIGHT: Record<UserRole, number> = {
  AGENT: 1,
  SUPERVISOR: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};
```

E atualizar o uso interno no `canActivate` para `ROLE_WEIGHT` (renomeado para evitar colisão com qualquer importe `WEIGHT` ambíguo).

- [ ] **Step 2.2: Rodar typecheck para confirmar nenhum outro arquivo quebrou**

```bash
pnpm typecheck
```

Expected: sem erros (a constante era privada, ninguém mais a importava).

- [ ] **Step 2.3: Rodar testes existentes que cobrem RolesGuard**

```bash
pnpm test:e2e -- departments
```

Expected: passa (usa role guard).

- [ ] **Step 2.4: Commit**

```bash
git add src/common/guards/roles.guard.ts
git commit -m "refactor(common): export ROLE_WEIGHT from roles guard"
```

---

## Task 3: Pré-requisito — adicionar factory `createTag` em `test/e2e/factories.ts`

**Files:**

- Modify: `test/e2e/factories.ts`

- [ ] **Step 3.1: Adicionar import `Tag` e `TagScope` do Prisma**

No topo do arquivo, expandir o import:

```ts
import type {
  Company,
  Department,
  DepartmentDistributionMode,
  Plan,
  Prisma,
  PrismaClient,
  Tag,
  TagScope,
  User,
  UserRole,
} from '@prisma/client';
```

- [ ] **Step 3.2: Adicionar função `createTag` ao final do arquivo (antes de `truncateAll`)**

```ts
export async function createTag(
  prisma: PrismaClient,
  companyId: string,
  overrides: Partial<{
    name: string;
    color: string;
    scope: TagScope;
    active: boolean;
  }> = {},
): Promise<Tag> {
  return prisma.tag.create({
    data: {
      companyId,
      name: overrides.name ?? `Tag ${nextId()}`,
      color: overrides.color ?? '#FF0000',
      scope: overrides.scope ?? 'BOTH',
      active: overrides.active ?? true,
    },
  });
}
```

- [ ] **Step 3.3: Verificar typecheck**

```bash
pnpm typecheck
```

Expected: sem erros.

- [ ] **Step 3.4: Commit**

```bash
git add test/e2e/factories.ts
git commit -m "test(tags): add createTag factory helper"
```

---

## Task 4: Schemas Zod — criar todos os 5 arquivos

Schemas são config; não há TDD aqui. Criar todos juntos e validar via typecheck.

**Files:**

- Create: `src/modules/tags/schemas/create-tag.schema.ts`
- Create: `src/modules/tags/schemas/update-tag.schema.ts`
- Create: `src/modules/tags/schemas/list-tags.schema.ts`
- Create: `src/modules/tags/schemas/delete-tag.schema.ts`
- Create: `src/modules/tags/schemas/tag-response.schema.ts`

- [ ] **Step 4.1: Criar diretório**

```bash
mkdir -p src/modules/tags/schemas src/modules/tags/services src/modules/tags/controllers src/modules/tags/tests
```

- [ ] **Step 4.2: Criar `create-tag.schema.ts`**

```ts
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const CreateTagSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Nome é obrigatório')
      .max(100, 'Máximo 100 caracteres')
      .describe('Nome único da tag dentro do tenant'),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar no formato #RRGGBB')
      .transform((s) => s.toUpperCase())
      .describe('Cor hex no formato #RRGGBB; normalizada para uppercase'),
    scope: z
      .enum(['CONTACT', 'TICKET', 'BOTH'])
      .default('BOTH')
      .describe('Onde a tag pode ser aplicada: contato, ticket ou ambos'),
    active: z.boolean().default(true),
  })
  .strict();

export class CreateTagDto extends createZodDto(CreateTagSchema) {}
```

- [ ] **Step 4.3: Criar `update-tag.schema.ts`**

```ts
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const UpdateTagSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Nome é obrigatório')
      .max(100, 'Máximo 100 caracteres')
      .optional(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar no formato #RRGGBB')
      .transform((s) => s.toUpperCase())
      .optional(),
    scope: z.enum(['CONTACT', 'TICKET', 'BOTH']).optional(),
    active: z.boolean().optional(),
  })
  .strict();

export class UpdateTagDto extends createZodDto(UpdateTagSchema) {}
```

- [ ] **Step 4.4: Criar `list-tags.schema.ts`**

Verificar primeiro como Departments lida com `z.coerce.boolean()` em query. Ler `src/modules/departments/schemas/list-departments.schema.ts`. Replicar o padrão exatamente. Provavelmente usa `z.coerce.boolean()` puro ou um `z.enum(['true','false']).transform(...)`.

```ts
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const ListTagsQuerySchema = z.object({
  active: z.coerce.boolean().optional(),
  scope: z.enum(['CONTACT', 'TICKET', 'BOTH']).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['createdAt', 'name']).default('createdAt'),
});

export class ListTagsQueryDto extends createZodDto(ListTagsQuerySchema) {}
```

> **Se Sprint 0.6 usar tratamento diferente de boolean:** copiar literal o que estiver lá. Consistência > preferência pessoal.

- [ ] **Step 4.5: Criar `delete-tag.schema.ts`**

```ts
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const DeleteTagQuerySchema = z.object({
  hard: z.coerce.boolean().default(false),
});

export class DeleteTagQueryDto extends createZodDto(DeleteTagQuerySchema) {}
```

- [ ] **Step 4.6: Criar `tag-response.schema.ts`**

```ts
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const TagResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  name: z.string(),
  color: z.string(),
  scope: z.enum(['CONTACT', 'TICKET', 'BOTH']),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export class TagResponseDto extends createZodDto(TagResponseSchema) {}

export const TagListResponseSchema = z.object({
  items: z.array(TagResponseSchema),
  pagination: z.object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
});

export class TagListResponseDto extends createZodDto(TagListResponseSchema) {}
```

> Observação: `createdAt`/`updatedAt` como `z.string()` (ISO) e não `z.coerce.date()` — Departments retorna `.toISOString()` no DTO. Manter consistência.

- [ ] **Step 4.7: Validar typecheck**

```bash
pnpm typecheck
```

Expected: sem erros.

- [ ] **Step 4.8: Commit**

```bash
git add src/modules/tags/schemas/
git commit -m "feat(tags): add zod schemas for CRUD"
```

---

## Task 5: Domain service — esqueleto + teste de `findById`

**Files:**

- Create: `src/modules/tags/services/tags.domain.service.ts` (esqueleto)
- Create: `src/modules/tags/tests/tags.domain.service.spec.ts`

- [ ] **Step 5.1: Criar esqueleto vazio do domain service**

```ts
// src/modules/tags/services/tags.domain.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Tag } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class TagsDomainService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, companyId: string, tx?: Prisma.TransactionClient): Promise<Tag> {
    const db: Db = tx ?? this.prisma;
    const tag = await db.tag.findFirst({ where: { id, companyId } });
    if (!tag) throw new NotFoundException('Tag não encontrada');
    return tag;
  }
}
```

- [ ] **Step 5.2: Criar arquivo de teste com primeiro caso (findById feliz + 404 + cross-tenant)**

```ts
// src/modules/tags/tests/tags.domain.service.spec.ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { Company } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { TagsDomainService } from '../services/tags.domain.service';
import { createCompany, createTag, truncateAll } from '../../../../test/e2e/factories';
import { getPrisma } from '../../../../test/setup-prisma';

describe('TagsDomainService.findById', () => {
  let service: TagsDomainService;
  let prisma: PrismaService;
  let companyA: Company;
  let companyB: Company;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TagsDomainService, { provide: PrismaService, useValue: getPrisma() }],
    }).compile();
    service = moduleRef.get(TagsDomainService);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await truncateAll(getPrisma());
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    companyA = await createCompany(getPrisma());
    companyB = await createCompany(getPrisma());
  });

  it('retorna tag quando existe no tenant', async () => {
    const tag = await createTag(getPrisma(), companyA.id, { name: 'VIP' });
    const found = await service.findById(tag.id, companyA.id);
    expect(found.id).toBe(tag.id);
    expect(found.name).toBe('VIP');
  });

  it('lança 404 quando tag não existe', async () => {
    await expect(
      service.findById('00000000-0000-0000-0000-000000000000', companyA.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lança 404 quando tag pertence a outro tenant (cross-tenant guard)', async () => {
    const tag = await createTag(getPrisma(), companyB.id);
    await expect(service.findById(tag.id, companyA.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 5.3: Rodar o teste**

```bash
pnpm test src/modules/tags/tests/tags.domain.service.spec.ts
```

Expected: 3 testes passando.

- [ ] **Step 5.4: Commit**

```bash
git add src/modules/tags/services/tags.domain.service.ts src/modules/tags/tests/tags.domain.service.spec.ts
git commit -m "feat(tags): add domain service findById with multi-tenant guard"
```

---

## Task 6: Domain service — `list` com filtros básicos (active, search, sem scope)

**Files:**

- Modify: `src/modules/tags/services/tags.domain.service.ts`
- Modify: `src/modules/tags/tests/tags.domain.service.spec.ts`

- [ ] **Step 6.1: Adicionar bloco `describe('TagsDomainService.list')` com testes para active e search**

Adicionar ao final do arquivo de teste:

```ts
describe('TagsDomainService.list', () => {
  let service: TagsDomainService;
  let companyA: Company;
  let companyB: Company;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TagsDomainService, { provide: PrismaService, useValue: getPrisma() }],
    }).compile();
    service = moduleRef.get(TagsDomainService);
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    companyA = await createCompany(getPrisma());
    companyB = await createCompany(getPrisma());
  });

  it('retorna apenas tags do tenant solicitado (multi-tenant)', async () => {
    await createTag(getPrisma(), companyA.id, { name: 'A1' });
    await createTag(getPrisma(), companyB.id, { name: 'B1' });
    const { items } = await service.list(companyA.id, { sort: 'createdAt' }, { limit: 10 });
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('A1');
  });

  it('sem filtro de active retorna ativas e inativas', async () => {
    await createTag(getPrisma(), companyA.id, { name: 'Ativa', active: true });
    await createTag(getPrisma(), companyA.id, { name: 'Inativa', active: false });
    const { items } = await service.list(companyA.id, { sort: 'createdAt' }, { limit: 10 });
    expect(items).toHaveLength(2);
  });

  it('filtro active=true retorna apenas ativas', async () => {
    await createTag(getPrisma(), companyA.id, { name: 'Ativa', active: true });
    await createTag(getPrisma(), companyA.id, { name: 'Inativa', active: false });
    const { items } = await service.list(
      companyA.id,
      { active: true, sort: 'createdAt' },
      { limit: 10 },
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('Ativa');
  });

  it('filtro search é case-insensitive contains', async () => {
    await createTag(getPrisma(), companyA.id, { name: 'Cliente VIP' });
    await createTag(getPrisma(), companyA.id, { name: 'Suporte' });
    const { items } = await service.list(
      companyA.id,
      { search: 'vip', sort: 'createdAt' },
      { limit: 10 },
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('Cliente VIP');
  });
});
```

- [ ] **Step 6.2: Rodar o teste — deve falhar (método `list` não existe ainda)**

```bash
pnpm test src/modules/tags/tests/tags.domain.service.spec.ts
```

Expected: FAIL — `service.list is not a function`.

- [ ] **Step 6.3: Implementar `list` com filtros básicos no domain service**

Adicionar ao `tags.domain.service.ts`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Tag, type TagScope } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { decodeCursor } from '@/common/cursor';

type Db = PrismaService | Prisma.TransactionClient;

type ListFilters = {
  active?: boolean | undefined;
  scope?: TagScope | undefined;
  search?: string | undefined;
  sort: 'createdAt' | 'name';
};
type ListPagination = { cursor?: string | undefined; limit: number };
type ListResult = { items: Tag[]; hasMore: boolean };

@Injectable()
export class TagsDomainService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, companyId: string, tx?: Prisma.TransactionClient): Promise<Tag> {
    const db: Db = tx ?? this.prisma;
    const tag = await db.tag.findFirst({ where: { id, companyId } });
    if (!tag) throw new NotFoundException('Tag não encontrada');
    return tag;
  }

  async list(
    companyId: string,
    filters: ListFilters,
    pagination: ListPagination,
  ): Promise<ListResult> {
    const where: Prisma.TagWhereInput = {
      companyId,
      ...(filters.active !== undefined ? { active: filters.active } : {}),
      ...(filters.search
        ? { name: { contains: filters.search, mode: 'insensitive' as const } }
        : {}),
      ...(filters.scope ? this.scopeFilter(filters.scope) : {}),
    };

    if (filters.sort === 'name') {
      const decoded = decodeCursor<{ name: string; id: string }>(pagination.cursor);
      if (decoded !== null) {
        if (typeof decoded.name !== 'string' || typeof decoded.id !== 'string') {
          throw new BadRequestException('Cursor inválido');
        }
        where.OR = [{ name: { gt: decoded.name } }, { name: decoded.name, id: { gt: decoded.id } }];
      }
      const items = await this.prisma.tag.findMany({
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
    const items = await this.prisma.tag.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.limit + 1,
    });
    const hasMore = items.length > pagination.limit;
    return { items: hasMore ? items.slice(0, pagination.limit) : items, hasMore };
  }

  private scopeFilter(scope: TagScope): Prisma.TagWhereInput {
    if (scope === 'TICKET') return { scope: { in: ['TICKET', 'BOTH'] } };
    if (scope === 'CONTACT') return { scope: { in: ['CONTACT', 'BOTH'] } };
    return { scope: 'BOTH' };
  }
}
```

- [ ] **Step 6.4: Rodar testes — devem passar agora**

```bash
pnpm test src/modules/tags/tests/tags.domain.service.spec.ts
```

Expected: 7 passing (3 findById + 4 list básicos).

- [ ] **Step 6.5: Commit**

```bash
git add src/modules/tags/services/tags.domain.service.ts src/modules/tags/tests/tags.domain.service.spec.ts
git commit -m "feat(tags): add domain service list with active/search filters"
```

---

## Task 7: Domain service — semântica de `?scope=` (decisão D-2.3)

**Files:**

- Modify: `src/modules/tags/tests/tags.domain.service.spec.ts`

- [ ] **Step 7.1: Adicionar testes de scope semantic dentro do `describe('TagsDomainService.list')`**

```ts
it('scope=TICKET retorna TICKET + BOTH (semântica de aplicabilidade)', async () => {
  await createTag(getPrisma(), companyA.id, { name: 'T', scope: 'TICKET' });
  await createTag(getPrisma(), companyA.id, { name: 'C', scope: 'CONTACT' });
  await createTag(getPrisma(), companyA.id, { name: 'B', scope: 'BOTH' });
  const { items } = await service.list(
    companyA.id,
    { scope: 'TICKET', sort: 'name' },
    { limit: 10 },
  );
  expect(items.map((t) => t.name).sort()).toEqual(['B', 'T']);
});

it('scope=CONTACT retorna CONTACT + BOTH', async () => {
  await createTag(getPrisma(), companyA.id, { name: 'T', scope: 'TICKET' });
  await createTag(getPrisma(), companyA.id, { name: 'C', scope: 'CONTACT' });
  await createTag(getPrisma(), companyA.id, { name: 'B', scope: 'BOTH' });
  const { items } = await service.list(
    companyA.id,
    { scope: 'CONTACT', sort: 'name' },
    { limit: 10 },
  );
  expect(items.map((t) => t.name).sort()).toEqual(['B', 'C']);
});

it('scope=BOTH retorna apenas BOTH (literal)', async () => {
  await createTag(getPrisma(), companyA.id, { name: 'T', scope: 'TICKET' });
  await createTag(getPrisma(), companyA.id, { name: 'B', scope: 'BOTH' });
  const { items } = await service.list(
    companyA.id,
    { scope: 'BOTH', sort: 'createdAt' },
    { limit: 10 },
  );
  expect(items).toHaveLength(1);
  expect(items[0]!.name).toBe('B');
});
```

- [ ] **Step 7.2: Rodar testes — devem passar (já implementado em Task 6 via `scopeFilter`)**

```bash
pnpm test src/modules/tags/tests/tags.domain.service.spec.ts
```

Expected: 10 passing.

- [ ] **Step 7.3: Commit**

```bash
git add src/modules/tags/tests/tags.domain.service.spec.ts
git commit -m "test(tags): cover scope filter semantics (TICKET/CONTACT include BOTH)"
```

---

## Task 8: Domain service — sort + paginação cursor

**Files:**

- Modify: `src/modules/tags/tests/tags.domain.service.spec.ts`

- [ ] **Step 8.1: Adicionar testes de sort e paginação dentro do `describe('TagsDomainService.list')`**

```ts
it('sort=name ordena alfabeticamente', async () => {
  await createTag(getPrisma(), companyA.id, { name: 'C' });
  await createTag(getPrisma(), companyA.id, { name: 'A' });
  await createTag(getPrisma(), companyA.id, { name: 'B' });
  const { items } = await service.list(companyA.id, { sort: 'name' }, { limit: 10 });
  expect(items.map((t) => t.name)).toEqual(['A', 'B', 'C']);
});

it('sort=createdAt ordena desc (mais nova primeiro)', async () => {
  const t1 = await createTag(getPrisma(), companyA.id, { name: 'T1' });
  await new Promise((r) => setTimeout(r, 5));
  const t2 = await createTag(getPrisma(), companyA.id, { name: 'T2' });
  const { items } = await service.list(companyA.id, { sort: 'createdAt' }, { limit: 10 });
  expect(items[0]!.id).toBe(t2.id);
  expect(items[1]!.id).toBe(t1.id);
});

it('paginação cursor cobre todas as tags exatamente uma vez', async () => {
  await createTag(getPrisma(), companyA.id, { name: 'A' });
  await createTag(getPrisma(), companyA.id, { name: 'B' });
  await createTag(getPrisma(), companyA.id, { name: 'C' });
  await createTag(getPrisma(), companyA.id, { name: 'D' });
  await createTag(getPrisma(), companyA.id, { name: 'E' });

  const seen: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const result = await service.list(
      companyA.id,
      { sort: 'name' },
      cursor !== undefined ? { cursor, limit: 2 } : { limit: 2 },
    );
    seen.push(...result.items.map((t) => t.name));
    if (!result.hasMore) break;
    const last = result.items[result.items.length - 1]!;
    // mimicar encodeCursor que o app service usa, mas aqui só pra fechar o loop
    cursor = Buffer.from(JSON.stringify({ name: last.name, id: last.id })).toString('base64url');
  }
  expect(seen.sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
});
```

> Nota sobre o cursor: o domain service consome cursor via `decodeCursor`, que faz `Buffer.from(cursor, 'base64url').toString()` e `JSON.parse`. O teste replica essa codificação.

- [ ] **Step 8.2: Rodar testes**

```bash
pnpm test src/modules/tags/tests/tags.domain.service.spec.ts
```

Expected: 13 passing.

- [ ] **Step 8.3: Commit**

```bash
git add src/modules/tags/tests/tags.domain.service.spec.ts
git commit -m "test(tags): cover list sort and cursor pagination"
```

---

## Task 9: Domain service — `create` + `assertNameAvailable`

**Files:**

- Modify: `src/modules/tags/services/tags.domain.service.ts`
- Modify: `src/modules/tags/tests/tags.domain.service.spec.ts`

- [ ] **Step 9.1: Adicionar testes para `create` e duplicate guard**

```ts
describe('TagsDomainService.create', () => {
  let service: TagsDomainService;
  let companyA: Company;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TagsDomainService, { provide: PrismaService, useValue: getPrisma() }],
    }).compile();
    service = moduleRef.get(TagsDomainService);
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    companyA = await createCompany(getPrisma());
  });

  it('cria tag com defaults (scope=BOTH, active=true)', async () => {
    const tag = await getPrisma().$transaction((tx) =>
      service.create({ name: 'Nova', color: '#AABBCC' }, companyA.id, tx),
    );
    expect(tag.name).toBe('Nova');
    expect(tag.scope).toBe('BOTH');
    expect(tag.active).toBe(true);
    expect(tag.color).toBe('#AABBCC');
  });

  it('lança 409 ao tentar criar com nome duplicado no mesmo tenant', async () => {
    await getPrisma().$transaction((tx) =>
      service.create({ name: 'Dup', color: '#000000' }, companyA.id, tx),
    );
    await expect(
      getPrisma().$transaction((tx) =>
        service.create({ name: 'Dup', color: '#FFFFFF' }, companyA.id, tx),
      ),
    ).rejects.toThrow(/Já existe uma tag/i);
  });
});
```

- [ ] **Step 9.2: Rodar — falha (método `create` não existe)**

```bash
pnpm test src/modules/tags/tests/tags.domain.service.spec.ts
```

Expected: FAIL.

- [ ] **Step 9.3: Implementar `create` + `assertNameAvailable` no domain service**

Adicionar ao `tags.domain.service.ts`:

```ts
import { ConflictException } from '@nestjs/common';

export type CreateTagInput = {
  name: string;
  color: string;
  scope?: TagScope;
  active?: boolean;
};

// ... dentro da classe:

async create(
  input: CreateTagInput,
  companyId: string,
  tx: Prisma.TransactionClient,
): Promise<Tag> {
  await this.assertNameAvailable(input.name, companyId, tx);
  return tx.tag.create({
    data: {
      companyId,
      name: input.name,
      color: input.color,
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
  });
}

async assertNameAvailable(
  name: string,
  companyId: string,
  tx: Prisma.TransactionClient,
  exceptId?: string,
): Promise<void> {
  const existing = await tx.tag.findFirst({ where: { companyId, name } });
  if (existing && existing.id !== exceptId) {
    throw new ConflictException('Já existe uma tag com este nome');
  }
}
```

Adicionar `ConflictException` no import existente do `@nestjs/common`.

- [ ] **Step 9.4: Rodar — devem passar**

```bash
pnpm test src/modules/tags/tests/tags.domain.service.spec.ts
```

Expected: 15 passing.

- [ ] **Step 9.5: Commit**

```bash
git add src/modules/tags/services/tags.domain.service.ts src/modules/tags/tests/tags.domain.service.spec.ts
git commit -m "feat(tags): add domain service create with name uniqueness guard"
```

---

## Task 10: Domain service — `update`

**Files:**

- Modify: `src/modules/tags/services/tags.domain.service.ts`
- Modify: `src/modules/tags/tests/tags.domain.service.spec.ts`

- [ ] **Step 10.1: Adicionar testes para `update`**

```ts
describe('TagsDomainService.update', () => {
  let service: TagsDomainService;
  let companyA: Company;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TagsDomainService, { provide: PrismaService, useValue: getPrisma() }],
    }).compile();
    service = moduleRef.get(TagsDomainService);
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    companyA = await createCompany(getPrisma());
  });

  it('atualiza name, color, scope, active', async () => {
    const tag = await createTag(getPrisma(), companyA.id, { name: 'Old' });
    const updated = await getPrisma().$transaction((tx) =>
      service.update(
        tag.id,
        companyA.id,
        { name: 'New', color: '#123456', scope: 'TICKET', active: false },
        tx,
      ),
    );
    expect(updated.name).toBe('New');
    expect(updated.color).toBe('#123456');
    expect(updated.scope).toBe('TICKET');
    expect(updated.active).toBe(false);
  });

  it('rename para nome de outra tag do mesmo tenant lança 409', async () => {
    await createTag(getPrisma(), companyA.id, { name: 'Existing' });
    const target = await createTag(getPrisma(), companyA.id, { name: 'Target' });
    await expect(
      getPrisma().$transaction((tx) =>
        service.update(target.id, companyA.id, { name: 'Existing' }, tx),
      ),
    ).rejects.toThrow(/Já existe uma tag/i);
  });

  it('rename para mesmo nome (no-op) é permitido', async () => {
    const tag = await createTag(getPrisma(), companyA.id, { name: 'Same' });
    const updated = await getPrisma().$transaction((tx) =>
      service.update(tag.id, companyA.id, { name: 'Same' }, tx),
    );
    expect(updated.name).toBe('Same');
  });
});
```

- [ ] **Step 10.2: Rodar — falha**

```bash
pnpm test src/modules/tags/tests/tags.domain.service.spec.ts
```

Expected: FAIL.

- [ ] **Step 10.3: Implementar `update` no domain service**

Adicionar:

```ts
async update(
  id: string,
  companyId: string,
  patch: Prisma.TagUpdateInput,
  tx: Prisma.TransactionClient,
): Promise<Tag> {
  const existing = await this.findById(id, companyId, tx);
  if (typeof patch.name === 'string' && patch.name !== existing.name) {
    await this.assertNameAvailable(patch.name, companyId, tx, id);
  }
  return tx.tag.update({ where: { id }, data: patch });
}
```

- [ ] **Step 10.4: Rodar — devem passar**

```bash
pnpm test src/modules/tags/tests/tags.domain.service.spec.ts
```

Expected: 18 passing.

- [ ] **Step 10.5: Commit**

```bash
git add src/modules/tags/services/tags.domain.service.ts src/modules/tags/tests/tags.domain.service.spec.ts
git commit -m "feat(tags): add domain service update with rename collision guard"
```

---

## Task 11: Domain service — `softDelete` (idempotente)

**Files:**

- Modify: `src/modules/tags/services/tags.domain.service.ts`
- Modify: `src/modules/tags/tests/tags.domain.service.spec.ts`

- [ ] **Step 11.1: Adicionar testes para `softDelete`**

```ts
describe('TagsDomainService.softDelete', () => {
  let service: TagsDomainService;
  let companyA: Company;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TagsDomainService, { provide: PrismaService, useValue: getPrisma() }],
    }).compile();
    service = moduleRef.get(TagsDomainService);
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    companyA = await createCompany(getPrisma());
  });

  it('marca active=false', async () => {
    const tag = await createTag(getPrisma(), companyA.id, { active: true });
    await getPrisma().$transaction((tx) => service.softDelete(tag.id, companyA.id, tx));
    const after = await getPrisma().tag.findUnique({ where: { id: tag.id } });
    expect(after!.active).toBe(false);
  });

  it('idempotente — chamar duas vezes não falha', async () => {
    const tag = await createTag(getPrisma(), companyA.id, { active: true });
    await getPrisma().$transaction((tx) => service.softDelete(tag.id, companyA.id, tx));
    await getPrisma().$transaction((tx) => service.softDelete(tag.id, companyA.id, tx));
    const after = await getPrisma().tag.findUnique({ where: { id: tag.id } });
    expect(after!.active).toBe(false);
  });

  it('lança 404 se tag não existe', async () => {
    await expect(
      getPrisma().$transaction((tx) =>
        service.softDelete('00000000-0000-0000-0000-000000000000', companyA.id, tx),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 11.2: Rodar — falha**

```bash
pnpm test src/modules/tags/tests/tags.domain.service.spec.ts
```

Expected: FAIL.

- [ ] **Step 11.3: Implementar `softDelete`**

Adicionar:

```ts
async softDelete(id: string, companyId: string, tx: Prisma.TransactionClient): Promise<void> {
  await this.findById(id, companyId, tx);
  await tx.tag.update({ where: { id }, data: { active: false } });
}
```

- [ ] **Step 11.4: Rodar — devem passar**

```bash
pnpm test src/modules/tags/tests/tags.domain.service.spec.ts
```

Expected: 21 passing.

- [ ] **Step 11.5: Commit**

```bash
git add src/modules/tags/services/tags.domain.service.ts src/modules/tags/tests/tags.domain.service.spec.ts
git commit -m "feat(tags): add domain service softDelete (idempotent active=false)"
```

---

## Task 12: Domain service — `findByIdWithCounts` + `hardDelete`

**Files:**

- Modify: `src/modules/tags/services/tags.domain.service.ts`
- Modify: `src/modules/tags/tests/tags.domain.service.spec.ts`

- [ ] **Step 12.1: Adicionar testes**

```ts
describe('TagsDomainService.findByIdWithCounts', () => {
  let service: TagsDomainService;
  let companyA: Company;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TagsDomainService, { provide: PrismaService, useValue: getPrisma() }],
    }).compile();
    service = moduleRef.get(TagsDomainService);
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    companyA = await createCompany(getPrisma());
  });

  it('retorna tag com _count zerado quando sem assignments', async () => {
    const tag = await createTag(getPrisma(), companyA.id);
    const found = await service.findByIdWithCounts(tag.id, companyA.id);
    expect(found._count.contactTags).toBe(0);
    expect(found._count.ticketTags).toBe(0);
  });
});

describe('TagsDomainService.hardDelete', () => {
  let service: TagsDomainService;
  let companyA: Company;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TagsDomainService, { provide: PrismaService, useValue: getPrisma() }],
    }).compile();
    service = moduleRef.get(TagsDomainService);
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    companyA = await createCompany(getPrisma());
  });

  it('deleta a tag de fato (findById subsequente lança 404)', async () => {
    const tag = await createTag(getPrisma(), companyA.id);
    await getPrisma().$transaction((tx) => service.hardDelete(tag.id, companyA.id, tx));
    await expect(service.findById(tag.id, companyA.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 12.2: Rodar — falha**

```bash
pnpm test src/modules/tags/tests/tags.domain.service.spec.ts
```

Expected: FAIL.

- [ ] **Step 12.3: Implementar `findByIdWithCounts` e `hardDelete`**

Adicionar:

```ts
async findByIdWithCounts(
  id: string,
  companyId: string,
  tx?: Prisma.TransactionClient,
): Promise<Tag & { _count: { contactTags: number; ticketTags: number } }> {
  const db: Db = tx ?? this.prisma;
  const tag = await db.tag.findFirst({
    where: { id, companyId },
    include: { _count: { select: { contactTags: true, ticketTags: true } } },
  });
  if (!tag) throw new NotFoundException('Tag não encontrada');
  return tag;
}

async hardDelete(id: string, companyId: string, tx: Prisma.TransactionClient): Promise<void> {
  await this.findById(id, companyId, tx);
  await tx.tag.delete({ where: { id } });
}
```

- [ ] **Step 12.4: Rodar — devem passar**

```bash
pnpm test src/modules/tags/tests/tags.domain.service.spec.ts
```

Expected: 23 passing.

- [ ] **Step 12.5: Commit**

```bash
git add src/modules/tags/services/tags.domain.service.ts src/modules/tags/tests/tags.domain.service.spec.ts
git commit -m "feat(tags): add domain service findByIdWithCounts and hardDelete"
```

---

## Task 13: Application service — orquestração + hard delete check

**Files:**

- Create: `src/modules/tags/services/tags.application.service.ts`

A application service é coberta pelos testes e2e (não tem unit). Implementar inteira de uma vez.

- [ ] **Step 13.1: Criar `tags.application.service.ts`**

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, type Tag, type User } from '@prisma/client';
import { ZodError } from 'zod';
import { PrismaService } from '@/database/prisma.service';
import { encodeCursor } from '@/common/cursor';
import { ROLE_WEIGHT } from '@/common/guards/roles.guard';
import type { CreateTagDto } from '../schemas/create-tag.schema';
import { UpdateTagSchema, type UpdateTagDto } from '../schemas/update-tag.schema';
import type { ListTagsQueryDto } from '../schemas/list-tags.schema';
import type { DeleteTagQueryDto } from '../schemas/delete-tag.schema';
import type { TagListResponseDto, TagResponseDto } from '../schemas/tag-response.schema';
import { TagsDomainService, type CreateTagInput } from './tags.domain.service';

@Injectable()
export class TagsApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domain: TagsDomainService,
  ) {}

  async create(input: CreateTagDto, companyId: string): Promise<TagResponseDto> {
    const domainInput: CreateTagInput = {
      name: input.name,
      color: input.color,
      scope: input.scope,
      active: input.active,
    };
    try {
      const tag = await this.prisma.$transaction((tx) =>
        this.domain.create(domainInput, companyId, tx),
      );
      return this.toDto(tag);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  async list(companyId: string, query: ListTagsQueryDto): Promise<TagListResponseDto> {
    const filters = {
      sort: query.sort,
      ...(query.active !== undefined ? { active: query.active } : {}),
      ...(query.scope !== undefined ? { scope: query.scope } : {}),
      ...(query.search !== undefined ? { search: query.search } : {}),
    };
    const pagination = {
      limit: query.limit,
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    };
    const { items, hasMore } = await this.domain.list(companyId, filters, pagination);

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const last = items[items.length - 1]!;
      nextCursor =
        query.sort === 'name'
          ? encodeCursor({ name: last.name, id: last.id })
          : encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id });
    }

    return {
      items: items.map((t) => this.toDto(t)),
      pagination: { nextCursor, hasMore },
    };
  }

  async findById(id: string, companyId: string): Promise<TagResponseDto> {
    const tag = await this.domain.findById(id, companyId);
    return this.toDto(tag);
  }

  async update(id: string, companyId: string, input: UpdateTagDto): Promise<TagResponseDto> {
    // Re-parse defesa-em-profundidade (padrão Sprint 0.4/0.5/0.6)
    try {
      UpdateTagSchema.parse(input);
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

    const patch: Prisma.TagUpdateInput = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.color !== undefined) patch.color = input.color;
    if (input.scope !== undefined) patch.scope = input.scope;
    if (input.active !== undefined) patch.active = input.active;

    try {
      const tag = await this.prisma.$transaction((tx) =>
        this.domain.update(id, companyId, patch, tx),
      );
      return this.toDto(tag);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  async delete(id: string, companyId: string, user: User, query: DeleteTagQueryDto): Promise<void> {
    if (query.hard) {
      if (ROLE_WEIGHT[user.role] < ROLE_WEIGHT.ADMIN) {
        throw new ForbiddenException('Apenas ADMIN pode excluir definitivamente');
      }
      await this.prisma.$transaction(async (tx) => {
        const tag = await this.domain.findByIdWithCounts(id, companyId, tx);
        const total = tag._count.contactTags + tag._count.ticketTags;
        if (total > 0) {
          throw new ConflictException(
            `Não é possível excluir definitivamente: há ${total} atribuição(ões). Remova-as antes.`,
          );
        }
        await this.domain.hardDelete(id, companyId, tx);
      });
      return;
    }
    await this.prisma.$transaction((tx) => this.domain.softDelete(id, companyId, tx));
  }

  private toDto(t: Tag): TagResponseDto {
    return {
      id: t.id,
      companyId: t.companyId,
      name: t.name,
      color: t.color,
      scope: t.scope,
      active: t.active,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  private mapConflict(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined) ?? [];
      if (
        target.includes('name') ||
        target.some((t) => t.includes('companyId') && t.includes('name'))
      ) {
        return new ConflictException('Já existe uma tag com este nome');
      }
    }
    return err;
  }
}
```

- [ ] **Step 13.2: Validar typecheck**

```bash
pnpm typecheck
```

Expected: sem erros.

- [ ] **Step 13.3: Commit**

```bash
git add src/modules/tags/services/tags.application.service.ts
git commit -m "feat(tags): add application service with hard delete role check"
```

---

## Task 14: Controller + Module + registro em `app.module.ts`

**Files:**

- Create: `src/modules/tags/controllers/tags.controller.ts`
- Create: `src/modules/tags/tags.module.ts`
- Modify: `src/app.module.ts`

- [ ] **Step 14.1: Criar `tags.controller.ts`**

```ts
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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import type { User } from '@prisma/client';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentCompany } from '@/common/decorators/current-company.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { CreateTagDto } from '../schemas/create-tag.schema';
import { UpdateTagDto } from '../schemas/update-tag.schema';
import { ListTagsQueryDto } from '../schemas/list-tags.schema';
import { DeleteTagQueryDto } from '../schemas/delete-tag.schema';
import { TagListResponseDto, TagResponseDto } from '../schemas/tag-response.schema';
import { TagsApplicationService } from '../services/tags.application.service';

@ApiTags('tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly app: TagsApplicationService) {}

  @Post()
  @Roles('SUPERVISOR')
  @ZodSerializerDto(TagResponseDto)
  async create(@Body() body: CreateTagDto, @CurrentCompany() companyId: string) {
    return this.app.create(body, companyId);
  }

  @Get()
  @ZodSerializerDto(TagListResponseDto)
  async list(@Query() query: ListTagsQueryDto, @CurrentCompany() companyId: string) {
    return this.app.list(companyId, query);
  }

  @Get(':id')
  @ZodSerializerDto(TagResponseDto)
  async findById(@Param('id', ParseUUIDPipe) id: string, @CurrentCompany() companyId: string) {
    return this.app.findById(id, companyId);
  }

  @Patch(':id')
  @Roles('SUPERVISOR')
  @ZodSerializerDto(TagResponseDto)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTagDto,
    @CurrentCompany() companyId: string,
  ) {
    return this.app.update(id, companyId, body);
  }

  @Delete(':id')
  @Roles('SUPERVISOR')
  @HttpCode(204)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DeleteTagQueryDto,
    @CurrentUser() user: User,
    @CurrentCompany() companyId: string,
  ): Promise<void> {
    await this.app.delete(id, companyId, user, query);
  }
}
```

- [ ] **Step 14.2: Criar `tags.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { TagsController } from './controllers/tags.controller';
import { TagsApplicationService } from './services/tags.application.service';
import { TagsDomainService } from './services/tags.domain.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TagsController],
  providers: [TagsApplicationService, TagsDomainService],
  exports: [TagsApplicationService],
})
export class TagsModule {}
```

> Verificar se `DatabaseModule` é o nome correto comparando com `departments.module.ts`. Se Departments não importa `DatabaseModule` explicitamente (`PrismaService` provido global), remover esse import.

- [ ] **Step 14.3: Registrar `TagsModule` em `src/app.module.ts`**

Adicionar no array `imports`, logo após `DepartmentsModule`:

```ts
import { TagsModule } from './modules/tags/tags.module';
// ...
imports: [
  // ...
  DepartmentsModule,
  TagsModule,
  // ...
],
```

- [ ] **Step 14.4: Validar typecheck + lint + build**

```bash
pnpm typecheck && pnpm lint && pnpm build
```

Expected: tudo passa.

- [ ] **Step 14.5: Commit**

```bash
git add src/modules/tags/controllers/ src/modules/tags/tags.module.ts src/app.module.ts
git commit -m "feat(tags): add controller and register module in app.module"
```

---

## Task 15: E2E — Setup do arquivo + happy paths

**Files:**

- Create: `src/modules/tags/tests/tags.controller.e2e-spec.ts`

- [ ] **Step 15.1: Criar arquivo com setup + happy paths**

```ts
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Company, User } from '@prisma/client';
import { bootstrapTestApp } from '../../../../test/e2e/setup-app';
import {
  createCompany,
  createTag,
  createUser,
  loginAs,
  truncateAll,
} from '../../../../test/e2e/factories';
import { getPrisma } from '../../../../test/setup-prisma';

interface TagDto {
  id: string;
  companyId: string;
  name: string;
  color: string;
  scope: 'CONTACT' | 'TICKET' | 'BOTH';
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TagListResponse {
  items: TagDto[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

interface ErrorBody {
  message: string;
  errors?: Array<{ field: string; message: string; code: string }>;
}

describe('TagsController (e2e) — happy paths', () => {
  let app: NestFastifyApplication;
  let company: Company;
  let admin: { user: User; password: string };
  let supervisor: { user: User; password: string };
  let agent: { user: User; password: string };
  let tokenAdmin: string;
  let tokenSupervisor: string;
  let tokenAgent: string;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    company = await createCompany(getPrisma());
    admin = await createUser(getPrisma(), company.id, { role: 'ADMIN' });
    supervisor = await createUser(getPrisma(), company.id, { role: 'SUPERVISOR' });
    agent = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    ({ accessToken: tokenAdmin } = await loginAs(app, admin.user.email, admin.password));
    ({ accessToken: tokenSupervisor } = await loginAs(
      app,
      supervisor.user.email,
      supervisor.password,
    ));
    ({ accessToken: tokenAgent } = await loginAs(app, agent.user.email, agent.password));
  });

  it('POST /tags como ADMIN cria com defaults (scope=BOTH, active=true)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: { name: 'VIP', color: '#aabbcc' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<TagDto>();
    expect(body.name).toBe('VIP');
    expect(body.scope).toBe('BOTH');
    expect(body.active).toBe(true);
    expect(body.color).toBe('#AABBCC'); // normalizado para uppercase
  });

  it('POST /tags como SUPERVISOR também funciona (D-2.2)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenSupervisor}` },
      payload: { name: 'Sup', color: '#000000', scope: 'TICKET' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('GET /tags como AGENT retorna lista (qualquer auth)', async () => {
    await createTag(getPrisma(), company.id, { name: 'A' });
    await createTag(getPrisma(), company.id, { name: 'B' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAgent}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<TagListResponse>();
    expect(body.items).toHaveLength(2);
  });

  it('GET /tags/:id retorna detalhe', async () => {
    const tag = await createTag(getPrisma(), company.id, { name: 'Detail' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tags/${tag.id}`,
      headers: { authorization: `Bearer ${tokenAgent}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<TagDto>().name).toBe('Detail');
  });

  it('PATCH /tags/:id como SUPERVISOR atualiza name', async () => {
    const tag = await createTag(getPrisma(), company.id, { name: 'Old' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tags/${tag.id}`,
      headers: { authorization: `Bearer ${tokenSupervisor}` },
      payload: { name: 'New' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<TagDto>().name).toBe('New');
  });

  it('DELETE /tags/:id (soft) como SUPERVISOR marca active=false', async () => {
    const tag = await createTag(getPrisma(), company.id, { active: true });
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tags/${tag.id}`,
      headers: { authorization: `Bearer ${tokenSupervisor}` },
    });
    expect(del.statusCode).toBe(204);
    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/tags/${tag.id}`,
      headers: { authorization: `Bearer ${tokenAgent}` },
    });
    expect(get.statusCode).toBe(200);
    expect(get.json<TagDto>().active).toBe(false);
  });

  it('DELETE /tags/:id?hard=true como ADMIN sem assignments retorna 204', async () => {
    const tag = await createTag(getPrisma(), company.id);
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tags/${tag.id}?hard=true`,
      headers: { authorization: `Bearer ${tokenAdmin}` },
    });
    expect(del.statusCode).toBe(204);
    const get = await app.inject({
      method: 'GET',
      url: `/api/v1/tags/${tag.id}`,
      headers: { authorization: `Bearer ${tokenAgent}` },
    });
    expect(get.statusCode).toBe(404);
  });
});
```

- [ ] **Step 15.2: Rodar — devem passar**

```bash
pnpm test:e2e -- tags
```

Expected: 7 happy paths passing.

- [ ] **Step 15.3: Commit**

```bash
git add src/modules/tags/tests/tags.controller.e2e-spec.ts
git commit -m "test(tags): add e2e happy paths for CRUD"
```

---

## Task 16: E2E — Sad paths (validação, conflitos, 403/404)

**Files:**

- Modify: `src/modules/tags/tests/tags.controller.e2e-spec.ts`

- [ ] **Step 16.1: Adicionar bloco `describe` de sad paths**

Adicionar ao final do arquivo (mesmo setup beforeEach pode ser duplicado ou extraído — para simplicidade, duplicar):

```ts
describe('TagsController (e2e) — sad paths', () => {
  let app: NestFastifyApplication;
  let company: Company;
  let admin: { user: User; password: string };
  let supervisor: { user: User; password: string };
  let agent: { user: User; password: string };
  let tokenAdmin: string;
  let tokenSupervisor: string;
  let tokenAgent: string;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    company = await createCompany(getPrisma());
    admin = await createUser(getPrisma(), company.id, { role: 'ADMIN' });
    supervisor = await createUser(getPrisma(), company.id, { role: 'SUPERVISOR' });
    agent = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    ({ accessToken: tokenAdmin } = await loginAs(app, admin.user.email, admin.password));
    ({ accessToken: tokenSupervisor } = await loginAs(
      app,
      supervisor.user.email,
      supervisor.password,
    ));
    ({ accessToken: tokenAgent } = await loginAs(app, agent.user.email, agent.password));
  });

  it('POST color inválido ("red") retorna 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: { name: 'X', color: 'red' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST color inválido (#abc) retorna 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: { name: 'X', color: '#abc' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST name vazio retorna 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: { name: '', color: '#000000' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST com campo desconhecido retorna 400 (.strict())', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: { name: 'X', color: '#000000', foo: 'bar' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST nome duplicado no mesmo tenant retorna 409', async () => {
    await createTag(getPrisma(), company.id, { name: 'Dup' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: { name: 'Dup', color: '#FFFFFF' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('PATCH rename para nome existente retorna 409', async () => {
    await createTag(getPrisma(), company.id, { name: 'Existing' });
    const target = await createTag(getPrisma(), company.id, { name: 'Target' });
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tags/${target.id}`,
      headers: { authorization: `Bearer ${tokenSupervisor}` },
      payload: { name: 'Existing' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('PATCH com campo desconhecido retorna 400', async () => {
    const tag = await createTag(getPrisma(), company.id);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tags/${tag.id}`,
      headers: { authorization: `Bearer ${tokenSupervisor}` },
      payload: { foo: 'bar' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET /tags/:id inexistente retorna 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tags/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${tokenAgent}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE ?hard=true como SUPERVISOR retorna 403', async () => {
    const tag = await createTag(getPrisma(), company.id);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tags/${tag.id}?hard=true`,
      headers: { authorization: `Bearer ${tokenSupervisor}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE ?hard=true como AGENT retorna 403 (RolesGuard)', async () => {
    const tag = await createTag(getPrisma(), company.id);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tags/${tag.id}?hard=true`,
      headers: { authorization: `Bearer ${tokenAgent}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('DELETE soft como AGENT retorna 403', async () => {
    const tag = await createTag(getPrisma(), company.id);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tags/${tag.id}`,
      headers: { authorization: `Bearer ${tokenAgent}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST como AGENT retorna 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAgent}` },
      payload: { name: 'X', color: '#000000' },
    });
    expect(res.statusCode).toBe(403);
  });
});
```

- [ ] **Step 16.2: Rodar**

```bash
pnpm test:e2e -- tags
```

Expected: 7 + 12 = 19 passing.

- [ ] **Step 16.3: Commit**

```bash
git add src/modules/tags/tests/tags.controller.e2e-spec.ts
git commit -m "test(tags): add e2e sad paths (validation, conflicts, 403/404)"
```

---

## Task 17: E2E — Multi-tenant guard

**Files:**

- Modify: `src/modules/tags/tests/tags.controller.e2e-spec.ts`

- [ ] **Step 17.1: Adicionar bloco `describe` multi-tenant**

```ts
describe('TagsController (e2e) — multi-tenant guard', () => {
  let app: NestFastifyApplication;
  let companyA: Company;
  let companyB: Company;
  let adminA: { user: User; password: string };
  let supervisorB: { user: User; password: string };
  let tokenAdminA: string;
  let tokenSupervisorB: string;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    companyA = await createCompany(getPrisma());
    companyB = await createCompany(getPrisma());
    adminA = await createUser(getPrisma(), companyA.id, { role: 'ADMIN' });
    supervisorB = await createUser(getPrisma(), companyB.id, { role: 'SUPERVISOR' });
    ({ accessToken: tokenAdminA } = await loginAs(app, adminA.user.email, adminA.password));
    ({ accessToken: tokenSupervisorB } = await loginAs(
      app,
      supervisorB.user.email,
      supervisorB.password,
    ));
  });

  it('tenants A e B podem criar tag com mesmo nome (unique é por tenant)', async () => {
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAdminA}` },
      payload: { name: 'VIP', color: '#FF0000' },
    });
    expect(resA.statusCode).toBe(201);
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenSupervisorB}` },
      payload: { name: 'VIP', color: '#00FF00' },
    });
    expect(resB.statusCode).toBe(201);
  });

  it('tenant B GET tag de A retorna 404', async () => {
    const tagA = await createTag(getPrisma(), companyA.id);
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/tags/${tagA.id}`,
      headers: { authorization: `Bearer ${tokenSupervisorB}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('tenant B PATCH tag de A retorna 404', async () => {
    const tagA = await createTag(getPrisma(), companyA.id);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tags/${tagA.id}`,
      headers: { authorization: `Bearer ${tokenSupervisorB}` },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('tenant B DELETE tag de A retorna 404', async () => {
    const tagA = await createTag(getPrisma(), companyA.id);
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tags/${tagA.id}`,
      headers: { authorization: `Bearer ${tokenSupervisorB}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /tags lista apenas tags do próprio tenant', async () => {
    await createTag(getPrisma(), companyA.id, { name: 'TagA' });
    await createTag(getPrisma(), companyB.id, { name: 'TagB' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${tokenAdminA}` },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json<TagListResponse>().items;
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('TagA');
  });
});
```

- [ ] **Step 17.2: Rodar**

```bash
pnpm test:e2e -- tags
```

Expected: 19 + 5 = 24 passing.

- [ ] **Step 17.3: Commit**

```bash
git add src/modules/tags/tests/tags.controller.e2e-spec.ts
git commit -m "test(tags): add e2e multi-tenant isolation guards"
```

---

## Task 18: E2E — Filtro `?scope=` (semântica D-2.3)

**Files:**

- Modify: `src/modules/tags/tests/tags.controller.e2e-spec.ts`

- [ ] **Step 18.1: Adicionar bloco `describe` de scope filter**

```ts
describe('TagsController (e2e) — scope filter semantics', () => {
  let app: NestFastifyApplication;
  let company: Company;
  let agent: { user: User; password: string };
  let token: string;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    company = await createCompany(getPrisma());
    agent = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    ({ accessToken: token } = await loginAs(app, agent.user.email, agent.password));
    await createTag(getPrisma(), company.id, { name: 'OnlyTicket', scope: 'TICKET' });
    await createTag(getPrisma(), company.id, { name: 'OnlyContact', scope: 'CONTACT' });
    await createTag(getPrisma(), company.id, { name: 'Both', scope: 'BOTH' });
  });

  it('?scope=TICKET inclui TICKET + BOTH', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tags?scope=TICKET',
      headers: { authorization: `Bearer ${token}` },
    });
    const names = res
      .json<TagListResponse>()
      .items.map((t) => t.name)
      .sort();
    expect(names).toEqual(['Both', 'OnlyTicket']);
  });

  it('?scope=CONTACT inclui CONTACT + BOTH', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tags?scope=CONTACT',
      headers: { authorization: `Bearer ${token}` },
    });
    const names = res
      .json<TagListResponse>()
      .items.map((t) => t.name)
      .sort();
    expect(names).toEqual(['Both', 'OnlyContact']);
  });

  it('?scope=BOTH retorna apenas BOTH (literal)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tags?scope=BOTH',
      headers: { authorization: `Bearer ${token}` },
    });
    const items = res.json<TagListResponse>().items;
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('Both');
  });

  it('sem ?scope retorna todas as 3', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/tags',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.json<TagListResponse>().items).toHaveLength(3);
  });
});
```

- [ ] **Step 18.2: Rodar**

```bash
pnpm test:e2e -- tags
```

Expected: 24 + 4 = 28 passing.

- [ ] **Step 18.3: Commit**

```bash
git add src/modules/tags/tests/tags.controller.e2e-spec.ts
git commit -m "test(tags): cover scope filter applicability semantics"
```

---

## Task 19: E2E — Hard delete bloqueado por assignments

**Files:**

- Modify: `src/modules/tags/tests/tags.controller.e2e-spec.ts`

Tentativa: criar `Contact` minimal via Prisma direto (sem CRUD de Contact) e inserir `ContactTag`. Se Contact tiver muitos campos NOT NULL, marcar como `it.todo` documentado.

- [ ] **Step 19.1: Inspecionar schema do Contact**

```bash
grep -n -A 30 "^model Contact" prisma/schema.prisma | head -40
```

Identificar campos NOT NULL sem default. Provavelmente: `companyId`, e `phone`/`name` ou similar.

- [ ] **Step 19.2: Decidir estratégia**

- **Cenário A:** Contact pode ser criado com poucos campos. → Implementar teste real.
- **Cenário B:** Contact requer >5 campos NOT NULL ou FKs complexas. → `it.todo('hard delete bloqueado por assignments — implementar quando ContactsModule existir (Phase 2)')`.

- [ ] **Step 19.3: Adicionar bloco `describe`**

Para Cenário A:

```ts
describe('TagsController (e2e) — hard delete blocked by assignments', () => {
  let app: NestFastifyApplication;
  let company: Company;
  let admin: { user: User; password: string };
  let token: string;

  beforeAll(async () => {
    app = await bootstrapTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    company = await createCompany(getPrisma());
    admin = await createUser(getPrisma(), company.id, { role: 'ADMIN' });
    ({ accessToken: token } = await loginAs(app, admin.user.email, admin.password));
  });

  it('DELETE ?hard=true bloqueado se há ContactTag (409 com contagem)', async () => {
    const tag = await createTag(getPrisma(), company.id, { name: 'Vinculada' });

    // criar Contact minimal — ajustar campos conforme schema real
    const contact = await getPrisma().contact.create({
      data: {
        companyId: company.id,
        // adicionar aqui APENAS os NOT NULL sem default que o schema exigir
      },
    });
    await getPrisma().contactTag.create({
      data: { contactId: contact.id, tagId: tag.id },
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/tags/${tag.id}?hard=true`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toMatch(/atribuição/i);
    expect(res.json<ErrorBody>().message).toMatch(/1/);
  });
});
```

Para Cenário B, substituir o bloco por:

```ts
describe('TagsController (e2e) — hard delete blocked by assignments', () => {
  it.todo(
    'DELETE ?hard=true bloqueado se há ContactTag (409) — implementar quando ContactsModule existir (Phase 2). Spec ref: D-2.1.',
  );
  it.todo(
    'DELETE ?hard=true bloqueado se há TicketTag (409) — implementar quando TicketsModule existir (Phase 2). Spec ref: D-2.1.',
  );
});
```

- [ ] **Step 19.4: Rodar**

```bash
pnpm test:e2e -- tags
```

Expected: passa (cenário A: 29 passing; cenário B: 28 passing + 2 todo).

- [ ] **Step 19.5: Commit**

```bash
git add src/modules/tags/tests/tags.controller.e2e-spec.ts
git commit -m "test(tags): cover hard delete blocked by pivot assignments"
```

---

## Task 20: Verificação final por evidência

Antes de declarar pronto, rodar a bateria completa.

- [ ] **Step 20.1: Typecheck**

```bash
pnpm typecheck
```

Expected: sem erros.

- [ ] **Step 20.2: Lint**

```bash
pnpm lint
```

Expected: sem warnings/errors.

- [ ] **Step 20.3: Unit tests (vitest)**

```bash
pnpm test
```

Expected: tudo passando, incluindo os ~23 novos testes do domain de Tags.

- [ ] **Step 20.4: Schema tests (Sprint 0.2 não pode quebrar)**

```bash
pnpm test:schema
```

Expected: passa.

- [ ] **Step 20.5: E2E tests (118 existentes + ~28-29 novos)**

```bash
pnpm test:e2e
```

Expected: tudo passa. Se algum e2e existente falhou, investigar — provavelmente algo relacionado ao rename `WEIGHT` → `ROLE_WEIGHT`.

- [ ] **Step 20.6: Build**

```bash
pnpm build
```

Expected: compila sem erros.

- [ ] **Step 20.7: Smoke manual via curl**

Levantar o servidor (`pnpm dev`) em outro terminal e rodar os 14 cenários do Smoke da Seção 10 do spec. Documentar quaisquer divergências.

---

## Task 21: Marcar ROADMAP como done + commit

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 21.1: Marcar item na seção 5**

Em `ROADMAP.md` §5 "CRUD básico (estrutura 3 camadas em todos)", mudar:

```md
- [ ] Tags (com escopo)
```

Para:

```md
- [x] Tags (com escopo)
```

- [ ] **Step 21.2: Atualizar tabela §17 se necessário**

Verificar se a "Notas" da Fase 0 menciona próximo passo. Se sim, atualizar para refletir que Tags está pronto e o próximo é "CloseReasons (com reorder)".

- [ ] **Step 21.3: Commit**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): mark sprint 0.7 tags crud as done"
```

---

## Task 22: Push + abrir PR

- [ ] **Step 22.1: Push da branch**

```bash
git push -u origin feat/sprint-0-7-tags-com-escopo
```

- [ ] **Step 22.2: Confirmar com o usuário antes de criar o PR**

Ler git status, git log, git diff main...HEAD para garantir que tudo está em ordem e o usuário aprova antes de criar o PR via `gh`.

- [ ] **Step 22.3: Criar PR via `gh`**

```bash
gh pr create --title "feat: sprint 0.7 tags crud (com escopo)" --body "$(cat <<'EOF'
## Summary

- CRUD completo de Tag (`POST/GET/PATCH/DELETE /api/v1/tags`) seguindo padrão 3 camadas das Sprints 0.4–0.6.
- Escopo `CONTACT`/`TICKET`/`BOTH` com filtro `?scope=` semântico (TICKET inclui BOTH; idem CONTACT).
- Soft delete via `active=false` (default DELETE) e hard delete via `?hard=true` para ADMIN+ apenas, bloqueado com 409 se houver `ContactTag`/`TicketTag`.
- Cor hex `#RRGGBB` validada e normalizada para uppercase.
- Permissões: SUPERVISOR+ em escrita (alinhado ao audit); ADMIN+ no hard delete.
- Refactor mínimo: `WEIGHT` exportado como `ROLE_WEIGHT` em `roles.guard.ts` para reuso no check programático.

## Spec & Plan

- Design: `docs/superpowers/specs/2026-05-04-sprint-0-7-tags-crud-design.md`
- Plano: `docs/superpowers/plans/2026-05-04-sprint-0-7-tags-crud.md`

## Test plan

- [x] Unit tests do domain service (~23 casos)
- [x] E2E happy paths (CRUD completo)
- [x] E2E sad paths (validação, conflitos, 403/404)
- [x] E2E multi-tenant guard
- [x] E2E filtro `?scope=` (3 cenários)
- [x] E2E hard delete bloqueado por assignments (ou `it.todo` se Contact stub for impraticável)
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:schema`, `pnpm test:e2e`, `pnpm build` — verde
- [x] Smoke manual (14 cenários do spec §10)
EOF
)"
```

- [ ] **Step 22.4: Aguardar CI verde**

Monitorar com `gh pr checks <PR#> --watch` ou similar.

- [ ] **Step 22.5: Reportar PR URL ao usuário**

Imprimir a URL do PR e aguardar aprovação humana antes de qualquer merge.

---

## Self-review checklist

Antes de declarar plano pronto:

**Spec coverage** (cada requisito do spec → task):

- [x] D-2.1 (DELETE híbrido) → Tasks 11, 12, 13, 15, 16, 19
- [x] D-2.2 (SUPERVISOR+ escrita / ADMIN+ hard) → Tasks 13, 14, 16
- [x] D-2.3 (`?scope=` aplicabilidade) → Tasks 6, 7, 18
- [x] D-2.4 (color normalization) → Tasks 4, 15
- [x] D-2.5 (lista default ativas+inativas) → Task 6
- [x] D-2.6 (rota única + check programático) → Tasks 13, 14
- [x] §3 API contract — todos os endpoints cobertos
- [x] §4 Schemas — Task 4
- [x] §5 Domain service — Tasks 5–12
- [x] §6 Application service — Task 13
- [x] §7 Controller — Task 14
- [x] §8 Module wiring — Task 14
- [x] §9 Tests (domain + e2e + factory) — Tasks 3, 5–12, 15–19
- [x] §10 Verificação por evidência — Task 20
- [x] §12 ROADMAP + commit + PR — Tasks 21, 22

**Placeholders:** zero "TBD/TODO/implement later" no plano (todos os steps têm código completo). Único `it.todo` é em Task 19 cenário B, e isso é uma decisão consciente documentada (não placeholder).

**Type consistency:**

- `ROLE_WEIGHT` consistente entre `roles.guard.ts` (Task 2) e `tags.application.service.ts` (Task 13).
- `CreateTagInput` definido em Task 9, usado em Task 13.
- `TagListResponse` shape em testes (Task 15+) bate com schema (Task 4) e application service (Task 13): `{ items, pagination: { nextCursor, hasMore } }`.
- `ListFilters.scope: TagScope | undefined` em domain (Task 6) consistente com query DTO (Task 4) que aceita `'CONTACT' | 'TICKET' | 'BOTH' | undefined`.

Plano OK para handoff.
