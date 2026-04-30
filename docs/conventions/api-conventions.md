# API Conventions — DigiChat

> Padrões REST do backend. Aplicado em todos os endpoints.

---

## Princípios

1. **REST consistente.** Verbos HTTP semânticos, recursos pluralizados.
2. **Pt-BR nas mensagens, en nas chaves.** Resposta tem `"message": "Ticket aceito"` mas chave é `"message"`, não `"mensagem"`.
3. **Versionamento na URL.** `/api/v1/...` desde o dia 1.
4. **Paginação cursor-based.** Não offset (problema em listas grandes).
5. **JSON em camelCase em todo lugar.** Backend (schemas Zod), OpenAPI, frontend (tipos gerados via Kubb) — todos usam camelCase. Sem conversão entre camadas. (Padrão moderno de API TypeScript-first.)

> **Ver também:** `error-handling.md` para formato de erros.

---

## Estrutura de URL

### Padrão

```
/api/v1/<recurso>[/<id>][/<sub-recurso>][/<id>][/<ação>]
```

### Convenções

- **Recursos pluralizados:** `/tickets`, `/users`, `/channels`
- **IDs em UUID v7** na URL
- **Sub-recursos** quando faz sentido: `/tickets/:id/messages`, `/channels/:id/templates`
- **Ações em verbo no final** quando não é CRUD puro: `/tickets/:id/accept`, `/tickets/:id/close`

### Exemplos

```
GET    /api/v1/tickets                       # listar
GET    /api/v1/tickets/:id                   # detalhe
POST   /api/v1/tickets                       # criar
PATCH  /api/v1/tickets/:id                   # atualizar parcial
DELETE /api/v1/tickets/:id                   # deletar (soft delete)

POST   /api/v1/tickets/:id/accept            # ação de aceite
POST   /api/v1/tickets/:id/transfer          # ação de transferência
POST   /api/v1/tickets/:id/close             # ação de fechamento
POST   /api/v1/tickets/:id/reopen            # ação de reabertura

GET    /api/v1/tickets/:id/messages          # listar mensagens do ticket
POST   /api/v1/tickets/:id/messages          # enviar mensagem
POST   /api/v1/tickets/:id/messages/template # enviar template HSM

GET    /api/v1/channels                      # listar canais
POST   /api/v1/channels/:id/reveal-credentials  # ação especial

POST   /api/v1/me/ticket-preferences         # preferências do usuário atual
```

### Recursos especiais

- `/api/v1/me` — referente ao usuário autenticado (alias do `/users/:id` próprio)
- `/api/v1/companies/me` — referente ao tenant do usuário autenticado

---

## Verbos HTTP

| Verbo  | Uso                    | Exemplo                                       |
| ------ | ---------------------- | --------------------------------------------- |
| GET    | Ler recurso(s)         | `GET /tickets`, `GET /tickets/:id`            |
| POST   | Criar OU executar ação | `POST /tickets`, `POST /tickets/:id/accept`   |
| PATCH  | Atualização parcial    | `PATCH /tickets/:id` (apenas campos enviados) |
| PUT    | Substituição completa  | (raro, geralmente preferimos PATCH)           |
| DELETE | Remover recurso        | `DELETE /tickets/:id`                         |

---

## Paginação cursor-based

Default em todas as listagens. Por quê: offset (`page=2`) tem performance ruim em grandes datasets, e gera inconsistência quando dados mudam entre páginas.

### Request

Query params:

```
?cursor=<opaque-cursor>&limit=20
```

- `cursor`: opaco, gerado pelo servidor (geralmente base64 do `id` do último item da página anterior)
- `limit`: tamanho da página, default 20, max 100

### Response

```json
{
  "items": [...],
  "pagination": {
    "nextCursor": "eyJpZCI6ICJhYmMxMjMifQ==",
    "hasMore": true,
    "total": 1234
  }
}
```

`nextCursor` é `null` quando não há mais páginas. `total` é opcional — só calcular quando barato.

### Filtros

Query params adicionais:

```
GET /tickets?status=PENDING&assignedUserId=user-123&limit=20
```

Filtros suportados por endpoint documentados na descrição do controller.

