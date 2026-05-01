# Sprint 0.4 — Users CRUD (com force-logout) — Design

> **Escopo:** `crm-api`, Fase 0, item "Users (com force-logout)" do `ROADMAP.md` §5.
>
> **Branch:** `feat/sprint-0-4-users-crud` (a partir de `bde140f`, tip de `origin/main`).
>
> **Audit fonte da verdade:** `crm-specs/audits/audit-03A-cadastros-base.md` §3 (D-USER-1..8, RF-USER-1..7, TC-USER-1..8).
>
> **Pré-requisitos prontos:** schema Prisma de `User`, `RefreshToken`, `Department`, `UserDepartment` (Sprint 0.2); `AuthDomainService` com `revokeAllRefreshTokens(userId, companyId)` (Sprint 0.3); `JwtAuthGuard`/`RolesGuard` globais; decorators `@CurrentUser`/`@CurrentCompany`/`@Roles`; gerador `pnpm g:feature`; setup de e2e (`test/e2e/factories.ts`, `setup-app.ts`).

---

## 1. Decisões de design (saída do brainstorming)

### 1.1 Email após soft-delete

**Decisão:** opção A — email permanece ocupado para sempre.

`User.email @unique` global (D-USER-8 da Sprint 0.3) continua intacta. Quando ADMIN tenta criar/editar com email já em uso por **qualquer** user (incluindo soft-deleted, em qualquer tenant), retorna **409** `"Email já cadastrado"`. Sem endpoint de `restore`. Sem partial unique index. Sem reescrita do email do soft-deleted.

Justificativa: contexto B2B raramente gera colisão; mantém audit trail íntegro; evolução futura para `restore` é incremental se virar dor real.

### 1.2 Self-edit vs admin-edit

**Decisão:** dois endpoints distintos.

- `PATCH /api/v1/me` — qualquer autenticado, schema **strict** restrito a `name`, `password`, `absenceMessage`, `absenceActive`.
- `PATCH /api/v1/users/:id` — apenas `ADMIN+`, schema completo (`name`, `email`, `password`, `role`, `departmentIds`, `absenceMessage`, `absenceActive`).

Cada controller com schema próprio. Kubb gera dois hooks tipados distintos no frontend, sem ambiguidade. RolesGuard cuida de TC-USER-6 (AGENT chamar `PATCH /users/<other>` → 403) ortogonal por rota. A invariante "AGENT não escala role/dept via `/me`" (TC-USER-7-neg em §6.1) vira validação a nível de schema: `UpdateMeSchema.strict()` rejeita `role`/`email`/`departmentIds` automaticamente com 400 `Unrecognized key` antes de chegar no service.

### 1.3 Force-logout: shape e bordas

- Resposta: **204 No Content**, sem `revokedCount` no body.
- ADMIN pode forçar saída de si mesmo (equivalente a "logout de todos os dispositivos") — **permitido**.
- Alvo SUPER_ADMIN — **bloqueado** com 403 `"Você não tem permissão para esta ação"`.
- Alvo soft-deletado — **404** `"Usuário não encontrado"` (já sumiu da listagem; idempotência silenciosa abriria espaço pra enumeração).
- AuditLog — **fora de Sprint 0.4** (entra junto com `reveal-credentials` em Fase 1).

### 1.4 Outras decisões implícitas no brainstorming

- **Soft-delete não revoga refresh tokens automaticamente.** São ações ortogonais. Se ADMIN quer derrubar o user e remover, chama `force-logout` antes do `DELETE`.
- **PATCH `/users/:id` que muda senha do próprio ADMIN não faz auto-revogação de tokens.** UX "mudei senha, fui deslogado dos outros dispositivos" fica explícita via `force-logout` separado.
- **`bcrypt.hash(password, 12)`** acontece no application service, não no domain (mantém domain testável sem bcrypt nos mocks).
- **`lastSeenAt`** retornado no DTO mas não atualizado nesta sprint (sem socket).

---

## 2. Superfície da API

