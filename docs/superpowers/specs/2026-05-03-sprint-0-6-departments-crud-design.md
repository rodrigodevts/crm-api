# Sprint 0.6 — Departments CRUD (com working hours) — Design

> **Escopo:** `crm-api`, Fase 0, item "Departments (com working hours)" do `ROADMAP.md` §5.
>
> **Branches planejadas:**
>
> 1. `refactor/common-extract-shared-helpers` — pré-passo, mergeada antes desta sprint. Promove `WorkingHoursSchema` pra `src/common/schemas/` e generaliza `cursor.ts`.
> 2. `feat/sprint-0-6-departments-crud` — desta sprint, a partir do `main` atualizado.
>
> **Audit fonte da verdade:** **não há** audit dedicado a Departments em `crm-specs/audits/`. Department é tocado de raspão em `audit-03A-cadastros-base.md` (se existir) e `audit-06-atendimentos.md` no contexto de roteamento de tickets. Fontes da verdade nesta sprint: `ARCHITECTURE.md` §3 (3 camadas), §6 (modelo de domínio), §7 (multi-tenant), §12 (auth/segurança), §13 (working hours), §17 (Chatwoot ref), §21 (glossário); `prisma/schema.prisma` (`Department`, `UserDepartment`, enum `DepartmentDistributionMode`); `docs/conventions/multi-tenant-checklist.md` (Department segue padrão tradicional).
>
> **Pré-requisitos prontos:**
>
> - Schema Prisma de `Department`, `UserDepartment`, enum `DepartmentDistributionMode` (Sprint 0.2).
> - `JwtAuthGuard` global, `RolesGuard` global, decorators `@CurrentUser`/`@CurrentCompany`/`@Roles`, hierarquia de roles (Sprint 0.3).
> - `UsersDomainService` com `assertDepartmentsBelongToTenant` e suporte a `departmentIds` em `create`/`update` (Sprint 0.4).
> - `WorkingHoursSchema` (Sprint 0.5, em `src/modules/companies/schemas/` — promovido como pré-passo).
> - `cursor.ts` em `src/common/cursor.ts` (Sprint 0.5, hardcoded `{ createdAt, id }` — generalizado como pré-passo).
> - Padrão de schema `.strict()` + re-parse explícito no application service (Sprint 0.4 PATCH /me + Sprint 0.5 PATCH /companies/me + #14 fix).
> - Padrão de `mapConflict` P2002 → 409 (Sprint 0.5).
> - Gerador `pnpm g:feature` (Fase 0). Schemas plurais geram, renomear pra singular (lição da Sprint 0.5).
> - Setup e2e (`test/e2e/factories.ts`, `setup-app.ts`, `truncateAll`, factory `createDepartment` já existente).

---

## 1. Decisões de design (saída do brainstorming)

### 1.1 Sem endpoints de assignment user↔department dedicados

**Decisão:** opção A — `PATCH /users/:id { departmentIds: [...] }` (Sprint 0.4) continua sendo a **única** fonte de escrita pra associação user↔department. `GET /departments/:id` retorna lista mínima de users associados (read-only) pra UI ter dropdown sem fetch extra.

Justificativa: uma fonte da verdade pra escrita evita race conditions e ambiguidade semântica. YAGNI — não há tela ainda; a tela completa de Departments só nasce na Fase 4 (`ROADMAP.md` §10). Quando vier UI dedicada com requisito de operação atômica "adicionar user X ao depto Y", abre-se discussão pra `POST /departments/:id/users` em sprint própria.

### 1.2 Soft-delete limpa `UserDepartment` na mesma transação

**Decisão:** opção B — `softDelete` faz `tx.userDepartment.deleteMany({ where: { departmentId } })` antes de setar `deletedAt`, na mesma `prisma.$transaction`.

Justificativa: bloquear soft-delete por users assigned (opção A) é fricção sem ganho — diferente de Companies, onde "ainda tem User ativo" sinaliza perda real de dados ao deletar tenant. Aqui, os users continuam existindo, só perdem o vínculo com o depto deletado. Tombstones (opção C) acumulam estado sujo indefinidamente. A opção B é cirúrgica e atômica.

**Sobre `Ticket.departmentId`** (FK com `onDelete: Restrict` no schema): irrelevante nesta sprint porque Ticket é stub vazio. Quando Ticket virar entidade real (Fase 1/2), adicionar `assertNoOpenTickets(deptId, tx)` como guard. Nota explícita aqui no spec.

**Sobre `CloseReasonDepartment`**: tabela vazia agora (CloseReason ainda não tem CRUD). Mesmo padrão futuro: `deleteMany` na mesma transação quando virar real.

### 1.3 Permissão de leitura aberta a qualquer autenticado do tenant

**Decisão:** opção A — `GET /departments` e `GET /departments/:id` aberto a `AGENT/SUPERVISOR/ADMIN/SUPER_ADMIN` do tenant; escrita (`POST/PATCH/DELETE`) ADMIN+. Sub-recurso `users` no GET /:id retorna apenas `{ id, name, role }` — sem email.

Justificativa: consistência com Sprint 0.4 (`GET /users` aberto a qualquer auth do tenant pra dropdowns); AGENT precisa do dropdown "transferir ticket pro depto Y" e do filtro de fila por departamento. Department não tem informação sensível (nome, working hours, SLA, distributionMode são todos operacionais). Isolar email no GET /:id mantém PII restrita ao endpoint próprio (`GET /users` ADMIN+).

### 1.4 `WorkingHoursSchema` promovido para `src/common/schemas/`

**Decisão:** opção A — mover o arquivo de `src/modules/companies/schemas/working-hours.schema.ts` para `src/common/schemas/working-hours.schema.ts`. Companies refatorada pra importar do novo path. Departments importa direto.

Justificativa: schemas compartilhados entre features moram em `common/` (`ARCHITECTURE.md` §3.7: comunicação entre módulos é via DI ou eventos, não via import direto de tipos). Importar cross-module entre features (opção B) é mau cheiro. Duplicar (opção C) garante drift. `src/common/` já tem precedente do `cursor.ts` (extraído na Sprint 0.5).

A semântica continua só estrutural (`HH:MM`, `.strict()`); validação semântica (sobreposição, fuso, isOpen) fica para o `BusinessHoursService` futuro (Fase 0 sprint separada).

### 1.5 `distributionMode` valida só enum + default; SLA livre com limites sanitários

**Decisão:** opção A + C.

- **`distributionMode`**: `z.nativeEnum(DepartmentDistributionMode).default('MANUAL')`. **Sem** validação semântica — não há TicketsDomainService ainda; `RANDOM`/`BALANCED`/`SEQUENTIAL` são strings armazenadas até Fase 2.
- **SLA fields**: `z.number().int().min(1).max(43200).optional().nullable()` (43200 = 30 dias em minutos, limite sanitário). Sem cross-validation — `slaResponseMinutes` e `slaResolutionMinutes` são independentes; alguns contratos têm janelas separadas.

Justificativa: bloquear 3 dos 4 modos do enum agora é reescrever a regra na camada de aplicação e cria churn quando Fase 2 implementar o TicketsDomainService. SLA é métrica observacional (Fase 4+), não bloqueia nada agora.

### 1.6 Sem `sortOrder` no schema; `?sort=createdAt|name` opcional na listagem

**Decisão:** opção A + `sort=name` opcional. Não adicionar `Department.sortOrder` agora (consistente com a omissão deliberada do Sprint 0.2). Listagem aceita `?sort=createdAt` (default, cursor `{ createdAt, id }`, `desc`) ou `?sort=name` (cursor `{ name, id }`, `asc`).

Justificativa: drag-and-drop não tem requisito concreto — a tela completa de Departments é Fase 4. `?sort=name` cobre o uso prático imediato (dropdown alfabético na UI de transferência). Generalização de `cursor.ts` paga o custo do `sort=name` agora e fica disponível pra próximas features.

### 1.7 Outras decisões implícitas

- **`active` no POST**: aceito no body, default `true` via Zod.
- **`active` no PATCH**: aceito (ADMIN pode desativar depto sem soft-deletar — escondido em listagens com `?active=true` mas ainda visível em `?active=false`).
- **GET /:id cross-tenant**: 404 (não 403) — alinhado com Sprint 0.4 e 0.5, nunca vazar existência cross-tenant.
- **`@CurrentCompany()` decorator**: continua válido — retorna `companyId` do JWT do operador. Usado em **todas** as rotas dessa sprint (Department é entidade-tenant tradicional, não o caso especial de Company).
- **AuditLog**: fora do escopo (entra junto com `reveal-credentials` na Fase 1).
- **Restore de soft-deleted**: fora do escopo.
- **Constraint `@@unique([companyId, name])`**: do schema, sem filtro `deletedAt`. `assertNameAvailable` filtra `deletedAt: null` (permite "intenção" de reusar nome de depto deletado), mas o INSERT pode falhar com P2002 se o registro antigo ainda ocupa o nome. `mapConflict` traduz P2002 pra 409 igual. Ver §6.3 — limitação documentada, sem migração agora.

---

## 2. Superfície da API

| Verbo  | Path                      | Permissão               | Sucesso | Resposta                      |
| ------ | ------------------------- | ----------------------- | ------- | ----------------------------- |
| POST   | `/api/v1/departments`     | ADMIN+ do tenant        | 201     | `DepartmentResponseDto`       |
| GET    | `/api/v1/departments`     | qualquer auth do tenant | 200     | `DepartmentListResponseDto`   |
| GET    | `/api/v1/departments/:id` | qualquer auth do tenant | 200     | `DepartmentDetailResponseDto` |
| PATCH  | `/api/v1/departments/:id` | ADMIN+ do tenant        | 200     | `DepartmentResponseDto`       |
| DELETE | `/api/v1/departments/:id` | ADMIN+ do tenant        | 204     | —                             |

**Notas:**

1. **Multi-tenant tradicional.** Toda query Prisma carrega `where: { companyId }` extraído via `@CurrentCompany()`. Sem exceção (Departments NÃO é o caso especial de Companies).
2. **`GET /departments` filtros:** `?active=true|false&search=<texto>&sort=createdAt|name&cursor=<base64>&limit=20`.
   - `active=true` (default): exclui `deletedAt != null` E `active = false`.
   - `search`: ILIKE case-insensitive em `name`.
   - `sort=createdAt` (default): cursor `{ createdAt: ISO string, id }`, ordenação `[{ createdAt: 'desc' }, { id: 'desc' }]`.
   - `sort=name`: cursor `{ name, id }`, ordenação `[{ name: 'asc' }, { id: 'asc' }]`.
   - Cursor com shape diferente do `sort` solicitado → 400 `Cursor inválido` (defesa via inspeção do JSON decodificado).
3. **`GET /departments/:id`** retorna o department com `users: [{ id, name, role }]`. Sem `count` separado. Lista filtra `User.deletedAt: null` no JOIN. Ordenação dos users: `name asc`.
4. **Cross-tenant:** GET/PATCH/DELETE em department de outro tenant → **404** `Departamento não encontrado`. Nunca vaza existência.
5. **Soft-deleted:** GET/PATCH/DELETE retornam 404; nunca aparece em listagem.
6. **`name` único por tenant:** `@@unique([companyId, name])` no schema. Domain `assertNameAvailable` (filtra `deletedAt: null`) + P2002 fallback no app service via `mapConflict` → 409 `Já existe um departamento com este nome`.

---

## 3. Schemas Zod

7 arquivos: 2 em `src/common/`, 5 em `src/modules/departments/schemas/`.

### 3.1 `src/common/schemas/working-hours.schema.ts` (promovido da Sprint 0.5)

Mesmo conteúdo do arquivo atual em `companies/schemas/working-hours.schema.ts`:

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

Imports atualizados em `companies/schemas/{create,update-me,update,response}-company.schema.ts`.

### 3.2 `src/common/cursor.ts` (generalizado)

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

`UsersDomainService` refatora para usar `encodeCursor({ createdAt: x.toISOString(), id })` e `decodeCursor<{ createdAt: string; id: string }>(cursor)`. Domain valida shape (campos esperados presentes e tipados); shape errado → `BadRequestException('Cursor inválido')`. `CompaniesDomainService.list` segue o mesmo padrão.

### 3.3 `create-department.schema.ts`

```typescript
import { DepartmentDistributionMode } from '@prisma/client';
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
```

### 3.4 `update-department.schema.ts`

```typescript
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
```

### 3.5 `list-departments.schema.ts`

```typescript
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

### 3.6 `department-response.schema.ts`

```typescript
import { DepartmentDistributionMode } from '@prisma/client';
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
```

### 3.7 `department-detail-response.schema.ts`

```typescript
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
```

`UserRefSchema` propositalmente local (sem importar `UserResponseSchema` da Sprint 0.4 — payload diferente, sem email).

---

## 4. Domain service — `departments.domain.service.ts`

`src/modules/departments/services/departments.domain.service.ts`. Acessa Prisma direto. Recebe `companyId` em **todos** os métodos públicos (multi-tenant tradicional). Não retorna DTO. Não emite eventos. Não enfileira jobs.

### 4.1 Tipo de retorno

Métodos retornam entidade Prisma `Department` (com `include` quando aplicável).

### 4.2 Métodos públicos

- **`findById(id, companyId, tx?)`** — `findFirst({ where: { id, companyId, deletedAt: null } })`. Throws `NotFoundException('Departamento não encontrado')`.

- **`findByIdWithUsers(id, companyId, tx?)`** — idem + `include: { users: { include: { user: { select: { id: true, name: true, role: true } } }, where: { user: { deletedAt: null } } } }`. Filtra users soft-deleted no JOIN. Retorna entidade tipada como `Department & { users: (UserDepartment & { user: { id, name, role } })[] }`.

- **`list(companyId, filters, pagination)`** — cursor-based. Aceita `sort: 'createdAt' | 'name'`. Constrói WHERE com:
  - `companyId` (sempre)
  - `deletedAt: null` (sempre)
  - `active: filters.active` (se fornecido)
  - `name: { contains: filters.search, mode: 'insensitive' }` (se search)

  Cursor decoded:
  - `sort='createdAt'`: cursor `{ createdAt: string, id: string }`, WHERE adicional `OR: [{ createdAt: { lt: X } }, { createdAt: X, id: { lt: Y } }]`, orderBy `[{ createdAt: 'desc' }, { id: 'desc' }]`.
  - `sort='name'`: cursor `{ name: string, id: string }`, WHERE adicional `OR: [{ name: { gt: X } }, { name: X, id: { gt: Y } }]`, orderBy `[{ name: 'asc' }, { id: 'asc' }]`.
  - Cursor com shape diferente → `BadRequestException('Cursor inválido')`.

  Take: `limit + 1` para detectar `hasMore`.

- **`create(input, companyId, tx)`** — sequência:
  1. `assertNameAvailable(input.name, companyId, tx)`.
  2. `tx.department.create({ data: { ...input, companyId } })`.
  3. Retorna o criado.

  P2002 em `(companyId, name)` propaga para o app service mapear (defesa via `mapConflict`).

- **`update(id, companyId, patch, tx)`** — sequência:
  1. `existing = findById(id, companyId, tx)` (valida tenant + soft-deleted).
  2. Se `patch.name && patch.name !== existing.name`: `assertNameAvailable(patch.name, companyId, tx, exceptId: id)`.
  3. `tx.department.update({ where: { id }, data: patch })`.
  4. Retorna o atualizado.

  P2002 propaga.

- **`softDelete(id, companyId, tx)`** — sequência:
  1. `existing = findById(id, companyId, tx)` (valida tenant + soft-deleted).
  2. `tx.userDepartment.deleteMany({ where: { departmentId: id } })` (decisão 1.2).
  3. `tx.department.update({ where: { id }, data: { deletedAt: new Date() } })`.
  4. `Promise<void>`.

### 4.3 Asserções privadas

- **`assertNameAvailable(name, companyId, tx, exceptId?)`** — `tx.department.findFirst({ where: { companyId, name, deletedAt: null } })`. Existe e `existing.id !== exceptId` → `ConflictException('Já existe um departamento com este nome')`.

  > Nota: filtra `deletedAt: null`. Permite "intenção" de reusar nome de depto soft-deletado, mas o constraint Postgres `@@unique([companyId, name])` é global — pode dar P2002 mesmo com assert passando. `mapConflict` no app service traduz pra mesma mensagem 409. Ver §6.3.

### 4.4 Invariantes garantidas

1. Soft-deleted department nunca volta em queries default.
2. `companyId` sempre filtrado no WHERE.
3. `userDepartment` limpo na hora do soft-delete (atomicidade da `$transaction`).
4. P2002 em `(companyId, name)` → 409 com mensagem em pt-BR (mapConflict).
5. Cursor mismatch (shape ≠ sort) → 400.

### 4.5 O que **não** está no domain de Departments

- Atribuição user↔department: `UsersDomainService.assertDepartmentsBelongToTenant` + `syncDepartments` (Sprint 0.4). Não duplicar aqui.
- Validação semântica de `workingHours` (sobreposição, fuso, isOpen): `BusinessHoursService` futuro.
- Validação semântica de `distributionMode` (round-robin, balanceamento): `TicketsDomainService` na Fase 2.
- Mapeamento para DTO: application service.

---

## 5. Application service — `departments.application.service.ts`

Injeta: `PrismaService`, `DepartmentsDomainService`. **Não injeta** `UsersDomainService` (não cria/edita users — só lê via `include` no `findByIdWithUsers`).

### 5.1 `create(input: CreateDepartmentDto, companyId: string): Promise<DepartmentResponseDto>`

```
try {
  const department = await prisma.$transaction(tx =>
    departmentsDomain.create(input, companyId, tx)
  )
  return toDto(department)
} catch (err) {
  throw mapConflict(err)
}
```

### 5.2 `list(companyId: string, query: ListDepartmentsQueryDto): Promise<DepartmentListResponseDto>`

Wraper sobre `domain.list`. Constrói `nextCursor` com `encodeCursor` no shape do `sort`:

- `sort='createdAt'`: `encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })`.
- `sort='name'`: `encodeCursor({ name: last.name, id: last.id })`.

`hasMore` derivado de `take = limit + 1`.

### 5.3 `findById(id: string, companyId: string): Promise<DepartmentDetailResponseDto>`

Wraper sobre `domain.findByIdWithUsers`. Flatten `users` (de `UserDepartment[]` para `{ id, name, role }[]`); ordenar por `name asc` na aplicação. Retorna `toDetailDto`.

### 5.4 `update(id: string, companyId: string, input: UpdateDepartmentDto): Promise<DepartmentResponseDto>`

```
// Re-parse explícito (defesa-em-profundidade contra ZodValidationPipe global não enforçar .strict())
try {
  UpdateDepartmentSchema.parse(input)
} catch (error) {
  if (error instanceof ZodError) {
    throw new BadRequestException({
      message: 'Validação falhou',
      errors: error.issues.map(i => ({
        field: i.path.join('.') || '<root>',
        message: i.message,
        code: i.code,
      })),
    })
  }
  throw error
}

