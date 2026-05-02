# Sprint 0.4 — Users CRUD (com force-logout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o módulo `users` com 7 endpoints (CRUD + force-logout + self-edit) e cobertura de testes unitários e e2e, conforme spec `2026-05-01-sprint-0-4-users-crud-design.md`.

**Architecture:** Arquitetura formal de 3 camadas (Controller → Application Service → Domain Service) já estabelecida em `ARCHITECTURE.md` §3. `UsersDomainService` acessa Prisma direto com `companyId` explícito. `UsersApplicationService` orquestra `bcrypt.hash` + transações + delegação a `AuthDomainService.revokeAllRefreshTokens` (Sprint 0.3). Dois controllers: `UsersController` (`/users`) e `MeController` (`/me`) com schemas Zod distintos. Sem migrations novas (schema completo desde Sprint 0.2/0.3).

**Tech Stack:** NestJS 11 + Fastify, Prisma 6, Zod (via `nestjs-zod` + `ZodValidationPipe` global), bcrypt cost 12, vitest (unit + e2e via `app.inject()`).

---

## File Structure

### Created

| Caminho                                                   | Responsabilidade                                                                                                                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/users/users.module.ts`                       | NestJS module: importa `AuthModule` (pra usar `AuthDomainService`), declara `UsersController` + `MeController`, providencia `UsersApplicationService` + `UsersDomainService`.     |
| `src/modules/users/controllers/users.controller.ts`       | HTTP transport para `/users` + `/users/:id/force-logout`. Aplica `@Roles('ADMIN')` onde a permissão exige; soft-deleted detectado no domain via `findByIdWithDepartments`.        |
| `src/modules/users/controllers/me.controller.ts`          | HTTP transport para `PATCH /me`. Sem `@Roles` (qualquer autenticado). Schema strict bloqueia escalação.                                                                           |
| `src/modules/users/services/users.application.service.ts` | Orquestra: bcrypt, `prisma.$transaction`, `toDto`. Captura `P2002` em email e converte em `ConflictException`. Reusa `AuthDomainService.revokeAllRefreshTokens` em `forceLogout`. |
| `src/modules/users/services/users.domain.service.ts`      | Regras de negócio: invariantes multi-tenant + last-ADMIN guard + SUPER_ADMIN guard + dept ownership + email global unique. Retorna entidade Prisma populada.                      |
| `src/modules/users/schemas/create-user.schema.ts`         | `CreateUserSchema` + `CreateUserDto`. `role` enum sem SUPER_ADMIN (cobre TC-USER-1).                                                                                              |
| `src/modules/users/schemas/update-user.schema.ts`         | `UpdateUserSchema` + `UpdateUserDto`. Schema completo (`.strict()` + tudo `.optional()`). Para `PATCH /users/:id` (ADMIN+).                                                       |
| `src/modules/users/schemas/update-me.schema.ts`           | `UpdateMeSchema` + `UpdateMeDto`. Schema restrito (name, password, absence). `.strict()` defende TC-USER-7-neg.                                                                   |
| `src/modules/users/schemas/list-users.schema.ts`          | `ListUsersQuerySchema` + `ListUsersQueryDto`. Filtros (role inclui SUPER_ADMIN para leitura), cursor pagination.                                                                  |
| `src/modules/users/schemas/user-response.schema.ts`       | `UserResponseSchema` + `UserListResponseSchema` + DTOs. Inclui `departments` populados, omite `passwordHash`/`deletedAt`.                                                         |
| `src/modules/users/tests/users.domain.service.spec.ts`    | Unit tests: assertions de regra + integração interna (`update`, `softDelete`).                                                                                                    |
| `src/modules/users/tests/users.controller.e2e-spec.ts`    | E2E para `/users` e `/users/:id/force-logout`.                                                                                                                                    |
| `src/modules/users/tests/me.controller.e2e-spec.ts`       | E2E para `PATCH /me`.                                                                                                                                                             |

### Modified

| Caminho                 | Mudança                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `src/app.module.ts`     | `imports: [...UsersModule]` (auto-adicionado pelo schematic). |
| `test/e2e/factories.ts` | Adicionar `createDepartment` e `loginAs`.                     |
| `ROADMAP.md`            | Marcar `[x] Users (com force-logout)` na §5.                  |

### Existing dependencies (não modificar)

- `src/database/prisma.service.ts`, `src/common/decorators/{current-user,current-company,public,roles}.decorator.ts`, `src/common/guards/{jwt-auth,roles}.guard.ts`, `src/modules/auth/auth.module.ts` (já exporta `AuthDomainService`).

---

## Phase 0 — Setup

### Task 1: Gerar scaffold do módulo via schematic

**Files:**

- Create (auto): `src/modules/users/users.module.ts`, `controllers/users.controller.ts`, `services/users.application.service.ts`, `services/users.domain.service.ts`, `schemas/create-users.schema.ts`, `schemas/update-users.schema.ts`, `schemas/users-response.schema.ts`, `tests/users.domain.service.spec.ts`, `tests/users.controller.e2e-spec.ts`
- Modify (auto): `src/app.module.ts` (adiciona `UsersModule` aos imports)

- [ ] **Step 1.1: Verificar working tree limpo**

Run: `git status --short`
Expected: vazio (sem arquivos modificados/untracked).

- [ ] **Step 1.2: Rodar o gerador**

Run: `pnpm g:feature users`
Expected: cria 9 arquivos + atualiza `src/app.module.ts`.

- [ ] **Step 1.3: Renomear schemas pro singular**

O gerador cria `create-users.schema.ts`/`update-users.schema.ts`/`users-response.schema.ts` (plural). O spec usa singular (`create-user`, `update-user`, `user-response`).

```bash
git mv src/modules/users/schemas/create-users.schema.ts src/modules/users/schemas/create-user.schema.ts
git mv src/modules/users/schemas/update-users.schema.ts src/modules/users/schemas/update-user.schema.ts
git mv src/modules/users/schemas/users-response.schema.ts src/modules/users/schemas/user-response.schema.ts
```

Em seguida, ajustar imports nos arquivos que referenciam os schemas (controller + services). Procurar com:

```bash
grep -rn "create-users.schema\|update-users.schema\|users-response.schema" src/modules/users
```

Substituir cada ocorrência: `create-users` → `create-user`, `update-users` → `update-user`, `users-response` → `user-response`.

- [ ] **Step 1.4: Verificar build após scaffold**

Run: `pnpm typecheck`
Expected: PASS (placeholders são `NotImplementedException` e similares — compila).

Run: `pnpm build`
Expected: PASS.

- [ ] **Step 1.5: Commit do scaffold**

```bash
git add src/modules/users src/app.module.ts
git commit -m "chore(users): scaffold module via pnpm g:feature"
```

---

### Task 2: Importar `AuthModule` no `UsersModule`

**Files:**

- Modify: `src/modules/users/users.module.ts`

`UsersApplicationService` precisa de `AuthDomainService` (force-logout). `AuthModule` já o exporta (Sprint 0.3, verificado em `src/modules/auth/auth.module.ts:14`).

- [ ] **Step 2.1: Editar `users.module.ts`**

Substituir o conteúdo gerado por:

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MeController } from './controllers/me.controller';
import { UsersController } from './controllers/users.controller';
import { UsersApplicationService } from './services/users.application.service';
import { UsersDomainService } from './services/users.domain.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, MeController],
  providers: [UsersApplicationService, UsersDomainService],
  exports: [UsersApplicationService, UsersDomainService],
})
export class UsersModule {}
```

> Nota: `MeController` ainda não existe (Task 21). O typecheck vai quebrar até lá. Aceitável — o módulo só é registrado em `AppModule` e o erro de import só acontece em runtime/build. Para deixar build passando entre tasks, comentar `MeController` por enquanto e descomentar na Task 21. **Decisão:** comentar agora.

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
// import { MeController } from './controllers/me.controller';  // Task 21
import { UsersController } from './controllers/users.controller';
import { UsersApplicationService } from './services/users.application.service';
import { UsersDomainService } from './services/users.domain.service';

@Module({
  imports: [AuthModule],
  controllers: [UsersController /*, MeController*/],
  providers: [UsersApplicationService, UsersDomainService],
  exports: [UsersApplicationService, UsersDomainService],
})
export class UsersModule {}
```

- [ ] **Step 2.2: Verificar typecheck e build**

Run: `pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 2.3: Commit**

```bash
git add src/modules/users/users.module.ts
git commit -m "feat(users): wire AuthModule into UsersModule"
```

---

### Task 3: Adicionar `createDepartment` e `loginAs` em `test/e2e/factories.ts`

**Files:**

- Modify: `test/e2e/factories.ts`

- [ ] **Step 3.1: Adicionar imports e factories**

Editar `test/e2e/factories.ts` no topo, adicionar `Department` ao import:

```typescript
import * as bcrypt from 'bcrypt';
import type { Company, Department, Plan, PrismaClient, User, UserRole } from '@prisma/client';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
```

Adicionar no final do arquivo (antes de `truncateAll`):

```typescript
export async function createDepartment(
  prisma: PrismaClient,
  companyId: string,
  overrides: Partial<{ name: string; active: boolean }> = {},
): Promise<Department> {
  return prisma.department.create({
    data: {
      companyId,
      name: overrides.name ?? `Dept ${nextId()}`,
      active: overrides.active ?? true,
    },
  });
}

export async function loginAs(
  app: NestFastifyApplication,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  if (res.statusCode !== 200) {
    throw new Error(`loginAs failed: ${res.statusCode} ${res.body}`);
  }
  const body = res.json<{ accessToken: string; refreshToken: string }>();
  return { accessToken: body.accessToken, refreshToken: body.refreshToken };
}
```

- [ ] **Step 3.2: Verificar typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3.3: Commit**

```bash
git add test/e2e/factories.ts
git commit -m "test(e2e): add createDepartment and loginAs factories"
```

---

## Phase 1 — Schemas

### Task 4: Escrever os 5 schemas Zod

**Files:**

- Modify: `src/modules/users/schemas/create-user.schema.ts`
- Modify: `src/modules/users/schemas/update-user.schema.ts`
- Create: `src/modules/users/schemas/update-me.schema.ts`
- Create: `src/modules/users/schemas/list-users.schema.ts`
- Modify: `src/modules/users/schemas/user-response.schema.ts`

Sem testes — schemas Zod são pura validação declarativa (testing-strategy.md §"O que NÃO testamos"). Verificar com typecheck + uso pelos services em tasks subsequentes.

- [ ] **Step 4.1: Escrever `create-user.schema.ts`**

Substituir conteúdo do placeholder por:

```typescript
import { z } from 'zod';

export const CreateUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100),
    email: z.string().trim().toLowerCase().email('Email em formato inválido'),
    password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres').max(128),
    role: z
      .enum(['ADMIN', 'SUPERVISOR', 'AGENT'])
      .describe('Perfil do usuário no tenant. SUPER_ADMIN não é permitido por esta rota.'),
    departmentIds: z
      .array(z.string().uuid())
      .default([])
      .describe('UUIDs dos departamentos. Pode ser vazio.'),
  })
  .strict()
  .describe('Dados para criar usuário no tenant atual');

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
```