| Verbo  | Path                             | Permissão            | Sucesso | Resposta                                        |
| ------ | -------------------------------- | -------------------- | ------- | ----------------------------------------------- |
| POST   | `/api/v1/users`                  | ADMIN+ (tenant)      | 201     | `UserResponseDto` (com `departments` populados) |
| GET    | `/api/v1/users`                  | qualquer autenticado | 200     | `{ items: UserResponseDto[], pagination }`      |
| GET    | `/api/v1/users/:id`              | qualquer autenticado | 200     | `UserResponseDto`                               |
| PATCH  | `/api/v1/users/:id`              | ADMIN+ (tenant)      | 200     | `UserResponseDto`                               |
| PATCH  | `/api/v1/me`                     | qualquer autenticado | 200     | `UserResponseDto` (do próprio user)             |
| DELETE | `/api/v1/users/:id`              | ADMIN+ (tenant)      | 204     | —                                               |
| POST   | `/api/v1/users/:id/force-logout` | ADMIN+ (tenant)      | 204     | —                                               |

**Notas:**

1. `GET /users/:id` aberto a qualquer autenticado dentro do tenant — AGENT precisa ver dropdowns de "atribuir a usuário X" e tela de perfil de colega. Filtra `companyId` no domain. Soft-deleted retorna 404.
2. `GET /users` filtros: `?role=AGENT|SUPERVISOR|ADMIN|SUPER_ADMIN&active=true|false&departmentId=<uuid>&search=<texto>&cursor=<base64>&limit=20`. `active=true` (default) exclui `deletedAt != null`. `search` é case-insensitive (ILIKE) em `name` e `email`. Ordenação fixa `createdAt desc`, `id desc` como tie-breaker pro cursor.
3. SUPER_ADMIN passa em `@Roles('ADMIN')` por peso (4 > 3) — a guarda contra alvejá-lo é validação no domain (`assertNotSuperAdmin`).
4. Todos os endpoints filtram `@CurrentCompany()`. Soft-deleted users nunca aparecem em listagem nem detalhe.
5. Sem endpoint `restore`.

---

## 3. Schemas Zod

Cinco arquivos em `src/modules/users/schemas/`.

### 3.1 `create-user.schema.ts`

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

`role` enum sem `SUPER_ADMIN` cobre TC-USER-1 a nível de schema.

### 3.2 `update-user.schema.ts`

```typescript
export const UpdateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    password: z.string().min(8).max(128).optional(),
    role: z.enum(['ADMIN', 'SUPERVISOR', 'AGENT']).optional(),
    departmentIds: z.array(z.string().uuid()).optional(),
    absenceMessage: z.string().max(500).nullable().optional(),
    absenceActive: z.boolean().optional(),
  })
  .strict()
  .describe('Dados para editar usuário (apenas ADMIN+)');

export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
```

### 3.3 `update-me.schema.ts`

```typescript
export const UpdateMeSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    password: z.string().min(8).max(128).optional(),
    absenceMessage: z.string().max(500).nullable().optional(),
    absenceActive: z.boolean().optional(),
  })
  .strict()
  .describe('Dados que o próprio usuário pode editar');

export type UpdateMeDto = z.infer<typeof UpdateMeSchema>;
```

A combinação `.strict()` + omissão de `role/email/departmentIds` defende a invariante TC-USER-7-neg (AGENT não escala role/dept via `/me`) a nível de schema — não chega na lógica de service. TC-USER-6 (AGENT editar outro user) é defesa do RolesGuard em `PATCH /users/:id`.

### 3.4 `list-users.schema.ts`

```typescript
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

`role` aqui inclui `SUPER_ADMIN` (filtro de leitura) enquanto `CreateUserSchema`/`UpdateUserSchema` não permitem (TC-USER-1). Filtrar é OK; criar/promover via API regular não.

### 3.5 `user-response.schema.ts`

```typescript
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

`passwordHash` e `deletedAt` nunca vazam.

---

## 4. Domain service

`src/modules/users/services/users.domain.service.ts`. Acessa Prisma direto. Recebe `companyId` explícito. Não retorna DTO, não emite eventos, não enfileira jobs.

### 4.1 Tipo auxiliar

```typescript
type UserWithDepartments = User & {
  departments: Array<{ department: { id: string; name: string } }>;
};
```

Obtido via `include: { departments: { include: { department: { select: { id: true, name: true } } } } }`.

### 4.2 Métodos públicos

