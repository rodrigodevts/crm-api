# Sprint 0.5 — Companies CRUD (apenas SUPER_ADMIN) — Design

> **Escopo:** `crm-api`, Fase 0, item "Companies (apenas SUPER_ADMIN)" do `ROADMAP.md` §5.
>
> **Branches planejadas:**
>
> 1. `fix/users-strict-validation` — pequena, mergeada antes desta sprint (defesa-em-profundidade do `PATCH /users/:id`).
> 2. `feat/sprint-0-5-companies-crud` — desta sprint, a partir do `main` atualizado.
>
> **Audit fonte da verdade:** **não há** audit dedicado a Companies em `crm-specs/audits/` — Company é entidade meta-administrativa (tenant root + plano), não feature de produto. Fontes da verdade nesta sprint: `ARCHITECTURE.md` §6 (modelo de domínio) e §7 (multi-tenant), `prisma/schema.prisma` (`Company`, `Plan`, `CompanySettings`, `User`), `prisma/seed.ts` (template do que o POST faz).
>
> **Pré-requisitos prontos:**
>
> - Schema Prisma de `Company`, `Plan`, `CompanySettings`, `User`, `RefreshToken` (Sprint 0.2).
> - Plan "Default" + Company "exemplo" + CompanySettings + SUPER_ADMIN seedados (`prisma/seed.ts`).
> - `JwtAuthGuard` global, `RolesGuard` global, decorators `@CurrentUser`/`@CurrentCompany`/`@Roles`, hierarquia de roles (Sprint 0.3).
> - `UsersDomainService` com `create(input, companyId, tx)` (Sprint 0.4) — reutilizado no fluxo POST.
> - Gerador `pnpm g:feature companies` (Fase 0).
> - Setup e2e (`test/e2e/factories.ts`, `setup-app.ts`, `truncateAll`).

---

## 1. Decisões de design (saída do brainstorming)

### 1.1 POST cria tenant + 1º ADMIN no mesmo request (combo)

**Decisão:** opção A — combo. `POST /api/v1/companies` aceita `{ company: {...}, admin: {...} }` e cria `Company + CompanySettings (defaults) + User(role=ADMIN)` em uma única transação.

Justificativa: padrão clássico do `AccountBuilder` do Chatwoot, e é literalmente o que `prisma/seed.ts` faz pra "exemplo". Sem combo, o tenant nasce órfão (sem ADMIN) — único jeito de popular seria abrir uma porta no contrato do `/users` que aceitasse `companyId` arbitrário do body, quebrando a invariante multi-tenant da Sprint 0.4.

### 1.2 CompanySettings — só defaults no POST

**Decisão:** opção A — mínimo. `CompanySettings` é criado com **defaults do schema** (todas as 13 flags + `defaultBotChatFlowId: null`) dentro da transação do POST. Os endpoints CRUD desta sprint **não leem nem escrevem** em `CompanySettings`. `CompanyResponseDto` não inclui `settings`. O endpoint dedicado `PATCH /companies/:id/settings` (com leitura + flags) fica integralmente para a próxima sprint do ROADMAP (`CompanySettings (PATCH único)`).

### 1.3 `slug` — obrigatório no body, imutável, regex estrita

**Decisão:** opção A — explícito.

- **Origem:** obrigatório no body do `POST`. Sem auto-geração a partir do `name`.
- **Validação:** regex `^[a-z0-9](-?[a-z0-9]+)*$` (lowercase, dígitos, hífens não-consecutivos, sem hífen nas pontas), comprimento 3–63 chars (DNS subdomain compatible).
- **Colisão:** 409 `"Slug já em uso"`. Sem sufixo automático.
- **Mutabilidade:** **imutável**. `UpdateCompanySchema` (SUPER_ADMIN) **não aceita** `slug` no body — `.strict()` rejeita com 400. Defesa-em-profundidade no domain: `update` ignora qualquer `patch.slug` que vaze.

Justificativa: SUPER_ADMIN é operador interno; sem ergonomia de auto-gerar. Slug é "URL" do tenant — alta visibilidade, baixa frequência de mudança. Auto-geração tem armadilhas com pt-BR (acentos, ç, espaços, slug vazio). Se virar dor real, abrimos endpoint dedicado de rename.

### 1.4 `planId` — obrigatório, validado ativo

**Decisão:** opção A — sem fallback mágico. `planId` obrigatório no `POST`. Domain assert `Plan.findFirst({ id, active: true })` antes de criar Company; ausente/inativo → 422 `"Plano não encontrado ou inativo"`. Sem string mágica `"Default"`.

### 1.5 Soft-delete bloqueia se houver User ativo

