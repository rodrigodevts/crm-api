# WORKFLOW.md — DigiChat

> Como trabalhar com Claude Code + Superpowers no projeto. Documento operacional.
>
> **Audiência:** product owner (você) e Claude Code.

---

## Sumário

1. Stack de IA usada
2. Setup inicial do Superpowers
3. Workflow padrão (brainstorm → plan → execute)
4. Workflow para features simples (CRUD direto)
5. Workflow para features complexas
6. Quando NÃO seguir o workflow
7. Comandos do Superpowers e quando usar
8. Code review e verificação
9. Convivência com testes e CI
10. Anti-patterns

---

## 1. Stack de IA usada

- **Claude Code** (Anthropic) — agente principal de desenvolvimento, em terminal
- **Superpowers** plugin (`obra/superpowers`) — framework de metodologia de desenvolvimento
- **Você** — product owner, decisor final, revisor

Não usamos: Cursor (Claude Code preferido), Copilot, ferramentas de "AI pair programming" tradicional.

---

## 2. Setup inicial do Superpowers

### Instalação

```bash
# No Claude Code, registrar marketplace
/plugin marketplace add obra/superpowers-marketplace

# Instalar plugin
/plugin install superpowers@superpowers-marketplace

# Reiniciar Claude Code
```

Após reinício, você verá um session-start-hook injetado mencionando "Superpowers". Confirme com `/help` se comandos como `/superpowers:brainstorm`, `/write-plan`, `/execute-plan` aparecem.

### Configuração

Sem configuração específica para o projeto. Skills do Superpowers ativam automaticamente conforme contexto.

---

## 3. Workflow padrão (brainstorm → plan → execute)

Para **toda nova feature**, mesmo as simples, seguir este workflow.

### Fase 1: Brainstorm (~5-15 minutos)

Você inicia descrevendo o que quer construir. Exemplo:

```
"Vamos implementar o módulo de Tags (audit-03A, seção 4)"
```

Superpowers ativa skill `brainstorming`. Claude Code:

1. Lê CLAUDE.md, ROADMAP.md, audit relevante
2. Faz perguntas socráticas pra refinar requisitos
3. Apresenta design em seções
4. Aguarda você validar cada seção

**Você revisa criticamente:**
- Faltou algum caso de uso?
- Algum gap entre design e audit?
- Decisão de implementação que precisa ajustar?

**Output:** design doc salvo (Superpowers cuida do salvamento). Você aprova explicitamente.

### Fase 2: Plano (~5-10 minutos)

Comando: `/write-plan` (ou ativação automática após brainstorm aprovado).

Superpowers cria plano multi-step:

```
Plan: Implement Tags module
Steps:
1. Create Prisma schema for Tag
2. Generate migration
3. Create schemas/ folder with Zod schemas
4. Implement Tags domain service (TDD)
5. Implement Tags application service
6. Implement Tags controller
7. Add Tags to AppModule
8. E2E test for multi-tenant isolation
9. Update OpenAPI doc
```

**Você revisa o plano:**
- Steps estão na ordem certa?
- Algum step está fora de escopo?
- TDD aplicado corretamente?

Aprova ou ajusta.

### Fase 3: Execute (variável)

Comando: `/execute-plan`.

Superpowers:

1. Cria git worktree isolado em branch nova
2. Para cada step do plano:
   - **TDD:** escreve teste primeiro
   - Roda teste (deve falhar — RED)
   - Implementa código mínimo
   - Roda teste (deve passar — GREEN)
   - Refactor se necessário
   - **Code review automático** por subagent
   - Commit
3. Avança pra próximo step apenas após review aprovar

Você acompanha mas geralmente não interrompe. Se intervir, sai do workflow Superpowers.

### Fase 4: Verificação final

Antes de declarar pronto, Superpowers verifica:
- Todos os testes passando
- Lint OK
- Typecheck OK
- Build OK

Se algo falhar, identifica e corrige. **Sem declarar "deve funcionar" sem evidência.**

### Fase 5: Merge ou PR

