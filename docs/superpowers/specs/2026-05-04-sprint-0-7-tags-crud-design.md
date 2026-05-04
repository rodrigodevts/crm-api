# Sprint 0.7 — Tags CRUD (com escopo)

**Status:** aprovado para implementação
**Fase:** 0 (Fundação) — `ROADMAP.md` §5, "CRUD básico (estrutura 3 camadas em todos)"
**Branch:** `feat/sprint-0-7-tags-com-escopo`
**Audit fonte:** `crm-specs/audits/audit-03A-cadastros-base.md` §4
**Data:** 2026-05-04

---

## 1. Objetivo

CRUD completo de Tag com escopo (`CONTACT` / `TICKET` / `BOTH`), seguindo o padrão de 3 camadas consolidado nas Sprints 0.4–0.6. Tag é entidade-tenant tradicional: toda query filtra por `companyId`, leitura aberta a qualquer auth do tenant (atendentes precisam do dropdown "Aplicar tag"), escrita SUPERVISOR+, hard delete ADMIN+.

**Fora desta sprint** (documentado para próximas fases):

- `POST /contacts/:id/tags` (RF-TAG-5) — Phase 2 com `ContactsModule`.
- `POST /tickets/:id/tags` (RF-TAG-6) — Phase 2 com `TicketsModule`.
- Validação de `tag.scope` na atribuição em Contact/Ticket — regra documentada, implementada quando RF-TAG-5/6 entrarem.
- Limites 20 tags/contato e 10/ticket — pertencem a RF-TAG-5/6.
- Migration `deletedAt` em Tag — **não necessária**, `active=false` cobre soft delete.

---

## 2. Decisões arquiteturais (brainstorming)

### D-2.1 — Estratégia de DELETE: híbrido soft + hard via query param

**Decisão:** seguir audit RF-TAG-4 literal.

- `DELETE /tags/:id` → soft delete via `active=false` (idempotente).
- `DELETE /tags/:id?hard=true` → hard delete real, **ADMIN+ apenas**, retorna **409 Conflict** se houver `ContactTag` ou `TicketTag` associado (mesmo que Cascade exista no schema — UX é avisar antes, não apagar histórico em silêncio).
- Nenhuma migration necessária. `deletedAt` não é adicionado ao model Tag.

**Por quê:** alinhado ao audit, evita migration nesta sprint, mantém UX consistente entre "ocultar" e "deletar pra valer".

### D-2.2 — Permissões: SUPERVISOR+ em escrita, ADMIN+ em hard delete

**Decisão:** seguir audit RF-TAG-1 (mais permissivo que o padrão Departments/Users).

- `POST /tags`, `PATCH /tags/:id`, `DELETE /tags/:id` (soft) → `@Roles('SUPERVISOR')` (= SUPERVISOR + ADMIN + SUPER_ADMIN, hierárquico).
- `DELETE /tags/:id?hard=true` → check programático no application service: `WEIGHT[user.role] >= WEIGHT.ADMIN`, senão 403.
- `GET /tags`, `GET /tags/:id` → qualquer auth do tenant (sem `@Roles`).

**Por quê:** Tag é leve (não distribui ticket, não autoriza acesso). Supervisores cuidam da operação dia-a-dia. Hard delete é destrutivo → fica restrito a ADMIN.

### D-2.3 — Semântica do filtro `?scope=` na listagem: aplicabilidade

**Decisão:** filtro retorna tags **aplicáveis** ao tipo solicitado.

- `?scope=TICKET` → `WHERE scope IN ('TICKET', 'BOTH')`.
- `?scope=CONTACT` → `WHERE scope IN ('CONTACT', 'BOTH')`.
- `?scope=BOTH` → literal (`WHERE scope = 'BOTH'`).
- Sem `?scope` → sem filtro de scope.

**Por quê:** dropdown do ticket usa `?scope=TICKET&active=true` e recebe a lista certa sem OR client-side. Regra de negócio fica no backend (CLAUDE.md §4).

### D-2.4 — Normalização de `color`

**Decisão:** seguir audit D-TAG-2.

- Validação Zod: regex `/^#[0-9A-Fa-f]{6}$/` (case-insensitive na entrada).
- Normalização para uppercase via `.transform((s) => s.toUpperCase())` no schema, antes do domain service.
- Sem unique em `color` (duas tags podem ter mesma cor; é só visual).

**Por quê:** evita ruído em comparações/relatórios futuros, custo zero, audit pediu.