**Decisão:** opção A — critério mínimo coerente com o schema atual. `softDelete` chama `assertNoActiveUsers(companyId, tx)` que faz `User.count({ where: { companyId, deletedAt: null } })` > 0 → 409 `"Não é possível excluir empresa com usuários ativos. Remova-os primeiro."`.

Justificativa: na Sprint 0.5 o tenant nasce com 1 ADMIN; demais entidades-filhas ainda não têm CRUD. Quando Departments/Channels/Tickets ganharem CRUD, expandir o critério adicionando mais asserções no domain. Nota explícita no spec e no controller para futuras sprints.

### 1.6 PATCH dividido em 2 rotas (espelhando Sprint 0.4)

**Decisão:** opção A — duas rotas distintas, sem auth condicional dentro de service.

| Rota                   | Permissão                 | Schema                           | Body permitido                                                 |
| ---------------------- | ------------------------- | -------------------------------- | -------------------------------------------------------------- |
| `PATCH /companies/me`  | qualquer ADMIN+ do tenant | `UpdateCompanyMeSchema.strict()` | `name`, `defaultWorkingHours`, `outOfHoursMessage`, `timezone` |
| `PATCH /companies/:id` | SUPER_ADMIN               | `UpdateCompanySchema.strict()`   | os 4 acima + `planId`, `active`. Sem `slug`.                   |

Cada rota tem RolesGuard próprio, schema próprio, hook Kubb próprio no frontend. Re-parse explícito no application service (defesa-em-profundidade igual `PATCH /me` da Sprint 0.4) protege contra o problema do `ZodValidationPipe` global não impor `.strict()` quando o schema é consumido via `createZodDto`.

### 1.7 Outras decisões implícitas no brainstorming

- **`active` no `POST`:** não aceito no body. Tenant nasce sempre `active: true` (default do schema).
- **`active` no `PATCH /:id`:** aceito. SUPER_ADMIN pode desativar tenant sem soft-delete (suspende acesso sem perder dados).
- **`bcrypt.hash(admin.password, 12)`** acontece no application service, antes da transação do POST.
- **GET `/companies/:id` cross-tenant para ADMIN:** retorna 404 (não 403) — alinhado com a Sprint 0.4, nunca vazar existência cross-tenant.
- **`@CurrentCompany()` decorator:** continua válido — retorna a `companyId` do JWT do operador. Para `/me` (GET e PATCH), é a company sendo lida/editada. Para `POST`/`GET/:id`/`PATCH /:id`/`DELETE`, **não é usado** (a company sendo operada vem do path ou é nova).
- **AuditLog:** fora da Sprint 0.5 (entra junto com `reveal-credentials` na Fase 1).
- **`GET /plans`:** fora desta sprint. SUPER_ADMIN pega o `planId` por SQL ou seed por enquanto.

---

## 2. Superfície da API

| Verbo  | Path                    | Permissão                                                 | Sucesso | Resposta                      |
| ------ | ----------------------- | --------------------------------------------------------- | ------- | ----------------------------- |
| POST   | `/api/v1/companies`     | SUPER_ADMIN                                               | 201     | `CompanyWithAdminResponseDto` |
| GET    | `/api/v1/companies`     | SUPER_ADMIN                                               | 200     | `CompanyListResponseDto`      |
| GET    | `/api/v1/companies/me`  | qualquer autenticado                                      | 200     | `CompanyResponseDto`          |
| GET    | `/api/v1/companies/:id` | SUPER_ADMIN, ou ADMIN+ se `:id === currentUser.companyId` | 200     | `CompanyResponseDto`          |
| PATCH  | `/api/v1/companies/me`  | ADMIN+ do tenant                                          | 200     | `CompanyResponseDto`          |
| PATCH  | `/api/v1/companies/:id` | SUPER_ADMIN                                               | 200     | `CompanyResponseDto`          |
| DELETE | `/api/v1/companies/:id` | SUPER_ADMIN                                               | 204     | —                             |

**Notas:**