Você decide:
- Merge direto pra main (projeto solo, fluxo simples)
- Abrir PR pra revisar mais calmo
- Manter branch viva pra continuar amanhã
- Descartar (se não ficou bom)

---

## 4. Workflow para features simples (CRUD direto)

Mesmo CRUD simples passa pelo workflow completo. Razão: consistência de padrão, TDD, evita "atalho" que vira bug.

**Mas as fases ficam mais curtas:**

- Brainstorm: 2-3 minutos (audit já tem schema + endpoints, não tem muito a refinar)
- Plan: 2 minutos (steps óbvios)
- Execute: variável

Não pule brainstorm mesmo em CRUD. Pode ser que apareça caso edge não documentado.

---

## 5. Workflow para features complexas

Features complexas (Bot Engine, state machine de Tickets, integrações com retry) merecem workflow mais elaborado:

**Brainstorm mais longo:**
- Mapear todos os caminhos de erro
- Decidir trade-offs explicitamente
- Documentar no ADR se decisão arquitetural

**Plano dividido:**
- Plano em sub-features (não 1 plano gigante)
- Cada sub-feature com seu execute-plan
- Merge incremental entre sub-features

**Execute com checkpoints:**
- Após cada sub-feature, stop e revise
- Não acumule mudanças grandes sem validação

**Exemplo:** implementar Bot Engine não é "1 plano". É:

1. Plano: Schema (FlowExecution, ChatFlow expandido, BotCredential)
2. Plano: Node executors básicos (start, end, send_message, capture)
3. Plano: Node executors avançados (condition, api_request, loop)
4. Plano: GlobalIntent + validação automática
5. Plano: Integração com IncomingMessageProcessor
6. Plano: UI de editor JSON

Cada plano tem brainstorm próprio. Você valida entre eles.

---

## 6. Quando NÃO seguir o workflow

Casos onde Superpowers atrapalha mais que ajuda:

### Bug de produção urgente

Cliente não pode esperar brainstorm. Vá direto pra fix, mas:
- Crie teste regressivo depois
- Documente no ADR o "porque foi rápido"

### Refactor mecânico (rename, mover arquivo)

Tarefas determinísticas não precisam de TDD elaborado. Use Claude Code direto.

### Investigação / debugging

Antes de "fix", você precisa entender. Use Superpowers `debugging` skill (4 fases: reproduzir, isolar, root cause, fix). Mas não force `/execute-plan` num debug — fluxo é diferente.

### Documentação pura

Atualizar `ARCHITECTURE.md` ou similar não precisa do workflow. Pode pedir direto.

### Setup inicial / boilerplate

Configurar Docker Compose, env vars, geradores — não tem regra de negócio. Workflow vira cerimônia. Faça direto.

---

## 7. Comandos do Superpowers

Lista dos principais. Detalhes em `~/.claude/plugins/cache/Superpowers/skills/`.

### Comandos de planejamento

| Comando                                       | Quando usar                                |
| --------------------------------------------- | ------------------------------------------ |
| `/superpowers:brainstorm` ou `/brainstorming` | Antes de codar feature nova                |
| `/write-plan`                                 | Após brainstorm aprovado                   |
| `/execute-plan`                               | Para rodar o plano em git worktree isolado |

### Comandos de qualidade

| Comando         | Quando usar                                         |
| --------------- | --------------------------------------------------- |
| `/code-review`  | Após implementar feature, antes de merge            |
| `/verification` | Para confirmar que tudo passa (testes, lint, build) |
| `/debugging`    | Quando aparece bug, segue 4 fases                   |

### Comandos de meta

| Comando          | Quando usar                                           |
| ---------------- | ----------------------------------------------------- |
| `/finish-branch` | Quando quer encerrar branch (merge, PR, ou descartar) |

### Skills automáticas

Não precisa invocar — ativam por contexto:

- `getting-started` — ativa no início da sessão
- `tdd` — ativa quando vai escrever código
- `requesting-code-review` — ativa entre tasks
- `using-git-worktrees` — ativa antes de execute-plan
- `verifying-work` — ativa antes de declarar pronto

---

