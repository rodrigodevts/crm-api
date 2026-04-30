# CLAUDE.md — `src/modules/bot-engine/`

> Regras específicas do Bot Engine. **Diferencial estratégico do produto.**

---

## Antes de modificar este módulo

**LEIA:** `crm-specs/audits/audit-05-bot-fluxo.md` (audit principal)

E também: `crm-specs/areas/05b-bot-fluxo-caso-real.md` (caso real do cliente Jequié)

---

## Princípio central

Bot Engine **resolve lógica conversacional internamente**. APIs externas (Gupshup, prefeitura) só fazem o que é externo. **Nunca formatam respostas para WhatsApp** — isso é responsabilidade do bot.

Isso é o oposto do que Izing faz (que terceiriza tudo pra API custom). Nosso diferencial.

---

## Arquitetura de execução

```
IncomingMessageProcessor (worker)
   ↓
Existe FlowExecution ativa para o ticket?
   ├── Sim → BotEngine.continueExecution(flowExecutionId, input)
   └── Não → BotEngine.startNewExecution(flowId, ticketId)

BotEngine.process():
   1. Resolve current node
   2. Avalia globalIntents (interrupção)
   3. Executa node executor específico
   4. Atualiza context + history
   5. Determina próximo node
   6. Persiste FlowExecution
   7. Emite eventos Socket.IO
```

---

## Tipos de node MVP (Fase 3a)

Implementar como executors separados (strategy pattern):

```
src/modules/bot-engine/services/executors/
├── start-node.executor.ts
├── end-node.executor.ts
├── send-message-node.executor.ts
├── capture-node.executor.ts          # com validators
├── menu-node.executor.ts
├── condition-node.executor.ts        # JSONLogic
├── set-variable-node.executor.ts
├── api-request-node.executor.ts      # crítico
├── transfer-node.executor.ts
├── delay-node.executor.ts
└── loop-node.executor.ts             # render dinâmico de listas
```

Interface comum:

```typescript
interface NodeExecutor<TNode extends ChatFlowNode> {
  execute(
    node: TNode,
    context: ExecutionContext,
    input?: InboundMessage,
  ): Promise<NodeExecutionResult>;
}
```

Resultado:

```typescript
type NodeExecutionResult =
  | { kind: 'continue'; nextNodeId: string; contextUpdates?: Partial<Context> }
  | { kind: 'wait_for_input'; contextUpdates?: Partial<Context> }
  | { kind: 'wait_delay'; resumeAt: Date }
  | { kind: 'transfer'; departmentId?: string; userId?: string }
  | { kind: 'end'; closeTicket: boolean; closeReasonId?: string }
  | { kind: 'error'; message: string; nextNodeId?: string };
```

---

## Validators built-in (capture node)

Implementação de cada como função pura:

```typescript
type Validator =
  | { type: 'cpf' }
  | { type: 'cnpj' }
  | { type: 'cpf_or_cnpj' }
  | { type: 'email' }
  | { type: 'phone'; format?: 'BR' | 'E164' }
  | { type: 'url' }
  | { type: 'number'; min?: number; max?: number; integer?: boolean }
  | { type: 'date'; format?: string; min?: string; max?: string }
  | { type: 'length'; min?: number; max?: number }
  | { type: 'regex'; pattern: string; flags?: string }
  | { type: 'enum'; values: string[]; caseSensitive?: boolean }
  | { type: 'custom_api'; credentialId: string; endpoint: string };
```

Cada validator retorna `{ valid: boolean; cleanedValue?: any; errorMessage?: string }`.

**CPF:** valida dígitos verificadores, retorna sem máscara em `cleanedValue`.
**CNPJ:** idem.
**Phone:** parsing E.164 via libphonenumber.

---

## Variáveis built-in

Sempre disponíveis no contexto:

```
{{contact.id}}, {{contact.name}}, {{contact.phoneNumber}}, {{contact.email}}
{{contact.tags}}, {{contact.customFields.X}}, {{contact.walletUser.name}}

{{ticket.id}}, {{ticket.protocol}}, {{ticket.department.name}}
{{ticket.assignedUser.name}}

{{company.id}}, {{company.slug}}, {{company.name}}, {{company.timezone}}

{{message.content}}, {{message.type}}

{{datetime.now}}, {{datetime.today}}, {{datetime.weekday}}
{{datetime.greeting}}     ← bom dia / boa tarde / boa noite

{{flow.attempt}}, {{flow.startedAt}}, {{flow.previousNode}}
```

Variáveis customizadas: `{{var.cpf}}`, `{{var.boletoUrl}}` etc — declaradas no fluxo.

Resolver implementa via `TemplateRenderer` compartilhado com Quick Replies, mensagens de fechamento, etc.

---

## API Request node (crítico)

Resolve gap principal do Izing. Implementação detalhada:

```typescript
type ApiRequestNode = {
  id: string;
  type: 'api_request';
  credentialId?: string;          // ref a BotCredential, null se sem auth
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;                    // suporta {{ var }}
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: any;
  timeout: number;                // ms, default 30000
  retry: {
    maxAttempts: number;          // default 3
    backoffMs: number;
    retryOnStatuses: number[];    // default [502, 503, 504, 'timeout']
  };
  responseMapping: {
    [variableName: string]: string;  // JSONPath ou expression
  };
  onSuccess: { nextNodeId: string };
  onError: {
    onTimeout?: { nextNodeId: string; message?: string };
    onClientError?: { nextNodeId: string; message?: string };  // 4xx
    onServerError?: { nextNodeId: string; message?: string };  // 5xx
    onParsingError?: { nextNodeId: string; message?: string };
    onAnyError?: { nextNodeId: string; message?: string };
  };
};
```

**Cada caminho de erro tem mensagem específica.** Não usar mensagem genérica.

---

## Loop node (render dinâmico)

Resolve gap arquitetural crítico (`data.message` pré-formatada da API).

```typescript
type LoopNode = {
  id: string;
  type: 'loop';
  arraySource: string;          // "var.boletos" ou caminho JSON
  itemVariableName: string;     // "item" → acessa via {{item.X}}
  body: ChatFlowNode[];         // sub-fluxo executado por item
  emptyHandler?: { nodeId: string };
};
```

Caso de uso típico: API retorna `{ data: { boletos: [...] } }`. Loop itera e renderiza lista interativa do WhatsApp com cada item como entrada.

---

## GlobalIntent (interrupção)

Avaliados **antes** das condições locais em qualquer node aguardando input.

```typescript
type GlobalIntent = {
  id: string;
  name: string;             // "voltar_menu_principal"
  triggers: {
    keywords?: string[];    // case-insensitive, normalizado
    regex?: string;
  };
  action:
    | { type: 'jump_to_node'; nodeId: string }
    | { type: 'restart_flow' }
    | { type: 'end_flow' }
    | { type: 'transfer'; departmentId?: string; userId?: string };
  enabled: boolean;
};
```

Resolve gambiarra de "replicar Voltar/Sair em cada node".

---

## FlowExecution states

```typescript
enum FlowExecutionStatus {
  RUNNING               // executando síncronamente
  WAITING_FOR_INPUT     // aguardando mensagem do contato
  WAITING_FOR_API       // aguardando resposta API (deve ser raro)
  WAITING_DELAY         // node delay
  COMPLETED             // chegou em node end normalmente
  FAILED                // erro fatal
  ABORTED               // atendente humano assumiu
}
```

---

## Aborto pelo atendente humano

`Ticket.assignedUserId` mudou (atribuição manual ou aceite) → `BotEngine.abort(flowExecutionId, "Human took over")`. Bot para imediatamente.

Implementação: listener de evento `ticket.accepted` ou `ticket.assigned` chama abort.

---

## Validação automática do fluxo

Antes de salvar/ativar `ChatFlow.active=true`, backend valida:

- Todo node tem caminho a partir de `start`
- Sem ciclos infinitos detectáveis (sem `delay`/`wait`)
- Toda variável usada em `{{var.X}}` está declarada
- Toda referência a `nodeId` é válida
- Toda transferência tem destino válido (department/user existente e ativo)
- Toda condição tem ramo `default` ou cobertura completa
- `BotCredential` referenciada existe e está ativa

Validação retorna lista de problemas (errors + warnings). Erros bloqueiam ativação.

Implementar em `chat-flow-validator.domain.service.ts`.

---

## Cifragem de credenciais

`BotCredential.config: Bytes` cifrado AES-256-GCM com `CHANNEL_CONFIG_ENCRYPTION_KEY` (mesma chave de `ChannelConnection.config`).

Mascaramento por padrão. Endpoint dedicado de revelação. Audit log obrigatório.

---

## Wait/resume com BullMQ

`bot-resume-delays` worker recorrente (30s) busca `FlowExecution.status = WAITING_DELAY` E `resumeAt < now()`, retoma execução.

Para `WAITING_FOR_API` (raro), considerar timeout: se passou X minutos sem resposta, marca como `FAILED` com erro.

---

## Testes obrigatórios

- Unit de cada `*-node.executor.ts` (testar cada tipo)
- Unit de validators (CPF, CNPJ, email, etc) com casos válidos e inválidos
- Unit de `chat-flow-validator.domain.service.ts` cobrindo todos os casos de erro
- Integration do `BotEngine` com FlowExecution simulada
- E2E: webhook entrante → bot atende → transferência funciona

---

## Performance

Cada node `api_request` pode demorar. Para evitar bloquear webhook entrante:

- `process-incoming` worker enfileira `bot-execute` job
- `bot-execute` worker chama `BotEngine.process()` (síncrono dentro do job, mas async em relação ao webhook)

Frontend mostra "Bot processando..." enquanto isso (via Socket.IO).