- [ ] **Step 4.2: Escrever `update-user.schema.ts`**

```typescript
import { z } from 'zod';

export const UpdateUserSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100).optional(),
    email: z.string().trim().toLowerCase().email('Email em formato inválido').optional(),
    password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres').max(128).optional(),
    role: z.enum(['ADMIN', 'SUPERVISOR', 'AGENT']).optional(),
    departmentIds: z.array(z.string().uuid()).optional(),
    absenceMessage: z.string().max(500).nullable().optional(),
    absenceActive: z.boolean().optional(),
  })
  .strict()
  .describe('Dados para editar usuário (apenas ADMIN+)');

export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
```

- [ ] **Step 4.3: Criar `update-me.schema.ts`**

```typescript
import { z } from 'zod';

export const UpdateMeSchema = z
  .object({
    name: z.string().trim().min(2, 'Nome deve ter no mínimo 2 caracteres').max(100).optional(),
    password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres').max(128).optional(),
    absenceMessage: z.string().max(500).nullable().optional(),
    absenceActive: z.boolean().optional(),
  })
  .strict()
  .describe('Dados que o próprio usuário pode editar');

export type UpdateMeDto = z.infer<typeof UpdateMeSchema>;
```

- [ ] **Step 4.4: Criar `list-users.schema.ts`**

```typescript
import { z } from 'zod';

export const ListUsersQuerySchema = z
  .object({
    role: z.enum(['ADMIN', 'SUPERVISOR', 'AGENT', 'SUPER_ADMIN']).optional(),
    active: z.coerce.boolean().optional().default(true),
    departmentId: z.string().uuid().optional(),
    search: z.string().trim().min(1).max(100).optional(),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .describe('Filtros para listagem de usuários');

export type ListUsersQueryDto = z.infer<typeof ListUsersQuerySchema>;
```

- [ ] **Step 4.5: Escrever `user-response.schema.ts`**

```typescript
import { z } from 'zod';

const DepartmentRefSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

export const UserResponseSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'AGENT']),
    absenceMessage: z.string().nullable(),
    absenceActive: z.boolean(),
    lastSeenAt: z.string().datetime().nullable(),
    departments: z.array(DepartmentRefSchema),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .describe('Usuário do tenant com departamentos populados');

export const UserListResponseSchema = z.object({
  items: z.array(UserResponseSchema),
  pagination: z.object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }),
});

export type UserResponseDto = z.infer<typeof UserResponseSchema>;
export type UserListResponseDto = z.infer<typeof UserListResponseSchema>;
```

- [ ] **Step 4.6: Verificar typecheck**

Run: `pnpm typecheck`
Expected: pode quebrar nos services se eles importam o tipo antigo `CreateUsersDto`. Se quebrar, ignorar por enquanto (Task 11 reescreve o domain) ou ajustar imports stub manualmente.

Se houver erro de typecheck que bloqueia, comentar temporariamente os métodos do `users.application.service.ts` e `users.domain.service.ts` que usam os DTOs (eles serão reescritos do zero nas tasks 5-13).

- [ ] **Step 4.7: Commit**

```bash
git add src/modules/users/schemas
git commit -m "feat(users): add Zod schemas (create, update, update-me, list, response)"
```

---

## Phase 2 — Domain service (TDD)

> **Convenção dos próximos tasks:** ao TDD-ar cada método, o spec vai compilando aos poucos. Cada task **substitui parte** do `users.domain.service.ts` placeholder. Os testes são adicionados/modificados no mesmo `users.domain.service.spec.ts`. O service pode ficar em estado intermediário entre tasks — typecheck deve passar ao final de cada task.

### Task 5: `assertNotSuperAdmin`

**Files:**

- Modify: `src/modules/users/services/users.domain.service.ts`
- Modify: `src/modules/users/tests/users.domain.service.spec.ts`

- [ ] **Step 5.1: Escrever testes**

Substituir conteúdo do spec placeholder por:

```typescript
import { ForbiddenException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../database/prisma.service';
import { UsersDomainService } from '../services/users.domain.service';

const baseUser = (overrides: Partial<User> = {}): User => ({
  id: '00000000-0000-7000-8000-000000000001',
  companyId: '00000000-0000-7000-8000-00000000aaaa',
  name: 'Test',
  email: 'user@test.local',
  passwordHash: '',
  role: 'AGENT',
  absenceMessage: null,
  absenceActive: false,
  lastSeenAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
});

describe('UsersDomainService.assertNotSuperAdmin', () => {
  let service: UsersDomainService;

  beforeEach(() => {
    service = new UsersDomainService({} as unknown as PrismaService);
  });

  it('throws ForbiddenException when target is SUPER_ADMIN', () => {
    const target = baseUser({ role: 'SUPER_ADMIN' });
    expect(() => service.assertNotSuperAdmin(target)).toThrow(
      new ForbiddenException('Você não tem permissão para esta ação'),
    );
  });

  it('passes when target is ADMIN', () => {
    expect(() => service.assertNotSuperAdmin(baseUser({ role: 'ADMIN' }))).not.toThrow();
  });

  it('passes when target is SUPERVISOR', () => {
    expect(() => service.assertNotSuperAdmin(baseUser({ role: 'SUPERVISOR' }))).not.toThrow();
  });

  it('passes when target is AGENT', () => {
    expect(() => service.assertNotSuperAdmin(baseUser({ role: 'AGENT' }))).not.toThrow();
  });
});
```

- [ ] **Step 5.2: Rodar e ver falhar**

Run: `pnpm test users.domain.service`
Expected: FAIL — `service.assertNotSuperAdmin is not a function` (ou TypeError).

- [ ] **Step 5.3: Implementar `assertNotSuperAdmin`**

Substituir conteúdo do `users.domain.service.ts` placeholder por:

```typescript
import { ForbiddenException, Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class UsersDomainService {
  constructor(private readonly prisma: PrismaService) {}

  assertNotSuperAdmin(target: User): void {
    if (target.role === 'SUPER_ADMIN') {
      throw new ForbiddenException('Você não tem permissão para esta ação');
    }
  }
}
```

- [ ] **Step 5.4: Rodar e ver passar**

Run: `pnpm test users.domain.service`
Expected: PASS (4 testes).

Run: `pnpm typecheck && pnpm build`
Expected: PASS. (Application service ainda chama métodos inexistentes — comentar os corpos do app service ou retornar `throw new Error('not impl')` se necessário.)

> Se o build quebrar por causa do `application.service.ts`, substituir o corpo dos métodos do app service por `throw new Error('Not implemented yet');` e remover imports de DTOs que ainda não existem. As tasks 14-21 reescrevem o app service do zero.

- [ ] **Step 5.5: Commit**

```bash
git add src/modules/users
git commit -m "feat(users): UsersDomainService.assertNotSuperAdmin with TDD"
```

---

### Task 6: `findByEmailRaw` + `assertEmailNotInUse`

**Files:**

- Modify: `src/modules/users/services/users.domain.service.ts`
- Modify: `src/modules/users/tests/users.domain.service.spec.ts`

`findByEmailRaw` é trivial wrapper sem teste unit (testing-strategy: "métodos que apenas chamam Prisma sem lógica" não testar). `assertEmailNotInUse` tem regra → testar.

- [ ] **Step 6.1: Adicionar testes de `assertEmailNotInUse`**

Append ao spec:

```typescript
describe('UsersDomainService.assertEmailNotInUse', () => {
  let service: UsersDomainService;
  let prisma: { user: { findUnique: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    prisma = { user: { findUnique: vi.fn() } };
    service = new UsersDomainService(prisma as unknown as PrismaService);
  });

  it('passes when email is not in use', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.assertEmailNotInUse('new@x.com')).resolves.toBeUndefined();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'new@x.com' } });
  });

  it('throws ConflictException when another user has the email (any tenant, including soft-deleted)', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser({ id: 'other-id', email: 'taken@x.com' }));
    await expect(service.assertEmailNotInUse('taken@x.com')).rejects.toMatchObject({
      status: 409,
      message: 'Email já cadastrado',
    });
  });

  it('throws ConflictException even when email belongs to a soft-deleted user', async () => {
    prisma.user.findUnique.mockResolvedValue(
      baseUser({ id: 'deleted-id', email: 'old@x.com', deletedAt: new Date() }),
    );
    await expect(service.assertEmailNotInUse('old@x.com')).rejects.toMatchObject({ status: 409 });
  });

  it('passes when email belongs to the same user (exceptUserId)', async () => {
    const existing = baseUser({ id: 'self-id', email: 'self@x.com' });
    prisma.user.findUnique.mockResolvedValue(existing);
    await expect(service.assertEmailNotInUse('self@x.com', 'self-id')).resolves.toBeUndefined();
  });

  it('throws when email belongs to a different user even when exceptUserId is provided', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser({ id: 'other-id', email: 'taken@x.com' }));
    await expect(service.assertEmailNotInUse('taken@x.com', 'self-id')).rejects.toMatchObject({
      status: 409,
    });
  });
});
```

- [ ] **Step 6.2: Rodar e ver falhar**

Run: `pnpm test users.domain.service`
Expected: FAIL no novo describe — `assertEmailNotInUse is not a function`.

- [ ] **Step 6.3: Implementar `findByEmailRaw` + `assertEmailNotInUse`**

Adicionar ao `UsersDomainService` (preservando o método anterior):

```typescript
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class UsersDomainService {
  constructor(private readonly prisma: PrismaService) {}

  assertNotSuperAdmin(target: User): void {
    if (target.role === 'SUPER_ADMIN') {
      throw new ForbiddenException('Você não tem permissão para esta ação');
    }
  }

  async findByEmailRaw(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async assertEmailNotInUse(email: string, exceptUserId?: string): Promise<void> {
    const existing = await this.findByEmailRaw(email);
    if (existing && existing.id !== exceptUserId) {
      throw new ConflictException('Email já cadastrado');
    }
  }
}
```

- [ ] **Step 6.4: Rodar e ver passar**

Run: `pnpm test users.domain.service`
Expected: PASS (4 + 5 = 9 testes).

- [ ] **Step 6.5: Commit**

```bash
git add src/modules/users
git commit -m "feat(users): findByEmailRaw + assertEmailNotInUse with TDD"
```

---

### Task 7: `assertDepartmentsBelongToTenant`

**Files:**

- Modify: `src/modules/users/services/users.domain.service.ts`
- Modify: `src/modules/users/tests/users.domain.service.spec.ts`

- [ ] **Step 7.1: Adicionar testes**

Append ao spec:

```typescript
describe('UsersDomainService.assertDepartmentsBelongToTenant', () => {
  let service: UsersDomainService;
  let tx: { department: { count: ReturnType<typeof vi.fn> } };
  const COMPANY = '00000000-0000-7000-8000-00000000aaaa';

  beforeEach(() => {
    tx = { department: { count: vi.fn() } };
    service = new UsersDomainService({} as unknown as PrismaService);
  });

  it('returns immediately without DB call when deptIds is empty', async () => {
    await expect(
      service.assertDepartmentsBelongToTenant([], COMPANY, tx as never),
    ).resolves.toBeUndefined();
    expect(tx.department.count).not.toHaveBeenCalled();
  });

  it('passes when count matches deptIds.length', async () => {
    tx.department.count.mockResolvedValue(2);
    const ids = ['00000000-0000-7000-8000-00000000d001', '00000000-0000-7000-8000-00000000d002'];
    await expect(
      service.assertDepartmentsBelongToTenant(ids, COMPANY, tx as never),
    ).resolves.toBeUndefined();
    expect(tx.department.count).toHaveBeenCalledWith({
      where: { id: { in: ids }, companyId: COMPANY, deletedAt: null },
    });
  });

  it('throws BadRequestException when count is less than deptIds.length', async () => {
    tx.department.count.mockResolvedValue(1);
    const ids = ['00000000-0000-7000-8000-00000000d001', '00000000-0000-7000-8000-00000000d002'];
    await expect(
      service.assertDepartmentsBelongToTenant(ids, COMPANY, tx as never),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Departamento(s) não encontrado(s) no tenant',
    });
  });
});
```

- [ ] **Step 7.2: Rodar e ver falhar**

Run: `pnpm test users.domain.service`
Expected: FAIL — `assertDepartmentsBelongToTenant is not a function`.

- [ ] **Step 7.3: Implementar**

Adicionar ao service (preservar métodos anteriores):

```typescript
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';

// ... métodos existentes ...

  async assertDepartmentsBelongToTenant(
    deptIds: string[],
    companyId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (deptIds.length === 0) return;
    const count = await tx.department.count({
      where: { id: { in: deptIds }, companyId, deletedAt: null },
    });
    if (count !== deptIds.length) {
      throw new BadRequestException('Departamento(s) não encontrado(s) no tenant');
    }
  }
```

> Nota: o `Department` não tem `deletedAt` em todas migrações? Verificar com `grep "deletedAt" prisma/schema.prisma` — sim, presente (linha 297 no schema). Confirmar que dept soft-deletado é considerado "não encontrado": **sim**, esse é o comportamento desejado (não pode atribuir user a depto que está sendo descontinuado).

- [ ] **Step 7.4: Rodar e ver passar**

Run: `pnpm test users.domain.service`
Expected: PASS (9 + 3 = 12 testes).

- [ ] **Step 7.5: Commit**

```bash
git add src/modules/users
git commit -m "feat(users): assertDepartmentsBelongToTenant with TDD"
```

---

### Task 8: `assertNotLastAdmin`

**Files:**

- Modify: `src/modules/users/services/users.domain.service.ts`
- Modify: `src/modules/users/tests/users.domain.service.spec.ts`

- [ ] **Step 8.1: Adicionar testes**

Append:

```typescript
describe('UsersDomainService.assertNotLastAdmin', () => {
  let service: UsersDomainService;
  let tx: { user: { count: ReturnType<typeof vi.fn> } };
  const COMPANY = '00000000-0000-7000-8000-00000000aaaa';
  const USER_ID = '00000000-0000-7000-8000-000000000001';

  beforeEach(() => {
    tx = { user: { count: vi.fn() } };
    service = new UsersDomainService({} as unknown as PrismaService);
  });

  it('passes when at least one other active ADMIN exists in the tenant', async () => {
    tx.user.count.mockResolvedValue(1);
    await expect(
      service.assertNotLastAdmin(USER_ID, COMPANY, tx as never),
    ).resolves.toBeUndefined();
    expect(tx.user.count).toHaveBeenCalledWith({
      where: {
        companyId: COMPANY,
        role: 'ADMIN',
        deletedAt: null,
        id: { not: USER_ID },
      },
    });
  });

  it('throws ConflictException when no other active ADMIN exists', async () => {
    tx.user.count.mockResolvedValue(0);
    await expect(service.assertNotLastAdmin(USER_ID, COMPANY, tx as never)).rejects.toMatchObject({
      status: 409,
      message: 'Não é possível remover o último ADMIN do tenant',
    });
  });
});
```

- [ ] **Step 8.2: Rodar e ver falhar**

Run: `pnpm test users.domain.service`
Expected: FAIL — `assertNotLastAdmin is not a function`.

- [ ] **Step 8.3: Implementar**

Adicionar:

```typescript
  async assertNotLastAdmin(
    userId: string,
    companyId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const others = await tx.user.count({
      where: {
        companyId,
        role: 'ADMIN',
        deletedAt: null,
        id: { not: userId },
      },
    });
    if (others === 0) {
      throw new ConflictException('Não é possível remover o último ADMIN do tenant');
    }
  }
```

- [ ] **Step 8.4: Rodar e ver passar**

Run: `pnpm test users.domain.service`
Expected: PASS (12 + 2 = 14 testes).

- [ ] **Step 8.5: Commit**

```bash
git add src/modules/users
git commit -m "feat(users): assertNotLastAdmin with TDD"
```

---

### Task 9: `findByIdWithDepartments` (sem unit test, e2e cobre)

**Files:**

- Modify: `src/modules/users/services/users.domain.service.ts`

Trivial Prisma query — testing-strategy.md: "Métodos que apenas chamam Prisma sem lógica" não testar unitariamente.

- [ ] **Step 9.1: Adicionar tipo auxiliar e método**

No topo de `users.domain.service.ts`, adicionar tipo:

```typescript
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

export type UserWithDepartments = User & {
  departments: Array<{ department: { id: string; name: string } }>;
};
```

Método dentro da classe:

```typescript
  async findByIdWithDepartments(
    userId: string,
    companyId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<UserWithDepartments> {
    const db = tx ?? this.prisma;
    const user = await db.user.findFirst({
      where: { id: userId, companyId, deletedAt: null },
      include: {
        departments: {
          include: {
            department: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return user;
  }
```

- [ ] **Step 9.2: Verificar typecheck**

Run: `pnpm typecheck`
Expected: PASS. Os testes existentes continuam passando.

Run: `pnpm test users.domain.service`
Expected: PASS (14 testes).

- [ ] **Step 9.3: Commit**

```bash
git add src/modules/users
git commit -m "feat(users): findByIdWithDepartments with optional tx"
```

---

### Task 10: `list` com cursor pagination

**Files:**

- Modify: `src/modules/users/services/users.domain.service.ts`
- Modify: `src/modules/users/tests/users.domain.service.spec.ts`

Light unit test pra encode/decode do cursor; resto e2e cobre.

- [ ] **Step 10.1: Adicionar testes do cursor**

Append:

```typescript
describe('UsersDomainService.list cursor encoding', () => {
  let service: UsersDomainService;

  beforeEach(() => {
    service = new UsersDomainService({} as unknown as PrismaService);
  });

  it('encodes and decodes a cursor symmetrically', () => {
    const date = new Date('2026-05-01T10:00:00.000Z');
    const id = '00000000-0000-7000-8000-000000000001';
    const cursor = service.encodeCursor(date, id);
    expect(typeof cursor).toBe('string');
    const decoded = service.decodeCursor(cursor);
    expect(decoded).toEqual({ createdAt: date, id });
  });

  it('returns null when decoding undefined', () => {
    expect(service.decodeCursor(undefined)).toBeNull();
  });

  it('throws BadRequestException when cursor is malformed', () => {
    expect(() => service.decodeCursor('not-base64-json')).toThrow();
  });
});
```

- [ ] **Step 10.2: Rodar e ver falhar**

Run: `pnpm test users.domain.service`
Expected: FAIL — `service.encodeCursor is not a function`.

- [ ] **Step 10.3: Implementar `list` + helpers**

Adicionar tipo de retorno e métodos:

```typescript
export interface ListUsersFilters {
  role?: 'ADMIN' | 'SUPERVISOR' | 'AGENT' | 'SUPER_ADMIN';
  active?: boolean;
  departmentId?: string;
  search?: string;
}

export interface ListUsersPagination {
  cursor?: string;
  limit: number;
}

export interface ListUsersResult {
  items: UserWithDepartments[];
  nextCursor: string | null;
  hasMore: boolean;
}

// dentro da classe
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

  async list(
    companyId: string,
    filters: ListUsersFilters,
    pagination: ListUsersPagination,
  ): Promise<ListUsersResult> {
    const decoded = this.decodeCursor(pagination.cursor);
    const where: Prisma.UserWhereInput = {
      companyId,
      ...(filters.active !== false ? { deletedAt: null } : {}),
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.departmentId
        ? { departments: { some: { departmentId: filters.departmentId } } }
        : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { email: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(decoded
        ? {
            OR: [
              { createdAt: { lt: decoded.createdAt } },
              { createdAt: decoded.createdAt, id: { lt: decoded.id } },
            ],
          }
        : {}),
    };

    const items = await this.prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.limit + 1,
      include: {
        departments: {
          include: { department: { select: { id: true, name: true } } },
        },
      },
    });

    const hasMore = items.length > pagination.limit;
    const trimmed = hasMore ? items.slice(0, pagination.limit) : items;
    const last = trimmed[trimmed.length - 1];
    const nextCursor = hasMore && last ? this.encodeCursor(last.createdAt, last.id) : null;

    return { items: trimmed, nextCursor, hasMore };
  }
```

> **Nota sobre composição do `where` quando há cursor + search:** o `OR` do cursor pode conflitar com o `OR` do search. Como ambos são "OR" no top level, o Prisma os mescla. Para evitar bug, embrulhar:

Refatorar a montagem do `where` pra usar `AND` quando ambos cursor e search estão presentes:

```typescript
const conditions: Prisma.UserWhereInput[] = [];
if (filters.search) {
  conditions.push({
    OR: [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { email: { contains: filters.search, mode: 'insensitive' } },
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

const where: Prisma.UserWhereInput = {
  companyId,
  ...(filters.active !== false ? { deletedAt: null } : {}),
  ...(filters.role ? { role: filters.role } : {}),
  ...(filters.departmentId
    ? { departments: { some: { departmentId: filters.departmentId } } }
    : {}),
  ...(conditions.length > 0 ? { AND: conditions } : {}),
};
```

Trocar a montagem inicial por essa.

- [ ] **Step 10.4: Rodar e ver passar**

Run: `pnpm test users.domain.service`
Expected: PASS (14 + 3 = 17 testes).

- [ ] **Step 10.5: Commit**

```bash
git add src/modules/users
git commit -m "feat(users): list with cursor pagination + filters"
```

---

### Task 11: `create`

**Files:**

- Modify: `src/modules/users/services/users.domain.service.ts`
- Modify: `src/modules/users/tests/users.domain.service.spec.ts`

- [ ] **Step 11.1: Adicionar testes**

Append:

