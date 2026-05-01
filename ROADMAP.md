# ROADMAP.md

> Plano de fases do projeto. Atualize ao terminar cada fase ou quando o escopo mudar.
>
> **Versão:** 6 (stack atualizada: Fastify + Zod + Scalar + Kubb)
> **Última atualização:** 27/04/2026
>
> **Documento companheiro:** `ARCHITECTURE.md` v6.

---

## Sumário

<!-- prettier-ignore -->
1. Premissas
2. Critério de "fase pronta"
3. Mapa geral de fases
4. Dependências entre fases
5-14. Fases 0-9
15. Fase futura — IA
16. Rastreamento

---

## 1. Premissas

- Dev solo, ~3h/dia × 6 dias/semana
- Sem prazo apertado (parceria atual continua atendendo clientes)
- Filosofia médio-termo: bem feito, focado no essencial
- Cada fase deve ser entregável e testável end-to-end antes da próxima
- Estimativas em semanas são chutes calibrados, não promessas
- **Arquitetura formal de 3 camadas** (controller + application service + domain service) aplicada em todos os módulos. Estimativas consideram este overhead.

---

## 2. Critério de "fase pronta"

1. Código funcionando em ambiente de desenvolvimento
2. Testes passando (unit nos domain services + e2e nos fluxos principais)
3. Deploy em staging validado
4. Documentação atualizada (`ARCHITECTURE.md` se houver mudança arquitetural)
5. ADR registrado se houve decisão arquitetural significativa
6. Validação manual end-to-end conforme checklist da fase

---

## 3. Mapa geral de fases

| #   | Nome                                                   | Estimativa             | Status     |
| --- | ------------------------------------------------------ | ---------------------- | ---------- |
| 0   | Fundação + gerador de boilerplate de 3 camadas         | 5-6 semanas            | aguardando |
| 1   | Canal Gupshup + mensagens + auto-close + templates HSM | 4-5 semanas            | aguardando |
| 2   | Tickets + atendimento + composer HSM                   | 5-6 semanas            | aguardando |
| 3a  | Bot Engine + mensageria rica completa                  | 6-8 semanas            | aguardando |
| 3b  | Bot avançado                                           | 4-5 semanas            | aguardando |
| 4   | Polimento, CSAT, telas auxiliares                      | 4-5 semanas            | aguardando |
| 5   | Disparos em massa + webhooks + API push                | 5-6 semanas            | aguardando |
| 6   | Builder visual de fluxo                                | 4-5 semanas            | aguardando |
| 7   | Baileys (canal não-oficial)                            | 3-4 semanas            | aguardando |
| 8   | Migração dos clientes existentes                       | variável (2-4 semanas) | aguardando |

**Estimativa total:** 42-54 semanas até produção comercial completa (~10-13 meses).

> **Nota sobre estimativas:** ajustadas em ~15% pra cima vs versão anterior, pra refletir o overhead da arquitetura de 3 camadas. Investimento em consistência cobra preço em código, mas paga em manutenção e clareza.

---

## 4. Dependências entre fases

```
Fase 0 (Fundação + gerador 3 camadas)
   ↓
Fase 1 (Canal + Templates HSM + Auto-close)
   ↓
Fase 2 (Tickets + UI completa) ←─── depende de Templates HSM da Fase 1
   ↓
Fase 3a (Bot Engine + mensageria rica) ←─── depende de BusinessHoursService da Fase 0
   ↓
Fase 3b (Bot avançado)
   ↓
Fase 4 (CSAT + IntegrationLink + Holidays)
   ↓
Fase 5 (Campanhas + Webhooks + API Push) ←─── PRÉ-REQUISITO da Fase 8
   ↓
Fase 6 (Builder visual) ────┐
                            │  podem rodar em paralelo
Fase 7 (Baileys) ───────────┘
   ↓
Fase 8 (Migração) ←─── REQUER Fase 5 completa
   ↓
Fase 9+ (Backlog, IA quando priorizada)
```

