# Sprint 0.3 — Auth (3 camadas) — Design

**Data:** 2026-05-01
**Branch:** `feat/sprint-0-3-auth`
**Fase do ROADMAP:** Fase 0 — bloco "Auth (estrutura 3 camadas)"
**Audits relacionados:** `crm-specs/audits/audit-03A-cadastros-base.md` §3 (Usuários — Tela 8)
**Documento companheiro:** `ARCHITECTURE.md` §12 (Auth e segurança)

---

## 1. Contexto

Esta sprint implementa o módulo `auth/` com a arquitetura formal de 3 camadas, fechando os 4 boxes da seção "Auth" do ROADMAP Fase 0:

- [ ] Módulo `auth/` com 3 camadas (controller + application service + domain service)
- [ ] Register, login, refresh, force-logout
- [ ] Decorators `@CurrentUser`, `@CurrentCompany`
- [ ] Hierarquia de roles (SUPER_ADMIN > ADMIN > SUPERVISOR > AGENT)

A Sprint 0.2 já entregou `User` (4 perfis) e `RefreshToken` (com `tokenHash`, `revokedAt`, `expiresAt`) no schema. Bcrypt e Prisma já estão instalados. Faltam apenas as deps de Passport/JWT.

## 2. Decisões da sprint

### 2.1 Login — estratégia multi-tenant

**Decisão (B):** email **globalmente único** entre tenants. Login passa a ser `{ email, password }` simples, sem `companySlug`.

**Trade-off aceito:** o mesmo email não pode existir em 2 tenants distintos. Justificativa: SaaS B2B do nosso porte raramente tem o mesmo email humano servindo a 2 empresas; a simplicidade no front e na UX compensa o constrangimento.

**Impacto:**

- Migration nova: `change_user_email_to_global_unique` (drop compound `User_companyId_email_key`, add `User_email_key`).
- Seed precisa ajustar `where: { companyId_email: ... }` → `where: { email }`.
- Audit-03A precisa atualização: TC-USER-5 invertido + nota em D-USER-1.

### 2.2 Register

**Decisão (A):** **não shippa** `POST /auth/register` nesta sprint. Criação de usuário é responsabilidade do Users CRUD da próxima sprint (RF-USER-1: `POST /users` autenticado, ADMIN-only, com `departmentIds`).

A linha "Register" do ROADMAP fica marcada com nota _"deferido para Users CRUD — método domain pronto e exercitado por testes"_.

### 2.3 Logout

`POST /auth/logout` (autenticado) revoga **apenas o refresh token do device atual** (o que veio no body), não todos. Equivale ao "Sair" típico de uma SPA. Revogar todos os devices é caso de uso futuro (tela de perfil) — fora desta sprint.

### 2.4 Force-logout (admin força saída de outro user)

Endpoint HTTP `POST /users/:id/force-logout` é responsabilidade da próxima Sprint Users CRUD. Nesta sprint, o **domain service** já expõe `revokeAllRefreshTokens(userId, companyId)`, com testes unitários e e2e validando que a próxima tentativa de `/auth/refresh` retorna 401 (TC-USER-3 cumprido).

### 2.5 Tokens

| Token   | Algo  | Expiry | Secret env           | Persistência                                               |
| ------- | ----- | ------ | -------------------- | ---------------------------------------------------------- |
| Access  | HS256 | 15 min | `JWT_ACCESS_SECRET`  | nenhuma (stateless)                                        |
| Refresh | HS256 | 7 dias | `JWT_REFRESH_SECRET` | row em `RefreshToken` com `tokenHash = SHA-256(jti)` (hex) |

**Refresh token rotation:** `/auth/refresh` revoga o refresh recebido (`revokedAt = now()`) e emite par novo. **Reuse-detection** (revogar família inteira ao detectar uso de token revogado) está fora de escopo desta sprint.

**Senha:** bcrypt cost 12. Mínimo 8 caracteres no schema Zod, sem regras complexas (D-USER-6).

### 2.6 `@CurrentUser` faz DB-fetch

