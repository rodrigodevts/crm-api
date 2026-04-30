# Error Handling — DigiChat

> Padrão de tratamento de erros, mensagens e códigos HTTP. Aplicado em todo o backend.

---

## Princípios

1. **Errors nunca são silenciosos.** Sempre logar, sempre retornar resposta clara.
2. **Mensagens em pt-BR para usuário final.** Atendente não fala inglês.
3. **Stack traces e detalhes técnicos NUNCA vão pro cliente.** Filtrados por `AllExceptionsFilter`.
4. **Códigos HTTP semânticos.** Usar a tabela abaixo, não inventar.
5. **Erros de validação são detalhados.** Frontend precisa saber qual campo está errado.

---

## Tabela de códigos HTTP

| Código | Quando usar                   | Exemplo                                         |
| ------ | ----------------------------- | ----------------------------------------------- |
| 200    | Sucesso geral                 | GET, PATCH, PUT bem-sucedido                    |
| 201    | Recurso criado                | POST que cria entidade                          |
| 204    | Sucesso sem conteúdo          | DELETE bem-sucedido                             |
| 400    | Erro de validação             | DTO inválido, body malformado                   |
| 401    | Não autenticado               | Sem JWT ou JWT inválido                         |
| 403    | Autenticado mas sem permissão | AGENT tenta DELETE que só ADMIN faz             |
| 404    | Recurso não encontrado        | ID não existe ou não pertence ao tenant         |
| 409    | Conflito de estado            | Aceitar ticket já aceito, email duplicado       |
| 410    | Recurso "morto"               | Tentar usar refresh token revogado              |
| 422    | Validação semântica           | Regra de negócio violada (raro, geralmente 409) |
| 429    | Rate limit                    | Muitas tentativas de login                      |
| 500    | Erro interno                  | Bug, exception não tratada                      |
| 502    | Erro de upstream              | Gupshup retornou 5xx                            |
| 503    | Indisponibilidade temporária  | Maintenance mode                                |

---

## Hierarquia de exceções

Usamos exceções padrão do NestJS. Quando precisar customizar, estender as do NestJS.

```typescript
import {
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  InternalServerErrorException,
} from '@nestjs/common';
```

**Exceções customizadas** (criadas em `src/common/exceptions/`):

```typescript
export class TicketNotPendingException extends ConflictException {
  constructor(ticketId: string) {
    super(`Ticket ${ticketId} já foi aceito ou não está pendente`);
  }
}

export class WhatsappWindowExpiredException extends ConflictException {
  constructor() {
    super('Conversa fora da janela de 24h. Envie um template HSM.');
  }
}

export class CompanyTrialExpiredException extends ForbiddenException {
  constructor() {
    super('Período de avaliação expirou. Faça upgrade do plano.');
  }
}
```

---

## Formato de resposta de erro

Todas as respostas de erro seguem o mesmo formato (definido em `AllExceptionsFilter`):

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Ticket #12345 já foi aceito por outro atendente",
  "path": "/tickets/abc-123/accept",
  "timestamp": "2026-04-27T15:30:00.000Z",
  "requestId": "req_xyz789"
}
```

**Para erros de validação (400)**, formato detalhado por campo:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validação falhou",
  "errors": [
    {
      "field": "email",
      "message": "Email inválido",
      "code": "invalid_format"
    },
    {
      "field": "password",
      "message": "Senha deve ter no mínimo 8 caracteres",
      "code": "min_length"
    }
  ],
  "path": "/users",
  "timestamp": "2026-04-27T15:30:00.000Z",
  "requestId": "req_xyz789"
}
```

---

## Onde lançar exceções

### Domain Service

Lança exceções de **regras de negócio**:

```typescript
async accept(ticketId: string, companyId: string, userId: string, tx) {
  const updated = await tx.ticket.updateMany({
    where: { id: ticketId, companyId, status: 'PENDING', assignedUserId: null },
    data: { status: 'OPEN', assignedUserId: userId },
  });

  if (updated.count === 0) {
    // 409 — ticket já aceito (regra de negócio)
    throw new TicketNotPendingException(ticketId);
  }

  return tx.ticket.findFirstOrThrow({ where: { id: ticketId, companyId } });
}
```