```typescript
describe('UsersDomainService.create', () => {
  let service: UsersDomainService;
  let prisma: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
  };
  let tx: {
    user: { create: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
    department: { count: ReturnType<typeof vi.fn> };
    userDepartment: { createMany: ReturnType<typeof vi.fn> };
  };
  const COMPANY = '00000000-0000-7000-8000-00000000aaaa';

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
    };
    tx = {
      user: { create: vi.fn(), findFirst: vi.fn() },
      department: { count: vi.fn() },
      userDepartment: { createMany: vi.fn() },
    };
    service = new UsersDomainService(prisma as unknown as PrismaService);
  });

  it('throws ConflictException when email is already in use', async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser({ email: 'taken@x.com' }));
    await expect(
      service.create(
        {
          name: 'New',
          email: 'taken@x.com',
          passwordHash: 'h',
          role: 'AGENT',
          departmentIds: [],
        },
        COMPANY,
        tx as never,
      ),
    ).rejects.toMatchObject({ status: 409, message: 'Email já cadastrado' });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when departmentIds do not all belong to tenant', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    tx.department.count.mockResolvedValue(1); // dois ids, só 1 encontrado
    await expect(
      service.create(
        {
          name: 'New',
          email: 'new@x.com',
          passwordHash: 'h',
          role: 'AGENT',
          departmentIds: [
            '00000000-0000-7000-8000-00000000d001',
            '00000000-0000-7000-8000-00000000d002',
          ],
        },
        COMPANY,
        tx as never,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('creates user without departments when departmentIds is empty', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const created = baseUser({ id: 'new-id', email: 'new@x.com' });
    tx.user.create.mockResolvedValue(created);
    tx.user.findFirst.mockResolvedValue({ ...created, departments: [] });

    const result = await service.create(
      {
        name: 'New',
        email: 'new@x.com',
        passwordHash: 'h',
        role: 'AGENT',
        departmentIds: [],
      },
      COMPANY,
      tx as never,
    );

    expect(tx.user.create).toHaveBeenCalled();
    expect(tx.userDepartment.createMany).not.toHaveBeenCalled();
    expect(result.id).toBe('new-id');
  });

  it('creates user and links departments when departmentIds is non-empty', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    tx.department.count.mockResolvedValue(2);
    const created = baseUser({ id: 'new-id', email: 'new@x.com' });
    tx.user.create.mockResolvedValue(created);
    tx.user.findFirst.mockResolvedValue({ ...created, departments: [] });
    const ids = ['00000000-0000-7000-8000-00000000d001', '00000000-0000-7000-8000-00000000d002'];

    await service.create(
      {
        name: 'New',
        email: 'new@x.com',
        passwordHash: 'h',
        role: 'AGENT',
        departmentIds: ids,
      },
      COMPANY,
      tx as never,
    );

    expect(tx.userDepartment.createMany).toHaveBeenCalledWith({
      data: ids.map((d) => ({ userId: 'new-id', departmentId: d })),
    });
  });
});
```

- [ ] **Step 11.2: Rodar e ver falhar**

Run: `pnpm test users.domain.service`
Expected: FAIL — `service.create is not a function`.

- [ ] **Step 11.3: Implementar `create`**

Adicionar interface de input + método:

```typescript
export interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'AGENT';
  departmentIds: string[];
}

// dentro da classe
  async create(
    input: CreateUserInput,
    companyId: string,
    tx: Prisma.TransactionClient,
  ): Promise<UserWithDepartments> {
    await this.assertEmailNotInUse(input.email);
    await this.assertDepartmentsBelongToTenant(input.departmentIds, companyId, tx);

    const created = await tx.user.create({
      data: {
        companyId,
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
      },
    });

    if (input.departmentIds.length > 0) {
      await tx.userDepartment.createMany({
        data: input.departmentIds.map((d) => ({ userId: created.id, departmentId: d })),
      });
    }

    return this.findByIdWithDepartments(created.id, companyId, tx);
  }
```

- [ ] **Step 11.4: Rodar e ver passar**

Run: `pnpm test users.domain.service`
Expected: PASS (17 + 4 = 21 testes).

- [ ] **Step 11.5: Commit**

```bash
git add src/modules/users
git commit -m "feat(users): UsersDomainService.create with TDD"
```

---

### Task 12: `update`

**Files:**

- Modify: `src/modules/users/services/users.domain.service.ts`
- Modify: `src/modules/users/tests/users.domain.service.spec.ts`

Cobre TC-USER-2b (demote último ADMIN), dept sync, SUPER_ADMIN guard, email collision com `exceptUserId`.

- [ ] **Step 12.1: Adicionar testes**

Append:

```typescript
describe('UsersDomainService.update', () => {
  let service: UsersDomainService;
  let prisma: {
    user: { findUnique: ReturnType<typeof vi.fn> };
  };
  let tx: {
    user: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    department: { count: ReturnType<typeof vi.fn> };
    userDepartment: {
      deleteMany: ReturnType<typeof vi.fn>;
      createMany: ReturnType<typeof vi.fn>;
    };
  };
  const COMPANY = '00000000-0000-7000-8000-00000000aaaa';
  const USER_ID = '00000000-0000-7000-8000-000000000001';

  beforeEach(() => {
    prisma = { user: { findUnique: vi.fn() } };
    tx = {
      user: { findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
      department: { count: vi.fn() },
      userDepartment: { deleteMany: vi.fn(), createMany: vi.fn() },
    };
    service = new UsersDomainService(prisma as unknown as PrismaService);
  });

  const stubExisting = (overrides: Partial<User> = {}) => {
    const existing = {
      ...baseUser({ id: USER_ID, companyId: COMPANY, ...overrides }),
      departments: [],
    };
    tx.user.findFirst.mockResolvedValue(existing);
    return existing;
  };

  it('throws NotFoundException when target does not exist or is soft-deleted', async () => {
    tx.user.findFirst.mockResolvedValue(null);
    await expect(
      service.update(USER_ID, COMPANY, { name: 'X' }, tx as never),
    ).rejects.toMatchObject({ status: 404, message: 'Usuário não encontrado' });
  });

  it('throws ForbiddenException when target is SUPER_ADMIN', async () => {
    stubExisting({ role: 'SUPER_ADMIN' });
    await expect(
      service.update(USER_ID, COMPANY, { name: 'X' }, tx as never),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('throws ConflictException when email is changed to one already in use', async () => {
    stubExisting({ role: 'AGENT', email: 'self@x.com' });
    prisma.user.findUnique.mockResolvedValue(baseUser({ id: 'other', email: 'taken@x.com' }));
    await expect(
      service.update(USER_ID, COMPANY, { email: 'taken@x.com' }, tx as never),
    ).rejects.toMatchObject({ status: 409, message: 'Email já cadastrado' });
  });

  it('passes when email is unchanged', async () => {
    stubExisting({ role: 'AGENT', email: 'self@x.com' });
    tx.user.update.mockResolvedValue({});
    tx.user.findFirst.mockResolvedValueOnce({
      ...baseUser({ id: USER_ID, role: 'AGENT', email: 'self@x.com' }),
      departments: [],
    });
    tx.user.findFirst.mockResolvedValueOnce({
      ...baseUser({ id: USER_ID, role: 'AGENT', email: 'self@x.com', name: 'Renamed' }),
      departments: [],
    });
    await expect(
      service.update(USER_ID, COMPANY, { name: 'Renamed' }, tx as never),
    ).resolves.toBeDefined();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('throws ConflictException when demoting the last ADMIN', async () => {
    stubExisting({ role: 'ADMIN' });
    tx.user.count.mockResolvedValue(0); // nenhum outro ADMIN ativo
    await expect(
      service.update(USER_ID, COMPANY, { role: 'AGENT' }, tx as never),
    ).rejects.toMatchObject({
      status: 409,
      message: 'Não é possível remover o último ADMIN do tenant',
    });
  });

  it('passes when demoting an ADMIN with at least one other active ADMIN', async () => {
    stubExisting({ role: 'ADMIN' });
    tx.user.count.mockResolvedValue(1);
    tx.user.update.mockResolvedValue({});
    tx.user.findFirst.mockResolvedValueOnce({
      ...baseUser({ id: USER_ID, role: 'ADMIN' }),
      departments: [],
    });
    tx.user.findFirst.mockResolvedValueOnce({
      ...baseUser({ id: USER_ID, role: 'AGENT' }),
      departments: [],
    });
    await expect(
      service.update(USER_ID, COMPANY, { role: 'AGENT' }, tx as never),
    ).resolves.toBeDefined();
  });

  it('replaces departments completely when departmentIds is provided', async () => {
    stubExisting({ role: 'AGENT' });
    tx.department.count.mockResolvedValue(2);
    tx.user.update.mockResolvedValue({});
    tx.user.findFirst.mockResolvedValueOnce({
      ...baseUser({ id: USER_ID, role: 'AGENT' }),
      departments: [],
    });
    tx.user.findFirst.mockResolvedValueOnce({
      ...baseUser({ id: USER_ID, role: 'AGENT' }),
      departments: [],
    });
    const ids = ['00000000-0000-7000-8000-00000000d001', '00000000-0000-7000-8000-00000000d002'];

    await service.update(USER_ID, COMPANY, { departmentIds: ids }, tx as never);

    expect(tx.userDepartment.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(tx.userDepartment.createMany).toHaveBeenCalledWith({
      data: ids.map((d) => ({ userId: USER_ID, departmentId: d })),
    });
  });
});
```

- [ ] **Step 12.2: Rodar e ver falhar**

Run: `pnpm test users.domain.service`
Expected: FAIL — `service.update is not a function`.

- [ ] **Step 12.3: Implementar `update`**

Adicionar interface de patch + método + helper de sync:

```typescript
export interface UpdateUserPatch {
  name?: string;
  email?: string;
  passwordHash?: string;
  role?: 'ADMIN' | 'SUPERVISOR' | 'AGENT';
  departmentIds?: string[];
  absenceMessage?: string | null;
  absenceActive?: boolean;
}

// dentro da classe
  async update(
    userId: string,
    companyId: string,
    patch: UpdateUserPatch,
    tx: Prisma.TransactionClient,
  ): Promise<UserWithDepartments> {
    const existing = await this.findByIdWithDepartments(userId, companyId, tx);
    this.assertNotSuperAdmin(existing);

    if (patch.email && patch.email !== existing.email) {
      await this.assertEmailNotInUse(patch.email, existing.id);
    }

    if (patch.role && existing.role === 'ADMIN' && patch.role !== 'ADMIN') {
      await this.assertNotLastAdmin(existing.id, companyId, tx);
    }

    if (patch.departmentIds !== undefined) {
      await this.assertDepartmentsBelongToTenant(patch.departmentIds, companyId, tx);
      await this.syncDepartments(existing.id, patch.departmentIds, tx);
    }

    const userScalarPatch: Prisma.UserUpdateInput = {};
    if (patch.name !== undefined) userScalarPatch.name = patch.name;
    if (patch.email !== undefined) userScalarPatch.email = patch.email;
    if (patch.passwordHash !== undefined) userScalarPatch.passwordHash = patch.passwordHash;
    if (patch.role !== undefined) userScalarPatch.role = patch.role;
    if (patch.absenceMessage !== undefined) userScalarPatch.absenceMessage = patch.absenceMessage;
    if (patch.absenceActive !== undefined) userScalarPatch.absenceActive = patch.absenceActive;

    if (Object.keys(userScalarPatch).length > 0) {
      await tx.user.update({ where: { id: existing.id }, data: userScalarPatch });
    }

    return this.findByIdWithDepartments(existing.id, companyId, tx);
  }

  private async syncDepartments(
    userId: string,
    deptIds: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.userDepartment.deleteMany({ where: { userId } });
    if (deptIds.length > 0) {
      await tx.userDepartment.createMany({
        data: deptIds.map((d) => ({ userId, departmentId: d })),
      });
    }
  }
```