### D-2.5 — Lista default inclui ativas + inativas

**Decisão:** `GET /tags` sem `?active` retorna todas (ativas e inativas) — igual Departments. Filtro `?active=true` ou `?active=false` aplica literal.

**Por quê:** consistência com Sprint 0.6.

### D-2.6 — DELETE com role variável: rota única + check programático

**Decisão:** rota única `DELETE /tags/:id` decorada com `@Roles('SUPERVISOR')`; se `?hard=true` chegar, application service valida `user.role >= ADMIN` e lança 403 se não.

**Por quê:** semântica REST do audit (`?hard=true`). Alternativa seria 2 rotas (`/tags/:id` e `/tags/:id/hard`), porém quebra a aderência ao audit por ganho marginal de clareza.

**Implicação:** `WEIGHT` é exportado de `src/common/guards/roles.guard.ts` para reutilizar no application service (single source of truth da hierarquia).

---

## 3. API Contract

| Método   | Rota                  | Roles                  | Body / Query       | Sucesso                    | Erros principais                               |
| -------- | --------------------- | ---------------------- | ------------------ | -------------------------- | ---------------------------------------------- |
| `POST`   | `/tags`               | `SUPERVISOR`           | `CreateTagDto`     | `201` `TagResponseDto`     | `400` validação, `409` nome duplicado          |
| `GET`    | `/tags`               | qualquer auth          | `ListTagsQueryDto` | `200` `TagListResponseDto` | `400` cursor inválido                          |
| `GET`    | `/tags/:id`           | qualquer auth          | —                  | `200` `TagResponseDto`     | `404` not found / cross-tenant                 |
| `PATCH`  | `/tags/:id`           | `SUPERVISOR`           | `UpdateTagDto`     | `200` `TagResponseDto`     | `400`, `404`, `409` rename colide              |
| `DELETE` | `/tags/:id`           | `SUPERVISOR`           | (sem `?hard`)      | `204` (soft)               | `404`                                          |
| `DELETE` | `/tags/:id?hard=true` | `ADMIN` (programático) | —                  | `204` (hard)               | `403` se < ADMIN, `404`, `409` se houver pivôs |

**Detalhes:**

- **DELETE soft:** marca `active=false`, idempotente (DELETE em tag já inativa retorna 204).
- **DELETE hard:** `findByIdWithCounts` → soma `_count.contactTags + _count.ticketTags`. Se > 0 → `409` com mensagem `"Não é possível excluir definitivamente: há N atribuição(ões). Remova-as antes."` Tudo dentro de `prisma.$transaction`.
- **Cross-tenant:** `404` em GET/PATCH/DELETE (não 403 — evita info leak).

---

## 4. Schemas Zod

Padrão consolidado: `createZodDto`, `.strict()` em body, `z.coerce.*` em query, `.describe()` em campos não-óbvios (vira OpenAPI), mensagens em pt-BR.

### `schemas/create-tag.schema.ts`

```ts
export const CreateTagSchema = z
  .object({
    name: z.string().trim().min(1, 'Nome é obrigatório').max(100, 'Máximo 100 caracteres'),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar no formato #RRGGBB')
      .transform((s) => s.toUpperCase()),
    scope: z.enum(['CONTACT', 'TICKET', 'BOTH']).default('BOTH'),
    active: z.boolean().default(true),
  })
  .strict();

export class CreateTagDto extends createZodDto(CreateTagSchema) {}
```

### `schemas/update-tag.schema.ts`

```ts
export const UpdateTagSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
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

### `schemas/list-tags.schema.ts`

```ts
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

> **Nota sobre `z.coerce.boolean()`:** comportamento conhecido — `coerce.boolean('false')` retorna `true` (truthy). Conferir como Sprint 0.6 (Departments) lida com isso e seguir o padrão. Se houver workaround, replicar; senão, considerar `z.enum(['true','false']).transform((v) => v === 'true')`.

### `schemas/delete-tag.schema.ts`

```ts
export const DeleteTagQuerySchema = z.object({
  hard: z.coerce.boolean().default(false),
});

export class DeleteTagQueryDto extends createZodDto(DeleteTagQuerySchema) {}
```

### `schemas/tag-response.schema.ts`

```ts
export const TagResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string(),
  scope: z.enum(['CONTACT', 'TICKET', 'BOTH']),
  active: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
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

---

## 5. Domain Service

`services/tags.domain.service.ts` — acesso Prisma com `companyId` explícito, sem eventos, sem DTOs.

```ts
type Db = PrismaService | Prisma.TransactionClient;