1. **Ordem das rotas no controller importa para o Fastify adapter.** `me` precisa ser declarado antes de `:id` em `GET` e (se aplicável) `PATCH`. Como `/me` vai num controller separado (`companies-me.controller.ts`), e Nest registra rotas por ordem de declaração de controller no `module.imports`, **registrar `CompaniesMeController` antes de `CompaniesController`** em `companies.module.ts`.
2. **`GET /companies` filtros:** `?active=true|false&search=<texto>&cursor=<base64>&limit=20`. `active=true` (default) exclui `deletedAt != null` E `active = false`. `search` é case-insensitive (ILIKE) em `name` e `slug`. Ordenação fixa `createdAt desc, id desc` (cursor estável).
3. **`GET /companies/:id` autorização condicional:** `RolesGuard` libera ADMIN+ (peso 3+); o app service compara `id` com `currentUser.companyId`. Se diferente e `currentUser.role !== 'SUPER_ADMIN'` → **404** (não vaza existência). Se igual → segue.
4. **Soft-deleted Company:** GET/PATCH/DELETE retornam 404. Nunca aparece em listagem.
5. **`POST /companies`:** body é objeto aninhado `{ company, admin }`. Erros de validação Zod retornam 400 com `errors[]` apontando para o caminho (`company.slug`, `admin.email`, etc.).

---

## 3. Schemas Zod

7 arquivos em `src/modules/companies/schemas/`.

### 3.1 `working-hours.schema.ts` — shape compartilhado

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

> Observação: a interpretação semântica (sobrepor ranges, fuso horário, "isOpen") é responsabilidade do `BusinessHoursService` (item separado na Fase 0). Aqui só validamos a estrutura.

### 3.2 `create-company.schema.ts`

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

### 3.3 `update-company-me.schema.ts` — ADMIN+ do próprio tenant

```typescript
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

### 3.4 `update-company.schema.ts` — SUPER_ADMIN, full

```typescript
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

### 3.5 `list-companies.schema.ts`

```typescript
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

### 3.6 `company-response.schema.ts`

```typescript
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

### 3.7 `company-with-admin-response.schema.ts`

```typescript
import { UserResponseSchema } from '../../users/schemas/user-response.schema';

export const CompanyWithAdminResponseSchema = z
  .object({
    company: CompanyResponseSchema,
    admin: UserResponseSchema,
  })
  .describe('Resposta de POST /companies — empresa criada + 1º ADMIN');

export type CompanyWithAdminResponseDto = z.infer<typeof CompanyWithAdminResponseSchema>;
```

`UserResponseSchema` é importado da Sprint 0.4. `passwordHash` nunca vaza (já garantido lá).

---

## 4. Domain service — `companies.domain.service.ts`

`src/modules/companies/services/companies.domain.service.ts`. Acessa Prisma direto. **Não recebe `companyId`** como argumento — Company _é_ o tenant; o id da operação vem do path. Não retorna DTO. Não emite eventos. Não enfileira jobs.

### 4.1 Tipo de retorno

Retorna a entidade Prisma `Company` direta (sem include — settings e users vivem em outros módulos).

### 4.2 Métodos públicos

- **`findById(id, tx?)`** — `findFirst({ where: { id, deletedAt: null } })`. Throws `NotFoundException('Empresa não encontrada')` se ausente.

- **`list(filters, pagination)`** — paginação cursor-based. Mesma estrutura da Sprint 0.4 (`encodeCursor`/`decodeCursor` reaproveitam o helper já implementado em `UsersDomainService` — vou extrair pra `src/common/cursor.ts` na Sprint 0.5 e refatorar Users para usar; nota no plano de execução).

- **`create(input, tx)`** — `input` inclui todos os campos do `Company` já validados pelo app service. Sequência:
  1. `assertSlugAvailable(input.slug, tx)`.
  2. `assertPlanIsActive(input.planId, tx)`.
  3. `tx.company.create({ data: { ...input, settings: { create: {} } } })` — usa nested write para criar `CompanySettings` com defaults do schema na mesma chamada.
  4. Retorna o `Company` criado (sem populate de settings — quem precisar busca explicitamente).

- **`update(id, patch, tx)`** — sequência:
  1. `existing = findById(id, tx)`.
  2. **Defesa-em-profundidade:** ignora `patch.slug` se vier (não deveria — schema do PATCH não inclui).
  3. Se `patch.planId && patch.planId !== existing.planId`: `assertPlanIsActive(patch.planId, tx)`.
  4. `tx.company.update({ where: { id }, data: patch })`.
  5. Retorna o atualizado.

- **`softDelete(id, tx)`** — sequência:
  1. `existing = findById(id, tx)`.
  2. `assertNoActiveUsers(existing.id, tx)`.
  3. `tx.company.update({ where: { id }, data: { deletedAt: new Date() } })`.
  4. Sem retorno (`Promise<void>`).

### 4.3 Asserções privadas

- **`assertSlugAvailable(slug, tx, exceptId?)`** — `tx.company.findFirst({ where: { slug } })`. Inclui soft-deleted (slug é unique global, não respeita deletedAt). Se existe e `existing.id !== exceptId` → `ConflictException('Slug já em uso')`.