const patch: Prisma.DepartmentUpdateInput = {}
if (input.name !== undefined) patch.name = input.name
if (input.active !== undefined) patch.active = input.active
if ('greetingMessage' in input) patch.greetingMessage = input.greetingMessage ?? null
if ('outOfHoursMessage' in input) patch.outOfHoursMessage = input.outOfHoursMessage ?? null
if ('workingHours' in input) patch.workingHours = input.workingHours ?? Prisma.DbNull
if ('slaResponseMinutes' in input) patch.slaResponseMinutes = input.slaResponseMinutes ?? null
if ('slaResolutionMinutes' in input) patch.slaResolutionMinutes = input.slaResolutionMinutes ?? null
if (input.distributionMode !== undefined) patch.distributionMode = input.distributionMode

try {
  const department = await prisma.$transaction(tx =>
    departmentsDomain.update(id, companyId, patch, tx)
  )
  return toDto(department)
} catch (err) {
  throw mapConflict(err)
}
```

### 5.5 `softDelete(id: string, companyId: string): Promise<void>`

```
await prisma.$transaction(tx =>
  departmentsDomain.softDelete(id, companyId, tx)
)
```

### 5.6 `toDto(d: Department): DepartmentResponseDto`

```typescript
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
```

### 5.7 `toDetailDto(d: Department & { users: ... }): DepartmentDetailResponseDto`

```typescript
const users = d.users
  .map((ud) => ({ id: ud.user.id, name: ud.user.name, role: ud.user.role }))
  .sort((a, b) => a.name.localeCompare(b.name));