type ListFilters = {
  active?: boolean | undefined;
  scope?: 'CONTACT' | 'TICKET' | 'BOTH' | undefined;
  search?: string | undefined;
  sort: 'createdAt' | 'name';
};
type ListPagination = { cursor?: string | undefined; limit: number };
type ListResult = { items: Tag[]; hasMore: boolean };

export type CreateTagInput = {
  name: string;
  color: string; // já uppercase
  scope?: 'CONTACT' | 'TICKET' | 'BOTH';
  active?: boolean;
};

@Injectable()
export class TagsDomainService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, companyId: string, tx?: Prisma.TransactionClient): Promise<Tag>;
  async findByIdWithCounts(
    id: string,
    companyId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Tag & { _count: { contactTags: number; ticketTags: number } }>;
  async list(
    companyId: string,
    filters: ListFilters,
    pagination: ListPagination,
  ): Promise<ListResult>;
  async create(
    input: CreateTagInput,
    companyId: string,
    tx: Prisma.TransactionClient,
  ): Promise<Tag>;
  async update(
    id: string,
    companyId: string,
    patch: Prisma.TagUpdateInput,
    tx: Prisma.TransactionClient,
  ): Promise<Tag>;
  async softDelete(id: string, companyId: string, tx: Prisma.TransactionClient): Promise<void>;
  async hardDelete(id: string, companyId: string, tx: Prisma.TransactionClient): Promise<void>;
  async assertNameAvailable(
    name: string,
    companyId: string,
    tx: Prisma.TransactionClient,
    exceptId?: string,
  ): Promise<void>;
}
```

**Comportamento crítico do `list`:**

- `where.companyId = companyId` — não-negociável (CLAUDE.md §4 regra 1).
- `filters.active`: literal se definido; senão sem filtro.
- `filters.scope`:
  - `TICKET` → `where.scope = { in: ['TICKET', 'BOTH'] }`
  - `CONTACT` → `where.scope = { in: ['CONTACT', 'BOTH'] }`
  - `BOTH` → `where.scope = 'BOTH'`
  - undefined → sem filtro
- `filters.search`: `name: { contains, mode: 'insensitive' }`.
- Cursor + sort idêntico ao Departments — reusa `decodeCursor` de `src/common/cursor.ts`.

**`softDelete`** é idempotente: chamar em tag já inativa não falha (executa o update mesmo assim, write é noop em termos de estado).

**`hardDelete`** assume permissão e ausência de pivôs já checadas pelo application service. Apenas executa `tx.tag.delete({ where: { id } })`. Cascade do schema cuida da limpeza dos pivôs (mas eles devem estar vazios se chegou aqui).

---

## 6. Application Service

`services/tags.application.service.ts` — orquestração + transação + mapeamento de erro + check de permissão programático para hard delete.

```ts
@Injectable()
export class TagsApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tags: TagsDomainService,
  ) {}

  async create(input: CreateTagDto, companyId: string): Promise<TagResponse> {
    try {
      const tag = await this.prisma.$transaction((tx) => this.tags.create(input, companyId, tx));
      return this.toResponse(tag);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  async list(companyId: string, query: ListTagsQueryDto): Promise<TagListResponse> {
    const result = await this.tags.list(
      companyId,
      { active: query.active, scope: query.scope, search: query.search, sort: query.sort },
      { cursor: query.cursor, limit: query.limit },
    );
    return {
      items: result.items.map((t) => this.toResponse(t)),
      pagination: {
        nextCursor: this.computeNextCursor(result, query.sort),
        hasMore: result.hasMore,
      },
    };
  }

  async findById(id: string, companyId: string): Promise<TagResponse> {
    const tag = await this.tags.findById(id, companyId);
    return this.toResponse(tag);
  }

  async update(id: string, companyId: string, input: UpdateTagDto): Promise<TagResponse> {
    // Re-parse defesa-em-profundidade (padrão Sprint 0.4/0.5/0.6)
    const parsed = UpdateTagSchema.parse(input);
    const patch: Prisma.TagUpdateInput = {};
    if (parsed.name !== undefined) patch.name = parsed.name;
    if (parsed.color !== undefined) patch.color = parsed.color;
    if (parsed.scope !== undefined) patch.scope = parsed.scope;
    if (parsed.active !== undefined) patch.active = parsed.active;

    try {
      const tag = await this.prisma.$transaction((tx) =>
        this.tags.update(id, companyId, patch, tx),
      );
      return this.toResponse(tag);
    } catch (err) {
      throw this.mapConflict(err);
    }
  }

  async delete(id: string, companyId: string, user: User, query: DeleteTagQueryDto): Promise<void> {
    if (query.hard) {
      if (WEIGHT[user.role] < WEIGHT.ADMIN) {
        throw new ForbiddenException('Apenas ADMIN pode excluir definitivamente');
      }
      await this.prisma.$transaction(async (tx) => {
        const tag = await this.tags.findByIdWithCounts(id, companyId, tx);
        const total = tag._count.contactTags + tag._count.ticketTags;
        if (total > 0) {
          throw new ConflictException(
            `Não é possível excluir definitivamente: há ${total} atribuição(ões). Remova-as antes.`,
          );
        }
        await this.tags.hardDelete(id, companyId, tx);
      });
      return;
    }
    await this.prisma.$transaction((tx) => this.tags.softDelete(id, companyId, tx));
  }

  private mapConflict(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException('Já existe uma tag com este nome');
    }
    return err;
  }

  private toResponse(tag: Tag): TagResponse {
    /* shape do TagResponseSchema */
  }
  private computeNextCursor(result: ListResult, sort: 'createdAt' | 'name'): string | null {
    /* idem Departments */
  }
}
```

**Pontos:**

- Transação em todas as escritas — futuro-proof para AuditLog.
- Re-parse no PATCH — defesa-em-profundidade contra controller que escapou validação.
- Hard delete: 2 checks dentro da transação (permissão antes, count dentro).
- `mapConflict` privado por módulo — duplicação consciente (~5 linhas, YAGNI extrair pra common agora).

---

## 7. Controller

`controllers/tags.controller.ts`

```ts
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