### Application Service

Lança exceções de **autorização** e **orquestração**:

```typescript
async accept(ticketId: string, companyId: string, userId: string) {
  const user = await this.usersDomainService.findById(userId, companyId);

  if (!user.active) {
    throw new ForbiddenException('Usuário inativo não pode aceitar tickets');
  }

  // ... orquestra resto
}
```

### Controller

**Geralmente NÃO lança exceções**. Schemas Zod (via `ZodValidationPipe` do `nestjs-zod`) lançam 400 automaticamente. Outras exceções vêm de services.

Exceções no controller só pra coisas HTTP-específicas:

```typescript
@Get(':id')
async getTicket(
  @Param('id') id: string,
  @CurrentCompany() companyId: string,
) {
  if (!isUUID(id)) {
    throw new BadRequestException('ID inválido');
  }
  return this.ticketsApplicationService.findById(id, companyId);
}
```

---

## Mensagens de erro

### Boas mensagens

- **Em pt-BR**
- **Específicas** — diz o que está errado
- **Acionáveis** — diz o que fazer (quando aplicável)
- **Sem detalhes técnicos** — sem nomes de tabela, IDs UUID, stack trace
- **Sem revelar dados sensíveis** — sem confirmar/negar existência de usuário em erro de login

**Exemplos:**

```
✅ "Ticket #12345 já foi aceito por outro atendente"
✅ "Email já cadastrado neste tenant"
✅ "Conversa fora da janela de 24h. Envie um template HSM."
✅ "Departamento com tickets abertos não pode ser excluído"
✅ "Senha incorreta"  (mesma mensagem de "usuário não existe" — não vaza info)

❌ "TicketsService.accept failed at line 47"
❌ "Validation error in field assignedUserId at column FK_tickets_users"
❌ "Email rodrigo@exemplo.com não existe"  (vaza informação)
❌ "Internal server error"  (sem contexto)
```

### Mensagens por contexto

**Auth:**
- 401 (sem token): `"Autenticação necessária"`
- 401 (token inválido): `"Sessão expirada. Faça login novamente."`
- 403 (sem permissão): `"Você não tem permissão para esta ação"`

**Validação:**
- 400 (campo obrigatório): `"Campo {nome} é obrigatório"`
- 400 (formato): `"Email em formato inválido"`
- 400 (regra): `"Senha deve ter no mínimo 8 caracteres"`

**Recursos:**
- 404: `"{Recurso} não encontrado"` (ex: `"Ticket não encontrado"`)
- 409 (duplicado): `"Já existe um {recurso} com este {campo}"` (ex: `"Já existe um departamento com este nome"`)

**Estado:**
- 409 (estado inválido): `"Não é possível {ação} um {recurso} {estado}"` (ex: `"Não é possível fechar um ticket que não está aberto"`)

**Upstream:**
- 502 (Gupshup down): `"Erro temporário ao comunicar com WhatsApp. Tente novamente em alguns instantes."`

---

## Logs de erro

### O que logar

Todo erro 5xx **deve** ser logado. Erros 4xx são logados em `info` (não são problemas do sistema, são problemas de uso).

**Estrutura de log de erro:**

```typescript
this.logger.error({
  msg: 'Failed to accept ticket',
  error: error.message,
  stack: error.stack,
  ticketId,
  companyId,
  userId,
  requestId,
});
```

### O que NÃO logar

- Senhas (mesmo hash)
- Tokens, secrets, credenciais
- Conteúdo completo de mensagens de cidadão (LGPD)
- CPF, telefone, dados pessoais identificáveis (LGPD)
- Stack trace em logs de produção visíveis a clientes

### Sentry

Configurar Sentry pra capturar 5xx automaticamente. Contexto:
- `companyId`
- `userId` (se autenticado)
- `requestId`
- Stack trace
- Tags: `module`, `endpoint`

NÃO mandar pro Sentry: dados pessoais, senhas, tokens.

---