---

## 5. Fase 0 — Fundação + gerador 3 camadas (5-6 semanas)

**Objetivo:** Setup completo, infraestrutura, auth, schema do núcleo, **gerador de boilerplate de 3 camadas**.

### Setup

- [ ] Repos `crm-api` e `crm-web` no GitHub sob AGPLv3
- [ ] Repo `crm-specs` privado
- [ ] CI/CD básico (GitHub Actions)
- [ ] Docker Compose: postgres + redis + minio
- [ ] Backend NestJS 11 + **Fastify adapter** (`@nestjs/platform-fastify`)
- [ ] **Zod + nestjs-zod** configurado (ZodValidationPipe global, ZodExceptionFilter)
- [ ] **OpenAPI + Scalar** configurado em `/api/v1/docs` (UI) e `/api/v1/openapi` (JSON)
- [ ] TypeScript estrito (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- [ ] Frontend Next.js 15 + Tailwind + shadcn/ui
- [ ] **Kubb configurado no `crm-web`** (`kubb.config.ts`, comando `pnpm generate:api`)
- [ ] Pipeline de geração de tipos do frontend testada com endpoint dummy

### Gerador de boilerplate (3 camadas) — NOVO

- [x] Schematic customizado em `crm-api/schematics/`
- [x] Comando `pnpm g:feature <nome>` (alias) ou `pnpm nest g --collection ./schematics/collection.json feature <nome>` cria:
  - `feature.module.ts`
  - `controllers/feature.controller.ts` (5 endpoints CRUD com `NotImplementedException`)
  - `services/feature.application.service.ts` (5 métodos placeholder)
  - `services/feature.domain.service.ts` (5 métodos placeholder, assinaturas com `companyId`)
  - `schemas/create-feature.schema.ts`, `update-feature.schema.ts`, `feature-response.schema.ts` (Zod placeholders com TODO)
  - `tests/feature.domain.service.spec.ts` + `tests/feature.controller.e2e-spec.ts` (vitest, com `it.skip` placeholder)
- [x] Atualização automática de `src/app.module.ts` (import + entrada em `imports: [...]`)
- [x] Documentação de uso em `crm-api/README.md` e `crm-api/CONTRIBUTING.md`

### Schema do núcleo (Prisma)

**Entidades base:**

- [ ] `Plan`, `Company`, `CompanySettings` (13 flags incluindo `hideBotTicketsFromAgents`)
- [ ] `User` (4 perfis), `RefreshToken`
- [ ] `Department` (workingHours, SLA, distributionMode preparados)

**Cadastros:**

- [ ] `Tag` (com scope), `QuickReply` (escopo COMPANY/PERSONAL)
- [ ] `CloseReason` + `CloseReasonDepartment`
- [ ] `SalesFunnel`, `LeadStatus`
- [ ] `CustomFieldDefinition` (8 tipos, schema preparado)
- [ ] `BusinessHoliday` (schema preparado, fase 4+)

**Integrações (schema apenas):**

- [ ] `IntegrationLink`, `MessageTemplate`, `BotCredential`, `WebhookSubscription`, `WebhookDelivery`

**Auditoria:**

- [ ] `AuditLog`

### Auth (estrutura 3 camadas)

- [ ] Módulo `auth/` com 3 camadas
- [ ] Register, login, refresh, force-logout
- [ ] Decorators `@CurrentUser`, `@CurrentCompany`
- [ ] Hierarquia de roles

### Services foundationais

- [ ] `BusinessHoursService` (`isOpen()`, `nextOpenAt()`)
- [ ] `TemplateRenderer` (variáveis nomeadas)
- [ ] `EncryptionService` (AES-256-GCM com env var `CHANNEL_CONFIG_ENCRYPTION_KEY`)

### CRUD básico (estrutura 3 camadas em todos)

- [ ] Companies (apenas SUPER_ADMIN)
- [ ] Users (com force-logout)
- [ ] Departments (com working hours)
- [ ] Tags (com escopo)
- [ ] CloseReasons (com reorder)
- [ ] CompanySettings (PATCH único)

### Frontend

- [ ] Tela login + register
- [ ] Layout base Izing-like
- [ ] Páginas dummy de Atendimentos
- [ ] Telas básicas de Configurações

### Documentação

- [ ] `ARCHITECTURE.md` na raiz (cópia da v5)
- [ ] `ROADMAP.md` na raiz (cópia da v5)
- [ ] `CLAUDE.md` na raiz (instruções pro Claude Code)
- [ ] `README.md` com setup local
- [ ] Pasta `docs/integrations/` criada (vazia, preenchida em Fase 1)
- [ ] Pasta `docs/chatwoot-reference/` criada (opcional)
- [ ] Diretrizes de PR no `CONTRIBUTING.md` (anti-checks de multi-tenant)

### Deploy

- [ ] Staging em K8s (mais simples possível: GKE Autopilot, EKS, etc)

### Validação manual

- Criar Company via SUPER_ADMIN → registrar primeiro ADMIN
- ADMIN cria Departments, Users, Tags, CloseReasons usando 3 camadas em todos
- Gerar feature nova com `pnpm g:feature exemplo` e ver estrutura completa + `app.module.ts` atualizado
- Force-logout funciona em até 15min

### Anti-objetivos

- Não implementar canais ainda
- Não implementar tickets/mensagens

---

## 6. Fase 1 — Canal Gupshup + auto-close + templates HSM (4-5 semanas)

**Objetivo:** Canal Gupshup operacional end-to-end. Receber e enviar mensagens, com auto-close e templates HSM.

> **Pré-requisitos:** Fase 0 completa.

### Documentação Gupshup (NOVO)

- [ ] Criar `crm-api/docs/integrations/gupshup.md`
- [ ] Documentar formato de webhook entrante (request body, headers, assinatura)
- [ ] Documentar API de envio (text, image, video, audio, document, interactive_buttons, interactive_list, interactive_cta_url, template)
- [ ] Documentar API de listagem de templates HSM
- [ ] Documentar códigos de erro
- [ ] Capturar exemplos JSON reais (anonimizados) em `docs/integrations/gupshup-webhook-payloads/`
- [ ] Linkar doc oficial: https://docs.gupshup.io/

### Schema adicional

- [ ] `ChannelConnection` (config cifrado, defaults, inactivity)
- [ ] `Contact` (com walletUserId, defaultUserId, defaultDepartmentId, customFields, email, leadStatusId)
- [ ] `Message` (mínimo viável)
- [ ] `Ticket` (mínimo viável — refinamento na Fase 2)

### Channel Adapter

- [ ] Interface `ChannelAdapter` com capability flags
- [ ] `GupshupAdapter` completo (3 camadas: controller webhook → application service → domain service)
- [ ] `EncryptionService` integrado para `ChannelConnection.config`

### Módulo `channels` (3 camadas completas)

- [ ] CRUD com mascaramento
- [ ] POST `/reveal-credentials` (apenas ADMIN, audit log)
- [ ] POST `/activate`, `/deactivate`, `/restart`

### Módulo `message-templates` (3 camadas)

- [ ] Endpoint `POST /channels/:id/templates/sync` (manual)
- [ ] Worker BullMQ recorrente `sync-templates`
- [ ] `GET /channels/:id/templates`
- [ ] Service `HsmTemplateRenderer` (sintaxe numerada)

### Webhook entrante

- [ ] `POST /webhooks/channel/:id` com verificação HMAC-SHA256
- [ ] Worker BullMQ `process-incoming` (3 camadas)
  - Aplica `CompanySettings.ignoreGroupMessages`
  - Aplica `BusinessHoursService.isOpen()` em ticket sem bot

### Workers BullMQ

- [ ] `process-incoming`
- [ ] `send-message`
- [ ] `download-media`
- [ ] `auto-close-inactive-tickets` (recorrente)
- [ ] `sync-templates` (recorrente)

### Realtime

- [ ] Socket.IO + Redis adapter setup
- [ ] Evento `channel:status`

### Frontend

- [ ] Tela de configuração de canal
- [ ] Mascaramento de credenciais com botão "Revelar para editar"
- [ ] Card de canal com status em tempo real
- [ ] Tela básica de mensagens recebidas (validação)

### Observabilidade

- [ ] Logs Pino com `companyId`, `connectionId`, `messageId`
- [ ] Métricas Prometheus básicas

### Validação manual end-to-end

1. Cadastrar canal Gupshup, conectar
2. Sincronizar templates HSM
3. Receber mensagem real, ver Message criada
4. Ticket criado em `defaultDepartmentId`
5. Mensagem fora do horário com bot: bot processa
6. Mensagem fora do horário sem bot: aplica working hours
7. Ticket inativo é fechado pelo worker (`resolvedBy=SYSTEM`)
8. Audit log registra após `reveal-credentials`

---

## 7. Fase 2 — Tickets e atendimento (5-6 semanas)

**Objetivo:** Ticketing completo com UI Izing-like + composer HSM + pin/ordenação + visibilidade de bot.

### Schema refinado

- [ ] `Ticket` completo (com protocol, lastInboundAt, closeReasonId, inWhatsappWindow, isBot, resolvedBy)
- [ ] `Message` completa (sentByUserId, sentByBot, isSystemMessage, replacesMessageId, metadata)
- [ ] `MessageAttachment`
- [ ] `TicketLog` com 18 ações
- [ ] `TicketTag` com `addedByUserId`
- [ ] `CompanyTicketProtocolSequence`
- [ ] `UserTicketPreference` (pin + queueSortOrder)
- [ ] `CompanySettings.hideBotTicketsFromAgents`

### Módulo `tickets` (3 camadas completas)

**Domain services:**

- [ ] `tickets.domain.service.ts` (state machine)
- [ ] `ticket-log.domain.service.ts` (logging append-only)
- [ ] `ticket-protocol.domain.service.ts` (geração transacional)

**Application service:**

- [ ] `tickets.application.service.ts` (orquestração de aceitar, transferir, fechar, reabrir, etc)

**Endpoints (controller):**

- [ ] Listar com WHERE complexo + 12+ flags
- [ ] CRUD básico cursor pagination
- [ ] Aceitar (lock otimista)
- [ ] Transferir (depto e/ou user)
- [ ] Retornar ao departamento
- [ ] Fechar (com motivo, observação, dealValue, calcula resolvedBy)
- [ ] Reabrir (apenas ADMIN/SUPERVISOR)
- [ ] Aplicar tags (validar scope)
- [ ] Marcar mensagens como lidas (manual, sem read receipt automático)
- [ ] Iniciar bot manual (gancho, execução real na 3a)

### Módulo `user-ticket-preferences` (3 camadas)

- [ ] GET/PATCH `/me/ticket-preferences`
- [ ] POST/DELETE `/tickets/:id/pin`

### Módulo `messages` (3 camadas)

- [ ] Endpoint POST polimórfico por tipo
- [ ] Upload de anexo separado (`POST /attachments/upload`)
- [ ] Composer HSM com preview de variáveis em tempo real
- [ ] Quick reply com renderização em runtime
- [ ] Status de mensagem via webhook Gupshup

### Janela 24h

- [ ] Cálculo no entrante
- [ ] Worker recorrente `recalc-whatsapp-window`
- [ ] Composer alterna conforme `inWhatsappWindow`

### Realtime

- [ ] Salas company/user/ticket/department
- [ ] Eventos completos
- [ ] **Modo busca isolado** (resolve bug do sistema atual)

### UI Izing-like

- [ ] Sidebar de fila com 3 abas + virtualização
- [ ] Dropdown "Ordenar por" (4 opções)
- [ ] Visual ticket pinned + seção Fixados
- [ ] Menu do card com Fixar/Desfixar
- [ ] Filtro avançado com toggle "Em fluxo de bot"
- [ ] Header polimórfico
- [ ] Composer livre + HSM com preview
- [ ] Painel lateral 5 abas (Info, Custom Fields, Funil, ChatBot manual, Histórico)
- [ ] Modais: Iniciar atendimento, Transferir, Resolver, Editar Contato

### Validação manual end-to-end

16 cenários conforme audit-06 v2 (cliente envia, atendente aceita, transfere, fecha, etc).

### Risco principal

Race conditions em aceite/transferência. Mitigado com lock otimista + testes de concorrência.

---

## 8. Fase 3a — Bot Engine + mensageria rica (6-8 semanas)

**Objetivo:** Bot funcional com paridade Izing + mensageria rica WhatsApp completa + API HTTP elevada + validações nativas.

### Schema

- [ ] `ChatFlow` expandido
- [ ] `BotCredential` cifrada (já preparada Fase 0)
- [ ] `FlowExecution` com history e context
- [ ] `Ticket.flowExecutionId` adicionado

### Módulo `chat-flows` (3 camadas)

**Domain services:**

- [ ] `chat-flows.domain.service.ts` (CRUD, validação)
- [ ] `flow-execution.domain.service.ts` (state machine de execução)
- [ ] `chat-flow-validator.domain.service.ts` (validação automática)

**Application service:**

- [ ] `chat-flows.application.service.ts`

### Módulo `bot-engine` (3 camadas)

**Domain services:**

- [ ] `bot-engine.domain.service.ts` (orquestração de execução)
- [ ] Node executors em domain services dedicados (um por tipo):
  - [ ] `start-node.executor.ts`, `end-node.executor.ts`
  - [ ] `send-message-node.executor.ts`
  - [ ] `capture-node.executor.ts`
  - [ ] `menu-node.executor.ts`
  - [ ] `condition-node.executor.ts`
  - [ ] `set-variable-node.executor.ts`
  - [ ] `api-request-node.executor.ts`
  - [ ] `transfer-node.executor.ts`
  - [ ] `delay-node.executor.ts`
  - [ ] `loop-node.executor.ts`
- [ ] Expression engine baseada em JSONLogic
- [ ] Variáveis tipadas e contexto rico
- [ ] Validators built-in (cpf, cnpj, email, phone, etc)
- [ ] GlobalIntent evaluation

### Módulo `bot-credentials` (3 camadas)

- [ ] CRUD com mascaramento e revelação (audit log)

### Mensageria rica WhatsApp

- [ ] Tipos: text, image, video, audio, document, location, contact_card, sticker
- [ ] Interactive buttons, list, CTA URL
- [ ] Template HSM com variáveis numeradas
- [ ] Render dinâmico via `loop` node

### API HTTP elevada

- [ ] Node `api_request` com retry policy
- [ ] Response mapping JSONPath
- [ ] Tratamento granular de erros
- [ ] Referência a `BotCredential` por nome

### Workers BullMQ

- [ ] `bot-execute` (sob demanda)
- [ ] `bot-resume-delays` (recorrente)

### UI editor JSON estruturado

- [ ] Tela de lista de fluxos
- [ ] Editor com painéis (árvore + form tipado por tipo + validação)
- [ ] CRUD de `BotCredential`
- [ ] Modal/painel de simulador (mínimo viável)

### Aplicação no painel lateral

- [ ] Aba "ChatBot manual" funcional
- [ ] Indicador "Bot rodando" + botão "Parar bot"

### Validação manual

9 cenários conforme audit-05 (cliente "oi" → bot atende, valida CPF, chama API, renderiza lista, etc).

---

## 9. Fase 3b — Bot avançado (4-5 semanas)

**Objetivo:** Templates de fluxo, simulador completo, novos tipos de node.

### Novos tipos de node

- [ ] `subflow`, `schedule`, `branch_jump`, `webhook_trigger`

### Templates e reuso

- [ ] Schema `ChatFlowTemplate` (GLOBAL e TENANT)
- [ ] Templates iniciais GLOBAL: 2ª via IPTU, agendamento, consulta protocolo, FAQ, triagem
- [ ] UI marketplace de templates
- [ ] Ação "Criar fluxo a partir de template"

### Simulador completo

- [ ] Endpoint `POST /chat-flows/:id/simulate`
- [ ] UI inline com step-by-step
- [ ] Mock de respostas de API
- [ ] Visualização de variáveis a cada step

### Triggers avançados

- [ ] Trigger por evento (LEAD_STATUS_CHANGED, CONTACT_TAGGED)
- [ ] Trigger agendado (cron-like)
- [ ] Trigger por mídia recebida

### Workers

- [ ] `bot-schedule-trigger` (recorrente)

---

## 10. Fase 4 — Polimento, CSAT, telas auxiliares, beta interno (4-5 semanas)

**Objetivo:** Produto utilizável de verdade. CSAT e Plugins entram aqui.

### CRUDs e telas (3 camadas)

- [ ] Tela de Contatos completa
- [ ] Tela de Configurações da Company
- [ ] Tela completa de Departamentos
- [ ] Tela completa de Usuários
- [ ] Tela de Quick Replies (pessoal e global)
- [ ] Tela de CustomFieldDefinition
- [ ] Tela de SalesFunnel + LeadStatus (read-only)
- [ ] Tela de IntegrationLink + UI na sidebar do ticket

### CSAT (sessão de design dedicada antes)

- [ ] Schema completo (CsatConfig, CsatSurvey, CsatResponse)
- [ ] UI de configuração
- [ ] Workflow de envio quando `CloseReason.triggersCsat=true`
- [ ] Dashboard de notas
- [ ] Aplicar timeout

### Aplicação de flags pendentes

- [ ] hidePhoneFromAgents, agentCanDeleteContacts, agentCanChangeDefaultAgent, agentCanToggleSignature

### Métricas e dashboard

- [ ] Dashboard básico (paridade com sistema atual)
- [ ] Dashboard de "tickets resolvidos por bot vs humano"

### Outros

- [ ] Reset de senha via email
- [ ] Sentry integrado
- [ ] Health check ativo de canais
- [ ] BusinessHoliday + UI
- [ ] Documentação de instalação on-premise
- [ ] Beta interno: usar produto por 1-2 semanas

---

## 11. Fase 5 — Disparos, webhooks, API push (5-6 semanas)

**Objetivo:** Campanhas + integrações de saída.

> **Pré-requisito da Fase 8.**

### Campanhas (3 camadas)

- [ ] Schema: `Campaign`, `CampaignContact`, `ContactList`, `MessageCampaign`
- [ ] Tela: criar lista, criar campanha, agendamento
- [ ] Worker `campaign-sender` com rate limiting Meta
- [ ] Tracking de status por contato
- [ ] Relatório de campanha
- [ ] Saldo Gupshup em tempo real (cache 60s)

### Webhooks de saída (3 camadas)

- [ ] CRUD de `WebhookSubscription` com geração e rotação de secret
- [ ] `WebhookDispatcher` (application service)
- [ ] Worker `webhook-delivery` com retry exponencial
- [ ] Logs de delivery
- [ ] HMAC-SHA256 obrigatório
- [ ] UI de gestão (criar, listar, ver logs, re-disparar)
- [ ] Endpoint de teste e re-delivery
- [ ] 11 eventos suportados

### API Push manual

- [ ] Botão customizável no ticket
- [ ] Reutiliza infra de delivery
- [ ] UI de configuração

---

## 12. Fase 6 — Builder visual de fluxo (4-5 semanas)

**Objetivo:** Substituir editor JSON por builder visual.

### Entregáveis

- [ ] React Flow integrado
- [ ] Canvas drag-and-drop com paleta
- [ ] Edição inline de propriedades
- [ ] Validação visual
- [ ] Salvar/carregar JSON compatível com Bot Engine
- [ ] Versionamento básico (rascunho vs publicado)
- [ ] Templates pré-prontos (Fase 3b)
- [ ] Modo compacto dos nodes

---

## 13. Fase 7 — Baileys (3-4 semanas)

**Objetivo:** Adicionar canal Baileys.

### Entregáveis

- [ ] `BaileysAdapter` (3 camadas)
- [ ] Capabilities corretas (`requiresQrAuth=true`, etc)
- [ ] Frontend renderiza dinamicamente "Rejeitar Ligações" via capabilities
- [ ] Gestão de sessão: QR code, persistência, reconexão
- [ ] Worker dedicado por ChannelConnection
- [ ] Tela de QR code
- [ ] Documentação: avisos de risco

---

## 14. Fase 8 — Migração dos clientes existentes (variável)

### Pré-requisitos

- Fase 5 completa (webhooks)
- Fases 0-4 estáveis
- Documentação on-premise pronta
- Beta interno bem testado

### Entregáveis

- [ ] Script de importação de contatos (CSV)
- [ ] Script de importação de fluxos (manual)
- [ ] Script de importação de Tags, Departments, Users, CloseReasons
- [ ] Plano de migração com janela de transição
- [ ] Documentação de operação para suporte
- [ ] Treinamento de atendentes
- [ ] Plataforma de análise interna conectada via webhook
- [ ] Período de monitoramento intensivo (2 semanas mínimo)

### Cuidados especiais

- Histórico de tickets antigos: decidir se migra
- Templates HSM: re-cadastrar no Gupshup ou re-sync
- Cidadãos não percebem (mesmo número)

---

## 15. Fase 9+ — Backlog priorizado

- Kanban completo de leads (drag-and-drop, filtros, ações em massa)
- Funil de cadência completo (`MessageCampaign`)
- Custom Fields em Tickets
- API pública com OpenAPI
- Relatórios avançados
- Versionamento completo de fluxos (rollback, diff, A/B)
- Analytics por node (dropoff, conversão, heatmap)
- App mobile (React Native)
- Multi-canal: Instagram, Facebook, Telegram
- Tenant guard automático via Prisma extension
- Reply/quote em mensagens
- Snooze de ticket
- NLU/intent classification

---

## 16. Fase futura — IA / Agente conversacional

**Status:** descartado do escopo MVP por decisão estratégica.

**Quando priorizar:**

- Após produto base validado em produção
- Com dores reais dos clientes mapeadas
- Com mercado de LLMs mais estabilizado

**Escopo a definir em sessão dedicada:** provider, casos de uso, tools customizáveis, modelagem (`AIAgent`, `AITool`, `AIToolCall`, `KnowledgeBase`), refatoração de `defaultChatFlowId`.

A arquitetura atual **não bloqueia** essa evolução.

---

## 17. Rastreamento

| Fase    | Início | Fim | Status     | Notas          |
| ------- | ------ | --- | ---------- | -------------- |
| Fase 0  | —      | —   | aguardando | —              |
| Fase 1  | —      | —   | aguardando | —              |
| Fase 2  | —      | —   | aguardando | —              |
| Fase 3a | —      | —   | aguardando | —              |
| Fase 3b | —      | —   | aguardando | —              |
| Fase 4  | —      | —   | aguardando | —              |
| Fase 5  | —      | —   | aguardando | Pré-req Fase 8 |
| Fase 6  | —      | —   | aguardando | —              |
| Fase 7  | —      | —   | aguardando | —              |
| Fase 8  | —      | —   | aguardando | Requer Fase 5  |
| Fase 9+ | —      | —   | aguardando | Backlog        |
| IA      | —      | —   | sem prazo  | —              |