return { ...toDto(d), users };
```

### 5.8 `mapConflict(err: unknown): unknown`

```typescript
if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
  const target = (err.meta?.target as string[] | undefined) ?? [];
  if (target.includes('name') || target.includes('companyId_name')) {
    return new ConflictException('Já existe um departamento com este nome');
  }
}
return err;
```

---

## 6. Validações e mapeamento de erros

### 6.1 Tabela completa

| Cenário                                           | Camada                                       | Status     | Mensagem                                             |
| ------------------------------------------------- | -------------------------------------------- | ---------- | ---------------------------------------------------- | -------------------------- |
| Sem JWT                                           | `JwtAuthGuard`                               | 401        | `Autenticação necessária`                            |
| JWT inválido/expirado                             | `JwtAuthGuard`                               | 401        | `Sessão expirada. Faça login novamente.`             |
| AGENT/SUPERVISOR em rota ADMIN+                   | `RolesGuard`                                 | 403        | `Você não tem permissão para esta ação`              |
| `name` < 2 / > 100 chars                          | Schema Zod                                   | 400        | `Nome deve ter no mínimo 2 caracteres` / Zod default |
| Body com chave extra (`companyId`, `id`, etc.)    | Schema Zod `.strict()` + re-parse            | 400        | `Validação falhou` + `Unrecognized key`              |
| `distributionMode` fora do enum                   | Schema Zod                                   | 400        | (mensagem padrão Zod nativeEnum)                     |
| `slaResponseMinutes < 1` ou `> 43200`             | Schema Zod                                   | 400        | (mensagem padrão Zod)                                |
| `workingHours` com formato fora `HH:MM`           | Schema Zod                                   | 400        | `Formato HH:MM`                                      |
| POST com `name` colidindo no tenant               | Domain `assertNameAvailable` ou P2002        | 409        | `Já existe um departamento com este nome`            |
| PATCH com `name` colidindo no tenant              | Domain `assertNameAvailable` ou P2002        | 409        | idem                                                 |
| GET/PATCH/DELETE em depto de outro tenant         | Domain `findById` (filtra companyId)         | 404        | `Departamento não encontrado`                        |
| GET/PATCH/DELETE em soft-deletado                 | Domain `findById` (filtra `deletedAt: null`) | 404        | idem                                                 |
| Cursor inválido (base64 quebrado / JSON inválido) | `decodeCursor`                               | 400        | `Cursor inválido`                                    |
| Cursor com shape ≠ sort                           | Domain `list` (validação de shape)           | 400        | `Cursor inválido`                                    |
| `limit > 100`                                     | Schema Zod                                   | 400        | (mensagem padrão Zod)                                |
| `sort` fora de `createdAt                         | name`                                        | Schema Zod | 400                                                  | (mensagem padrão Zod enum) |

### 6.2 Race condition em `name`

Janela rara entre `assertNameAvailable` e o `INSERT` em concorrência. Constraint `@@unique([companyId, name])` rejeita o segundo INSERT com P2002. `mapConflict` no app service captura e converte pra `ConflictException` com mesma mensagem. Padrão idêntico a Sprint 0.4 (email) e 0.5 (slug).

### 6.3 Limitação conhecida — reusar nome de depto soft-deletado

`assertNameAvailable` filtra `deletedAt: null`, então o domain **deixa passar** a tentativa de reusar o nome. Mas o constraint Postgres `@@unique([companyId, name])` é **global** (não respeita `deletedAt`); o `INSERT` falha com P2002, que vira 409 via `mapConflict`. Resultado: usuário recebe "Já existe um departamento com este nome" mesmo se o registro original estiver soft-deletado.

**Decisão pragmática:** comportamento aceitável pra Fase 0. ADMIN pode contornar adicionando sufixo (ex: "Suporte (2)"). Se virar dor real, abre-se ADR pra:

- Migrar pra `@@unique([companyId, name])` parcial (`WHERE "deletedAt" IS NULL`) via SQL raw em migration.
- Ou adicionar sufixo automático no soft-delete (`name = name || ' [deleted ' || timestamp || ']'`) — herdado do padrão Chatwoot.

Ambos fora desta sprint. Documentado aqui.

### 6.4 Fora de escopo do Sprint 0.6

- Endpoints de assignment dedicados (decisão 1.1).
- `Department.sortOrder` no schema (decisão 1.6).
- Validação semântica de `distributionMode` (Fase 2).
- Validação semântica de `workingHours` (`BusinessHoursService` futuro).
- Bloqueio de soft-delete por tickets abertos (Fase 1/2).
- Restore de department soft-deletado.
- AuditLog.
- Reusar nome de depto soft-deletado (§6.3).

---

## 7. Estrutura de arquivos

```
src/common/                                          # mudanças do PR 1
├── cursor.ts                                        # generalizado: encodeCursor(payload), decodeCursor<T>()
└── schemas/
    └── working-hours.schema.ts                      # promovido de companies/