`JwtStrategy.validate()` busca o User do banco a cada request autenticado. Custo: 1 SELECT por request. Trade-off aceito: garante que `deletedAt`, `role`, e demais campos sempre refletem o estado atual. Otimização (cache Redis ou trust no JWT) fica para quando aparecer dor real.

### 2.7 RolesGuard hierárquico

Enum mapeado para peso numérico:

```ts
const ROLE_WEIGHT = {
  AGENT: 1,
  SUPERVISOR: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
} as const satisfies Record<UserRole, number>;
```

`@Roles(UserRole.ADMIN)` permite role com peso ≥ 3 (ADMIN ou SUPER_ADMIN). `@Roles(UserRole.AGENT)` permite todos.

Nesta sprint, `RolesGuard` fica pronto e testado, mas as rotas de auth não exigem role específico além de "autenticado". Ele será exercitado de fato pelos CRUDs (Users, Departments, etc).

## 3. Endpoints

| Verbo + Rota                | Auth        | Body                  | 200/204                               | Erros principais                               |
| --------------------------- | ----------- | --------------------- | ------------------------------------- | ---------------------------------------------- |
| `POST /api/v1/auth/login`   | público     | `{ email, password }` | `{ accessToken, refreshToken, user }` | 401 (`E-mail ou senha inválidos`)              |
| `POST /api/v1/auth/refresh` | público     | `{ refreshToken }`    | `{ accessToken, refreshToken, user }` | 401 (`Sessão expirada. Faça login novamente.`) |
| `POST /api/v1/auth/logout`  | autenticado | `{ refreshToken }`    | 204                                   | 401                                            |

`user` na response é a `UserPublicSchema` (id, name, email, role, companyId — sem `passwordHash`).

## 4. Estrutura de arquivos

```
src/
├── common/
│   ├── decorators/
│   │   ├── current-user.decorator.ts        # extrai request.user → User
│   │   ├── current-company.decorator.ts     # extrai request.user.companyId → string
│   │   ├── public.decorator.ts              # SetMetadata IS_PUBLIC_KEY
│   │   └── roles.decorator.ts               # SetMetadata ROLES_KEY
│   ├── filters/                             # já existe
│   └── guards/
│       ├── jwt-auth.guard.ts                # passport JWT, respeita @Public
│       └── roles.guard.ts                   # hierárquico
├── database/
│   ├── prisma.module.ts                     # @Global module
│   └── prisma.service.ts                    # extends PrismaClient, OnModuleInit/Destroy
└── modules/
    └── auth/
        ├── auth.module.ts
        ├── controllers/
        │   └── auth.controller.ts
        ├── services/
        │   ├── auth.application.service.ts  # orquestração
        │   └── auth.domain.service.ts       # regras (hash, verify, issue, rotate, revoke)
        ├── strategies/
        │   └── jwt.strategy.ts              # passport-jwt; validate() faz DB-fetch
        ├── schemas/
        │   ├── login.schema.ts
        │   ├── refresh.schema.ts
        │   ├── logout.schema.ts
        │   ├── auth-response.schema.ts      # { accessToken, refreshToken, user }
        │   └── user-public.schema.ts        # User sem passwordHash
        └── tests/
            ├── auth.domain.service.spec.ts
            └── auth.controller.e2e-spec.ts
```

`AuthModule` registrado em `AppModule`. `JwtAuthGuard` e `RolesGuard` instalados via `APP_GUARD` (globais). Health controller, login, refresh recebem `@Public()`.

## 5. Schemas Zod

```ts
// login.schema.ts
export const LoginSchema = z
  .object({
    email: z.string().email('E-mail em formato inválido').toLowerCase().trim(),
    password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  })
  .describe('Credenciais de login');

// refresh.schema.ts
export const RefreshSchema = z
  .object({
    refreshToken: z.string().min(1, 'Refresh token obrigatório'),
  })
  .describe('Refresh token para renovar par de tokens');

// logout.schema.ts — mesmo que refresh
export const LogoutSchema = RefreshSchema;

// user-public.schema.ts
export const UserPublicSchema = z
  .object({
    id: z.string().uuid(),
    companyId: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
    role: z.enum(['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'AGENT']),
  })
  .describe('Dados públicos do usuário (sem hash de senha)');

// auth-response.schema.ts
export const AuthResponseSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
    user: UserPublicSchema,
  })
  .describe('Par de tokens + usuário autenticado');
```

