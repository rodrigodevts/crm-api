# CONTRIBUTING.md — DigiChat

> Guia de contribuição para o projeto. Aplicado tanto pra você (dev solo) quanto pra futuros contribuidores externos (já que o repo é AGPLv3 público).

---

## Sumário

1. Setup local
2. Estrutura do projeto
3. Workflow de desenvolvimento
4. Padrões de commit
5. Padrões de PR
6. Padrões de código
7. Antes de mergear (checklist)
8. Convenções específicas

---

## 1. Setup local

### Pré-requisitos

- Node.js 22 LTS
- pnpm 9+
- Docker e Docker Compose
- Git

### Setup inicial

```bash
# Clone o repo
git clone https://github.com/<sua-org>/crm-api.git
cd crm-api

# Instalar dependências
pnpm install

# Subir infra local (postgres, redis, minio)
docker compose up -d

# Copiar variáveis de ambiente
cp .env.example .env
# Editar .env com as credenciais locais

# Gerar Prisma client
pnpm prisma generate

# Rodar migrations
pnpm prisma migrate dev

# Seed inicial
pnpm prisma db seed

# Rodar app em modo dev
pnpm start:dev
```

### Variáveis de ambiente obrigatórias

```env
DATABASE_URL="postgresql://digichat:digichat@localhost:5432/digichat"
REDIS_URL="redis://localhost:6379"

# JWT
JWT_ACCESS_SECRET="<gerar com: openssl rand -base64 32>"
JWT_REFRESH_SECRET="<gerar com: openssl rand -base64 32>"

# Cifragem (32 bytes hex)
CHANNEL_CONFIG_ENCRYPTION_KEY="<gerar com: openssl rand -hex 32>"

# Storage
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_BUCKET="digichat-media"

# Workers
AUTO_CLOSE_WORKER_INTERVAL_MINUTES=15
TEMPLATE_SYNC_CRON="0 3 * * *"
WEBHOOK_DELIVERY_MAX_RETRIES=5

# Sentry (produção, opcional em dev)
SENTRY_DSN=""
```

---

## 2. Estrutura do projeto

Ver `ARCHITECTURE.md` seção 5 para estrutura completa. Resumo:

```
crm-api/
├── src/
│   ├── common/         # decorators, guards, interceptors compartilhados
│   ├── config/         # configuração tipada
│   ├── database/       # Prisma module
│   └── modules/        # cada feature (3 camadas: controller + application + domain)
├── prisma/             # schema, migrations, seed
├── docs/               # documentação técnica
└── test/               # testes e2e
```

---

## 3. Workflow de desenvolvimento

### Branches

- `main` — código pronto pra produção
- `develop` — branch de integração (se houver fluxo gitflow), opcional
- `feature/<nome-curto>` — features
- `fix/<nome-curto>` — correções
- `chore/<nome-curto>` — refactor, deps, infra

### Fluxo de uma feature

1. Criar branch a partir de `main` (ou `develop` se usar gitflow)
2. Desenvolver feature seguindo arquitetura de 3 camadas
3. Escrever testes (unit no domain service obrigatoriamente)
4. Rodar `pnpm lint` e `pnpm test` localmente
5. Commit seguindo convenção (ver seção 4)
6. Push e abrir PR
7. CI verifica (lint, typecheck, test, build)
8. Code review (se tiver outro dev) ou self-review
9. Mergear via squash + delete branch

### Comandos comuns

```bash
# Desenvolvimento
pnpm start:dev              # backend em watch mode
pnpm prisma studio          # GUI do banco

# Migrations
pnpm prisma migrate dev --name nome_descritivo
pnpm prisma migrate deploy  # produção
pnpm prisma generate        # após mudar schema

# Testes
pnpm test                   # unit
pnpm test:watch
pnpm test:e2e               # e2e
pnpm test:cov               # coverage

# Qualidade
pnpm lint
pnpm format
pnpm typecheck

# Build
pnpm build
```

### Comandos no frontend (`crm-web`)

```bash
# Geração de tipos a partir do OpenAPI do backend (Kubb)
pnpm generate:api           # roda Kubb usando API_OPENAPI_URL ou default localhost

# Pipeline completo (gerar API + dev)
pnpm generate:api && pnpm dev

# Forçar regeneração mesmo sem mudança detectada
pnpm generate:api --clean
```

**Importante:** após qualquer PR no backend que mude schema Zod ou endpoint, rodar `pnpm generate:api` no frontend antes de codar a feature consumidora. Tipo gerado garante que frontend e backend não divergem.

---

## 4. Padrões de commit