- **`findByIdWithDepartments(userId, companyId, tx?)`** — filtra `deletedAt: null`, `companyId`. Throws `NotFoundException('Usuário não encontrado')` se ausente. Retorna `UserWithDepartments`. `tx` opcional pra usar dentro de transação coordenada (caso de `update`/`softDelete`).

- **`findByEmailRaw(email)`** — sem filtro de `companyId` (email é global unique). Retorna `User | null`. Inclui soft-deleted. Usado em `assertEmailNotInUse`.

- **`list(companyId, filters, pagination)`** — paginação cursor-based. `createdAt desc, id desc` como ordenação estável. `cursor` é base64 de `{ createdAt, id }`. Retorna `{ items: UserWithDepartments[], nextCursor: string | null, hasMore: boolean }`.

- **`create(input, companyId, tx)`** — `input` inclui `passwordHash` (já hasheado pelo application). Sequência:
  1. `assertEmailNotInUse(input.email)` — sem `exceptUserId`.
  2. `assertDepartmentsBelongToTenant(input.departmentIds, companyId, tx)`.
  3. `tx.user.create(...)`.
  4. `tx.userDepartment.createMany(...)` se `departmentIds.length > 0`.
  5. Re-fetch via `findByIdWithDepartments(created.id, companyId, tx)` pra retornar populado.

- **`update(userId, companyId, patch, tx)`** — `patch` opcionalmente contém `passwordHash`. Sequência:
  1. `existing = findByIdWithDepartments(userId, companyId, tx)` — 404 se não acha.
  2. `assertNotSuperAdmin(existing)`.
  3. Se `patch.email && patch.email !== existing.email`: `assertEmailNotInUse(patch.email, existing.id)`.
  4. Se `patch.role && existing.role === 'ADMIN' && patch.role !== 'ADMIN'`: `assertNotLastAdmin(existing.id, companyId, tx)`.
  5. Se `patch.departmentIds`: `assertDepartmentsBelongToTenant(patch.departmentIds, companyId, tx)` + `syncDepartments(existing.id, patch.departmentIds, tx)`.
  6. `tx.user.update({ where: { id: userId }, data: { ...campos não-departmentIds } })`.
  7. Re-fetch e retorna.

- **`softDelete(userId, companyId, tx)`** — sequência:
  1. `existing = findByIdWithDepartments(userId, companyId, tx)`.
  2. `assertNotSuperAdmin(existing)`.
  3. Se `existing.role === 'ADMIN'`: `assertNotLastAdmin(existing.id, companyId, tx)`.
  4. `tx.user.update({ where: { id: userId }, data: { deletedAt: new Date() } })`.
  5. Sem retorno (`Promise<void>`).

- **`assertNotSuperAdmin(target: User)`** — público pra ser chamado direto pelo application no `forceLogout`. Throws `ForbiddenException('Você não tem permissão para esta ação')` se `target.role === 'SUPER_ADMIN'`.

### 4.3 Helpers privados

- **`assertEmailNotInUse(email, exceptUserId?)`** — `findByEmailRaw(email)` retorna user existente (mesmo soft-deleted) e `existing.id !== exceptUserId` → throws `ConflictException('Email já cadastrado')`.

- **`assertDepartmentsBelongToTenant(deptIds, companyId, tx)`** — early-return se `deptIds.length === 0`. `tx.department.count({ where: { id: { in: deptIds }, companyId, deletedAt: null } })`. Se count !== `deptIds.length` → throws `BadRequestException('Departamento(s) não encontrado(s) no tenant')`.

- **`assertNotLastAdmin(userId, companyId, tx)`** — `tx.user.count({ where: { companyId, role: 'ADMIN', deletedAt: null, id: { not: userId } } })`. Se 0 → throws `ConflictException('Não é possível remover o último ADMIN do tenant')`.

- **`syncDepartments(userId, deptIds, tx)`** — `tx.userDepartment.deleteMany({ where: { userId } })` + `tx.userDepartment.createMany({ data: deptIds.map(d => ({ userId, departmentId: d })) })` (se length > 0). Total replace, não merge.

### 4.4 Invariantes garantidas