Todos com type derivado via `z.infer` e DTOs via `createZodDto`.

## 6. Fluxos detalhados

### 6.1 Login

```
Controller.login(body)
  → AuthApplicationService.login(email, password, ip?, userAgent?)
       → AuthDomainService.validateCredentials(email, password) → User
       → AuthDomainService.issueTokens(user, ip?, userAgent?, tx)
           - emite access JWT
           - gera jti UUID v7 → refresh JWT
           - INSERT em RefreshToken { jti, hash=SHA256(jti), userId, companyId, expiresAt, ip, userAgent }
           - retorna { accessToken, refreshToken }
       → constrói AuthResponseDto com UserPublicSchema
  → Controller retorna 200
```

`validateCredentials` lança `UnauthorizedException('E-mail ou senha inválidos')` para email não encontrado, senha errada, ou user com `deletedAt`. Mensagem **idêntica** em todos os casos para não vazar enumeração de usuários.

### 6.2 Refresh

```
Controller.refresh(body)
  → AuthApplicationService.refresh(refreshTokenString)
       → AuthDomainService.rotateRefresh(refreshTokenString, ip?, userAgent?, tx)
           - jwt.verify (lança 401 se assinatura inválida ou expirado)
           - busca row por tokenHash = SHA256(payload.jti)
           - se não achar, ou revogado, ou expirado → 401
           - SELECT user (deletedAt: null) — se deletado → 401
           - UPDATE row.revokedAt = now() (revoga o refresh recebido)
           - issueTokens(user) → emite par novo
           - retorna { accessToken, refreshToken, user }
  → Controller retorna 200
```

Toda transição é dentro de `prisma.$transaction` para evitar race condition (token "revogado e novo emitido" deve ser atômico).

### 6.3 Logout (self)

```
Controller.logout(body, currentUser)
  → AuthApplicationService.logout(refreshTokenString, currentUser.id, currentUser.companyId)
       → AuthDomainService.revokeRefreshTokenByJti(jti, userId, companyId)
           - UPDATE refreshToken SET revokedAt = now()
             WHERE tokenHash = SHA256(jti) AND userId AND companyId AND revokedAt IS NULL
           - se 0 rows afetadas: idempotente, ignora
  → Controller retorna 204
```

Validação extra: o refresh token enviado deve pertencer ao currentUser (vem do JWT access). Se `payload.sub !== currentUser.id`, 403.

### 6.4 Force-logout (admin → outro user, **sem endpoint nesta sprint**)

```
AuthDomainService.revokeAllRefreshTokens(userId, companyId)
  - UPDATE refreshToken SET revokedAt = now()
    WHERE userId AND companyId AND revokedAt IS NULL
  - retorna count
```

Sprint Users CRUD vai criar `UsersController.forceLogout` que injeta `AuthApplicationService` (ou direto o domain) e chama isso após validar que actor é ADMIN.

## 7. Multi-tenant — checklist aplicado

- [x] Toda query Prisma de auth filtra por `companyId` quando aplicável (refresh token lookup verifica `userId`+`companyId` para defesa em profundidade).
- [x] `@CurrentCompany()` extrai do JWT validado, nunca do body.
- [x] Domain methods recebem `companyId` explícito.
- [x] `JwtStrategy.validate()` defende contra JWT manipulado: confere `user.companyId === payload.companyId`.
- [x] Email único global: o User é encontrado por email globalmente, mas todas as queries subsequentes (refresh, logout) carregam `companyId` do JWT.
- [x] E2E inclui caso explícito de isolamento entre Company A e B.

## 8. Mensagens de erro (pt-BR)

