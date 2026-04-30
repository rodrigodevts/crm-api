# CLAUDE.md — DigiChat (raiz)

> Instruções operacionais para Claude Code. **Leia este arquivo a cada sessão antes de qualquer ação.**
>
> Este documento é diretivo, não descritivo. Cada regra tem trigger explícito. Siga as regras, não improvise.

---

## 1. Você está no projeto DigiChat

CRM omnichannel WhatsApp multi-tenant em desenvolvimento. Stack: NestJS 11 + Fastify + Prisma + Postgres + Redis + BullMQ + Zod + Next.js 15 + Tailwind + shadcn/ui + Kubb.

Filosofia: AGPLv3 open-source, dev solo com Claude Code, médio-termo (sem over-engineering, sem Clean Architecture, sem DDD ortodoxo).

---

## 2. Antes de QUALQUER ação, leia estes arquivos

A cada sessão nova, sempre nesta ordem:

1. **Este arquivo** (`CLAUDE.md` raiz) — você está aqui
2. **`ROADMAP.md`** — confirme em qual fase estamos. NUNCA implemente algo de fase futura sem autorização explícita.
3. **`WORKFLOW.md`** — como trabalhamos com Superpowers
4. **`ARCHITECTURE.md`** — fundação técnica do projeto

Não pule essa leitura mesmo que pareça redundante. Decisões mudam. Documentos são fonte da verdade.

---

## 3. Triggers de leitura por contexto

### Antes de criar/modificar query Prisma

**LEIA SEMPRE:** `docs/conventions/multi-tenant-checklist.md`

Toda query precisa filtrar por `companyId`. Se você esquecer, é bug crítico de segurança.

### Antes de criar endpoint REST

**LEIA SEMPRE:** `docs/conventions/api-conventions.md`

Padrões de URL, paginação cursor-based, naming camelCase, OpenAPI gerado automaticamente.

### Antes de criar/modificar lógica de erro

**LEIA SEMPRE:** `docs/conventions/error-handling.md`

Hierarquia de exceções, formato de resposta, mensagens em pt-BR.

### Antes de escrever testes

**LEIA SEMPRE:** `docs/conventions/testing-strategy.md`

O que testar (domain services), o que NÃO testar, padrões de teste e2e com isolamento multi-tenant.

### Antes de implementar área específica do produto

**LEIA SEMPRE:** o audit correspondente em `crm-specs/audits/`:

- Implementar Canais → `audit-04-canais.md`
- Implementar Configurações (Departments, Tags, Users, etc) → `audit-03A-cadastros-base.md`, `audit-03B-comportamento-global.md`, `audit-03C-integracoes.md`
- Implementar Bot/Fluxo → `audit-05-bot-fluxo.md`
- Implementar Atendimentos/Tickets → `audit-06-atendimentos.md`

### Antes de modificar UI / componente

**LEIA SEMPRE (no `crm-web`):** `design-system.md`

Cores, tipografia, espaçamento, componentes, estados.

### Antes de criar integração externa

**LEIA SEMPRE:** `docs/integrations/<provider>.md` se existir, ou criar com base na doc oficial.

Para Gupshup especificamente, contratos críticos estão em `docs/integrations/gupshup.md`.

---

## 4. Regras não-negociáveis (NUNCA quebrar)

### Multi-tenant

1. **Toda query Prisma filtra por `companyId`.** Sem exceção, exceto `Plan` e `_PrismaMigrations`.
2. **Service recebe `companyId` como argumento explícito.** Nunca pega do request implicitamente.
3. **`companyId` vem do JWT via `@CurrentCompany()`.** Nunca do body do request.
4. **Cache keys, sockets rooms, queue jobs** sempre prefixados/incluem `companyId`.

### Arquitetura de 3 camadas

5. **Toda feature tem 3 camadas:** Controller → Application Service → Domain Service.
6. **Sem exceção** mesmo em CRUDs simples — consistência total.
7. **Sem repositório separado de Prisma.** Domain service acessa Prisma direto.
8. **Sem Clean Architecture, sem Hexagonal, sem DDD ortodoxo.**

### Schemas Zod

9. **DTOs são schemas Zod**, não classes com decoradores.
10. **Type derivado** via `z.infer<typeof Schema>`, não declarado separadamente.
11. **Schema NUNCA aceita `companyId`** no body de input.

### Erros

12. **Mensagens de erro em pt-BR.**
13. **Sem stack trace pro cliente.**
14. **Códigos HTTP semânticos.** Ver tabela em `docs/conventions/error-handling.md`.

### Testes

15. **Domain services com regra de negócio têm testes unitários.**
16. **Cada feature crítica tem teste e2e de isolamento multi-tenant.**
17. **TDD enforçado pelo Superpowers** — testes antes de implementação.