1. Toda query Prisma carrega `companyId` (exceto `findByEmailRaw` por design — email é global).
2. Soft-deleted user nunca é retornado em queries default; `update`/`softDelete` retornam 404 se alvo está soft-deleted.
3. SUPER_ADMIN nunca é alvo de `update`/`softDelete`/`forceLogout` por essas rotas (`ForbiddenException` 403). Manipulado só via seed/SQL.
4. Last-ADMIN guard cobre tanto `softDelete` quanto `update` que demove role de ADMIN→outro.
5. `departmentIds` sempre validados antes de qualquer escrita em UserDepartment.

### 4.5 O que **não** está no domain

- `bcrypt.hash` — application service.
- `revokeAllRefreshTokens` — `AuthDomainService` (Sprint 0.3).
- Mapeamento pra `UserResponseDto` — application service.

---

## 5. Application service

`src/modules/users/services/users.application.service.ts`. Injeta `PrismaService`, `UsersDomainService`, `AuthDomainService`.

### 5.1 `create(input: CreateUserDto, companyId): Promise<UserResponseDto>`

```
passwordHash = await bcrypt.hash(input.password, 12)
user = await prisma.$transaction(tx =>
  usersDomain.create({ ...input, passwordHash }, companyId, tx)
)
return toDto(user)
```

`P2002` em `User.email` capturado e convertido em `ConflictException('Email já cadastrado')` (race condition entre `assertEmailNotInUse` e o `create`).

### 5.2 `list(companyId, query: ListUsersQueryDto): Promise<UserListResponseDto>`

```
result = await usersDomain.list(companyId, filters, pagination)
return { items: result.items.map(toDto), pagination: { nextCursor, hasMore } }
```

### 5.3 `findById(id, companyId): Promise<UserResponseDto>`

```
user = await usersDomain.findByIdWithDepartments(id, companyId)
return toDto(user)
```

### 5.4 `updateById(id, companyId, input: UpdateUserDto): Promise<UserResponseDto>`

```
patch = { ...input }
if (input.password) {
  patch.passwordHash = await bcrypt.hash(input.password, 12)
  delete patch.password
}
user = await prisma.$transaction(tx =>
  usersDomain.update(id, companyId, patch, tx)
)
return toDto(user)
```

`P2002` em email tratado igual ao `create`.

### 5.5 `updateMe(currentUser: User, input: UpdateMeDto): Promise<UserResponseDto>`

```
patch = {}
if (input.name !== undefined) patch.name = input.name
if (input.password) patch.passwordHash = await bcrypt.hash(input.password, 12)
if ('absenceMessage' in input) patch.absenceMessage = input.absenceMessage  // null válido
if (input.absenceActive !== undefined) patch.absenceActive = input.absenceActive

user = await prisma.$transaction(tx =>
  usersDomain.update(currentUser.id, currentUser.companyId, patch, tx)
)
return toDto(user)
```

A reduplicação proposital: schema strict do controller `/me` impede campos proibidos antes de chegar aqui; este montador de patch é defesa-em-profundidade.

### 5.6 `softDelete(id, companyId): Promise<void>`

```
await prisma.$transaction(tx =>
  usersDomain.softDelete(id, companyId, tx)
)
// Sprint 0.4: NÃO revoga refresh tokens automaticamente. Force-logout é ação separada.
```

### 5.7 `forceLogout(targetId, companyId): Promise<void>`

```
target = await usersDomain.findByIdWithDepartments(targetId, companyId)  // 404 se não acha / soft-deleted
usersDomain.assertNotSuperAdmin(target)                                    // 403 se SUPER_ADMIN
await authDomain.revokeAllRefreshTokens(targetId, companyId)               // Sprint 0.3
```

### 5.8 `toDto(user: UserWithDepartments): UserResponseDto`

```typescript
{
  id, companyId, name, email, role,
  absenceMessage, absenceActive,
  lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
  departments: user.departments.map(ud => ({ id: ud.department.id, name: ud.department.name })),
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
}
```

Sem `passwordHash`, sem `deletedAt`.

---

## 6. Validações e mapeamento de erros

### 6.1 Por caso de teste do audit

