# Multi-tenant Checklist — DigiChat

> Checklist obrigatório antes de mergear qualquer PR que toque em código de banco, queries, ou lógica de domínio.
>
> **Vazamento entre tenants é o pior bug possível do produto.** Trate este checklist como bloqueante.

---

## Por que isso existe

DigiChat é multi-tenant SaaS. Cada `Company` é um tenant. Dados de um tenant **NUNCA** podem aparecer em queries, caches, sockets ou jobs de outro tenant.

A estratégia de isolamento é **row-level com `companyId` em todas as tabelas**. Não tem schema-per-tenant. Não tem middleware automático. **A disciplina manual é a defesa.**

Por isso este checklist é obrigatório.

---

## Checklist completo

### A. Queries Prisma

Para **toda** query Prisma adicionada ou modificada na PR:

- [ ] **Tem `companyId` no `where`?** Sem exceção, exceto se a tabela for de catálogo global (`Plan`).
- [ ] **`companyId` vem de fonte autorizada?** (Argumento explícito, `@CurrentCompany()` no controller, ou `companyId` do JWT). NUNCA do body do request.
- [ ] **Service que faz a query recebe `companyId` como argumento explícito?** (Não pega do request implicitamente.)
- [ ] Se for query com `JOIN` ou `include`, **o filtro de `companyId` ainda fecha** todas as relações? (Cuidado com relações m:n onde a tabela intermediária pode vazar.)
- [ ] Se usar `findUnique`, considere usar `findFirst` com `companyId` no where (findUnique não permite filtros adicionais).

**Exemplos:**

```typescript
// ❌ ERRADO — query global, vaza entre tenants
const ticket = await this.prisma.ticket.findUnique({
  where: { id: ticketId },
});

// ❌ ERRADO — companyId vem do body do request (atacante manipula)
async findTicket(ticketId: string, body: { companyId: string }) {
  return this.prisma.ticket.findFirst({
    where: { id: ticketId, companyId: body.companyId },
  });
}

// ❌ ERRADO — service pega do request implicitamente
async findTicket(ticketId: string, req: Request) {
  const companyId = req.user.companyId;
  return this.prisma.ticket.findFirst({
    where: { id: ticketId, companyId },
  });
}

// ✅ CORRETO — companyId é argumento explícito
async findTicket(ticketId: string, companyId: string) {
  return this.prisma.ticket.findFirst({
    where: { id: ticketId, companyId },
  });
}

// ✅ CORRETO — controller extrai do JWT, passa pra service
@Get(':id')
async getTicket(
  @Param('id') id: string,
  @CurrentCompany() companyId: string,
) {
  return this.ticketsApplicationService.findById(id, companyId);
}
```

### B. Updates e deletes

Updates e deletes são especialmente perigosos:

- [ ] `updateMany` ou `deleteMany` sempre tem `companyId` no where
- [ ] `update` (única) usa `findFirst` antes para validar que pertence ao tenant
- [ ] Em transações, todos os passos validam `companyId`

**Padrão recomendado para update único:**

```typescript
// ✅ CORRETO
async updateTicket(id: string, companyId: string, data: UpdateTicketDto) {
  // valida que ticket pertence ao tenant
  const existing = await this.prisma.ticket.findFirst({
    where: { id, companyId },
  });
  if (!existing) {
    throw new NotFoundException('Ticket não encontrado');
  }

  return this.prisma.ticket.update({
    where: { id },
    data,
  });
}
```

### C. Cache (Redis)

- [ ] **Toda chave de cache começa com `company:{companyId}:`**
- [ ] Chaves globais (sistema) usam prefixo separado (`system:` ou `meta:`) — raro
- [ ] Invalidação de cache respeita o tenant: invalidar de A não afeta B

**Exemplos:**

```typescript
// ❌ ERRADO
const key = `tickets:list:${userId}`;

// ✅ CORRETO
const key = `company:${companyId}:tickets:list:${userId}`;
```

### D. Socket.IO (realtime)