### Ordenação

Por enquanto fixa por endpoint (definida no backend). Quando necessário customizar:

```
?sort=createdAt&order=desc
```

Apenas campos pré-aprovados (whitelist) podem ser usados em `sort` — evita query expensiva.

---

## Convenção de naming nas respostas

### Decisão: camelCase em tudo

**Por quê:**
- Backend é TypeScript end-to-end com Zod gerando schemas
- OpenAPI gerado dos schemas Zod usa o nome dos campos como definidos no schema
- Frontend importa tipos via Kubb a partir do OpenAPI
- Sem conversão entre camadas — schema é fonte da verdade do nome
- Padrão moderno em APIs TypeScript-first (tRPC-style, schema-driven)

**Não usamos conversão snake_case porque:**
- Kubb geraria tipos com snake_case no frontend (`ticket.assigned_user_id`) — estranho em código TS
- Interceptor de conversão adiciona complexidade sem benefício técnico
- Schema Zod (camelCase) seria o nome interno mas não o documentado

**Exemplo de schema e response:**

```typescript
// schemas/ticket-response.schema.ts
export const TicketResponseSchema = z.object({
  id: z.string().uuid(),
  protocol: z.string(),
  contactId: z.string().uuid(),
  assignedUserId: z.string().uuid().nullable(),
  lastMessageAt: z.string().datetime().nullable(),
});

export type TicketResponseDto = z.infer<typeof TicketResponseSchema>;
```

Response JSON:
```json
{
  "id": "abc-123",
  "protocol": "#12345",
  "contactId": "contact-456",
  "assignedUserId": "user-789",
  "lastMessageAt": "2026-04-27T10:30:00.000Z"
}
```

Frontend (gerado pelo Kubb):
```typescript
import type { TicketResponseDto } from '@/lib/generated';

const ticket: TicketResponseDto = await fetchTicket();
ticket.assignedUserId;  // camelCase consistente
```

---

## Formato de datas

ISO 8601 com timezone (sempre UTC):

```
"2026-04-27T15:30:00.000Z"
```

Frontend converte para timezone local na exibição.

NÃO retornar timestamps Unix (epoch ms). NÃO retornar datas formatadas em pt-BR.

---

## Boolean

`true` / `false` literais em JSON. NÃO usar `0` / `1`.

---

## Null vs undefined vs missing

- **Campo opcional não preenchido:** `null` (explícito)
- **Campo nunca enviado:** ausente da resposta (não enviar `undefined`)

```json
{
  "id": "abc-123",
  "name": "Ticket X",
  "description": null,        // explicitamente vazio
  "closed_at": null           // ainda não fechado
}
```

---

## Endpoints de busca/search

Quando endpoint de listagem aceita busca textual:

```
GET /tickets?search=joão&limit=20
```

`search` é case-insensitive, busca em campos pré-definidos (documentado por endpoint). Backend usa `ILIKE` no Postgres.

Para busca avançada com múltiplos campos:

```
GET /contacts?name=joão&phone=11999&tags=cliente-vip
```

Cada filtro é seu próprio param.

---

## Ações em massa (bulk)

Para operações em múltiplos recursos:

```
POST /api/v1/tickets/bulk-close
Body: {
  "ticket_ids": ["abc", "def", "ghi"],
  "close_reason_id": "reason-1"
}
```

Response:

```json
{
  "succeeded": ["abc", "def"],
  "failed": [
    { "id": "ghi", "reason": "Ticket já está fechado" }
  ]
}
```

Status 207 Multi-Status quando há sucessos parciais.

---

## Filtros complexos

Para filtros booleanos múltiplos, usar lista:

```
GET /tickets?status=PENDING,OPEN
```

Backend faz split em vírgula. Documentar campos que aceitam múltiplos valores.

Para queries muito complexas (raro), considerar `POST /tickets/search` com body JSON.

---

## Códigos HTTP

Ver `error-handling.md`.

Resumo:

| Endpoint      | Sucesso | Erro comum              |
| ------------- | ------- | ----------------------- |
| GET (listar)  | 200     | 401, 403                |
| GET (detalhe) | 200     | 401, 403, 404           |
| POST (criar)  | 201     | 400, 401, 403, 409      |
| POST (ação)   | 200     | 400, 401, 403, 404, 409 |
| PATCH         | 200     | 400, 401, 403, 404, 409 |
| DELETE        | 204     | 401, 403, 404, 409      |

---

## Headers

### Request headers obrigatórios

```
Authorization: Bearer <jwt>
Content-Type: application/json
```

### Response headers padrão

```
Content-Type: application/json; charset=utf-8
X-Request-Id: <uuid>          # rastreabilidade
```

### Headers de rate limit

Quando aplicável:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1714234800
```

---

## Idempotência

Para `POST` que cria recursos críticos (mensagem, ticket), aceitar `Idempotency-Key` header:

```
POST /api/v1/tickets/:id/messages
Idempotency-Key: msg-abc-123-from-client
```

Se mesma key vier 2x, retornar resposta da primeira tentativa (sem criar duplicada). Implementação: cache Redis 24h.

Não obrigatório no MVP, mas planejar pra fase 4+.

---

## Versionamento da API

API começa em `/api/v1/`. Sempre incluir version na URL.

Quando mudar:
- **Breaking change:** nova versão (`/api/v2/`)
- **Adição compatível** (campo novo na response): mesma versão
- **Mudança em response existente:** breaking, nova versão

Manter v1 funcionando por X meses após v2 ser default. Comunicação via header de deprecação:

```
X-API-Deprecated: This endpoint will be removed in v3
X-API-Deprecation-Date: 2027-12-31
```

---

## Documentação OpenAPI

OpenAPI spec gerado automaticamente a partir dos schemas Zod via `nestjs-zod` + `@nestjs/swagger`. UI servida via **Scalar** (não Swagger UI).

### Stack de geração

```bash
pnpm add @nestjs/swagger nestjs-zod zod
pnpm add @scalar/nestjs-api-reference
```

### Setup em `main.ts`

```typescript
import { patchNestJsSwagger } from 'nestjs-zod';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';

// Patch necessário para nestjs-zod gerar OpenAPI corretamente
patchNestJsSwagger();

const config = new DocumentBuilder()
  .setTitle('DigiChat API')
  .setVersion('1.0.0')
  .addBearerAuth()
  .build();

const document = SwaggerModule.createDocument(app, config);

// Endpoint clássico de Swagger JSON (usado pelo Kubb no frontend)
SwaggerModule.setup('api/v1/openapi', app, document);

// UI Scalar (mais bonita que Swagger UI)
app.use(
  '/api/v1/docs',
  apiReference({
    spec: { content: document },
    theme: 'purple',  // ou outro tema
  }),
);
```

### Endpoints

- `/api/v1/openapi` — JSON do OpenAPI spec (consumido pelo Kubb)
- `/api/v1/openapi-yaml` — YAML do mesmo spec (opcional)
- `/api/v1/docs` — UI Scalar interativa (acessível por ADMIN/SUPER_ADMIN)

### Como o schema Zod gera OpenAPI

Cada schema com `.describe()` vira documentação na API:

```typescript
export const CreateTicketSchema = z.object({
  contactId: z.string().uuid().describe('ID do contato no formato UUID v7'),
  channelConnectionId: z.string().uuid(),
  initialMessage: z.string().min(1).max(4096).optional()
    .describe('Mensagem inicial (obrigatória se canal exigir HSM)'),
}).describe('Dados para criar novo ticket');
```

`nestjs-zod` extrai `.describe()`, validações (`.uuid()`, `.min()`, `.max()`), exemplos (via `.example()`) e gera OpenAPI completo.

**Não usar `@ApiProperty` em DTOs.** Não há DTO classe. Schema Zod é o documento.

### Frontend: geração de tipos com Kubb

Workflow no frontend:

1. Backend roda em `localhost:3000` (dev) ou URL de staging
2. Frontend executa `pnpm generate:api`
3. Kubb lê `http://localhost:3000/api/v1/openapi`
4. Gera tipos TS, hooks TanStack Query, cliente HTTP em `lib/generated/`
5. Commit do código gerado

Exemplo de uso no frontend:

```tsx
// Antes (manual): manter type sincronizado com backend, fácil divergir
import type { Ticket } from '@/types/ticket';

// Depois (gerado): single source of truth, regenera a cada API change
import { useGetTicket, type Ticket } from '@/lib/generated';

function TicketDetail({ id }: { id: string }) {
  const { data: ticket } = useGetTicket({ id });  // tipado completamente
  return <div>{ticket?.protocol}</div>;
}
```

### `kubb.config.ts` no frontend

```typescript
import { defineConfig } from '@kubb/core';
import { pluginOas } from '@kubb/plugin-oas';
import { pluginTs } from '@kubb/plugin-ts';
import { pluginReactQuery } from '@kubb/plugin-react-query';

export default defineConfig({
  root: '.',
  input: {
    path: process.env.API_OPENAPI_URL ?? 'http://localhost:3000/api/v1/openapi',
  },
  output: {
    path: './lib/generated',
    clean: true,
  },
  plugins: [
    pluginOas(),
    pluginTs({ output: { path: 'types' } }),
    pluginReactQuery({
      output: { path: 'hooks' },
      client: { dataReturnType: 'data' },
    }),
  ],
});
```

### Manter spec sincronizado

`crm-api` exporta o `openapi.json` em CI quando há mudança em schemas. `crm-web` no CI roda Kubb pra regenerar tipos. Diff é commitado.

Workflow alternativo (mais simples no início): regenerar manualmente com `pnpm generate:api` no `crm-web` quando você lembrar.

---

## Endpoints especiais

### Health check

```
GET /health
```

Sem auth. Retorna 200 se app está vivo, 503 se não. Usado por K8s liveness/readiness.

### Versão

```
GET /api/v1/version
```

Retorna versão do backend, sha do git, timestamp de build. Sem auth. Útil pra debug.

```json
{
  "version": "1.2.3",
  "git_sha": "abc1234",
  "build_at": "2026-04-27T15:00:00.000Z"
}
```

---

## Webhooks de entrada (públicos)

Webhooks vindos de canais externos (Gupshup) não usam JWT. Validação por HMAC.

```
POST /webhooks/channel/:id
X-Gupshup-Signature: <hmac-sha256>
```

NÃO confundir com endpoints autenticados. Webhooks ficam em namespace `/webhooks/`, fora de `/api/v1/`.

---

## Padrão de naming de campos

| Conceito    | Field name (camelCase)                                                |
| ----------- | --------------------------------------------------------------------- |
| ID primário | `id`                                                                  |
| FK          | `<entity>Id` (ex: `contactId`, `assignedUserId`)                      |
| Booleanos   | prefixo `is`, `has`, `can` (ex: `isBot`, `hasAttachments`, `canEdit`) |
| Datas       | sufixo `At` (ex: `createdAt`, `closedAt`)                             |
| Contadores  | sufixo `Count` (ex: `unreadCount`, `messagesCount`)                   |
| URLs        | sufixo `Url` (ex: `mediaUrl`, `avatarUrl`)                            |
| Coleções    | plural sem prefixo (ex: `tags`, `messages`)                           |

---

## Checklist de PR (controllers/endpoints)

- [ ] URL segue padrão (versionada, recurso pluralizado, ação no final se não-CRUD)
- [ ] Verbo HTTP correto
- [ ] **Schema Zod definido** em `schemas/` (com `.describe()` nos campos importantes)
- [ ] Schema Zod usado tanto em validação de input quanto em response (via `@ZodSerializerDto`)
- [ ] Type derivado via `z.infer<typeof Schema>`, não declarado separadamente
- [ ] Schema **NUNCA** aceita `companyId` no body (atacante manipula)
- [ ] Datas em ISO 8601 UTC
- [ ] Códigos HTTP corretos
- [ ] Paginação cursor-based em listagens
- [ ] OpenAPI gerado automaticamente do schema (sem `@ApiProperty`)
- [ ] Erros conforme `error-handling.md`
- [ ] Multi-tenant validado conforme `multi-tenant-checklist.md`
- [ ] Após mergear: rodar `pnpm generate:api` no `crm-web` para regenerar tipos