| Caso          | Trigger                                                          | Camada                               | Status | Mensagem (pt-BR)                                                  |
| ------------- | ---------------------------------------------------------------- | ------------------------------------ | ------ | ----------------------------------------------------------------- |
| TC-USER-1     | `POST /users` com `role=SUPER_ADMIN`                             | Schema Zod (enum)                    | 400    | `Validação falhou` + erro detalhado em `errors[]`                 |
| TC-USER-2a    | `DELETE /users/:id` do último ADMIN                              | Domain `assertNotLastAdmin`          | 409    | `Não é possível remover o último ADMIN do tenant`                 |
| TC-USER-2b    | `PATCH /users/:id` demovendo último ADMIN (role: ADMIN→AGENT)    | Domain `assertNotLastAdmin`          | 409    | `Não é possível remover o último ADMIN do tenant`                 |
| TC-USER-3     | Force-logout: refresh do alvo deve falhar                        | (e2e: `revokeAllRefreshTokens`)      | 401    | `Sessão expirada. Faça login novamente.` (mensagem da Sprint 0.3) |
| TC-USER-4     | `POST /users` email igual no mesmo tenant                        | Domain `assertEmailNotInUse`         | 409    | `Email já cadastrado`                                             |
| TC-USER-5     | `POST /users` email igual em outro tenant (D-USER-8 global)      | Domain `assertEmailNotInUse`         | 409    | `Email já cadastrado`                                             |
| TC-USER-6     | AGENT chama `PATCH /users/<other>`                               | RolesGuard                           | 403    | `Você não tem permissão para esta ação`                           |
| TC-USER-7     | AGENT chama `PATCH /me` com `{name, password, absence*}`         | (passa)                              | 200    | `UserResponseDto`                                                 |
| TC-USER-7-neg | AGENT chama `PATCH /me` com `{role}`/`{email}`/`{departmentIds}` | Schema Zod `UpdateMeSchema.strict()` | 400    | `Validação falhou` + `Unrecognized key`                           |

### 6.2 Sad paths adicionais

| Cenário                                                                | Camada                                   | Status | Mensagem                                      |
| ---------------------------------------------------------------------- | ---------------------------------------- | ------ | --------------------------------------------- |
| Sem JWT em rota autenticada                                            | JwtAuthGuard global                      | 401    | `Autenticação necessária`                     |
| JWT inválido/expirado                                                  | JwtAuthGuard global                      | 401    | `Sessão expirada. Faça login novamente.`      |
| AGENT em `POST /users`/`DELETE /users/:id`/`force-logout`              | RolesGuard                               | 403    | `Você não tem permissão para esta ação`       |
| GET/PATCH/DELETE/`force-logout` em id de outro tenant                  | Domain `findByIdWithDepartments`         | 404    | `Usuário não encontrado`                      |
| GET/PATCH/DELETE/`force-logout` em user soft-deletado                  | Domain `findByIdWithDepartments`         | 404    | `Usuário não encontrado`                      |
| PATCH/DELETE/`force-logout` em SUPER_ADMIN do mesmo tenant             | Domain `assertNotSuperAdmin`             | 403    | `Você não tem permissão para esta ação`       |
| `POST /users` com `departmentIds` contendo id inexistente/outro tenant | Domain `assertDepartmentsBelongToTenant` | 400    | `Departamento(s) não encontrado(s) no tenant` |
| `PATCH /users/:id` com email já em uso                                 | Domain `assertEmailNotInUse`             | 409    | `Email já cadastrado`                         |
| Senha < 8 chars em qualquer rota                                       | Schema Zod                               | 400    | `Senha deve ter no mínimo 8 caracteres`       |
| Email malformado                                                       | Schema Zod                               | 400    | `Email em formato inválido`                   |
| `limit > 100` no list                                                  | Schema Zod                               | 400    | (mensagem padrão Zod)                         |

### 6.3 Race condition de email

Janela rara entre `assertEmailNotInUse` e o `INSERT` em concorrência. O constraint `User.email @unique` rejeita o segundo INSERT com `Prisma.PrismaClientKnownRequestError` code `P2002`. Application service captura e converte em `ConflictException('Email já cadastrado')`. Padrão já documentado em `docs/conventions/error-handling.md` §"Erros em transações".

### 6.4 Fora de escopo do Sprint 0.4

- Política de senha além de min 8 chars (D-USER-6).
- Validação de domínios bloqueados de email.
- Limite de usuários por plano.
- AuditLog.
- Notificação ao usuário soft-deletado/force-logoutado.
- Restore endpoint.
- Status online via Socket.IO (RF-USER-7 — fica pra fase com realtime).

