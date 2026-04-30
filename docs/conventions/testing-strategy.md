# Testing Strategy — DigiChat

> Estratégia de testes do projeto. O que testar, onde testar, como testar, e quando NÃO testar.

---

## Princípios

1. **Testes são valor, não cerimônia.** Teste o que tem regra de negócio, não getter trivial.
2. **Pirâmide invertida discreta.** Mais unit em domain services. Menos e2e (caros). Quase sem integration tradicional.
3. **Velocidade > completude.** Suite de testes que demora >5 min vira ignorada.
4. **Multi-tenant é não-negociável.** Cada feature crítica tem teste explícito de isolamento.
5. **Confiar nas types.** Não testar coisas que TypeScript já garante.

---

## Camadas de teste

### Unit Tests — Domain Services

**Onde:** `src/modules/<feature>/tests/<feature>.domain.service.spec.ts`

**O que testar:**
- Lógica de regra de negócio
- State machines (transições válidas e inválidas)
- Cálculos
- Validações
- Edge cases

**O que NÃO testar:**
- Métodos que apenas chamam Prisma sem lógica
- Getters/setters
- Construtores triviais
- Métodos de mapeamento simples

**Mock do Prisma:** sim, usar mock do PrismaClient pra isolar regras.

**Exemplo:**

```typescript
describe('TicketsDomainService', () => {
  let service: TicketsDomainService;
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    service = new TicketsDomainService(prisma);
  });

  describe('accept', () => {
    it('changes ticket from PENDING to OPEN with assigned user', async () => {
      prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
      prisma.ticket.findFirstOrThrow.mockResolvedValue({
        id: 'ticket-1',
        status: 'OPEN',
        assignedUserId: 'user-1',
      } as Ticket);

      const result = await service.accept('ticket-1', 'company-1', 'user-1', prisma);

      expect(result.status).toBe('OPEN');
      expect(result.assignedUserId).toBe('user-1');
      expect(prisma.ticket.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'ticket-1',
          companyId: 'company-1',
          status: 'PENDING',
          assignedUserId: null,
        },
        data: { status: 'OPEN', assignedUserId: 'user-1' },
      });
    });

    it('throws ConflictException when ticket is not pending', async () => {
      prisma.ticket.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.accept('ticket-1', 'company-1', 'user-1', prisma)
      ).rejects.toThrow(ConflictException);
    });

    it('does not allow accepting ticket from another company', async () => {
      prisma.ticket.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.accept('ticket-of-A', 'company-B', 'user-of-B', prisma)
      ).rejects.toThrow(ConflictException);
    });
  });
});
```

**Coverage alvo:** domain services com lógica de negócio: 80%+. Não obrigatório, é métrica de saúde.

---

### Integration Tests — Application Services

**Onde:** `src/modules/<feature>/tests/<feature>.application.service.spec.ts` (opcional)

**Quando criar:** raramente. Application services são thin (orquestração). Lógica está em domain. E2E cobre o fluxo.

**Quando vale criar:** quando application service tem lógica complexa de orquestração (múltiplas transações, eventos condicionais). Aí testa mockando domain services.

---

### E2E Tests — Fluxos críticos

**Onde:** `test/<feature>.e2e-spec.ts`

**O que testar:**
- Happy path do fluxo principal
- 1-2 sad paths importantes
- **Multi-tenant isolation** (obrigatório por feature)
- Race conditions críticas (aceite simultâneo de ticket)

**O que NÃO testar:**
- Toda combinação de validação de schema Zod
- Toda mensagem de erro
- CRUDs simples e completos (lista, atualiza, exclui — só happy path)

**Setup:**
- Banco real em memória ou container Docker (Postgres test)
- Redis test
- Mocks de canais externos (Gupshup) — não bater em API real

**Exemplo:**