---

## 8. Module wiring

`tags.module.ts`:

```ts
@Module({
  controllers: [TagsController],
  providers: [TagsApplicationService, TagsDomainService],
  exports: [TagsApplicationService],
})
export class TagsModule {}
```

Adicionar em `src/app.module.ts` na lista de imports. **Não usar `pnpm g:feature tags`** sem renomear depois — o gerador pluraliza para `tags` (já no plural correto), mas conferir o output.

---

## 9. Testes

### 9.1 Domain (`tests/tags.domain.service.spec.ts`)

Vitest, banco real via `truncateAll` no `beforeEach`. Não mocka Prisma.

- `findById`: retorna; 404 se id de outro tenant; 404 se não existe.
- `list` filtros:
  - sem filtros: ativas + inativas do tenant.
  - `active=true`: só ativas.
  - `scope=TICKET`: TICKET + BOTH.
  - `scope=CONTACT`: CONTACT + BOTH.
  - `scope=BOTH`: literal.
  - `search='vip'`: case-insensitive.
  - `sort=name`: alfabético; `sort=createdAt`: desc.
  - cursor pagination 3 páginas com limit=2: cobre todas as tags exatamente uma vez.
- `create`: cria; `assertNameAvailable` lança 409 em duplicata.
- `update`: atualiza name; rename colidindo lança 409.
- `softDelete`: marca `active=false`; idempotente.
- `hardDelete`: deleta de fato; após hard, `findById` lança 404.

### 9.2 E2E controller (`tests/tags.controller.e2e-spec.ts`)

Cobre HTTP + auth + roles + multi-tenant.

**Happy paths:**

1. `POST /tags` ADMIN com `scope=BOTH` default e `color: '#aabbcc'` → 201 com `color: '#AABBCC'`.
2. `POST` SUPERVISOR funciona (cobre D-2.2).
3. `GET /tags` AGENT → 200.
4. `GET /tags/:id` → 200.
5. `PATCH` SUPERVISOR atualiza name → 200.
6. `DELETE` SUPERVISOR (soft) → 204; `GET` subsequente mostra `active=false`.
7. `DELETE ?hard=true` ADMIN sem assignments → 204; `GET` retorna 404.

**Sad paths:**

- `POST` color inválido (`"red"`) → 400.
- `POST` color inválido (`"#abc"`) → 400.
- `POST` name vazio → 400.
- `POST` campo desconhecido → 400 (`.strict()`).
- `POST` nome duplicado no tenant → 409.
- `PATCH` rename colidindo → 409.
- `PATCH` campo desconhecido → 400.
- `GET /tags/:id` cross-tenant → 404 (não 403).
- `DELETE ?hard=true` SUPERVISOR → 403.
- `DELETE ?hard=true` AGENT → 403.
- `DELETE` AGENT → 403.
- `POST` AGENT → 403.