- **`assertPlanIsActive(planId, tx)`** — `tx.plan.findFirst({ where: { id: planId, active: true } })`. Ausente → `UnprocessableEntityException('Plano não encontrado ou inativo')`.

- **`assertNoActiveUsers(companyId, tx)`** — `tx.user.count({ where: { companyId, deletedAt: null } })`. Count > 0 → `ConflictException('Não é possível excluir empresa com usuários ativos. Remova-os primeiro.')`.

### 4.4 Invariantes garantidas

1. Soft-deleted Company nunca é retornada em queries default.
2. `slug` nunca é alterado via `update` (defesa em domain + schema strict).
3. `planId` em update é validado.
4. `softDelete` bloqueia se houver User ativo.
5. P2002 em `slug` durante create (race entre `assertSlugAvailable` e `create`) → app service mapeia para `ConflictException('Slug já em uso')`.

### 4.5 O que **não** está no domain de Companies

- Criação do User ADMIN — usa `UsersDomainService.create(...)` injetado pelo app service.
- Criação de `CompanySettings` — feito como nested write dentro de `create` (forma idiomática Prisma; sem precisar tocar em outro domain).
- `bcrypt.hash` — application service.
- Mapeamento para DTO — application service.

---

## 5. Application service — `companies.application.service.ts`

Injeta: `PrismaService`, `CompaniesDomainService`, `UsersDomainService`. Não injeta `AuthDomainService` (sem refresh tokens nesta sprint).

### 5.1 `create(input: CreateCompanyDto): Promise<CompanyWithAdminResponseDto>`

```
passwordHash = await bcrypt.hash(input.admin.password, 12)

try {
  result = await prisma.$transaction(async (tx) => {
    company = await companiesDomain.create({
      name: input.company.name,
      slug: input.company.slug,
      planId: input.company.planId,
      timezone: input.company.timezone,
      defaultWorkingHours: input.company.defaultWorkingHours ?? null,
      outOfHoursMessage: input.company.outOfHoursMessage ?? null,
    }, tx)

    admin = await usersDomain.create({
      name: input.admin.name,
      email: input.admin.email,
      passwordHash,
      role: 'ADMIN',
      departmentIds: [],
    }, company.id, tx)

    return { company, admin }
  })
} catch (err) {
  throw mapConflict(err)  // P2002 em slug → 409 "Slug já em uso"
                          // P2002 em email → 409 "Email já cadastrado" (mesmo padrão da Sprint 0.4)
                          // outros → re-throw
}

return {
  company: toCompanyDto(result.company),
  admin: toUserDto(result.admin),  // reusa toDto da Sprint 0.4 — UserResponseSchema
}
```

### 5.2 `list(query: ListCompaniesQueryDto): Promise<CompanyListResponseDto>`

Mesma estrutura do `UsersApplicationService.list` (cursor-based). Sem dependência de `companyId` — SUPER_ADMIN vê todos os tenants.

### 5.3 `findById(id: string): Promise<CompanyResponseDto>`

Wrapper sobre `companiesDomain.findById(id)` + `toDto`. Só usado pela rota SUPER_ADMIN.

### 5.4 `findByIdAuthorized(id: string, currentUser: User): Promise<CompanyResponseDto>`

```
if (currentUser.role !== 'SUPER_ADMIN' && id !== currentUser.companyId) {
  throw new NotFoundException('Empresa não encontrada')   // não vaza existência
}
const company = await companiesDomain.findById(id)
return toDto(company)
```

### 5.5 `findMine(currentUser: User): Promise<CompanyResponseDto>`

`companiesDomain.findById(currentUser.companyId)` + `toDto`. Sem checks adicionais — `JwtAuthGuard` já garantiu autenticação.

### 5.6 `updateMine(currentUser: User, input: UpdateCompanyMeDto): Promise<CompanyResponseDto>`

```
// Re-parse explícito (defesa-em-profundidade contra ZodValidationPipe global não enforçar .strict())
try {
  UpdateCompanyMeSchema.parse(input)
} catch (error) {
  if (error instanceof ZodError) {
    throw new BadRequestException({
      message: 'Validação falhou',
      errors: error.issues.map(i => ({ field: i.path.join('.') || '<root>', message: i.message, code: i.code })),
    })
  }
  throw error
}

const patch: Prisma.CompanyUpdateInput = {}
if (input.name !== undefined) patch.name = input.name
if (input.timezone !== undefined) patch.timezone = input.timezone
if ('defaultWorkingHours' in input) patch.defaultWorkingHours = input.defaultWorkingHours ?? Prisma.DbNull
if ('outOfHoursMessage' in input) patch.outOfHoursMessage = input.outOfHoursMessage ?? null

const company = await prisma.$transaction(tx =>
  companiesDomain.update(currentUser.companyId, patch, tx)
)
return toDto(company)
```