```typescript
describe('TicketsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  describe('POST /tickets/:id/accept', () => {
    it('agent accepts pending ticket from their department', async () => {
      // Arrange
      const company = await createCompany(prisma);
      const dept = await createDepartment(prisma, company.id);
      const user = await createUser(prisma, company.id, 'AGENT', { departmentIds: [dept.id] });
      const ticket = await createTicket(prisma, company.id, {
        status: 'PENDING',
        departmentId: dept.id,
      });
      const token = generateJwt(user);

      // Act
      const response = await request(app.getHttpServer())
        .post(`/tickets/${ticket.id}/accept`)
        .set('Authorization', `Bearer ${token}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('OPEN');
      expect(response.body.assignedUserId).toBe(user.id);
    });

    it('returns 409 when ticket already accepted (race condition)', async () => {
      const company = await createCompany(prisma);
      const user1 = await createUser(prisma, company.id, 'AGENT');
      const user2 = await createUser(prisma, company.id, 'AGENT');
      const ticket = await createTicket(prisma, company.id, { status: 'PENDING' });

      const token1 = generateJwt(user1);
      const token2 = generateJwt(user2);

      // Race: dois aceites simultâneos
      const [r1, r2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/tickets/${ticket.id}/accept`)
          .set('Authorization', `Bearer ${token1}`),
        request(app.getHttpServer())
          .post(`/tickets/${ticket.id}/accept`)
          .set('Authorization', `Bearer ${token2}`),
      ]);

      // Um aceitou, outro recebeu 409
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([200, 409]);
    });

    // CRÍTICO: isolamento multi-tenant
    it('agent of company B cannot accept ticket of company A', async () => {
      const companyA = await createCompany(prisma);
      const companyB = await createCompany(prisma);
      const userOfB = await createUser(prisma, companyB.id, 'AGENT');
      const ticketOfA = await createTicket(prisma, companyA.id, { status: 'PENDING' });

      const tokenB = generateJwt(userOfB);

      const response = await request(app.getHttpServer())
        .post(`/tickets/${ticketOfA.id}/accept`)
        .set('Authorization', `Bearer ${tokenB}`);

      expect(response.status).toBe(404);  // não vê, não pode aceitar
    });
  });
});
```

**Coverage alvo:** todos os fluxos críticos do roadmap têm e2e do happy path. Regra simples: cada item da seção "Validação manual end-to-end" do ROADMAP vira um e2e test.

---

## Bot Engine — testes específicos

Bot Engine tem complexidade alta. Mais testes:

**Unit nos node executors:**
- `start-node.executor.spec.ts`
- `capture-node.executor.spec.ts` (testar todos os validators)
- `condition-node.executor.spec.ts` (testar expression engine com casos)
- `api-request-node.executor.spec.ts` (testar retry, mapping, error handling)
- `loop-node.executor.spec.ts` (testar iteração, empty handler)

**Integration do BotEngine:**
- Fluxo completo simulado (sem chamar WhatsApp real)
- Cenários do `audit-05-bot-fluxo.md`

**E2E do bot via webhook:**
- Webhook entrante → bot processa → mensagem outbound

---

## Testes de migração de schema

Toda migration nova **deve** ser testada:

1. Em base limpa (do zero)
2. Em base com dados (simulação de produção)

Comando: `pnpm prisma migrate dev` em ambiente de teste.

Se migration tem `data migration` (mudar dados existentes), criar test específico.

---

## O que NÃO testamos

- **Frameworks** — não testamos NestJS, Prisma, Tailwind. Confiar.
- **Tipos TypeScript** — typecheck já valida.
- **CRUDs triviais** sem regra de negócio (cobertos por e2e do happy path).
- **Migrations sem data migration** (apenas schema, sem dado a transformar).
- **Validação de schema Zod** isoladamente (Zod é robusto, testar apenas combinações com regra de negócio).
- **Configuração** (env vars são loadadas pelo NestJS).

---

## Mocks e fixtures

### Helpers de criação de entidades

`test/factories/`:

```typescript
// test/factories/company.factory.ts
export async function createCompany(
  prisma: PrismaService,
  overrides: Partial<Company> = {},
): Promise<Company> {
  return prisma.company.create({
    data: {
      id: ulid(),
      name: `Company ${Date.now()}`,
      slug: `company-${Date.now()}`,
      status: 'ACTIVE',
      ...overrides,
    },
  });
}
```

Reusar em todos os testes. Evitar duplicação.

### Mocks de canal externo

`test/mocks/gupshup-adapter.mock.ts`:

```typescript
export const mockGupshupAdapter = (): jest.Mocked<ChannelAdapter> => ({
  getProvider: jest.fn().mockReturnValue('GUPSHUP'),
  sendMessage: jest.fn().mockResolvedValue({ messageId: 'mock-msg-1' }),
  parseInboundWebhook: jest.fn().mockReturnValue([]),
  // ...
});
```

---

## CI

GitHub Actions roda:

1. `pnpm lint` — bloqueia em erro
2. `pnpm typecheck` — bloqueia em erro
3. `pnpm test` — bloqueia se falhar
4. `pnpm test:e2e` — bloqueia se falhar
5. `pnpm build` — bloqueia em erro

Tempo total alvo: < 5 minutos. Se passar disso, otimizar.

Coverage não é gate (não bloqueia PR), mas relatório é gerado e comentado em PR.

---

## Comandos úteis

```bash
# Rodar tudo
pnpm test

# Modo watch (desenvolvimento)
pnpm test:watch

# Apenas um arquivo
pnpm test tickets.domain.service

# Apenas um teste
pnpm test -t 'accepts pending ticket'

# E2E
pnpm test:e2e

# Coverage
pnpm test:cov

# Debug (com inspector)
pnpm test:debug
```

---

## Estratégia de fixtures de tempo

Testes que dependem de tempo (auto-close, janela 24h, scheduled jobs):

- Usar `vi.useFakeTimers()` (Vitest) ou `jest.useFakeTimers()`
- Avançar tempo com `vi.advanceTimersByTime(24 * 60 * 60 * 1000)`
- NÃO usar `setTimeout` real em testes

```typescript
it('auto-closes ticket inactive for 60 minutes', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-27T10:00:00Z'));

  const ticket = await createTicket(prisma, companyId, {
    status: 'OPEN',
    lastInboundAt: new Date('2026-04-27T08:30:00Z'),  // 1h30 atrás
  });

  vi.setSystemTime(new Date('2026-04-27T10:30:00Z'));  // já passou 2h

  await autoCloseWorker.process();

  const updated = await prisma.ticket.findFirst({ where: { id: ticket.id }});
  expect(updated.status).toBe('CLOSED');
  expect(updated.resolvedBy).toBe('SYSTEM');

  vi.useRealTimers();
});
```

---

## Quando flaky test aparece

Teste flaky (passa às vezes, falha às vezes) é problema sério:

1. Investigar causa real (geralmente race condition, dependência de tempo, ordem de execução)
2. **NÃO** marcar como `skip` ou `retry` sem investigar
3. Se não conseguir corrigir hoje, abrir issue priorizada
4. Considerar refactor do que está sendo testado

Flaky tests deterioram confiança na suite. Tolerância zero.