src/modules/departments/                             # novo no PR 2
├── departments.module.ts                            # imports: nada extra (usa PrismaService global)
├── controllers/
│   └── departments.controller.ts                    # 5 endpoints
├── services/
│   ├── departments.application.service.ts
│   └── departments.domain.service.ts
├── schemas/
│   ├── create-department.schema.ts                  # singular (renomear do scaffold plural)
│   ├── update-department.schema.ts                  # singular
│   ├── list-departments.schema.ts                   # query params
│   ├── department-response.schema.ts                # DTO simples
│   └── department-detail-response.schema.ts         # com array users
└── tests/
    ├── departments.domain.service.spec.ts           # unit
    └── departments.controller.e2e-spec.ts           # e2e + multi-tenant + cross-feature
```

`DepartmentsModule` registrado em `src/app.module.ts` `imports: [...]`. `pnpm g:feature departments` gera plural; renomear pra singular (lição da Sprint 0.5).

---

## 8. Testes

### 8.1 Unit — `departments.domain.service.spec.ts`

Mockar `PrismaClient` com `vi.fn()` (mesmo padrão de `users.domain.service.spec.ts`). Cobrir só regra de negócio:

- `assertNameAvailable` — colide → `ConflictException`; livre → passa; `exceptId === existing.id` passa.
- `softDelete` chama `userDepartment.deleteMany` antes de `update` (validar ordem das chamadas via mock).
- `findById` em outro tenant → `NotFoundException` (companyId no where).
- `update` — se `patch.name === existing.name`, não chama `assertNameAvailable` (evita assert redundante).
- `list` com `sort=name`: cursor `{ createdAt: '...' }` (shape errado) → `BadRequestException('Cursor inválido')`.
- `list` com `sort=createdAt`: cursor `{ name: '...' }` → idem.
- `list` cursor base64 quebrado → propaga `BadRequestException('Cursor inválido')` do `decodeCursor`.

Não testar (e2e cobre): `findById` happy path, `findByIdWithUsers` happy path, `create`/`update` happy paths, mapeamento de DTO.

### 8.2 E2E — `departments.controller.e2e-spec.ts`

Padrão Sprint 0.4/0.5: `app.inject()` (Fastify), `truncateAll` no `beforeEach`, factories de `test/e2e/factories.ts`.

**Happy paths (1 por endpoint):**

- POST como ADMIN: cria depto, 201, asserts no banco (`departments.count() === 1`).
- POST com `workingHours` válido + SLA + `distributionMode='RANDOM'` → asserts no banco.
- GET (list) como AGENT: vê os deptos do tenant, paginação com `nextCursor` populado quando >`limit`.
- GET (list) com `sort=name`: ordem alfabética; cursor permite paginar entre páginas.
- GET /:id como AGENT: 200 + `users` populado correto (deptos com 0, 1, e 3 users → asserts).
- PATCH como ADMIN: muda `name`, `workingHours`, `slaResponseMinutes`, `distributionMode` → 200, asserts no banco.
- DELETE como ADMIN, depto vazio (sem users): 204, GET subsequente → 404.
- DELETE como ADMIN, depto com 2 AGENTs assigned: 204; assert `userDepartment.count({ where: { departmentId } }) === 0` E os AGENTs continuam existindo (`user.findFirst({ id })` retorna user com `deletedAt: null`).

**Sad paths obrigatórios:**

- POST como AGENT → 403.
- POST como SUPERVISOR → 403.
- POST com `name` colidindo no tenant → 409.
- POST com `companyId` no body → 400 (`Unrecognized key`).
- POST com `distributionMode: 'NOPE'` → 400.
- POST com `slaResponseMinutes: -5` → 400.
- POST com `slaResponseMinutes: 99999` (>43200) → 400.
- POST com `workingHours: { monday: [{ from: '09', to: '18:00' }] }` → 400 (`Formato HH:MM`).
- PATCH como AGENT → 403.
- PATCH com chave extra (`companyId`, `id`) → 400 (`Unrecognized key`) — defesa do re-parse explícito.
- PATCH com `name` colidindo com outro depto do mesmo tenant → 409.
- PATCH em depto inexistente → 404.
- DELETE como AGENT → 403.
- DELETE em depto inexistente → 404.
- GET /:id em depto soft-deletado → 404.
- GET com cursor base64 quebrado → 400.
- GET com `sort=name` + cursor de `sort=createdAt` (shape errado) → 400.

**Multi-tenant isolation:**

- Tenant A cria Dept A1; ADMIN do tenant B → `GET /departments/A1.id` → 404.
- ADMIN do tenant B → `PATCH /departments/A1.id` → 404.
- ADMIN do tenant B → `DELETE /departments/A1.id` → 404.
- AGENT do tenant B → `GET /departments` → não vê deptos do tenant A.

**Cross-feature integration (ponte com Sprint 0.4):**

- Cria Dept; cria AGENT via `POST /users` com `departmentIds: [deptId]`; `GET /departments/:id` → o AGENT aparece em `users[]`.
- Soft-delete o Dept; `GET /users/:id` → array `departments` do AGENT não inclui mais o depto deletado (conferindo o `deleteMany` do soft-delete).

### 8.3 Schema tests (`pnpm test:schema`)

Não há novos campos no schema — testes existentes continuam passando inalterados.

### 8.4 Factory updates em `test/e2e/factories.ts`

`createDepartment` já existe. Adicionar overrides opcionais:

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
  }> = {},
): Promise<Department>;
```