### 5.7 `updateById(id: string, input: UpdateCompanyDto): Promise<CompanyResponseDto>`

```
// Re-parse explícito
try {
  UpdateCompanySchema.parse(input)
} catch (...) { /* idem */ }

const patch: Prisma.CompanyUpdateInput = {}
if (input.name !== undefined) patch.name = input.name
if (input.timezone !== undefined) patch.timezone = input.timezone
if ('defaultWorkingHours' in input) patch.defaultWorkingHours = input.defaultWorkingHours ?? Prisma.DbNull
if ('outOfHoursMessage' in input) patch.outOfHoursMessage = input.outOfHoursMessage ?? null
if (input.planId !== undefined) patch.plan = { connect: { id: input.planId } }
if (input.active !== undefined) patch.active = input.active

const company = await prisma.$transaction(tx =>
  companiesDomain.update(id, patch, tx)
)
return toDto(company)
```

### 5.8 `softDelete(id: string): Promise<void>`

```
await prisma.$transaction(tx =>
  companiesDomain.softDelete(id, tx)
)
```

### 5.9 `toDto(company: Company): CompanyResponseDto`

```typescript
return {
  id: company.id,
  planId: company.planId,
  name: company.name,
  slug: company.slug,
  active: company.active,
  timezone: company.timezone,
  defaultWorkingHours: company.defaultWorkingHours as WorkingHoursDto | null, // Json -> WorkingHoursDto
  outOfHoursMessage: company.outOfHoursMessage,
  createdAt: company.createdAt.toISOString(),
  updatedAt: company.updatedAt.toISOString(),
};
```

Sem `deletedAt`, sem `settings`.

### 5.10 `mapConflict(err: unknown): unknown`

```typescript
if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
  const target = (err.meta?.target as string[] | undefined) ?? [];
  if (target.includes('slug')) return new ConflictException('Slug já em uso');
  if (target.includes('email')) return new ConflictException('Email já cadastrado');
}
return err;
```

---

## 6. Validações e mapeamento de erros

### 6.1 Tabela completa

| Cenário                                                        | Camada                                                  | Status | Mensagem                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| Sem JWT                                                        | `JwtAuthGuard`                                          | 401    | `Autenticação necessária`                                                 |
| JWT inválido/expirado                                          | `JwtAuthGuard`                                          | 401    | `Sessão expirada. Faça login novamente.`                                  |
| AGENT/SUPERVISOR em rota SUPER_ADMIN-only                      | `RolesGuard`                                            | 403    | `Você não tem permissão para esta ação`                                   |
| ADMIN em `POST /companies`                                     | `RolesGuard`                                            | 403    | idem                                                                      |
| ADMIN em `GET /companies/:idDeOutroTenant`                     | App service `findByIdAuthorized`                        | 404    | `Empresa não encontrada`                                                  |
| `slug` formato inválido no POST                                | Schema Zod `CreateCompanySchema`                        | 400    | `Validação falhou` + mensagem do regex                                    |
| `slug` colide                                                  | Domain `assertSlugAvailable` ou P2002                   | 409    | `Slug já em uso`                                                          |
| `planId` não existe ou `active: false`                         | Domain `assertPlanIsActive`                             | 422    | `Plano não encontrado ou inativo`                                         |
| `admin.email` já existe (qualquer tenant, mesmo soft-deletado) | Reuso `UsersDomainService.assertEmailNotInUse` ou P2002 | 409    | `Email já cadastrado`                                                     |
| `admin.password` < 8 chars                                     | Schema Zod                                              | 400    | `Senha deve ter no mínimo 8 caracteres`                                   |
| GET/PATCH/DELETE em company soft-deletada ou inexistente       | Domain `findById`                                       | 404    | `Empresa não encontrada`                                                  |
| DELETE com User ativo                                          | Domain `assertNoActiveUsers`                            | 409    | `Não é possível excluir empresa com usuários ativos. Remova-os primeiro.` |
| PATCH `/me` com chave proibida (`planId`, `active`, `slug`)    | Schema Zod `.strict()` + re-parse                       | 400    | `Validação falhou` + `Unrecognized key`                                   |
| PATCH `/:id` com `slug`                                        | Schema Zod `.strict()` + re-parse                       | 400    | idem                                                                      |
| Body do POST sem `admin` ou sem `company`                      | Schema Zod                                              | 400    | `Validação falhou` + `Required`                                           |
| `limit > 100` no list                                          | Schema Zod                                              | 400    | (mensagem padrão Zod)                                                     |