## Filtro global (`AllExceptionsFilter`)

Implementado em `src/common/filters/all-exceptions.filter.ts`. Função:

1. Captura **toda** exceção não-tratada
2. Formata resposta no padrão da seção "Formato de resposta"
3. Loga 5xx em Sentry
4. Loga 5xx em Pino
5. Não vaza stack trace pro cliente

Configurado globalmente em `main.ts`:

```typescript
app.useGlobalFilters(new AllExceptionsFilter(logger, sentry));
```

---

## Validação de schemas Zod

`nestjs-zod` provê `ZodValidationPipe` que valida input automaticamente. Configurar globalmente:

```typescript
// main.ts
import { ZodValidationPipe } from 'nestjs-zod';

app.useGlobalPipes(new ZodValidationPipe());
```

Quando schema falha, lança `ZodValidationException` (estende `BadRequestException`) com erros detalhados. Configurar exception filter para formatar a resposta:

```typescript
// src/common/filters/zod-exception.filter.ts
import { ZodValidationException } from 'nestjs-zod';

@Catch(ZodValidationException)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: ZodValidationException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const zodError = exception.getZodError();

    response.status(400).json({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validação falhou',
      errors: zodError.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      })),
      path: ctx.getRequest().url,
      timestamp: new Date().toISOString(),
      requestId: ctx.getRequest().id,
    });
  }
}
```

Aplicar globalmente:
```typescript
app.useGlobalFilters(new AllExceptionsFilter(), new ZodExceptionFilter());
```

**Mensagens de erro em pt-BR:** Zod permite customizar mensagens nos schemas:

```typescript
const CreateUserSchema = z.object({
  email: z.string().email('Email em formato inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  name: z.string().min(2, 'Nome deve ter no mínimo 2 caracteres'),
});
```

Para configurar mensagens em pt-BR como default global (sem precisar repetir em cada schema), usar `zod-i18n-map` ou customizar `errorMap` global do Zod.

---

## Casos especiais

### Erros de canal externo (Gupshup, etc)

Wrap em exception específica:

```typescript
try {
  return await this.gupshupClient.sendMessage(params);
} catch (error) {
  if (error.response?.status >= 500) {
    throw new BadGatewayException('Erro temporário no WhatsApp. Tente novamente.');
  }
  if (error.response?.status === 429) {
    throw new ServiceUnavailableException('Limite de envio temporário. Aguarde 1 minuto.');
  }
  throw new InternalServerErrorException('Falha ao enviar mensagem');
}
```

### Erros em workers BullMQ

Workers retomam jobs falhados automaticamente (3 tentativas, backoff exponencial). Após esgotar:

- Log em Sentry com payload completo
- Fica em "failed jobs" do Bull Board
- Admin pode re-enfileirar manualmente

```typescript
@Processor('send-message')
export class SendMessageProcessor {
  @Process()
  async handle(job: Job) {
    try {
      await this.sendMessage(job.data);
    } catch (error) {
      this.logger.error({
        msg: 'Send message failed',
        jobId: job.id,
        attemptsMade: job.attemptsMade,
        error: error.message,
        ...job.data,
      });
      throw error;  // re-lança para BullMQ retentar
    }
  }
}
```

### Erros em transações

Se falhar dentro de `prisma.$transaction`, rollback automático. Captura no nível do application service:

```typescript
try {
  await this.prisma.$transaction(async (tx) => {
    // ... múltiplas operações
  });
} catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {  // unique constraint
      throw new ConflictException('Recurso duplicado');
    }
  }
  throw error;
}
```

---

## Checklist de PR

Antes de mergear PR que toque em código de erro:

- [ ] Toda exceção lançada usa NestJS exception classes (ou customizadas que estendem)
- [ ] Mensagens em pt-BR
- [ ] Códigos HTTP corretos conforme tabela
- [ ] Sem `console.log` ou `console.error` (usar logger)
- [ ] Sentry capturado para 5xx (config global, não precisa em cada lugar)
- [ ] Sem dados sensíveis em logs
- [ ] Frontend tem teste/feedback pro erro (toast, inline, etc)