`truncateAll` já cobre `UserDepartment, Department` na ordem certa (`factories.ts:96`) — sem mudança.

---

## 9. Verificação por evidência (gates do PR)

Em ordem, todos verdes localmente antes de abrir cada PR:

```bash
pnpm typecheck
pnpm lint
pnpm test                # unit (auth + users + companies + departments)
pnpm test:schema         # Sprint 0.2 não pode quebrar
pnpm test:e2e            # auth + users + me + companies + companies-me + departments
pnpm build
```

CI roda os mesmos comandos via `.github/workflows/ci.yml`.

Para o PR 1 (refactor preparatório): mesma bateria, sem o sufixo `+ departments` (porque ainda não existe).

---

## 10. Smoke test manual com curl

Pré-requisito: ADMIN do seed (`admin@digichat.local` ou similar) + AGENT criado via Sprint 0.4.

```
1. Login ADMIN → token_admin
   POST /api/v1/auth/login { email: admin@..., password: ... }

2. POST /users como ADMIN { name: "Agent 1", email: "a1@...", password: "...", role: "AGENT" } → 201
   POST /api/v1/users (Bearer token_admin)

3. Login AGENT → token_agent
   POST /api/v1/auth/login { email: a1@..., password: ... }

4. POST /departments como ADMIN { name: "Suporte", workingHours: {...}, distributionMode: "MANUAL" } → 201

5. POST /departments como ADMIN { name: "Vendas", slaResponseMinutes: 60 } → 201

6. POST /departments com name "Suporte" duplicado → 409 "Já existe um departamento com este nome"

7. POST /departments como AGENT { name: "Outro" } → 403

8. GET /departments como AGENT → 200, vê 2 deptos

9. GET /departments?sort=name como AGENT → ordem "Suporte", "Vendas"

10. GET /departments/:idSuporte como AGENT → 200, users: []

11. PATCH /users/:idAgent como ADMIN { departmentIds: [idSuporte] } → 200 (Sprint 0.4)

12. GET /departments/:idSuporte como AGENT → 200, users: [{id, name, role: "AGENT"}]

13. PATCH /departments/:idSuporte como ADMIN { name: "Vendas" } → 409

14. PATCH /departments/:idSuporte como ADMIN { name: "Suporte 24h" } → 200

15. PATCH /departments/:idSuporte como ADMIN { companyId: "..." } → 400 Unrecognized key

16. PATCH /departments/:idSuporte como AGENT → 403

17. DELETE /departments/:idSuporte como ADMIN (com AGENT assigned) → 204

18. GET /users/:idAgent como ADMIN → departments: [] (link removido pelo deleteMany)

19. GET /departments após DELETE → vê só "Vendas"

20. GET /departments/:idSuporte → 404

21. POST /departments com name "Suporte 24h" novamente como ADMIN → 409 (P2002 do constraint global; ver §6.3)
```