### Working Hours

18. **Bot NÃO é bloqueado por working hours.** Bot responde sempre. Working hours aplica apenas em transferência bot→humano e em ticket sem bot.

---

## 5. Workflow padrão (com Superpowers)

Detalhado em `WORKFLOW.md`. Resumo:

```
1. Você descreve o que quer construir
2. Superpowers ativa /brainstorming → refina requisitos
3. Você aprova design
4. Superpowers ativa /write-plan → plano multi-step
5. Cria git worktree isolado
6. Superpowers ativa /execute-plan
   - TDD: testes primeiro
   - Cada step: implementa, valida, code review
7. Verificação final (testes, lint, build)
8. Merge ou PR
```

**Antes de codar:** sempre brainstorm. Mesmo features simples.
**Implementando:** sempre TDD. Não pule.
**Antes de declarar pronto:** verificação por evidência (rodar testes, rodar lint, rodar build).

---

## 6. Quando perguntar (e quando não)

### SEMPRE pergunte ao humano antes de:

- Adicionar dependência nova (npm package)
- Criar nova entidade no schema Prisma
- Mudar contrato de API público (endpoint existente)
- Mudar comportamento documentado em audit
- Refatorar código existente que não foi pedido
- Implementar feature de fase futura (não-atual no ROADMAP)
- Pular regra de algum arquivo de convenção
- Tomar decisão arquitetural não documentada

### NÃO precisa perguntar para:

- Aplicar padrão já estabelecido em outro módulo
- Adicionar campo claramente útil ao schema (se for em entidade ainda não populada)
- Renomear variável local
- Ajustar formatação/lint
- Escrever teste pra função recém-criada
- Atualizar documentação que está desatualizada

**Quando em dúvida sobre se deve perguntar: pergunte.**

---

## 7. Padrões de erro a evitar (TOP 7)

Estes são os erros mais comuns que Claude Code comete. Evite explicitamente:

1. **Esquecer `companyId` em query.** Mais grave de todos. Sempre `where: { companyId, ... }`.
2. **Inventar regra de negócio.** Quando não está clara, pergunte. Não improvise.
3. **Reescrever código existente sem ser pedido.** Modificação cirúrgica, não refactor lateral.
4. **Adicionar lib não-aprovada.** Use só o que está em `ARCHITECTURE.md` seção 3.
5. **Misturar camadas.** Controller não tem regra de negócio. Service não retorna Response. Domain service não emite eventos.
6. **`any` ou `as Type` sem comentário.** TypeScript estrito é não-negociável.
7. **Criar arquivos não pedidos.** Se feature pediu X, não crie testes/docs/configs extras sem necessidade.

---

## 8. Subdiretórios com `CLAUDE.md` próprio

Quando trabalhando dentro destas pastas, leia também o `CLAUDE.md` específico delas:

**Backend (`crm-api/`):**
- `src/modules/CLAUDE.md` — convenções de módulos
- `src/modules/tickets/CLAUDE.md` — regras específicas de Ticket
- `src/modules/bot-engine/CLAUDE.md` — regras do Bot Engine
- `src/modules/channels/CLAUDE.md` — Channel Adapter pattern
- `prisma/CLAUDE.md` — convenções de schema e migrations

**Frontend (`crm-web/`):**
- `components/CLAUDE.md` — convenções de componentes
- `app/CLAUDE.md` — convenções de rotas e layouts
- `lib/generated/CLAUDE.md` — aviso de "código gerado, não editar"

Claude Code lê `CLAUDE.md` da pasta atual automaticamente. Não precisa puxar manualmente.

---

## 9. Quando precisar de informação que não está em nenhum arquivo

Hierarquia de busca:

1. **Audit da feature** em `crm-specs/audits/` — primeira consulta
2. **Spec descritiva do sistema atual** em `crm-specs/areas/` — comportamento atual
3. **Chatwoot** clonado localmente — referência arquitetural
4. **Doc oficial** da lib (Prisma, NestJS, Zod, etc) — nunca chutar API
5. **Pergunta ao humano** — se nada acima resolver

NÃO improvise comportamento crítico. Pergunte.

---

## 10. Ao final de cada sessão

Verifique:

- [ ] Documentação atualizada se você descobriu algo novo
- [ ] `ARCHITECTURE.md` atualizado se houve decisão arquitetural
- [ ] Migration criada e testada se mudou schema
- [ ] Testes passando localmente
- [ ] Lint e typecheck OK
- [ ] Commit message segue Conventional Commits
- [ ] Multi-tenant checklist passou (releia se modificou queries)

Reporte ao humano:
- O que foi feito
- O que ficou pendente
- Decisões tomadas que não estavam no plano (se houve)
- Próximo passo sugerido