---

## 7. Estrutura de arquivos

Gerada por `pnpm g:feature users`, depois preenchida. Adições além do scaffold padrão:

```
src/modules/users/
├── users.module.ts                                  # importa AuthModule pra usar AuthDomainService
├── controllers/
│   ├── users.controller.ts                          # /users + /users/:id/force-logout
│   └── me.controller.ts                             # PATCH /me
├── services/
│   ├── users.application.service.ts
│   └── users.domain.service.ts
├── schemas/
│   ├── create-user.schema.ts
│   ├── update-user.schema.ts
│   ├── update-me.schema.ts
│   ├── list-users.schema.ts
│   └── user-response.schema.ts
└── tests/
    ├── users.domain.service.spec.ts                 # unit
    ├── users.controller.e2e-spec.ts                 # POST/GET/PATCH/DELETE/force-logout em /users
    └── me.controller.e2e-spec.ts                    # PATCH /me
```

`UsersModule` registrado em `src/app.module.ts` `imports: [...]`. `AuthModule` já exporta `AuthDomainService` (Sprint 0.3, confirmado).

---

## 8. Testes

### 8.1 Unit — `users.domain.service.spec.ts`

Mockar `PrismaClient` com `vi.fn()` ad-hoc por método (mesmo padrão do `auth.domain.service.spec.ts`: `prisma = { user: { findUnique: vi.fn() } }` + `as unknown as PrismaService`). Cobrir **só** regra de negócio:

- `assertNotSuperAdmin` — SUPER_ADMIN throws `ForbiddenException`; ADMIN/SUPERVISOR/AGENT passam.
- `assertDepartmentsBelongToTenant` — count < deptIds.length throws `BadRequestException`; igual passa; lista vazia passa sem chamar Prisma.
- `assertEmailNotInUse` — `findByEmailRaw` retorna user existente → `ConflictException`; passando `exceptUserId === existing.id` passa; email novo passa.
- `assertNotLastAdmin` — count de outros ADMINs ativos === 0 throws `ConflictException`; >= 1 passa.
- `update` — quando `patch.role` demove ADMIN→AGENT e count de outros ADMINs é 0, throws `ConflictException` (integração das regras dentro de `update`).
- `update` — quando `patch.departmentIds` é fornecido, chama `userDepartment.deleteMany` e depois `createMany` na sequência correta.

Não testar: `findByIdWithDepartments`, `list`, mapeamento de DTO, `create` happy path simples — e2e cobre.

### 8.2 E2E — `users.controller.e2e-spec.ts`

Padrão da Sprint 0.3: `app.inject()` (Fastify), `truncateAll` no `beforeEach`, factories importadas de `test/e2e/factories.ts`.

Happy paths (1 por endpoint):

- `POST /users` cria ADMIN, retorna `departments` populados, 201.
- `GET /users?role=AGENT&active=true` filtra corretamente.
- `GET /users/:id` retorna user + departments.
- `PATCH /users/:id` como ADMIN muda `name` + `password` (verifica `passwordHash` mudou no banco).
- `DELETE /users/:id` seta `deletedAt`, GET subsequente retorna 404.
- `POST /users/:id/force-logout` retorna 204; refresh do alvo subsequente retorna 401 (linka com Sprint 0.3).

Sad paths obrigatórios:

- TC-USER-1: `role=SUPER_ADMIN` → 400.
- TC-USER-2a (DELETE) e 2b (PATCH demote) último ADMIN → 409.
- TC-USER-4 e TC-USER-5: email duplicado mesmo tenant e outro tenant → 409 com mesma mensagem.
- TC-USER-6: AGENT chama `PATCH /users/<other>` → 403.
- `POST /users` com `departmentIds` de outro tenant → 400.
- `force-logout` em SUPER_ADMIN → 403.
- `force-logout` em user soft-deletado → 404.

Multi-tenant isolation (obrigatório por `multi-tenant-checklist.md` §H):

