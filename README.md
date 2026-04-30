# crm-api

Backend do **DigiChat** — CRM omnichannel WhatsApp multi-tenant.

Stack: NestJS 11 + Fastify + Zod + Pino. Prisma, BullMQ, Socket.IO entram nas próximas etapas da Fase 0.

Licença: AGPL-3.0-or-later.

---

## Pré-requisitos

- Node.js **22 LTS** (`.nvmrc`)
- pnpm **10+**
- Docker e Docker Compose

## Setup local

```bash
# 1. Dependências
pnpm install

# 2. Infra (postgres, redis, minio)
docker compose up -d

# 3. Variáveis de ambiente
cp .env.example .env
# Gerar secrets:
#   openssl rand -base64 32   # JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
#   openssl rand -hex 32      # CHANNEL_CONFIG_ENCRYPTION_KEY

# 4. Subir a app em watch mode
pnpm start:dev
```

A app valida `.env` no boot e falha cedo com lista de erros se algo estiver faltando.

## Endpoints disponíveis nesta etapa

| URL                                  | Descrição                                    |
| ------------------------------------ | -------------------------------------------- |
| `GET  /health`                       | Liveness/readiness (sem auth, sem prefixo)   |
| `GET  /api/v1/docs`                  | UI interativa (Scalar)                       |
| `GET  /api/v1/openapi.json`          | OpenAPI 3 (consumido pelo Kubb no `crm-web`) |
| `GET  /api/v1/openapi.yaml`          | OpenAPI 3 em YAML                            |

## Comandos

```bash
pnpm start:dev      # watch mode
pnpm start          # sem watch
pnpm build          # gera dist/
pnpm start:prod     # roda dist/main.js

pnpm test           # vitest run
pnpm test:watch     # vitest

pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit
pnpm format         # prettier --write
```

## Estrutura

Detalhada em [`ARCHITECTURE.md`](./ARCHITECTURE.md) §5.

```
src/
├── main.ts                # bootstrap Fastify + OpenAPI + Scalar
├── app.module.ts          # ConfigModule + LoggerModule + HealthModule
├── common/
│   └── filters/           # AllExceptionsFilter, ZodExceptionFilter
├── config/
│   └── env.schema.ts      # Zod schema do .env
└── modules/
    └── health/            # GET /health
```

## Próximos passos da Fase 0

Ver [`ROADMAP.md`](./ROADMAP.md) §5. Em ordem:

1. Schema Prisma + migrations + seed
2. Auth (3 camadas) + JWT + decorators
3. Schema do núcleo (Company, Plan, User, Department, Tag, etc)
4. Services foundationais (BusinessHours, TemplateRenderer, Encryption)
5. CRUDs básicos com 3 camadas
6. Gerador `pnpm nest g feature <nome>`
7. CI GitHub Actions

## Documentação relacionada

- [`CLAUDE.md`](./CLAUDE.md) — instruções operacionais
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — fundação técnica
- [`ROADMAP.md`](./ROADMAP.md) — plano de fases
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — padrões de commit, PR, código
- [`docs/conventions/`](./docs/conventions/) — multi-tenant, errors, API, testing