### 6.2 Race condition de slug e email

Janela rara entre `assert*Available` e o `INSERT` em concorrência. O constraint `Company.slug @unique` ou `User.email @unique` rejeita o segundo INSERT com `P2002`. `mapConflict` no application service captura e converte para `ConflictException` apropriado. Padrão idêntico ao adotado na Sprint 0.4 para email.

### 6.3 Fora de escopo do Sprint 0.5

- `PATCH /companies/:id/settings` (CRUD de settings — próxima sprint).
- `GET /plans` ou tela de seleção de plano.
- Endpoint para renomear `slug`.
- `restore` de Company soft-deletada.
- AuditLog.
- Upload de logo / branding.
- Limites por plano (rate limit, quota de users, quota de canais).
- Validação semântica de `timezone` contra IANA tz database (apenas string min/max).
- Validação de sobreposição em `defaultWorkingHours` (estrutura validada, semântica não).

---

## 7. Estrutura de arquivos

Gerada por `pnpm g:feature companies`, depois preenchida. Adições além do scaffold padrão:

```
src/modules/companies/
├── companies.module.ts                                  # imports: AuthModule, UsersModule
├── controllers/
│   ├── companies.controller.ts                          # POST/GET/GET:id/PATCH:id/DELETE:id
│   └── companies-me.controller.ts                       # GET /me, PATCH /me  (registrado ANTES no module)
├── services/
│   ├── companies.application.service.ts
│   └── companies.domain.service.ts
├── schemas/
│   ├── create-company.schema.ts
│   ├── update-company-me.schema.ts
│   ├── update-company.schema.ts
│   ├── list-companies.schema.ts
│   ├── company-response.schema.ts
│   ├── company-with-admin-response.schema.ts
│   └── working-hours.schema.ts
└── tests/
    ├── companies.domain.service.spec.ts                 # unit
    ├── companies.controller.e2e-spec.ts                 # rotas SUPER_ADMIN + multi-tenant
    └── companies-me.controller.e2e-spec.ts              # GET/PATCH /me
```

`UsersModule` já exporta `UsersDomainService` (verificado em `src/modules/users/users.module.ts:12`). `CompaniesModule` registrado em `src/app.module.ts` `imports: [...]`.

**Nota sobre extração de cursor helper:** `encodeCursor`/`decodeCursor` está hoje em `UsersDomainService` (Sprint 0.4). Mover para `src/common/cursor.ts` durante esta sprint e refatorar `UsersDomainService` para importá-lo. Plano detalhado deixa essa extração como step explícito antes de implementar `CompaniesDomainService.list` — com PR atômica e testes de Users continuando a passar como gate.

---

## 8. Testes

### 8.1 Unit — `companies.domain.service.spec.ts`

Mockar `PrismaClient` com `vi.fn()` (mesmo padrão de `users.domain.service.spec.ts`). Cobrir só regra de negócio:

- `assertSlugAvailable` — colide → `ConflictException`; livre → passa; `exceptId === existing.id` passa (cenário hipotético — não chamamos hoje, mas guard existe).
- `assertPlanIsActive` — plano inativo → `UnprocessableEntityException`; ativo → passa; inexistente → `UnprocessableEntityException`.
- `assertNoActiveUsers` — count > 0 → `ConflictException`; count === 0 → passa.
- `update` ignora `patch.slug` quando vaza (defesa-em-profundidade).
- `softDelete` chama `assertNoActiveUsers` antes de setar `deletedAt`.

Não testar (e2e cobre): `findById`, `list`, `create` happy path, mapeamento de DTO.

### 8.2 E2E — `companies.controller.e2e-spec.ts`

Padrão da Sprint 0.4: `app.inject()` (Fastify), `truncateAll` no `beforeEach`, factories de `test/e2e/factories.ts`.

**Happy paths (1 por endpoint):**

- `POST /companies` como SUPER_ADMIN: cria Company + Settings + ADMIN; resposta 201 com `{ company, admin }`. Assert: `prisma.company.count() === 2` (seed + nova), `prisma.companySettings.count({ where: { companyId: novo } }) === 1`, admin retornado com `role === 'ADMIN'` e `passwordHash` ausente.
- `GET /companies` como SUPER_ADMIN: vê seed + nova.
- `GET /companies/:id` como SUPER_ADMIN: 200 com a company.
- `PATCH /companies/:id` como SUPER_ADMIN: muda `name` + `planId` + `active` → 200; assert no banco.
- `DELETE /companies/:id` como SUPER_ADMIN, tenant vazio: seta `deletedAt`, 204; GET subsequente → 404.