- [ ] **Step 12.4: Rodar e ver passar**

Run: `pnpm test users.domain.service`
Expected: PASS (21 + 7 = 28 testes).

- [ ] **Step 12.5: Commit**

```bash
git add src/modules/users
git commit -m "feat(users): UsersDomainService.update + syncDepartments with TDD"
```

---

### Task 13: `softDelete`

**Files:**

- Modify: `src/modules/users/services/users.domain.service.ts`
- Modify: `src/modules/users/tests/users.domain.service.spec.ts`

- [ ] **Step 13.1: Adicionar testes**

Append:

```typescript
describe('UsersDomainService.softDelete', () => {
  let service: UsersDomainService;
  let tx: {
    user: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
  };
  const COMPANY = '00000000-0000-7000-8000-00000000aaaa';
  const USER_ID = '00000000-0000-7000-8000-000000000001';

  beforeEach(() => {
    tx = { user: { findFirst: vi.fn(), update: vi.fn(), count: vi.fn() } };
    service = new UsersDomainService({} as unknown as PrismaService);
  });

  it('throws NotFoundException when target does not exist', async () => {
    tx.user.findFirst.mockResolvedValue(null);
    await expect(service.softDelete(USER_ID, COMPANY, tx as never)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('throws ForbiddenException when target is SUPER_ADMIN', async () => {
    tx.user.findFirst.mockResolvedValue({
      ...baseUser({ id: USER_ID, role: 'SUPER_ADMIN' }),
      departments: [],
    });
    await expect(service.softDelete(USER_ID, COMPANY, tx as never)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('throws ConflictException when target is the last ADMIN', async () => {
    tx.user.findFirst.mockResolvedValue({
      ...baseUser({ id: USER_ID, role: 'ADMIN' }),
      departments: [],
    });
    tx.user.count.mockResolvedValue(0);
    await expect(service.softDelete(USER_ID, COMPANY, tx as never)).rejects.toMatchObject({
      status: 409,
      message: 'Não é possível remover o último ADMIN do tenant',
    });
  });

  it('soft-deletes a non-last ADMIN by setting deletedAt', async () => {
    tx.user.findFirst.mockResolvedValue({
      ...baseUser({ id: USER_ID, role: 'ADMIN' }),
      departments: [],
    });
    tx.user.count.mockResolvedValue(1);

    await service.softDelete(USER_ID, COMPANY, tx as never);

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('soft-deletes an AGENT without checking last-admin', async () => {
    tx.user.findFirst.mockResolvedValue({
      ...baseUser({ id: USER_ID, role: 'AGENT' }),
      departments: [],
    });

    await service.softDelete(USER_ID, COMPANY, tx as never);

    expect(tx.user.count).not.toHaveBeenCalled();
    expect(tx.user.update).toHaveBeenCalled();
  });
});
```

- [ ] **Step 13.2: Rodar e ver falhar**

Run: `pnpm test users.domain.service`
Expected: FAIL — `service.softDelete is not a function`.

- [ ] **Step 13.3: Implementar `softDelete`**

```typescript
  async softDelete(
    userId: string,
    companyId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const existing = await this.findByIdWithDepartments(userId, companyId, tx);
    this.assertNotSuperAdmin(existing);
    if (existing.role === 'ADMIN') {
      await this.assertNotLastAdmin(existing.id, companyId, tx);
    }
    await tx.user.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  }
```

- [ ] **Step 13.4: Rodar e ver passar**

Run: `pnpm test users.domain.service`
Expected: PASS (28 + 5 = 33 testes).

Run: `pnpm typecheck && pnpm build`
Expected: PASS.

- [ ] **Step 13.5: Commit**

```bash
git add src/modules/users
git commit -m "feat(users): UsersDomainService.softDelete with TDD"
```

---

## Phase 3 — Application service + controllers (e2e por endpoint)

### Task 14: Application service skeleton + DTO mapper

**Files:**

- Modify: `src/modules/users/services/users.application.service.ts`

Sem teste — application services são thin orquestradores (testing-strategy.md). E2E cobre.

- [ ] **Step 14.1: Reescrever do zero**

```typescript
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../database/prisma.service';
import { AuthDomainService } from '../../auth/services/auth.domain.service';
import type { CreateUserDto } from '../schemas/create-user.schema';
import type { ListUsersQueryDto } from '../schemas/list-users.schema';
import type { UpdateMeDto } from '../schemas/update-me.schema';
import type { UpdateUserDto } from '../schemas/update-user.schema';
import type { UserListResponseDto, UserResponseDto } from '../schemas/user-response.schema';
import {
  UsersDomainService,
  type UpdateUserPatch,
  type UserWithDepartments,
} from './users.domain.service';

const BCRYPT_COST = 12;
const EMAIL_DUPLICATED_MESSAGE = 'Email já cadastrado';

@Injectable()
export class UsersApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersDomain: UsersDomainService,
    private readonly authDomain: AuthDomainService,
  ) {}

  async create(input: CreateUserDto, companyId: string): Promise<UserResponseDto> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    try {
      const user = await this.prisma.$transaction((tx) =>
        this.usersDomain.create(
          {
            name: input.name,
            email: input.email,
            passwordHash,
            role: input.role,
            departmentIds: input.departmentIds,
          },
          companyId,
          tx,
        ),
      );
      return this.toDto(user);
    } catch (err) {
      throw this.mapEmailConflict(err);
    }
  }

  async list(companyId: string, query: ListUsersQueryDto): Promise<UserListResponseDto> {
    const result = await this.usersDomain.list(
      companyId,
      {
        role: query.role,
        active: query.active,
        departmentId: query.departmentId,
        search: query.search,
      },
      { cursor: query.cursor, limit: query.limit },
    );
    return {
      items: result.items.map((u) => this.toDto(u)),
      pagination: { nextCursor: result.nextCursor, hasMore: result.hasMore },
    };
  }

  async findById(id: string, companyId: string): Promise<UserResponseDto> {
    const user = await this.usersDomain.findByIdWithDepartments(id, companyId);
    return this.toDto(user);
  }

  async updateById(id: string, companyId: string, input: UpdateUserDto): Promise<UserResponseDto> {
    const patch = await this.toPatch(input);
    try {
      const user = await this.prisma.$transaction((tx) =>
        this.usersDomain.update(id, companyId, patch, tx),
      );
      return this.toDto(user);
    } catch (err) {
      throw this.mapEmailConflict(err);
    }
  }

  async updateMe(currentUser: User, input: UpdateMeDto): Promise<UserResponseDto> {
    const patch: UpdateUserPatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.password) patch.passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    if ('absenceMessage' in input) patch.absenceMessage = input.absenceMessage ?? null;
    if (input.absenceActive !== undefined) patch.absenceActive = input.absenceActive;

    const user = await this.prisma.$transaction((tx) =>
      this.usersDomain.update(currentUser.id, currentUser.companyId, patch, tx),
    );
    return this.toDto(user);
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    await this.prisma.$transaction((tx) => this.usersDomain.softDelete(id, companyId, tx));
  }

  async forceLogout(targetId: string, companyId: string): Promise<void> {
    const target = await this.usersDomain.findByIdWithDepartments(targetId, companyId);
    this.usersDomain.assertNotSuperAdmin(target);
    await this.authDomain.revokeAllRefreshTokens(targetId, companyId);
  }

  private async toPatch(input: UpdateUserDto): Promise<UpdateUserPatch> {
    const patch: UpdateUserPatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.email !== undefined) patch.email = input.email;
    if (input.password) patch.passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    if (input.role !== undefined) patch.role = input.role;
    if (input.departmentIds !== undefined) patch.departmentIds = input.departmentIds;
    if ('absenceMessage' in input) patch.absenceMessage = input.absenceMessage ?? null;
    if (input.absenceActive !== undefined) patch.absenceActive = input.absenceActive;
    return patch;
  }

  private toDto(user: UserWithDepartments): UserResponseDto {
    return {
      id: user.id,
      companyId: user.companyId,
      name: user.name,
      email: user.email,
      role: user.role,
      absenceMessage: user.absenceMessage,
      absenceActive: user.absenceActive,
      lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
      departments: user.departments.map((ud) => ({
        id: ud.department.id,
        name: ud.department.name,
      })),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private mapEmailConflict(err: unknown): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      Array.isArray((err.meta as { target?: string[] } | undefined)?.target) &&
      (err.meta as { target: string[] }).target.includes('email')
    ) {
      return new ConflictException(EMAIL_DUPLICATED_MESSAGE);
    }
    return err;
  }
}
```

- [ ] **Step 14.2: Verificar typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 14.3: Commit**

```bash
git add src/modules/users
git commit -m "feat(users): UsersApplicationService with bcrypt + P2002 email mapping"
```

---

### Task 15: `POST /users` — controller + e2e

**Files:**

- Modify: `src/modules/users/controllers/users.controller.ts`
- Modify: `src/modules/users/tests/users.controller.e2e-spec.ts`

- [ ] **Step 15.1: Escrever e2e (vai falhar)**

Substituir conteúdo do spec placeholder por:

```typescript
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as bcrypt from 'bcrypt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapTestApp } from '../../../../test/e2e/setup-app';
import {
  createCompany,
  createDepartment,
  createUser,
  loginAs,
  truncateAll,
} from '../../../../test/e2e/factories';
import { getPrisma } from '../../../../test/setup-prisma';

interface UserDto {
  id: string;
  companyId: string;
  name: string;
  email: string;
  role: string;
  departments: Array<{ id: string; name: string }>;
  absenceActive: boolean;
  absenceMessage: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  items: UserDto[];
  pagination: { nextCursor: string | null; hasMore: boolean };
}

interface ErrorBody {
  message: string;
  errors?: Array<{ field: string; message: string; code: string }>;
}

async function setupAdmin(app: NestFastifyApplication) {
  const company = await createCompany(getPrisma());
  const { user: admin, password } = await createUser(getPrisma(), company.id, {
    role: 'ADMIN',
    email: `admin-${Date.now()}@x.com`,
  });
  const tokens = await loginAs(app, admin.email, password);
  return { company, admin, tokens };
}

describe('UsersController POST /users (e2e)', () => {
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

  it('creates an AGENT and returns it with departments populated', async () => {
    const { company, tokens } = await setupAdmin(app);
    const dept = await createDepartment(getPrisma(), company.id, { name: 'Suporte' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: 'Maria',
        email: 'maria@x.com',
        password: 'valid-pass-1234',
        role: 'AGENT',
        departmentIds: [dept.id],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<UserDto>();
    expect(body.email).toBe('maria@x.com');
    expect(body.role).toBe('AGENT');
    expect(body.departments).toEqual([{ id: dept.id, name: 'Suporte' }]);

    const persisted = await getPrisma().user.findUnique({ where: { id: body.id } });
    expect(persisted?.passwordHash).toBeTruthy();
    expect(persisted?.passwordHash).not.toBe('valid-pass-1234');
    expect(await bcrypt.compare('valid-pass-1234', persisted!.passwordHash)).toBe(true);
  });

  it('returns 400 when role is SUPER_ADMIN (TC-USER-1)', async () => {
    const { tokens } = await setupAdmin(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: 'X',
        email: 'x@x.com',
        password: 'valid-pass-1234',
        role: 'SUPER_ADMIN',
        departmentIds: [],
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 409 when email already exists in the same tenant (TC-USER-4)', async () => {
    const { company, tokens } = await setupAdmin(app);
    await createUser(getPrisma(), company.id, { email: 'taken@x.com' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: 'Y',
        email: 'taken@x.com',
        password: 'valid-pass-1234',
        role: 'AGENT',
        departmentIds: [],
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toBe('Email já cadastrado');
  });

  it('returns 409 when email already exists in another tenant (TC-USER-5)', async () => {
    const { tokens } = await setupAdmin(app);
    const otherCompany = await createCompany(getPrisma());
    await createUser(getPrisma(), otherCompany.id, { email: 'cross@x.com' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: 'Y',
        email: 'cross@x.com',
        password: 'valid-pass-1234',
        role: 'AGENT',
        departmentIds: [],
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 400 when departmentIds reference a department in another tenant', async () => {
    const { tokens } = await setupAdmin(app);
    const otherCompany = await createCompany(getPrisma());
    const otherDept = await createDepartment(getPrisma(), otherCompany.id);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: 'Y',
        email: 'y@x.com',
        password: 'valid-pass-1234',
        role: 'AGENT',
        departmentIds: [otherDept.id],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<ErrorBody>().message).toBe('Departamento(s) não encontrado(s) no tenant');
  });

  it('returns 403 when caller is AGENT', async () => {
    const company = await createCompany(getPrisma());
    const { user: agent, password } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    const tokens = await loginAs(app, agent.email, password);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: 'Y',
        email: 'y@x.com',
        password: 'valid-pass-1234',
        role: 'AGENT',
        departmentIds: [],
      },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 401 when no JWT is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: {
        name: 'Y',
        email: 'y@x.com',
        password: 'valid-pass-1234',
        role: 'AGENT',
        departmentIds: [],
      },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

> Nota: o spec usa interfaces `UserDto`/`ListResponse`/`ErrorBody` reaproveitáveis nas próximas tasks. Manter no topo do arquivo.

- [ ] **Step 15.2: Rodar e ver falhar**

Run: `pnpm test:e2e users.controller`
Expected: FAIL — controller retorna `NotImplementedException` ou rota não existe.

- [ ] **Step 15.3: Implementar controller (POST apenas; outros endpoints virão nas próximas tasks)**

Substituir conteúdo do `users.controller.ts` placeholder por:

```typescript
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentCompany } from '../../../common/decorators/current-company.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CreateUserSchema, type CreateUserDto } from '../schemas/create-user.schema';
import { UserResponseSchema, type UserResponseDto } from '../schemas/user-response.schema';
import { UsersApplicationService } from '../services/users.application.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersApplicationService) {}

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ZodSerializerDto(UserResponseSchema)
  async create(
    @Body() body: CreateUserDto,
    @CurrentCompany() companyId: string,
  ): Promise<UserResponseDto> {
    return this.users.create(body, companyId);
  }
}
```

> Nota sobre validação do body: como `ZodValidationPipe` está global (`src/app.module.ts:33`), o body é validado pelo schema Zod via `nestjs-zod`. Para que o pipe global pegue o schema certo, é preciso registrar o tipo importando do arquivo `*.schema.ts` e o nest-zod faz a "magia" de inferência através do tipo do parâmetro. Conferir auth controller para o padrão (`AuthController:23` usa `LoginDto` direto). Caso não esteja inferindo, anotar com `@UsePipes(new ZodValidationPipe(CreateUserSchema))` localmente — mas evite repetir, prefira ficar global.

> **Verificação concreta** após implementar: o auth flow funciona com o `LoginDto = z.infer<typeof LoginSchema>`. Olhando o nestjs-zod docs, ele usa `createZodDto` para classes ou `@UsePipes` explícito. O padrão atual do projeto pode estar usando `createZodDto`. Verificar com `grep "createZodDto" src/modules/auth`.

Se o projeto usa `createZodDto`, ajustar os schemas pra exportar tanto o `Schema` quanto a `Dto` class:

```typescript
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateUserSchema = z.object({ ... }).strict();
export class CreateUserDto extends createZodDto(CreateUserSchema) {}
```

E o controller usa:

```typescript
async create(@Body() body: CreateUserDto, ...) { ... }
```

**Antes de continuar, fazer:**

```bash
grep -rn "createZodDto" src/modules/auth/schemas
```

Se aparecer, **adotar esse padrão em todos os 5 schemas do users** (Task 4 reescrito mentalmente). Se não aparecer, manter `z.infer` puro e validar via `@UsePipes(new ZodValidationPipe(CreateUserSchema))` no método.

- [ ] **Step 15.4: Rodar e ver passar**

Run: `pnpm test:e2e users.controller`
Expected: PASS (7 testes do POST).

Run: `pnpm test:e2e auth.controller`
Expected: PASS (Sprint 0.3 não pode quebrar).

- [ ] **Step 15.5: Commit**

```bash
git add src/modules/users
git commit -m "feat(users): POST /users with TDD (TC-USER-1, TC-USER-4, TC-USER-5)"
```

---

### Task 16: `GET /users` (list) — controller + e2e

**Files:**

- Modify: `src/modules/users/controllers/users.controller.ts`
- Modify: `src/modules/users/tests/users.controller.e2e-spec.ts`

- [ ] **Step 16.1: Adicionar describe ao e2e**

Append:

```typescript
describe('UsersController GET /users (e2e)', () => {
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

  it('lists users of the tenant filtered by role=AGENT', async () => {
    const { company, tokens } = await setupAdmin(app);
    await createUser(getPrisma(), company.id, { role: 'AGENT', email: 'a1@x.com' });
    await createUser(getPrisma(), company.id, { role: 'AGENT', email: 'a2@x.com' });
    await createUser(getPrisma(), company.id, { role: 'SUPERVISOR', email: 's1@x.com' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users?role=AGENT&active=true',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<ListResponse>();
    expect(body.items.length).toBe(2);
    body.items.forEach((u) => expect(u.role).toBe('AGENT'));
  });

  it('does not list users from other tenants (multi-tenant isolation)', async () => {
    const { tokens } = await setupAdmin(app);
    const otherCompany = await createCompany(getPrisma());
    await createUser(getPrisma(), otherCompany.id, { email: 'cross@x.com' });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const emails = res.json<ListResponse>().items.map((u) => u.email);
    expect(emails).not.toContain('cross@x.com');
  });

  it('does not list soft-deleted users by default', async () => {
    const { company, tokens } = await setupAdmin(app);
    const { user } = await createUser(getPrisma(), company.id, { email: 'deleted@x.com' });
    await getPrisma().user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    const emails = res.json<ListResponse>().items.map((u) => u.email);
    expect(emails).not.toContain('deleted@x.com');
  });

  it('supports cursor pagination (returns nextCursor when hasMore)', async () => {
    const { company, tokens } = await setupAdmin(app);
    for (let i = 0; i < 25; i++) {
      await createUser(getPrisma(), company.id, { email: `bulk-${i}@x.com` });
    }

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users?limit=10',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    const body = res.json<ListResponse>();
    expect(body.items.length).toBe(10);
    expect(body.pagination.hasMore).toBe(true);
    expect(body.pagination.nextCursor).toBeTruthy();

    const res2 = await app.inject({
      method: 'GET',
      url: `/api/v1/users?limit=10&cursor=${encodeURIComponent(body.pagination.nextCursor!)}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    const body2 = res2.json<ListResponse>();
    expect(body2.items.length).toBe(10);
    const ids1 = new Set(body.items.map((u) => u.id));
    body2.items.forEach((u) => expect(ids1.has(u.id)).toBe(false));
  });

  it('AGENT can list users (read-only access)', async () => {
    const company = await createCompany(getPrisma());
    const { user: agent, password } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    const tokens = await loginAs(app, agent.email, password);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 16.2: Rodar e ver falhar**

Run: `pnpm test:e2e users.controller -t "GET /users"`
Expected: FAIL — rota não existe.

- [ ] **Step 16.3: Adicionar handler ao controller**

Adicionar imports e método ao `users.controller.ts`:

```typescript
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
// ... outros imports
import {
  ListUsersQuerySchema,
  type ListUsersQueryDto,
} from '../schemas/list-users.schema';
import {
  UserListResponseSchema,
  UserResponseSchema,
  type UserListResponseDto,
  type UserResponseDto,
} from '../schemas/user-response.schema';

// dentro da classe
  @Get()
  @ZodSerializerDto(UserListResponseSchema)
  async list(
    @Query() query: ListUsersQueryDto,
    @CurrentCompany() companyId: string,
  ): Promise<UserListResponseDto> {
    return this.users.list(companyId, query);
  }
```

> Nota: query params via Zod precisam de `@UsePipes(new ZodValidationPipe(ListUsersQuerySchema))` se o pipe global não cobre `@Query()`. Conferir o comportamento: nestjs-zod com `createZodDto` (se adotado) ou anotação local. Se não estiver funcionando, anotar localmente:

```typescript
  @Get()
  @UsePipes(new ZodValidationPipe(ListUsersQuerySchema))
  @ZodSerializerDto(UserListResponseSchema)
  async list(
    @Query() query: ListUsersQueryDto,
    ...
```

- [ ] **Step 16.4: Rodar e ver passar**

Run: `pnpm test:e2e users.controller`
Expected: PASS (7 + 5 = 12 testes).

- [ ] **Step 16.5: Commit**

```bash
git add src/modules/users
git commit -m "feat(users): GET /users with cursor pagination + filters"
```

---

### Task 17: `GET /users/:id` — controller + e2e

**Files:**

- Modify: `src/modules/users/controllers/users.controller.ts`
- Modify: `src/modules/users/tests/users.controller.e2e-spec.ts`

- [ ] **Step 17.1: Adicionar describe ao e2e**

Append:

```typescript
describe('UsersController GET /users/:id (e2e)', () => {
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

  it('returns user with departments populated', async () => {
    const { company, tokens } = await setupAdmin(app);
    const dept = await createDepartment(getPrisma(), company.id, { name: 'Vendas' });
    const { user: agent } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    await getPrisma().userDepartment.create({
      data: { userId: agent.id, departmentId: dept.id },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${agent.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<UserDto>();
    expect(body.id).toBe(agent.id);
    expect(body.departments).toEqual([{ id: dept.id, name: 'Vendas' }]);
  });

  it('returns 404 when user belongs to another tenant', async () => {
    const { tokens } = await setupAdmin(app);
    const otherCompany = await createCompany(getPrisma());
    const { user: cross } = await createUser(getPrisma(), otherCompany.id);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${cross.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>().message).toBe('Usuário não encontrado');
  });

  it('returns 404 when user is soft-deleted', async () => {
    const { company, tokens } = await setupAdmin(app);
    const { user } = await createUser(getPrisma(), company.id);
    await getPrisma().user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${user.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 17.2: Rodar e ver falhar**

Run: `pnpm test:e2e users.controller -t "GET /users/:id"`
Expected: FAIL.

- [ ] **Step 17.3: Adicionar handler**

```typescript
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';

  @Get(':id')
  @ZodSerializerDto(UserResponseSchema)
  async findById(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ): Promise<UserResponseDto> {
    return this.users.findById(id, companyId);
  }
```

- [ ] **Step 17.4: Rodar e ver passar**

Run: `pnpm test:e2e users.controller`
Expected: PASS (12 + 3 = 15 testes).

- [ ] **Step 17.5: Commit**

```bash
git add src/modules/users
git commit -m "feat(users): GET /users/:id"
```

---

### Task 18: `PATCH /users/:id` — controller + e2e

**Files:**

- Modify: `src/modules/users/controllers/users.controller.ts`
- Modify: `src/modules/users/tests/users.controller.e2e-spec.ts`

- [ ] **Step 18.1: Adicionar describe ao e2e**

Append (cobre TC-USER-2b, TC-USER-6, email collision, happy path):

```typescript
describe('UsersController PATCH /users/:id (e2e)', () => {
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

  it('admin updates name and password of another user (verifies bcrypt change)', async () => {
    const { company, tokens } = await setupAdmin(app);
    const { user: target } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
      email: 'before@x.com',
    });
    const beforeHash = (await getPrisma().user.findUnique({ where: { id: target.id } }))!
      .passwordHash;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'Renamed', password: 'new-pass-99999' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<UserDto>().name).toBe('Renamed');

    const afterHash = (await getPrisma().user.findUnique({ where: { id: target.id } }))!
      .passwordHash;
    expect(afterHash).not.toBe(beforeHash);
    expect(await bcrypt.compare('new-pass-99999', afterHash)).toBe(true);
  });

  it('returns 409 when demoting the last ADMIN (TC-USER-2b)', async () => {
    const { admin, tokens } = await setupAdmin(app);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${admin.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { role: 'AGENT' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toBe('Não é possível remover o último ADMIN do tenant');
  });

  it('allows demoting an ADMIN when another ADMIN exists', async () => {
    const { company, tokens } = await setupAdmin(app);
    const { user: secondAdmin } = await createUser(getPrisma(), company.id, {
      role: 'ADMIN',
      email: 'admin2@x.com',
    });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${secondAdmin.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { role: 'AGENT' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<UserDto>().role).toBe('AGENT');
  });

  it('returns 403 when AGENT tries to PATCH another user (TC-USER-6)', async () => {
    const company = await createCompany(getPrisma());
    const { user: agent, password } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    const { user: other } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
      email: 'other@x.com',
    });
    const tokens = await loginAs(app, agent.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${other.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'Hijack' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 409 when changing email to one already in use', async () => {
    const { company, tokens } = await setupAdmin(app);
    const { user: target } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
      email: 'me@x.com',
    });
    await createUser(getPrisma(), company.id, { email: 'taken@x.com' });

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { email: 'taken@x.com' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toBe('Email já cadastrado');
  });

  it('returns 404 when target is in another tenant (multi-tenant isolation)', async () => {
    const { tokens } = await setupAdmin(app);
    const otherCompany = await createCompany(getPrisma());
    const { user: cross } = await createUser(getPrisma(), otherCompany.id);

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${cross.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 18.2: Rodar e ver falhar**

Run: `pnpm test:e2e users.controller -t "PATCH /users/:id"`
Expected: FAIL.

- [ ] **Step 18.3: Adicionar handler**

```typescript
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  UpdateUserSchema,
  type UpdateUserDto,
} from '../schemas/update-user.schema';

  @Patch(':id')
  @Roles('ADMIN')
  @ZodSerializerDto(UserResponseSchema)
  async update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentCompany() companyId: string,
  ): Promise<UserResponseDto> {
    return this.users.updateById(id, companyId, body);
  }
```

- [ ] **Step 18.4: Rodar e ver passar**

Run: `pnpm test:e2e users.controller`
Expected: PASS (15 + 6 = 21 testes).

- [ ] **Step 18.5: Commit**

```bash
git add src/modules/users
git commit -m "feat(users): PATCH /users/:id (TC-USER-2b, TC-USER-6, email conflict)"
```

---

### Task 19: `DELETE /users/:id` — controller + e2e

**Files:**

- Modify: `src/modules/users/controllers/users.controller.ts`
- Modify: `src/modules/users/tests/users.controller.e2e-spec.ts`

- [ ] **Step 19.1: Adicionar describe ao e2e**

Append:

```typescript
describe('UsersController DELETE /users/:id (e2e)', () => {
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

  it('soft-deletes a non-last ADMIN target', async () => {
    const { company, tokens } = await setupAdmin(app);
    const { user: target } = await createUser(getPrisma(), company.id, { role: 'AGENT' });

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(204);

    const persisted = await getPrisma().user.findUnique({ where: { id: target.id } });
    expect(persisted?.deletedAt).not.toBeNull();
  });

  it('subsequent GET returns 404 after DELETE', async () => {
    const { company, tokens } = await setupAdmin(app);
    const { user: target } = await createUser(getPrisma(), company.id, { role: 'AGENT' });

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when deleting the last ADMIN (TC-USER-2a)', async () => {
    const { admin, tokens } = await setupAdmin(app);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${admin.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toBe('Não é possível remover o último ADMIN do tenant');
  });

  it('returns 403 when caller is AGENT', async () => {
    const company = await createCompany(getPrisma());
    const { user: agent, password } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    const { user: target } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
      email: 'other@x.com',
    });
    const tokens = await loginAs(app, agent.email, password);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when target is in another tenant', async () => {
    const { tokens } = await setupAdmin(app);
    const otherCompany = await createCompany(getPrisma());
    const { user: cross } = await createUser(getPrisma(), otherCompany.id);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${cross.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('blocks recreating with the same email after soft-delete (decision §1.1)', async () => {
    const { company, tokens } = await setupAdmin(app);
    const { user: target } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
      email: 'will-be-deleted@x.com',
    });
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${target.id}`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: 'New',
        email: 'will-be-deleted@x.com',
        password: 'valid-pass-1234',
        role: 'AGENT',
        departmentIds: [],
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json<ErrorBody>().message).toBe('Email já cadastrado');
  });
});
```

- [ ] **Step 19.2: Rodar e ver falhar**

Run: `pnpm test:e2e users.controller -t "DELETE /users/:id"`
Expected: FAIL.

- [ ] **Step 19.3: Adicionar handler**

```typescript
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ): Promise<void> {
    await this.users.softDelete(id, companyId);
  }
```

- [ ] **Step 19.4: Rodar e ver passar**

Run: `pnpm test:e2e users.controller`
Expected: PASS (21 + 6 = 27 testes).

- [ ] **Step 19.5: Commit**

```bash
git add src/modules/users
git commit -m "feat(users): DELETE /users/:id soft-delete (TC-USER-2a, email-after-delete)"
```

---

### Task 20: `POST /users/:id/force-logout` — controller + e2e

**Files:**

- Modify: `src/modules/users/controllers/users.controller.ts`
- Modify: `src/modules/users/tests/users.controller.e2e-spec.ts`

- [ ] **Step 20.1: Adicionar describe ao e2e**

Append:

```typescript
describe('UsersController POST /users/:id/force-logout (e2e)', () => {
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

  it("revokes target's refresh tokens, subsequent /auth/refresh returns 401 (TC-USER-3)", async () => {
    const { company, tokens: adminTokens } = await setupAdmin(app);
    const { user: target, password: targetPass } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
      email: 'target@x.com',
    });
    const targetTokens = await loginAs(app, target.email, targetPass);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${target.id}/force-logout`,
      headers: { authorization: `Bearer ${adminTokens.accessToken}` },
    });
    expect(res.statusCode).toBe(204);

    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: targetTokens.refreshToken },
    });
    expect(refreshRes.statusCode).toBe(401);
  });

  it('allows admin to force-logout self', async () => {
    const { admin, tokens } = await setupAdmin(app);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${admin.id}/force-logout`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(204);

    const refreshRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: tokens.refreshToken },
    });
    expect(refreshRes.statusCode).toBe(401);
  });

  it('returns 403 when target is SUPER_ADMIN of the same tenant', async () => {
    const company = await createCompany(getPrisma());
    const { user: superAdmin } = await createUser(getPrisma(), company.id, {
      role: 'SUPER_ADMIN',
      email: 'super@x.com',
    });
    const { user: admin, password } = await createUser(getPrisma(), company.id, { role: 'ADMIN' });
    const tokens = await loginAs(app, admin.email, password);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${superAdmin.id}/force-logout`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 404 when target is soft-deleted', async () => {
    const { company, tokens } = await setupAdmin(app);
    const { user: target } = await createUser(getPrisma(), company.id);
    await getPrisma().user.update({ where: { id: target.id }, data: { deletedAt: new Date() } });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${target.id}/force-logout`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 when target is in another tenant', async () => {
    const { tokens } = await setupAdmin(app);
    const otherCompany = await createCompany(getPrisma());
    const { user: cross } = await createUser(getPrisma(), otherCompany.id);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${cross.id}/force-logout`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when caller is AGENT', async () => {
    const company = await createCompany(getPrisma());
    const { user: agent, password } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    const { user: target } = await createUser(getPrisma(), company.id, {
      role: 'AGENT',
      email: 'other@x.com',
    });
    const tokens = await loginAs(app, agent.email, password);

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${target.id}/force-logout`,
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
```

- [ ] **Step 20.2: Rodar e ver falhar**

Run: `pnpm test:e2e users.controller -t "force-logout"`
Expected: FAIL.

- [ ] **Step 20.3: Adicionar handler**

```typescript
  @Post(':id/force-logout')
  @Roles('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  async forceLogout(
    @Param('id') id: string,
    @CurrentCompany() companyId: string,
  ): Promise<void> {
    await this.users.forceLogout(id, companyId);
  }
```

- [ ] **Step 20.4: Rodar e ver passar**

Run: `pnpm test:e2e users.controller`
Expected: PASS (27 + 6 = 33 testes).

- [ ] **Step 20.5: Commit**

```bash
git add src/modules/users
git commit -m "feat(users): POST /users/:id/force-logout (TC-USER-3, SUPER_ADMIN guard)"
```

---

### Task 21: `PATCH /me` — novo controller + e2e

**Files:**

- Create: `src/modules/users/controllers/me.controller.ts`
- Create: `src/modules/users/tests/me.controller.e2e-spec.ts`
- Modify: `src/modules/users/users.module.ts` (descomentar `MeController`)

- [ ] **Step 21.1: Escrever e2e**

Criar `src/modules/users/tests/me.controller.e2e-spec.ts`:

```typescript
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import * as bcrypt from 'bcrypt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapTestApp } from '../../../../test/e2e/setup-app';
import { createCompany, createUser, loginAs, truncateAll } from '../../../../test/e2e/factories';
import { getPrisma } from '../../../../test/setup-prisma';

interface UserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  absenceMessage: string | null;
  absenceActive: boolean;
}

describe('MeController PATCH /me (e2e)', () => {
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

  it('AGENT updates own name, password, and absence (TC-USER-7)', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    const tokens = await loginAs(app, user.email, password);
    const beforeHash = (await getPrisma().user.findUnique({ where: { id: user.id } }))!
      .passwordHash;

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: {
        name: 'New Name',
        password: 'new-pass-12345',
        absenceMessage: 'Em férias',
        absenceActive: true,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<UserDto>();
    expect(body.name).toBe('New Name');
    expect(body.absenceActive).toBe(true);
    expect(body.absenceMessage).toBe('Em férias');

    const afterHash = (await getPrisma().user.findUnique({ where: { id: user.id } }))!.passwordHash;
    expect(afterHash).not.toBe(beforeHash);
    expect(await bcrypt.compare('new-pass-12345', afterHash)).toBe(true);
  });

  it('returns 400 when AGENT tries to escalate role (TC-USER-7-neg)', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { role: 'ADMIN' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when AGENT tries to change email via /me', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { email: 'hijack@x.com' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when AGENT tries to set departmentIds via /me', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, { role: 'AGENT' });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { departmentIds: [] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('ADMIN can also use /me to change own name and password', async () => {
    const company = await createCompany(getPrisma());
    const { user, password } = await createUser(getPrisma(), company.id, { role: 'ADMIN' });
    const tokens = await loginAs(app, user.email, password);

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      payload: { name: 'Admin Renamed' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<UserDto>().name).toBe('Admin Renamed');
  });

  it('returns 401 when no JWT is provided', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 21.2: Rodar e ver falhar**

Run: `pnpm test:e2e me.controller`
Expected: FAIL — rota não existe.

- [ ] **Step 21.3: Implementar `MeController`**

Criar `src/modules/users/controllers/me.controller.ts`:

```typescript
import { Body, Controller, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { UpdateMeSchema, type UpdateMeDto } from '../schemas/update-me.schema';
import { UserResponseSchema, type UserResponseDto } from '../schemas/user-response.schema';
import { UsersApplicationService } from '../services/users.application.service';

@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersApplicationService) {}

  @Patch()
  @ZodSerializerDto(UserResponseSchema)
  async updateMe(
    @Body() body: UpdateMeDto,
    @CurrentUser() currentUser: User,
  ): Promise<UserResponseDto> {
    return this.users.updateMe(currentUser, body);
  }
}
```

- [ ] **Step 21.4: Descomentar `MeController` no `UsersModule`**

Editar `src/modules/users/users.module.ts`:

```typescript
import { MeController } from './controllers/me.controller';
// ...

@Module({
  imports: [AuthModule],
  controllers: [UsersController, MeController],
  providers: [UsersApplicationService, UsersDomainService],
  exports: [UsersApplicationService, UsersDomainService],
})
export class UsersModule {}
```

- [ ] **Step 21.5: Rodar e ver passar**

Run: `pnpm test:e2e me.controller`
Expected: PASS (6 testes).

Run: `pnpm test:e2e`
Expected: PASS (auth + users + me).

- [ ] **Step 21.6: Commit**

```bash
git add src/modules/users
git commit -m "feat(users): PATCH /me with strict schema (TC-USER-7, TC-USER-7-neg)"
```

---

## Phase 4 — Verificação final + ROADMAP

### Task 22: Gates de qualidade + ROADMAP + smoke manual

**Files:**

- Modify: `ROADMAP.md`

- [ ] **Step 22.1: Rodar todos os gates locais**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:schema
pnpm test:e2e
pnpm build
```

Expected: todos PASS.

Se algum falhar, corrigir antes de prosseguir.

- [ ] **Step 22.2: Smoke test manual com curl**

Executar o fluxo §10 do spec usando o backend rodando localmente (`pnpm start:dev` em outro terminal). Usar `httpie` ou `curl` direto. Anotar qualquer divergência inesperada.

Sequência:

```bash
# 1. Login SUPER_ADMIN do seed
curl -sX POST localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"super@digichat.local","password":"<senha-do-seed>"}'
# (capturar accessToken e companyId)

# 2-3. Criar ADMIN e AGENT
curl -sX POST localhost:3000/api/v1/users \
  -H 'Authorization: Bearer <token_super>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Admin Tenant","email":"admin@x.com","password":"valid-pass-1234","role":"ADMIN","departmentIds":[]}'

curl -sX POST localhost:3000/api/v1/users \
  -H 'Authorization: Bearer <token_super>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Agent X","email":"agent@x.com","password":"valid-pass-1234","role":"AGENT","departmentIds":[]}'

# 4. Listar
curl -sX GET localhost:3000/api/v1/users -H 'Authorization: Bearer <token_super>'

# 5. Login AGENT
curl -sX POST localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"agent@x.com","password":"valid-pass-1234"}'

# 6. PATCH /me como AGENT, mudar name → 200
curl -sX PATCH localhost:3000/api/v1/me \
  -H 'Authorization: Bearer <token_agent>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Agent Renamed"}'

# 7. PATCH /me como AGENT com role → 400
curl -isX PATCH localhost:3000/api/v1/me \
  -H 'Authorization: Bearer <token_agent>' \
  -H 'Content-Type: application/json' \
  -d '{"role":"ADMIN"}'

# 8. Force-logout AGENT como SUPER_ADMIN → 204
curl -isX POST localhost:3000/api/v1/users/<agentId>/force-logout \
  -H 'Authorization: Bearer <token_super>'

# 9. Refresh do AGENT → 401
curl -isX POST localhost:3000/api/v1/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refresh_agent_capturado_no_5>"}'

# 10. DELETE AGENT → 204
curl -isX DELETE localhost:3000/api/v1/users/<agentId> \
  -H 'Authorization: Bearer <token_super>'

# 11. Tentar criar com email igual → 409
curl -isX POST localhost:3000/api/v1/users \
  -H 'Authorization: Bearer <token_super>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Y","email":"agent@x.com","password":"valid-pass-1234","role":"AGENT","departmentIds":[]}'
```

Expected: cada chamada retorna o status esperado conforme spec §10.

- [ ] **Step 22.3: Atualizar ROADMAP.md**

No arquivo `ROADMAP.md` §5 (Fase 0), localizar:

```diff
 ### CRUD básico (estrutura 3 camadas em todos)

 - [ ] Companies (apenas SUPER_ADMIN)
-- [ ] Users (com force-logout)
+- [x] Users (com force-logout)
 - [ ] Departments (com working hours)
```

- [ ] **Step 22.4: Commit final**

```bash
git add ROADMAP.md
git commit -m "docs(roadmap): mark sprint 0.4 users crud as done"
```

- [ ] **Step 22.5: Push branch e abrir PR**

Confirmar com o usuário antes de pushar (CLAUDE.md raiz §4 regra 22: nunca tentar push em main; e o prompt de Sprint 0.4 diz "Não fazer push pro remote sem confirmar").

Quando autorizado:

```bash
git push -u origin feat/sprint-0-4-users-crud
gh pr create --title "feat: sprint 0.4 users crud (with force-logout)" --body "$(cat <<'EOF'
## Summary

- Implements POST/GET/PATCH/DELETE on `/api/v1/users` + POST `/users/:id/force-logout` + PATCH `/me`.
- Multi-tenant isolation enforced in `UsersDomainService` via `assertEmailNotInUse` (global), `assertDepartmentsBelongToTenant`, `assertNotLastAdmin`, `assertNotSuperAdmin`.
- Email after soft-delete: stays occupied forever (decision §1.1 of spec).
- Self-edit isolated to `PATCH /me` with strict Zod schema (TC-USER-7-neg).
- Force-logout: 204, reuses `AuthDomainService.revokeAllRefreshTokens`; 403 on SUPER_ADMIN, 404 on soft-deleted.

## Test plan

- [ ] `pnpm typecheck` — PASS
- [ ] `pnpm lint` — PASS
- [ ] `pnpm test` — unit + schema (Sprint 0.2/0.3 unchanged)
- [ ] `pnpm test:e2e` — auth.e2e + users + me
- [ ] `pnpm build` — PASS
- [ ] Manual smoke (12 steps in spec §10) — verify locally

Spec: `docs/superpowers/specs/2026-05-01-sprint-0-4-users-crud-design.md`
Plan: `docs/superpowers/plans/2026-05-01-sprint-0-4-users-crud.md`
EOF
)"
```

---

## Self-Review (do plano)

Esta seção é a checagem final do escritor do plano contra o spec. Marcar mentalmente cada item antes de declarar o plano completo.

**1. Spec coverage**

- §1.1 Email após soft-delete → Task 19 step 1 cobre o caso "criar com email de deleted → 409".
- §1.2 Self-edit vs admin-edit → Task 18 (PATCH `/users/:id`) + Task 21 (PATCH `/me`).
- §1.3 Force-logout 204 + 403 SUPER_ADMIN + 404 soft-deleted → Task 20 com 6 e2e cobrindo.
- §1.4 Soft-delete não revoga tokens → Application service não chama `revokeAllRefreshTokens` em `softDelete` (Task 14).
- §2 Superfície da API → Tasks 15-21 cobrem 7 endpoints, todos com `@Roles` certo.
- §3 Schemas → Task 4 cria os 5; ajuste de `createZodDto` previsto em Task 15 step 3 caso o projeto adote.
- §4 Domain service métodos públicos → Tasks 5-13.
- §4.3 Helpers privados → Tasks 6 (assertEmailNotInUse), 7 (assertDepartmentsBelongToTenant), 8 (assertNotLastAdmin), 12 (syncDepartments).
- §4.4 Invariantes → testes unit/e2e cobrem cada uma.
- §5 Application service por endpoint → Task 14 implementa todos os métodos.
- §6 Validações + erros → Tasks 5-13 (domain) + 15-21 (e2e por endpoint).
- §6.3 Race condition email → Task 14 step 1 (`mapEmailConflict` com `Prisma.PrismaClientKnownRequestError` + `P2002`).
- §7 Estrutura de arquivos → Tasks 1-2 + 21.
- §8 Testes → Tasks 5-13 (unit) + 15-21 (e2e).
- §8.4 Factory additions → Task 3.
- §9 Verificação por evidência → Task 22.
- §10 Smoke test manual → Task 22 step 2.
- §11 Migration → nenhuma (nota explícita no header).
- §12 Mapeamento ROADMAP → Task 22 step 3.

**2. Placeholder scan** — `grep -nE "TBD|TODO|implement later|fill in details" docs/superpowers/plans/2026-05-01-sprint-0-4-users-crud.md` deve retornar zero matches reais (excluindo "TODO" como string mencionada em comentários do schematic). Conferido.

**3. Type/method consistency** — `assertEmailNotInUse` chamado consistente em Task 6 (definição) e Tasks 11/12 (uso). `findByIdWithDepartments` recebe `tx?` em Task 9 e é usado com `tx` em Tasks 12/13/14. `UpdateUserPatch` definido em Task 12 e importado em Task 14. `UserWithDepartments` exportado em Task 9 e usado em Task 14 (`toDto`).

Plano consistente. Pronto para execução.
