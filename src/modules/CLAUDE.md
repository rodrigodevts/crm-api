# CLAUDE.md — `src/modules/` (Backend)

> Convenções específicas de módulos do backend NestJS.

---

## Estrutura obrigatória

Todo módulo segue **3 camadas**:

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
├── processors/                   # opcional, BullMQ
└── tests/
    ├── feature-name.domain.service.spec.ts
    └── feature-name.controller.e2e-spec.ts
```

Use `pnpm g:feature <nome>` (gerador customizado) pra criar a estrutura. Por baixo, roda `nest g --collection ./schematics/collection.json feature <nome>`.

---

## Responsabilidades por camada

### Controller

- Recebe request HTTP
- Valida via schema Zod (`@UsePipes(ZodValidationPipe)`)
- Extrai `@CurrentCompany()`, `@CurrentUser()` do JWT
- Chama application service
- Retorna response (Zod schema validado via `@ZodSerializerDto`)
- **Não tem regra de negócio**
- **Não acessa Prisma**

### Application Service

- Recebe input já validado do controller
- Coordena transações (`prisma.$transaction`)
- Chama domain service(s)
- Dispara eventos via `EventEmitter`
- Enfileira jobs BullMQ
- Constrói DTO de response
- **Pode** ter lógica de orquestração
- **Não tem** regras de negócio puras

### Domain Service

- Lógica de regras de negócio
- Validações de estado (state machine)
- Cálculos
- Acesso a Prisma com `companyId` explícito
- Recebe `tx: Prisma.TransactionClient` quando participa de transação coordenada
- **Não dispara eventos**
- **Não enfileira jobs**
- **Não retorna DTO** (retorna entidade Prisma)

---

## Múltiplos domain services por módulo

Permitido e recomendado quando faz sentido:

```
tickets/services/
├── tickets.application.service.ts
├── tickets.domain.service.ts          # CRUD de Ticket
├── ticket-log.domain.service.ts       # operações de TicketLog
└── ticket-protocol.domain.service.ts  # geração de protocolo #NNNNN
```

Application service compõe os domain services.

---

## Comunicação entre módulos

**Síncrona (DI):** application service de A injeta application service de B. Use quando A precisa do retorno de B.

**Assíncrona (eventos):** A emite evento, listener de B reage. Use quando A não precisa esperar resposta.

**Cross-module job:** A enfileira job que worker de B processa. Use pra trabalho assíncrono pesado.

---

## Schemas Zod

```typescript
import { z } from 'zod';

export const CreateFeatureSchema = z
  .object({
    name: z.string().min(1).max(100).describe('Nome da feature'),
    active: z.boolean().default(true),
  })
  .describe('Dados para criar feature');

export type CreateFeatureDto = z.infer<typeof CreateFeatureSchema>;
```

**Regras:**

- Schema **NUNCA** aceita `companyId` no body
- Use `.describe()` em campos não-óbvios (vira docstring no OpenAPI)
- Type sempre derivado via `z.infer`
- Mensagens de erro em pt-BR via mensagens customizadas

---

## Multi-tenant (CRÍTICO)

**Toda query Prisma:** `where: { companyId, ...otherConditions }`. Sem exceção.

**Domain service:** sempre recebe `companyId` como argumento explícito.

**Antes de codar query, leia:** `docs/conventions/multi-tenant-checklist.md`.

---

## Imports

Ordem (auto-organizada por linter):

1. Built-ins do Node
2. Pacotes externos (`@nestjs/*`, `zod`, etc)
3. Pacotes internos (alias `@/`)
4. Relativos (`./`, `../`)

---

## Naming

- Arquivos: `kebab-case.ts`
- Classes: `PascalCase`
- Variáveis/funções: `camelCase`
- Constantes: `UPPER_SNAKE_CASE`
- Modules: `feature-name`

---

## Antes de criar módulo novo

1. Confirme em `ROADMAP.md` que estamos na fase certa
2. Leia o audit relevante em `crm-specs/audits/`
3. Use o gerador (`pnpm g:feature <nome>`)
4. Siga o workflow de Superpowers (brainstorm → plan → execute)