**Sad paths obrigatórios:**

- POST sem `admin` no body → 400.
- POST com `slug` inválido (`Acme Co`, `acme-`, `--acme--`) → 400.
- POST com `slug` colidindo → 409 `"Slug já em uso"`.
- POST com `admin.email` colidindo (mesmo tenant inexistente, mas email é global unique) → 409 `"Email já cadastrado"`.
- POST com `planId` inativo → 422.
- POST com `planId` inexistente → 422.
- POST como ADMIN → 403.
- POST como AGENT → 403.
- LIST como ADMIN → 403.
- GET `:id` SUPER_ADMIN com soft-deleted → 404.
- PATCH `:id` SUPER_ADMIN com `slug` no body → 400 (`Unrecognized key`).
- PATCH `:id` SUPER_ADMIN com `planId` inativo → 422.
- PATCH `:id` como ADMIN → 403.
- DELETE com User ativo → 409 `"Não é possível excluir empresa com usuários ativos..."`.
- DELETE como ADMIN → 403.

**Multi-tenant isolation (caso especial — Companies É o tenant):**

- ADMIN do tenant A → `GET /companies/<idDeB>` → **404** (não vaza existência).
- ADMIN do tenant A → `GET /companies/<idDeA>` → 200.
- AGENT do tenant A → `GET /companies/<idDeB>` → 404.
- Listagem como ADMIN → 403 (tem RolesGuard antes de chegar no app service).

**Nota:** atualizar `docs/conventions/multi-tenant-checklist.md` com seção curta "Casos especiais — entidade que É o tenant", referenciando este spec. Sem reescrever o checklist; só linkar a exceção.

### 8.3 E2E — `companies-me.controller.e2e-spec.ts`

- `GET /companies/me` como AGENT/SUPERVISOR/ADMIN: 200, retorna a do JWT.
- `GET /companies/me` sem JWT → 401.
- `PATCH /companies/me` como ADMIN: muda `name`, `timezone`, `outOfHoursMessage`, `defaultWorkingHours` → 200.
- `PATCH /companies/me` como ADMIN com chave proibida (`planId`, `active`, `slug`) → 400 (`Unrecognized key`).
- `PATCH /companies/me` como AGENT → 403.
- `PATCH /companies/me` como SUPERVISOR → 403 (rota é ADMIN+).

### 8.4 Factory additions em `test/e2e/factories.ts`

```typescript
export async function createSuperAdmin(
  prisma: PrismaClient,
  companyId: string,
  options: { email?: string; password?: string } = {},
): Promise<{ user: User; password: string }>;
// wrapper sobre createUser com role: 'SUPER_ADMIN' — atalho para os specs
```

`truncateAll` já cobre `Company`, `CompanySettings`, `User` na ordem certa (verificado em `factories.ts:81`).

---

## 9. Verificação por evidência (gates do PR)

Em ordem, todos verdes localmente antes de abrir cada PR:

```bash
pnpm typecheck
pnpm lint
pnpm test                # unit (auth + users + companies)
pnpm test:schema         # Sprint 0.2 não pode quebrar
pnpm test:e2e            # auth + users + me + companies + companies-me
pnpm build
```

CI roda os mesmos comandos via `.github/workflows/ci.yml`.

---

## 10. Smoke test manual com curl

Pré-requisito: SUPER_ADMIN seedado (`super@digichat.local` / fallback de dev).

```
1. Login SUPER_ADMIN → token_super
   POST /api/v1/auth/login { email: super@..., password: ... }

2. Pegar planId do "Default" (SQL ou seed):
   SELECT id FROM "Plan" WHERE name = 'Default';

3. POST /companies → 201
   POST /api/v1/companies (Bearer token_super)
   { "company": { "name": "Acme Inc", "slug": "acme", "planId": "<uuid>" },
     "admin":   { "name": "Beth", "email": "beth@acme.com", "password": "valid-pass-1234" } }

4. Verificar que CompanySettings foi criada
   SELECT * FROM "CompanySettings" WHERE "companyId" = <newId>;

5. GET /companies → 200, vê 2 (exemplo + acme)
   GET /api/v1/companies (Bearer token_super)

6. GET /companies/me como SUPER_ADMIN → 200, retorna "exemplo"
   GET /api/v1/companies/me (Bearer token_super)

7. Login do novo ADMIN → token_admin
   POST /api/v1/auth/login { email: beth@..., password: ... }

8. GET /companies/me como ADMIN → 200, retorna "acme"
   GET /api/v1/companies/me (Bearer token_admin)

9. PATCH /companies/me com {name} → 200
   PATCH /api/v1/companies/me (Bearer token_admin) { "name": "Acme Brasil" }

10. PATCH /companies/me com {planId} → 400 (Unrecognized key)
    PATCH /api/v1/companies/me (Bearer token_admin) { "planId": "..." }

11. PATCH /companies/<idAcme> como SUPER_ADMIN → 200 (active: false)
    PATCH /api/v1/companies/<idAcme> (Bearer token_super) { "active": false }

12. PATCH /companies/<idExemplo> como ADMIN do acme → 403 (RolesGuard)

13. DELETE /companies/<idAcme> como SUPER_ADMIN com ADMIN ainda ativo → 409
    DELETE /api/v1/companies/<idAcme> (Bearer token_super)

14. DELETE /users/<idBeth> como SUPER_ADMIN → 204

15. DELETE /companies/<idAcme> como SUPER_ADMIN → 204

16. GET /companies/<idAcme> como SUPER_ADMIN → 404

17. POST /companies de novo com slug "acme" → 409 (slug global unique, soft-delete não libera)
```