**Multi-tenant:**

- Tenant A e B criam tag "VIP" — ambos sucedem.
- Tenant B GET/PATCH/DELETE tag de A → 404.

**Filtro `?scope=` (D-2.3):**

- 3 tags (TICKET, CONTACT, BOTH).
- `?scope=TICKET` → 2 (TICKET + BOTH).
- `?scope=CONTACT` → 2 (CONTACT + BOTH).
- `?scope=BOTH` → 1 (BOTH).

**Hard delete bloqueado por assignments:**

- Tentativa: criar `Contact` minimal via `prisma.contact.create({})` (sem CRUD), inserir `ContactTag` direto, validar que `DELETE ?hard=true` retorna 409 com mensagem da contagem.
- Se `Contact` exigir muitos campos NOT NULL que tornem o setup impraticável → o teste vira `it.todo` documentado e fica para Phase 1 quando ContactsModule existir.

### 9.3 Test factories

Adicionar `createTag(prisma, { companyId, name, color?, scope?, active? })` em `test/factories.ts`, análogo a `createDepartment`.

---

## 10. Verificação por evidência

Antes de declarar pronto:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:schema      # Sprint 0.2 não pode quebrar
pnpm test:e2e         # 118 existentes + ~30 novos
pnpm build
```

**Smoke manual via curl:**

1. Login ADMIN → `POST /tags` com `{ "name": "VIP", "scope": "TICKET", "color": "#FF0000" }` → 201.
2. `POST /tags` com `{ "name": "Cliente VIP", "scope": "CONTACT", "color": "#00FF00" }` → 201.
3. `POST /tags` com `{ "name": "Importante", "scope": "BOTH", "color": "#0000FF" }` → 201.
4. Login AGENT → `GET /tags` → 200, retorna 3 itens.
5. AGENT → `GET /tags?scope=TICKET` → 2 itens (VIP + Importante).
6. AGENT → `GET /tags?scope=CONTACT` → 2 itens (Cliente VIP + Importante).
7. AGENT → `POST /tags` → 403.
8. SUPERVISOR → `PATCH /tags/:vipId` com `{ "name": "Cliente VIP" }` → 409.
9. SUPERVISOR → `PATCH /tags/:vipId` com `{ "name": "VIP Premium" }` → 200.
10. SUPERVISOR → `DELETE /tags/:vipId?hard=true` → 403.
11. ADMIN → `DELETE /tags/:vipId?hard=true` → 204.
12. ADMIN → `GET /tags/:vipId` → 404.
13. SUPERVISOR → `DELETE /tags/:importanteId` → 204; `GET /tags/:importanteId` → 200 com `active=false`.
14. Cross-tenant: tenant B `GET /tags/:idDoA` → 404.

---

## 11. Pré-requisitos prontos (não criar de novo)

- Schema Tag + ContactTag + TicketTag + enum TagScope (Sprint 0.2).
- Auth + JwtAuthGuard + RolesGuard + `@CurrentUser`/`@CurrentCompany` (Sprint 0.3).
- Padrão 3 camadas (Sprint 0.4/0.5/0.6).
- `decodeCursor` em `src/common/cursor.ts` (Sprint 0.6).
- Padrão schema `.strict()` + re-parse no PATCH (Sprint 0.4/0.5/0.6).
- Padrão `mapConflict` P2002 → 409 (Sprint 0.5/0.6).
- `createZodDto` + `@Query() query: ListXxxQueryDto` (Sprint 0.6).
- Padrão `?sort=createdAt|name` (Sprint 0.6).
- Padrão leitura aberta a qualquer auth + escrita ADMIN+ (Sprint 0.4/0.6) — mas Tag usa SUPERVISOR+.
- Test factories `createPlan`, `createCompany`, `createUser`, `createDepartment`, `createSuperAdmin`, `loginAs`, `truncateAll` (Sprint 0.4–0.6).

**Mudança necessária em código existente:**

- Exportar `WEIGHT` de `src/common/guards/roles.guard.ts` (era constante privada do módulo). Single source of truth para hierarquia de roles.

---

## 12. Final da sprint

- Marcar `[x] Tags (com escopo)` em `ROADMAP.md` §5 "CRUD básico".
- Commit Conventional Commits em inglês.
- PR via `gh pr create`, aguardar CI verde, merge via PR (branch protection ativa em `main`).