| Cenário                                                    | HTTP | Message                                                |
| ---------------------------------------------------------- | ---- | ------------------------------------------------------ |
| login email inexistente / senha errada / user soft-deleted | 401  | `E-mail ou senha inválidos`                            |
| refresh com token expirado/revogado/inválido/user-deleted  | 401  | `Sessão expirada. Faça login novamente.`               |
| logout com token de outro user                             | 403  | `Você não tem permissão para esta ação`                |
| sem `Authorization` em rota privada                        | 401  | `Autenticação necessária`                              |
| RolesGuard nega                                            | 403  | `Você não tem permissão para esta ação`                |
| password < 8 chars no DTO                                  | 400  | (formato detalhado por campo via `ZodExceptionFilter`) |

Conforme `docs/conventions/error-handling.md`. Sem stack trace para o cliente.

## 9. Estratégia de testes

### 9.1 Unit (`auth.domain.service.spec.ts`, mock Prisma)

> Estratégia de mock de Prisma será definida na primeira spec de teste (provavelmente `vi.fn()` direto ou `vitest-mock-extended` se for instalado — pequena decisão de execute).

- `validateCredentials`:
  - senha correta → retorna User
  - email não encontrado → 401 com mensagem genérica
  - senha errada → 401 com mesma mensagem
  - user com `deletedAt` → 401 com mesma mensagem
- `issueTokens`:
  - emite par e persiste row em `RefreshToken` com `tokenHash` correto
  - hash é determinístico e estável
- `rotateRefresh`:
  - token válido → revoga e emite par novo (count de rows revogadas = 1, count de rows novas = 1)
  - JWT inválido (assinatura) → 401
  - JWT expirado → 401
  - token não encontrado em DB → 401
  - token já revogado → 401
  - user soft-deleted entre login e refresh → 401
- `revokeRefreshTokenByJti`:
  - row específica fica `revokedAt = now()`
  - chamada em token já revogado é idempotente
- `revokeAllRefreshTokens(userId, companyId)`:
  - revoga todas as rows ativas do user (TC-USER-3)
  - **multi-tenant**: revogar tokens do user A em company A não afeta user A' (homônimo) em company B (caso impossível pelo email global, mas defesa em profundidade do método)

### 9.2 E2E (`auth.controller.e2e-spec.ts`, real Postgres via testcontainers)

- **Setup**: criar Companies A e B; criar User A (ADMIN) e User B (AGENT); ambos com password conhecido.
- Login happy path com User A → 200, payload válido, refresh token persistido.
- Login com password errada → 401 + mensagem genérica.
- Login com email inexistente → 401 + **mesma** mensagem.
- Login com user soft-deleted → 401 + mesma mensagem.
- Login com password < 8 chars → 400 (validação Zod).
- Refresh happy path → novo par válido, refresh anterior revogado em DB.
- Refresh com token revogado → 401.
- Refresh com token expirado (set `expiresAt` no passado) → 401.
- Refresh com JWT mutilado → 401.
- Logout → 204; row revogada em DB; refresh subsequente do mesmo token → 401.
- **Force-logout via domain service** (sem rota): chama `revokeAllRefreshTokens(userA.id, companyA.id)` direto; refresh do User A → 401 (TC-USER-3).
- **Multi-tenant isolation**: revogar tudo do User A não afeta refresh do User B → continua 200.

### 9.3 RolesGuard (`roles.guard.spec.ts`)

- AGENT bloqueado em `@Roles(ADMIN)` → 403.
- ADMIN passa em `@Roles(AGENT)` → ok.
- SUPER_ADMIN passa em `@Roles(ADMIN)` → ok.
- Sem `@Roles()` (rota apenas `JwtAuthGuard`) → permite qualquer role autenticado.

### 9.4 Verificação manual (smoke test)

`pnpm start:dev`, então via `httpie` ou `curl`:

1. `POST /api/v1/auth/login` com credenciais do SUPER_ADMIN do seed → 200, copiar tokens.
2. `POST /api/v1/auth/refresh` com refresh token → 200, novo par.
3. Tentar usar o refresh anterior → 401.
4. `POST /api/v1/auth/logout` com novo refresh token → 204.
5. Tentar refresh do token recém-deslogado → 401.