---

## 11. Migration / schema

**Nenhuma migration nova nesta sprint.** `Company`, `CompanySettings`, `Plan`, `User` estão completos desde Sprint 0.2.

Se a sprint introduzir necessidade de schema change (ex: `Company.suspendedAt` separado de `active`), o spec será atualizado e o passo de migration entrará no plano de execução.

---

## 12. Plano de branches e PRs

### 12.1 Pré-passo — `fix/users-strict-validation`

PR pequena, mergeada **antes** do trabalho desta sprint. Escopo:

- Adicionar re-parse explícito de `UpdateUserSchema` em `UsersApplicationService.updateById` (mesmo padrão de `updateMe`, ~10 linhas).
- 1 caso e2e em `users.controller.e2e-spec.ts`: `PATCH /users/:id` com chave extra (ex: `{ randomKey: true }`) → 400 com `Unrecognized key`.
- Branch: `fix/users-strict-validation`.
- Commit: `fix(users): enforce strict schema on PATCH /users/:id` (Conventional Commits, en).

### 12.2 Branch principal — `feat/sprint-0-5-companies-crud`

Criada após merge do fix. Sequência (detalhada no plano executável):

1. Rodar `pnpm g:feature companies`, ajustar imports.
2. Extrair cursor helper para `src/common/cursor.ts`, refatorar `UsersDomainService`, garantir testes existentes verdes.
3. Implementar schemas (TDD: começar pelo schema teste mais simples).
4. Implementar `CompaniesDomainService` com testes unit.
5. Implementar `CompaniesApplicationService`.
6. Implementar `CompaniesController` + `CompaniesMeController`.
7. Adicionar factories e e2e.
8. Atualizar `docs/conventions/multi-tenant-checklist.md` com seção "entidade que É o tenant".
9. Rodar verificação completa (`typecheck`, `lint`, `test`, `test:schema`, `test:e2e`, `build`).
10. Smoke manual com curl.
11. Commit final marca `[x] Companies (apenas SUPER_ADMIN)` em `ROADMAP.md`.

### 12.3 PR final

Descrição com:

- Resumo das decisões da seção 1.
- Checklist (multi-tenant, schemas Zod, testes, ROADMAP).
- Link para o spec em `docs/superpowers/specs/2026-05-02-sprint-0-5-companies-crud-design.md`.
- Smoke test executado e printado.

---

## 13. Mapeamento ROADMAP

Ao final da sprint (commit que fecha o trabalho), `ROADMAP.md` §5 "CRUD básico (estrutura 3 camadas em todos)":

```diff
- [ ] Companies (apenas SUPER_ADMIN)
+ [x] Companies (apenas SUPER_ADMIN)
```

Demais itens da Fase 0 permanecem inalterados.

---

## 14. Atualização de convenções

Adicionar seção curta em `docs/conventions/multi-tenant-checklist.md`:

```markdown
## Caso especial — entidade que É o tenant (Company)

Operações sobre `Company` (tenant root) **não filtram por `@CurrentCompany()`**
da forma tradicional, porque o tenant **é** o objeto da operação, não o contexto.
Ver `docs/superpowers/specs/2026-05-02-sprint-0-5-companies-crud-design.md` §1.7
e §2.

Invariantes mantidas:

- ADMIN+ só acessa a própria Company (`:id === currentUser.companyId` ou
  `/companies/me`); cross-tenant retorna 404.
- Listagem e criação são SUPER_ADMIN-only.
- Demais entidades de tenant (User, Department, etc.) continuam seguindo o
  padrão tradicional do checklist.
```

Sem reescrever o checklist; só adicionar a exceção e linkar.