## 8. Code review e verificação

### Code review automático

Superpowers tem `code-reviewer` agent que revisa cada step. Critérios:

- Conformidade com plano original
- Padrões de código (TypeScript estrito, naming, etc)
- Qualidade arquitetural (3 camadas, sem violar princípios do CLAUDE.md)
- Multi-tenant (sempre `companyId`)
- Testes adequados

Issues classificadas:
- **Crítico:** bloqueia progresso até corrigir
- **Major:** corrigir antes de merge
- **Minor:** sugestão

### Sua revisão (humana)

Você revisa em pontos-chave:

- **Após brainstorm:** design faz sentido? Falta algo?
- **Após plan:** ordem certa? Nada fora de escopo?
- **Antes de merge:** ler diff inteiro. Sentir se o código "respira" certo.

Sua revisão complementa code review automático. Não substitua.

### Verificação por evidência

Antes de declarar pronto, **rodar comandos**:
- `pnpm test` — todos passam
- `pnpm test:e2e` — todos passam
- `pnpm lint` — sem erro
- `pnpm typecheck` — sem erro
- `pnpm build` — compila

Sem "deve funcionar" sem rodar. Sem "provavelmente está OK". Evidência sempre.

---

## 9. Convivência com testes e CI

### Local

Rodar antes de commit:

```bash
pnpm test
pnpm test:e2e
pnpm lint
pnpm typecheck
pnpm build
```

Superpowers `verification` skill faz isso automaticamente antes de declarar pronto.

### CI

GitHub Actions roda os mesmos comandos a cada push. Bloqueia merge se falhar.

CI também:
- Verifica formato de commit (Conventional Commits)
- Roda Kubb no `crm-web` se mudou OpenAPI no `crm-api`
- Faz coverage report (não bloqueia)

### Quando teste flaky aparece

Não marcar `skip`. Investigar. Geralmente é race condition ou dependência de tempo. Use `vi.useFakeTimers()` em vez de `setTimeout` real.

---

## 10. Anti-patterns

Comportamentos a evitar:

### "Vibe coding" sem brainstorm

Pular brainstorm e ir direto pra `/execute-plan` com requisito vago. Resultado: feature não atende caso real, retrabalho.

### Skipar TDD "porque é simples"

CRUD parece simples mas tem casos edge (validação Zod, multi-tenant, FK constraint). TDD descobre isso na hora certa.

### Aceitar code review automático sem ler

Superpowers code review é bom mas não infalível. Você é o revisor final.

### Mergear branch grande

Branch viva por 2 semanas com 50 commits = nightmare de review. Quebre em features menores.

### Documentação só ao final

Atualizar docs depois é otimismo. Atualize durante. Se esqueceu, criou dívida técnica imediata.

### Ignorar "evidence over claims"

"Acho que está funcionando" sem rodar teste. Rode. Sempre.

### Hardcoding contexto

Em vez de ler audit antes, codar de cabeça baseado em conversa antiga. Audit é fonte da verdade. Sempre releia.

### Skipar pergunta ao humano

Quando regra não está clara, **pergunte**. Não invente. Resposta errada custa retrabalho.

---

## Apêndice: cheat sheet do dia-a-dia

### Início de sessão

1. `cd crm-api` (ou `crm-web`)
2. Inicia Claude Code
3. Você descreve o que quer fazer hoje
4. Claude Code lê CLAUDE.md, ROADMAP.md, audits relevantes
5. Superpowers ativa workflow apropriado

### Durante implementação

- Acompanhe o progresso, mas não interrompa cada commit
- Intervir só quando: design não está saindo certo, plano está furado, code review reportou algo crítico

### Final de sessão

- Confirme que todos os testes passam
- Commit final ou PR aberto
- Atualize ROADMAP.md (item da fase atual marcado como done)
- Se descobriu algo arquitetural: atualize ARCHITECTURE.md ou abra ADR

### Próxima sessão

- Lê CLAUDE.md de novo (sim, sempre)
- Lê ROADMAP.md (em qual fase estamos? que item é o próximo?)
- Continua de onde parou