## 10. Side-tasks que entram nesta sprint

1. **Migration `change_user_email_to_global_unique`**
   - Drop `User_companyId_email_key`.
   - Add `User_email_key` (unique on `email`).
   - Atualizar `prisma/schema.prisma`: `email String @unique` (sem `@@unique([companyId, email])`).
   - Ajustar `prisma/seed.ts`: `where: { email: normalizedEmail }`.
2. **PrismaModule + PrismaService**
   - `src/database/prisma.module.ts` (`@Global()`).
   - `src/database/prisma.service.ts` (`extends PrismaClient`, com `OnModuleInit.$connect()` e `OnModuleDestroy.$disconnect()`).
   - Importar em `AppModule`.
3. **`vitest.e2e.config.ts`**
   - Não existe. Criar com testcontainers postgres + setup de migrate + seed-helpers.
   - Reusar `test/setup-prisma.ts` quando aplicável.
4. **Adicionar deps via pnpm** (após confirmação do humano):
   - `@nestjs/jwt`
   - `@nestjs/passport`
   - `passport`
   - `passport-jwt`
   - `@types/passport-jwt` (devDep)
5. **Atualizar `crm-specs/audits/audit-03A-cadastros-base.md`**
   - Nova decisão D-USER-8 (ou nota em D-USER-1): "Email é globalmente único entre tenants. Decisão revisada na Sprint 0.3 do `crm-api`."
   - TC-USER-5 invertido: "Email duplicado em qualquer tenant → 409".
6. **Atualizar `ROADMAP.md`** (commit final)
   - Marcar os 4 boxes da seção "Auth (estrutura 3 camadas)".
7. **Atualizar `ARCHITECTURE.md` §12** se algum detalhe da implementação merecer (provável: jti+SHA-256 e DB-fetch em `@CurrentUser` — avaliar no execute).

## 11. Fora de escopo (explícito)

- Reset de senha via email (D-USER-4: fase 4)
- 2FA (D-USER-5: fase futura)
- Rate-limit de login (futuro; deixar TODO no controller)
- Reuse-detection de refresh token (revogar família ao detectar reuso)
- Endpoint HTTP `POST /users/:id/force-logout` (Sprint Users CRUD)
- `/auth/me` (Users CRUD vai prover via `/users/me` ou similar)
- Endpoint de "logout de todos os devices" (futuro)
- Frontend (este sprint é backend-only)

## 12. Definição de "pronto"

Antes de marcar a sprint completa:

- [ ] `pnpm typecheck` ✓
- [ ] `pnpm lint` ✓
- [ ] `pnpm test` ✓ (unit incluindo `auth.domain.service.spec.ts` e `roles.guard.spec.ts`)
- [ ] `pnpm test:e2e` ✓ (`auth.controller.e2e-spec.ts`, com isolation multi-tenant)
- [ ] `pnpm test:schema` ✓ (Sprint 0.2 não pode quebrar; migration nova validada)
- [ ] `pnpm build` ✓
- [ ] Smoke manual: login → refresh → logout com SUPER_ADMIN do seed
- [ ] Pre-commit hooks (lefthook) rodando sem skip
- [ ] ROADMAP.md atualizado
- [ ] audit-03A atualizado (TC-USER-5 + nota em D-USER-1)
- [ ] ARCHITECTURE.md §12 atualizado se merecer
- [ ] PR aberto via `gh pr create` no final, aguardando confirmação humana antes do push

## 13. Trilha de migração entre sprints

Ao final desta sprint, o estado deixa preparado para a próxima sprint (Users CRUD):

- `AuthApplicationService` injetável de outros módulos.
- `revokeAllRefreshTokens(userId, companyId)` pronto para `POST /users/:id/force-logout`.
- `RolesGuard` exercitável em qualquer controller via `@Roles()`.
- `@CurrentUser`, `@CurrentCompany` disponíveis para qualquer rota autenticada.
- `PrismaService` global pronto para todos os domain services futuros.
- Padrão de testes (unit mock + e2e testcontainers) estabelecido.