- [ ] Toda sala (`room`) tem `companyId` no nome
- [ ] Broadcasts respeitam a sala, não enviam pra `io.emit` global
- [ ] Auth do socket valida `companyId` do JWT e adiciona à sala correta

**Padrão de salas:**

```
company:{companyId}                     # broadcast geral do tenant
company:{companyId}:user:{userId}       # eventos pessoais
company:{companyId}:ticket:{ticketId}   # mensagens do ticket
company:{companyId}:department:{deptId} # eventos do departamento
```

```typescript
// ❌ ERRADO — broadcast global
this.io.emit('ticket:created', ticket);

// ✅ CORRETO — só pra sala do tenant
this.io.to(`company:${ticket.companyId}`).emit('ticket:created', ticket);
```

### E. Jobs BullMQ

- [ ] **Todo job tem `companyId` no payload**
- [ ] Worker lê `companyId` do job e usa em queries
- [ ] Logs do worker incluem `companyId`

```typescript
// ❌ ERRADO
await this.queue.add('send-message', { ticketId, content });

// ✅ CORRETO
await this.queue.add('send-message', { companyId, ticketId, content });
```

### F. DTOs de input

- [ ] DTOs **nunca** aceitam `companyId` do body (atacante pode manipular)
- [ ] Se DTO precisa referenciar entidade de outro tenant (ex: criar ticket pra contato), valida que entidade referenciada **pertence ao tenant** antes de criar/atualizar

```typescript
// Controller extrai companyId do JWT, NÃO do body
@Post()
async create(
  @Body() dto: CreateTicketDto,        // dto NÃO tem companyId
  @CurrentCompany() companyId: string, // companyId vem do JWT
) {
  return this.ticketsApplicationService.create(dto, companyId);
}

// Domain service valida que contactId existe E pertence ao tenant
async create(dto: CreateTicketDto, companyId: string) {
  const contact = await this.prisma.contact.findFirst({
    where: { id: dto.contactId, companyId },  // ← valida pertence ao tenant
  });
  if (!contact) {
    throw new BadRequestException('Contato não encontrado');
  }
  // ... cria ticket
}
```

### G. Logs e Sentry

- [ ] Logs estruturados sempre incluem `companyId` quando há contexto de tenant
- [ ] Sentry context inclui `companyId` (não dado pessoal)
- [ ] Não logar PII (nome, telefone, conteúdo de mensagem) em produção

```typescript
this.logger.log({
  companyId,
  userId,
  ticketId,
  action: 'ticket_accepted',
  // NÃO incluir contact.phoneNumber, contact.name, message.content
});
```

### H. Testes

- [ ] **Toda PR de feature tem teste de isolamento multi-tenant**
- [ ] Teste cria 2 tenants diferentes e valida que dados de A não vazam pra B
- [ ] Teste e2e usa JWT do tenant A e tenta acessar recurso do tenant B → espera 404 ou 403

**Padrão de teste de isolamento:**