---

## 11. Migration / schema

**Nenhuma migration nova nesta sprint.** `Department`, `UserDepartment`, `DepartmentDistributionMode` estão completos desde Sprint 0.2.

Se a sprint introduzir necessidade de schema change (ex: `Department.sortOrder` ou unique parcial), o spec é atualizado e o passo de migration entra no plano de execução.

---

## 12. Plano de branches e PRs

### 12.1 PR 1 — `refactor/common-extract-shared-helpers` (pré-requisito)

Atômico, mergeado **antes** do trabalho de Departments. Escopo:

1. Mover `src/modules/companies/schemas/working-hours.schema.ts` → `src/common/schemas/working-hours.schema.ts`.
2. Atualizar imports em `companies/schemas/{create,update-me,update,response}-company.schema.ts` (4 arquivos).
3. Generalizar `src/common/cursor.ts` para `encodeCursor(payload: Record<string, unknown>)` e `decodeCursor<T>(cursor)`.
4. Refatorar `UsersDomainService.list` para usar a nova assinatura, com validação de shape (`createdAt: string`, `id: string`).
5. Refatorar `CompaniesDomainService.list` analogamente.

**Gate:** `pnpm typecheck && pnpm lint && pnpm test && pnpm test:schema && pnpm test:e2e && pnpm build` — todos os 86+ testes existentes continuam verdes.