- ADMIN do tenant B → `GET /users/<idDeA>` → 404.
- ADMIN do tenant B → `GET /users` → não vê users de A.
- ADMIN do tenant B → `PATCH /users/<idDeA>` → 404.
- ADMIN do tenant B → `DELETE /users/<idDeA>` → 404.
- ADMIN do tenant B → `POST /users/<idDeA>/force-logout` → 404.

### 8.3 E2E — `me.controller.e2e-spec.ts`

- TC-USER-7: AGENT autenticado, body `{ name, password, absenceMessage, absenceActive }` → 200, persiste.
- TC-USER-7-neg: AGENT body com `{ role: 'ADMIN' }` → 400; idem `{ email }`, `{ departmentIds: [] }`.
- ADMIN também pode usar `/me` pra mudar próprios `name`/`password` (não exclusivo de AGENT).
- Sem JWT → 401.

### 8.4 Factory additions em `test/e2e/factories.ts`

```typescript
export async function createDepartment(
  prisma: PrismaClient,
  companyId: string,
  overrides: Partial<{ name: string; active: boolean }> = {},
): Promise<Department>;

export async function loginAs(
  app: NestFastifyApplication,
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string }>;
// POST /api/v1/auth/login via app.inject, retorna tokens
```

`truncateAll` já cobre `User`, `Department`, `UserDepartment`, `RefreshToken` na ordem certa (verificado em `test/e2e/factories.ts:50`).

---

## 9. Verificação por evidência (gates do PR)

Em ordem, todos verdes localmente antes de abrir PR:

```bash
pnpm typecheck
pnpm lint
pnpm test                # unit (auth + users)
pnpm test:schema         # Sprint 0.2 — não pode quebrar
pnpm test:e2e            # auth.e2e.spec.ts + users + me
pnpm build
```

CI roda os mesmos comandos via `.github/workflows/ci.yml`.

---

## 10. Smoke test manual com curl

Pré-requisito: SUPER_ADMIN seedado. Sem `Departments CRUD` ainda — `departmentIds: []` no fluxo abaixo.

```
1. Login SUPER_ADMIN → token_super
   POST /api/v1/auth/login { email: super@..., password: ... }

2. Criar 1 ADMIN do tenant → 201
   POST /api/v1/users  (Bearer token_super)
   { name, email, password (8+ chars), role: ADMIN, departmentIds: [] }

3. Criar 1 AGENT → 201
   POST /api/v1/users  (Bearer token_super)
   { name, email, password, role: AGENT, departmentIds: [] }

4. Listar → 200 com ambos
   GET /api/v1/users  (Bearer token_super)

5. Login AGENT → token_agent + refresh_agent
   POST /api/v1/auth/login

6. PATCH /me como AGENT, mudar name → 200
   PATCH /api/v1/me  (Bearer token_agent) { name: 'novo' }

7. PATCH /me como AGENT com role → 400
   PATCH /api/v1/me  (Bearer token_agent) { role: 'ADMIN' }

8. Force-logout AGENT como SUPER_ADMIN → 204
   POST /api/v1/users/<agentId>/force-logout  (Bearer token_super)

9. Refresh do AGENT com token antigo → 401
   POST /api/v1/auth/refresh  { refreshToken: refresh_agent }

10. DELETE AGENT como SUPER_ADMIN → 204
    DELETE /api/v1/users/<agentId>  (Bearer token_super)

11. Tentar criar novo user com email idêntico ao do AGENT deletado → 409 (verifica decisão §1.1)
    POST /api/v1/users  (Bearer token_super) { ..., email: <emailDoAgent>, ... }

12. (Opcional) Tentar DELETE do único ADMIN do tenant restante → 409
```

---

## 11. Migration / schema

**Nenhuma migration nova nesta sprint.** `User`, `RefreshToken`, `UserDepartment`, `Department` estão completos desde Sprint 0.2/0.3. `User.email @unique` global aplicado em Sprint 0.3.

Se a sprint introduzir necessidade de schema change, o spec será atualizado e o passo de migration entrará no plano de execução.

---

## 12. Mapeamento ROADMAP

Ao final da sprint (no commit que fecha o trabalho), `ROADMAP.md` §5 "CRUD básico (estrutura 3 camadas em todos)" tem o item atualizado:

```diff
- [ ] Users (com force-logout)
+ [x] Users (com force-logout)
```

Outros itens da Fase 0 permanecem inalterados.