```typescript
describe('TicketsController (e2e) - multi-tenant isolation', () => {
  let companyA: Company;
  let companyB: Company;
  let userOfA: User;
  let userOfB: User;
  let ticketOfA: Ticket;

  beforeAll(async () => {
    companyA = await createCompany();
    companyB = await createCompany();
    userOfA = await createUser(companyA.id, 'AGENT');
    userOfB = await createUser(companyB.id, 'AGENT');
    ticketOfA = await createTicket(companyA.id);
  });

  it('user of B cannot read ticket of A (returns 404)', async () => {
    const tokenB = generateJwt(userOfB);

    const response = await request(app.getHttpServer())
      .get(`/tickets/${ticketOfA.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);  // ou 403, dependendo do design
  });

  it('user of B cannot update ticket of A', async () => {
    const tokenB = generateJwt(userOfB);
    await request(app.getHttpServer())
      .patch(`/tickets/${ticketOfA.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ status: 'CLOSED' })
      .expect(404);
  });

  it('user of B does not see ticket of A in list', async () => {
    const tokenB = generateJwt(userOfB);
    const response = await request(app.getHttpServer())
      .get(`/tickets`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(response.body.tickets).not.toContainEqual(
      expect.objectContaining({ id: ticketOfA.id })
    );
  });
});
```

---

## Anti-patterns comuns (NÃO fazer)

### 1. Confiar em `req.user.companyId` direto na query

Errado. Pegar `companyId` do JWT no controller é OK; usar no service é OK. Mas dentro de query não:

```typescript
// ❌ ERRADO — service não deve acessar req
async findTicket(ticketId: string, req: Request) {
  return this.prisma.ticket.findFirst({
    where: { id: ticketId, companyId: req.user.companyId },
  });
}
```

### 2. Esquecer `companyId` em transação

Em `prisma.$transaction`, **cada operação dentro** precisa do filtro:

```typescript
// ❌ ERRADO — segundo update vaza
await this.prisma.$transaction(async (tx) => {
  await tx.ticket.update({ where: { id, companyId }, data: { status: 'OPEN' }});
  await tx.message.update({ where: { id: messageId }, data: { read: true }});
  // ↑ sem companyId, vaza
});

// ✅ CORRETO
await this.prisma.$transaction(async (tx) => {
  await tx.ticket.update({ where: { id, companyId }, data: { status: 'OPEN' }});
  await tx.message.updateMany({
    where: { id: messageId, companyId },  // ← adicionar
    data: { read: true },
  });
});
```

### 3. Usar `findUnique` com ID composto sem `companyId`

```typescript
// ❌ ERRADO se a chave única não tem companyId
const ticket = await this.prisma.ticket.findUnique({
  where: { protocol: '#12345' },  // protocol é único POR TENANT, não global
});
// Pode retornar ticket de outro tenant!

// ✅ CORRETO
const ticket = await this.prisma.ticket.findFirst({
  where: { protocol: '#12345', companyId },
});
```

### 4. Webhooks externos sem isolamento

Webhook do Gupshup chega no endpoint público `/webhooks/channel/:id`. O `:id` é do `ChannelConnection`. Validar:

```typescript
// ✅ CORRETO
async processWebhook(channelId: string, payload: unknown) {
  const channel = await this.prisma.channelConnection.findUnique({
    where: { id: channelId },
  });
  if (!channel) throw new NotFoundException();

  // Verifica HMAC com secret específico desse channel
  const isValid = this.adapter.verifyWebhookSignature(payload, signature);
  if (!isValid) throw new UnauthorizedException();

  // Daqui pra frente, USA channel.companyId em TUDO
  await this.processIncomingQueue.add('process', {
    companyId: channel.companyId,  // ← propaga
    channelId: channel.id,
    payload,
  });
}
```

---

## Code review específico

Quando reviewar PR (você mesmo ou outro dev), procurar especificamente por:

1. Toda chamada `prisma.X.findUnique`, `findFirst`, `findMany`, `update`, `updateMany`, `delete`, `deleteMany` — verificar se tem `companyId` no where
2. Cada novo Service — verificar se métodos recebem `companyId` como argumento
3. Cada novo Controller — verificar se usa `@CurrentCompany()`
4. Cada nova entrada de fila BullMQ — verificar se payload inclui `companyId`
5. Cada nova sala Socket.IO — verificar prefixo `company:{companyId}:`
6. Cada teste e2e novo — confirmar que tem caso de isolamento

---

## Quando vazar (incidente)

Se descobrir vazamento entre tenants em produção:

1. **Imediato:** desabilitar o endpoint/feature afetada (rollback ou feature flag)
2. Investigar escopo: quantos tenants, quantos registros, qual período
3. Notificar tenants afetados (LGPD)
4. Corrigir o código com teste regressivo
5. Auditar TUDO que aquele endpoint/service tocou (inclusive logs, cache, salas Socket.IO)
6. ADR documentando incidente e ações tomadas

Vazamento é incidente sério. Tratar como prioridade 1.