**Commit:** `refactor(common): extract WorkingHoursSchema and generalize cursor helper` (Conventional Commits, en).

### 12.2 PR 2 — `feat/sprint-0-6-departments-crud` (principal)

Criada após merge do PR 1. Sequência (detalhada no plano executável):

1. Rodar `pnpm g:feature departments`, ajustar imports, renomear schemas plurais → singulares.
2. Implementar schemas Zod (TDD: começar pelos schemas e pelo response).
3. Implementar `DepartmentsDomainService` com testes unit (TDD).
4. Implementar `DepartmentsApplicationService`.
5. Implementar `DepartmentsController`.
6. Atualizar override em `createDepartment` factory.
7. E2E completo (happy + sad + multi-tenant + cross-feature).
8. Rodar verificação completa (gate §9).
9. Smoke manual com curl (§10).
10. Commit final marca `[x] Departments (com working hours)` em `ROADMAP.md`.

### 12.3 PR final

Descrição com:

- Resumo das 6 decisões (§1.1 a §1.6) + decisões implícitas (§1.7).
- Checklist (multi-tenant, schemas Zod, testes, ROADMAP).
- Link para este spec.
- Smoke test executado e printado.

---

## 13. Mapeamento ROADMAP

Ao final da sprint (commit que fecha o trabalho), `ROADMAP.md` §5 "CRUD básico (estrutura 3 camadas em todos)":

```diff
- [ ] Departments (com working hours)
+ [x] Departments (com working hours)
```

Demais itens da Fase 0 permanecem inalterados.

---

## 14. Atualização de convenções

**Nenhuma.** Departments segue padrão tradicional de multi-tenant — não introduz exceção que mereça nova seção em `multi-tenant-checklist.md`. A seção "Caso especial — entidade que É o tenant (Company)" continua aplicando apenas a Companies.