Usamos **Conventional Commits** (https://www.conventionalcommits.org/).

### Formato

```
<tipo>(<escopo>): <descrição curta>

[corpo opcional]

[rodapé opcional]
```

### Tipos

- `feat` — nova funcionalidade
- `fix` — correção de bug
- `docs` — documentação apenas
- `style` — formatação, sem mudança de código
- `refactor` — refactor sem mudança de comportamento
- `perf` — melhoria de performance
- `test` — adicionar/ajustar testes
- `chore` — infraestrutura, deps, configuração
- `ci` — mudanças em CI/CD

### Escopos comuns

`auth`, `tickets`, `messages`, `channels`, `bot`, `webhooks`, `companies`, `departments`, `tags`, `quick-replies`, etc. Geralmente o nome do módulo afetado.

### Exemplos

```
feat(tickets): add accept ticket endpoint with optimistic lock
fix(channels): correct hmac signature verification for gupshup
docs(architecture): update bot engine section with loop node
refactor(tickets): extract protocol generation to dedicated service
test(channels): add e2e test for credentials reveal
chore(deps): update prisma to 6.2.0
```

### Regras

- Descrição em **inglês**, no imperativo ("add", não "added" ou "adding")
- Máximo 72 caracteres na primeira linha
- Corpo explica **o porquê**, não o **o quê** (o quê está no diff)

---

## 5. Padrões de PR

### Título

Mesmo padrão de Conventional Commits.

### Descrição

Use template:

```markdown
## O que mudou

[Descrição em pt-BR explicando a mudança]

## Por que

[Motivação, contexto, link pra issue/doc se houver]

## Como testar

[Passos manuais para validar a mudança]

## Checklist

- [ ] Multi-tenant: queries filtram por companyId (ver multi-tenant-checklist.md)
- [ ] Testes unitários do domain service passando
- [ ] Testes e2e do fluxo principal passando
- [ ] Lint e typecheck passando
- [ ] Sem credenciais ou secrets no código/diff
- [ ] Documentação atualizada se houve mudança arquitetural
```

### Tamanho

PRs pequenos. Idealmente:
- < 300 linhas modificadas
- Foco em uma única feature/fix

PRs gigantes (> 1000 linhas) são sinal pra dividir. Exceções: setup inicial, migrations grandes, refactors mecânicos.

### Self-review

Antes de pedir review (ou mergear se solo), você mesmo revisa o diff. Frequentemente você encontra coisas que não viu enquanto codava.

---

## 6. Padrões de código

### TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- Sem `any` (usar `unknown` se realmente desconhecido)
- Sem `// @ts-ignore` ou `// @ts-expect-error` sem comentário explicando

### Naming

- Variáveis e funções: `camelCase`
- Classes: `PascalCase`
- Tipos e interfaces: `PascalCase`
- Constantes: `UPPER_SNAKE_CASE`
- Arquivos: `kebab-case.ts`
- Módulos: `feature-name`

### Estrutura de módulo

Sempre 3 camadas (ver `ARCHITECTURE.md` seção 3):

```
modules/feature-name/
├── feature-name.module.ts
├── controllers/
│   └── feature-name.controller.ts
├── services/
│   ├── feature-name.application.service.ts
│   └── feature-name.domain.service.ts
├── schemas/
│   ├── create-feature.schema.ts
│   ├── update-feature.schema.ts
│   └── feature-response.schema.ts
├── events/                       # opcional
└── tests/
    ├── feature-name.domain.service.spec.ts
    └── feature-name.controller.e2e-spec.ts
```

Use `pnpm nest g feature <nome>` (gerador customizado da Fase 0) para criar estrutura.

### Imports

Ordem (auto-organizada por linter):
1. Node built-ins
2. Pacotes externos (npm)
3. Pacotes internos (alias `@/`)
4. Imports relativos (`./`, `../`)

### Comentários

- Comentários técnicos em **inglês**
- Comentários sobre regra de negócio em **pt-BR**
- Não comentar o óbvio
- Comentar **o porquê**, não **o quê**

### Erros

Sempre lançar exceções tipadas. Ver `error-handling.md`.

---

## 7. Antes de mergear (checklist)

Validações automáticas (CI):
- [ ] Lint passa (`pnpm lint`)
- [ ] Typecheck passa (`pnpm typecheck`)
- [ ] Testes passam (`pnpm test`)
- [ ] Build passa (`pnpm build`)

Validações manuais:
- [ ] Multi-tenant checklist (ver `multi-tenant-checklist.md`)
- [ ] Testou manualmente em ambiente local
- [ ] Sem `console.log` esquecido
- [ ] Sem credenciais hardcoded
- [ ] Migration funciona em base nova **e** em base com dados
- [ ] Documentação atualizada se mudou arquitetura
- [ ] ADR criado se decisão arquitetural significativa

---

## 8. Convenções específicas

Documentos detalhados em `docs/conventions/`:

- **`multi-tenant-checklist.md`** — checklist obrigatório de isolamento por tenant
- **`error-handling.md`** — padrão de exceções e mensagens de erro
- **`testing-strategy.md`** — quando testar unit vs e2e
- **`api-conventions.md`** — REST patterns, paginação, filtros, formatos

Ler todos antes de fazer primeira PR.

---

## Sobre licença AGPLv3

Este projeto é AGPLv3. Toda contribuição é licenciada sob mesma licença automaticamente. Ao abrir PR, você confirma:

- Você é autor do código contribuído (ou tem autorização do autor)
- Você concorda em licenciar sob AGPLv3
- Você não usou código de outras fontes incompatível com AGPLv3

Em caso de dúvida sobre licença, abra issue antes de PR.