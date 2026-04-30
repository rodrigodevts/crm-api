# CLAUDE.md — `prisma/`

> Convenções de schema Prisma e migrations.

---

## Antes de modificar `schema.prisma`

**LEIA:** `ARCHITECTURE.md` seção 6 (Modelo de domínio).

**LEIA também:** `docs/conventions/multi-tenant-checklist.md` (toda tabela tem `companyId` exceto catálogos globais).

---

## Regras de schema

### Multi-tenant

- **Toda tabela** tem `companyId` exceto:
  - `Plan` (catálogo global)
  - `_PrismaMigrations` (sistema)
- **Toda tabela** tem `@@index([companyId])` no mínimo
- **Constraints únicos relativos ao tenant:** `@@unique([companyId, fieldName])`

### IDs

- UUID v7 (ordenável temporalmente)
- Default: `@default(uuid(7))` (precisa de extensão Prisma)
- Tipo: `String @id`

### Timestamps

- `createdAt: DateTime @default(now())`
- `updatedAt: DateTime @updatedAt`
- Em todas as tabelas

### Soft delete

Em entidades-chave: `deletedAt: DateTime?`

Aplicado em: `Contact`, `Ticket`, `User`, `ChannelConnection`, `CloseReason`, `ChatFlow`, etc.

### Naming

- Models: `PascalCase` no singular (`Ticket`, não `Tickets`)
- Campos: `camelCase` (`assignedUserId`, não `assigned_user_id`)
- Relações: nome semântico (`assignedUser`, não `user`)
- Enums: `PascalCase` no singular (`TicketStatus`)
- Valores de enum: `UPPER_SNAKE_CASE` (`PENDING`, `OPEN`, `CLOSED`)

---

## Migrations

### Criar migration

```bash
pnpm prisma migrate dev --name nome_descritivo
```

Nomenclatura:
- `add_tickets_table`
- `add_resolved_by_to_ticket`
- `rename_queue_to_department`
- `drop_legacy_field_x`

**Nunca:**
- `update_schema` (vago)
- `fix` (vago)
- nomes em pt-BR (mantém en por consistência)

### Antes de criar migration

- Confirme no `ROADMAP.md` que feature está na fase correta
- Releia o audit relevante
- Pense se a mudança é compatível com dados existentes
- Se mudança é **breaking** (ex: rename, drop), planeje data migration

### Data migration

Quando schema change quebra dados existentes, criar migration manual com:

1. `pnpm prisma migrate dev --create-only --name <nome>`
2. Editar SQL gerado pra incluir lógica de migração
3. Testar em base com dados representativos
4. Aplicar com `pnpm prisma migrate dev`

Exemplo: renomear `Queue` → `Department` em produção:

```sql
-- prisma/migrations/XXX_rename_queue_to_department/migration.sql
ALTER TABLE "Queue" RENAME TO "Department";
ALTER TABLE "Department" RENAME CONSTRAINT "Queue_pkey" TO "Department_pkey";
-- (continua...)
```

### Rollback

Migrations são one-way no Prisma. Para "rollback":
- Criar migration **nova** que reverte
- Nunca editar migration commitada

---

## Index strategy

### Índices obrigatórios

- `@@index([companyId])` em toda tabela (multi-tenant queries)
- `@@index([companyId, status])` em tabelas com filtro frequente por status
- `@@index([fkColumnId])` em FKs (Prisma cria automaticamente, mas confirme)

### Índices compostos pra worker queries

- `Ticket`: `@@index([companyId, status, lastInboundAt])` — worker auto-close
- `Ticket`: `@@index([companyId, isBot, status])` — filtro de bot tickets
- `Ticket`: `@@index([companyId, resolvedBy])` — relatórios
- `MessageDelivery`: `@@index([nextRetryAt, status])` — worker de retry de webhooks

### Quando adicionar índice novo

Sempre que aparecer query lenta em produção ou em teste de carga. **Não adicionar preemptivamente** — índices têm custo de write.

---

## Relações

### Cascade

- **`onDelete: Cascade`** apenas em sub-entidades fortes (filhas que não fazem sentido sem o pai)
- **`onDelete: SetNull`** quando relação é opcional e pai pode ser deletado sem afetar filho
- **`onDelete: Restrict`** (default) quando deletar pai deve falhar se houver filho

Exemplos:
- `Message → Ticket`: `onDelete: Cascade` (mensagens não fazem sentido sem ticket)
- `Ticket → CloseReason`: `onDelete: SetNull` (motivo deletado, ticket mantém referência null)
- `Ticket → Department`: `onDelete: Restrict` (não pode deletar depto com tickets)

### Relations explícitas

Sempre nomear relação quando há mais de uma FK pra mesma tabela:

```prisma
model Ticket {
  assignedUserId  String?
  walletUserId    String?

  assignedUser    User?    @relation("TicketAssignee", fields: [assignedUserId], references: [id])
  walletUser      User?    @relation("ContactWallet", fields: [walletUserId], references: [id])
}
```

---

## Schema completo lives in `schema.prisma`

Não duplicar schema em outros arquivos. Single source of truth.

Documentação narrativa do modelo de domínio: `ARCHITECTURE.md` seção 6.

---

## Antes de mergear PR com mudança de schema

- [ ] Migration testada em base limpa (do zero)
- [ ] Migration testada em base com dados representativos
- [ ] Multi-tenant: novo model tem `companyId` se aplicável
- [ ] Índices apropriados criados
- [ ] Soft delete aplicado se entidade-chave
- [ ] Naming segue convenções (camelCase, PascalCase, UPPER_SNAKE_CASE)
- [ ] `pnpm prisma generate` rodado e Prisma client atualizado
- [ ] OpenAPI atualizado (Kubb regenera tipos no frontend)
- [ ] Testes do domain service afetado atualizados