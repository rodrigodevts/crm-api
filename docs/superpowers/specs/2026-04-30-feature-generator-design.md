# Spec — Gerador de boilerplate de feature (3 camadas)

> Decisão: implementar schematic NestJS local que gera estrutura completa de módulo seguindo o padrão de 3 camadas, com atualização automática de `app.module.ts`.
>
> **Status:** aprovado em 2026-04-30
> **ROADMAP:** Fase 0 — "Gerador de boilerplate (3 camadas) — NOVO"

---

## 1. Motivação e escopo

### Por que existe

Toda feature do projeto segue a mesma estrutura de 3 camadas (ver `ARCHITECTURE.md` §3 e `src/modules/CLAUDE.md`). Sem gerador, a estrutura tende a divergir conforme novos módulos são criados manualmente — pequenos detalhes (decorators, ordem de imports, naming de arquivos) drift facilmente, mesmo com Claude Code seguindo a spec. O schematic transforma a spec em código executável, eliminando ambiguidade.

### Por que schematic NestJS (e não script Node puro)

Decisão tomada em conversa de brainstorm. Schematic NestJS:

- É a forma idiomática do framework (integra com `nest g`).
- Tem helpers de template (`applyTemplates`) que cobrem o caso de uso sem reinventar.
- 2 devDeps adicionais (`@angular-devkit/schematics`, `@angular-devkit/core`) — aprovadas explicitamente.

### Fora de escopo

- **Schema Prisma:** cada feature decide se modela entidade nova ou usa as existentes.
- **Schemas Zod com campos reais:** schemas gerados são placeholders com `// TODO`.
- **Pastas opcionais:** `events/`, `processors/` (BullMQ), `listeners/` — não geradas, criadas sob demanda.
- **Sub-features:** apenas top-level (`src/modules/<name>/`). Sem suporte a `--path` arbitrário.
- **Application service spec:** não gerado (orquestração testa-se mal isolada; testing strategy do projeto privilegia domain spec + e2e).

---

## 2. Arquitetura

```
crm-api/
├── schematics/
│   ├── collection.json                          # registry de schematics locais
│   └── feature/
│       ├── schema.json                          # validação dos args do CLI
│       ├── index.js                             # Rule principal (JS puro, sem build step)
│       └── files/                               # template tree
│           └── __name@dasherize__/
│               ├── __name@dasherize__.module.ts.template
│               ├── controllers/
│               │   └── __name@dasherize__.controller.ts.template
│               ├── services/
│               │   ├── __name@dasherize__.application.service.ts.template
│               │   └── __name@dasherize__.domain.service.ts.template
│               ├── schemas/
│               │   ├── create-__name@dasherize__.schema.ts.template
│               │   ├── update-__name@dasherize__.schema.ts.template
│               │   └── __name@dasherize__-response.schema.ts.template
│               └── tests/
│                   ├── __name@dasherize__.domain.service.spec.ts.template
│                   └── __name@dasherize__.controller.e2e-spec.ts.template
└── package.json                                 # script g:feature adicionado
```

### Por que JS puro no `index.js` (e não TS compilado)

- Schematic é ~80 linhas de código glue. Tipagem rica não traz ganho real.
- Evita criar `tsconfig.schematics.json` separado, build step, e dist directory.
- Tipos via JSDoc onde fizer diferença.
- ESLint/TS config: ajustar `eslint.config.mjs` e `tsconfig.json` pra ignorar `schematics/**`.

### Templates

- Extensão `.template`: stripada por `applyTemplates` na emissão.
- Substituição de placeholder em path/conteúdo via tokens do `@angular-devkit/schematics/strings`:
  - `__name@dasherize__` → `kebab-case`
  - `__name@classify__` → `PascalCase`
  - `__name@camelize__` → `camelCase`
- Conteúdo dos templates usa sintaxe `<%= classify(name) %>` etc. para substituições inline.

---

## 3. Conteúdo dos arquivos gerados

Para uma feature `contacts`, o schematic emite:

### `contacts.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ContactsController } from './controllers/contacts.controller';
import { ContactsApplicationService } from './services/contacts.application.service';
import { ContactsDomainService } from './services/contacts.domain.service';

@Module({
  controllers: [ContactsController],
  providers: [ContactsApplicationService, ContactsDomainService],
  exports: [ContactsApplicationService],
})
export class ContactsModule {}
```

### `controllers/contacts.controller.ts`

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  NotImplementedException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { ContactsApplicationService } from '../services/contacts.application.service';
import { CreateContactDto } from '../schemas/create-contact.schema';
import { UpdateContactDto } from '../schemas/update-contact.schema';
import { ContactResponseDto } from '../schemas/contact-response.schema';

@ApiTags('contacts')
@Controller('contacts')
export class ContactsController {
  constructor(private readonly applicationService: ContactsApplicationService) {}

  @Get()
  @ZodSerializerDto(ContactResponseDto)
  async list(): Promise<ContactResponseDto[]> {
    // TODO: extrair @CurrentCompany, paginar, chamar applicationService.list
    throw new NotImplementedException();
  }

  @Get(':id')
  @ZodSerializerDto(ContactResponseDto)
  async getById(@Param('id') _id: string): Promise<ContactResponseDto> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Post()
  @ZodSerializerDto(ContactResponseDto)
  async create(@Body() _input: CreateContactDto): Promise<ContactResponseDto> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Patch(':id')
  @ZodSerializerDto(ContactResponseDto)
  async update(
    @Param('id') _id: string,
    @Body() _input: UpdateContactDto,
  ): Promise<ContactResponseDto> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Delete(':id')
  async remove(@Param('id') _id: string): Promise<void> {
    // TODO: implementar
    throw new NotImplementedException();
  }
}
```

### `services/contacts.application.service.ts`

```typescript
import { Injectable, NotImplementedException } from '@nestjs/common';
import { ContactsDomainService } from './contacts.domain.service';

@Injectable()
export class ContactsApplicationService {
  constructor(private readonly domainService: ContactsDomainService) {}

  async list(_companyId: string): Promise<unknown> {
    // TODO: orquestrar listagem (paginação, filtros)
    throw new NotImplementedException();
  }

  async getById(_id: string, _companyId: string): Promise<unknown> {
    // TODO: orquestrar busca
    throw new NotImplementedException();
  }

  async create(_companyId: string, _input: unknown): Promise<unknown> {
    // TODO: orquestrar criação
    throw new NotImplementedException();
  }

  async update(_id: string, _companyId: string, _input: unknown): Promise<unknown> {
    // TODO: orquestrar atualização
    throw new NotImplementedException();
  }

  async remove(_id: string, _companyId: string): Promise<void> {
    // TODO: orquestrar remoção (soft delete se aplicável)
    throw new NotImplementedException();
  }
}
```

### `services/contacts.domain.service.ts`

```typescript
import { Injectable, NotImplementedException } from '@nestjs/common';

@Injectable()
export class ContactsDomainService {
  // TODO: injetar PrismaService quando criado o módulo Prisma

  async list(_companyId: string): Promise<unknown[]> {
    // TODO: tx.contact.findMany({ where: { companyId, ... } })
    throw new NotImplementedException();
  }

  async getById(_id: string, _companyId: string): Promise<unknown> {
    // TODO: tx.contact.findFirstOrThrow({ where: { id, companyId } })
    throw new NotImplementedException();
  }

  async create(_companyId: string, _input: unknown): Promise<unknown> {
    // TODO: regra de negócio + tx.contact.create
    throw new NotImplementedException();
  }

  async update(_id: string, _companyId: string, _input: unknown): Promise<unknown> {
    // TODO: regra de negócio + tx.contact.update
    throw new NotImplementedException();
  }

  async remove(_id: string, _companyId: string): Promise<void> {
    // TODO: tx.contact.update({ data: { deletedAt: new Date() } })
    throw new NotImplementedException();
  }
}
```

### `schemas/create-contact.schema.ts`

```typescript
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const CreateContactSchema = z
  .object({
    // TODO: definir campos do payload
  })
  .describe('TODO: descrever payload de criação de contact');

export class CreateContactDto extends createZodDto(CreateContactSchema) {}
```

### `schemas/update-contact.schema.ts`

```typescript
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const UpdateContactSchema = z
  .object({
    // TODO: definir campos do payload
  })
  .describe('TODO: descrever payload de atualização de contact');

export class UpdateContactDto extends createZodDto(UpdateContactSchema) {}
```

### `schemas/contact-response.schema.ts`

```typescript
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const ContactResponseSchema = z
  .object({
    id: z.string().uuid(),
    // TODO: definir campos da resposta
  })
  .describe('TODO: descrever resposta de contact');

export class ContactResponseDto extends createZodDto(ContactResponseSchema) {}
```

### `tests/contacts.domain.service.spec.ts`

```typescript
import { describe, it } from 'vitest';

describe('ContactsDomainService', () => {
  it.skip('TODO: cobrir regras de negócio do domain service', () => {
    // TODO: instanciar service com mock de Prisma e cobrir regras
  });
});
```

### `tests/contacts.controller.e2e-spec.ts`

```typescript
import { describe, it } from 'vitest';

describe('ContactsController (e2e)', () => {
  it.skip('TODO: validar isolamento multi-tenant', () => {
    // TODO: bootstrar app NestJS e validar que companyId isola
  });
});
```

---

## 4. Atualização automática do `app.module.ts`

Após emissão dos arquivos da feature, schematic adiciona ao `app.module.ts`:

1. **Import** logo abaixo dos imports de módulos existentes:

   ```typescript
   import { ContactsModule } from './modules/contacts/contacts.module';
   ```

2. **Entrada no array `imports`** do decorator `@Module`:
   ```typescript
   imports: [
     ConfigModule.forRoot({ ... }),
     LoggerModule.forRoot({ ... }),
     HealthModule,
     ContactsModule,    // ← adicionado
   ],
   ```

### Estratégia: âncoras por string + idempotência

- Lê `src/app.module.ts`.
- Detecta âncoras:
  - **Import:** última linha do bloco `import ... from './modules/...';` (regex multi-line).
  - **Imports array:** trailing `]` da prop `imports:` do `@Module(...)`. Insere `<ClassName>Module,` na linha imediatamente anterior.
- Idempotente: se `import { <Name>Module }` já existe, não duplica; nem entrada no array.
- Falha ruidosa: se nenhuma âncora for encontrada (estrutura mudou radicalmente), schematic emite warning explícito (`could not auto-update app.module.ts; add import + imports[] manually`) mas **não falha a geração** — arquivos da feature já foram emitidos.

### Por que não AST (ts-morph)

- Mais 1 devDep (5MB+).
- AST seria robusto a reescritas de estilo, mas `app.module.ts` é arquivo controlado por nós com forma estável.
- Trade-off explícito: aceita fragilidade marginal em troca de simplicidade. Se app.module.ts crescer (autenticação global, guards, etc.) e regex quebrar, swap pra ts-morph é ~30 linhas.

---

## 5. Validação dos args

`schema.json` valida:

- `name` obrigatório, string, regex `^[a-z][a-z0-9-]*$` (kebab-case, começa com letra).
- Mensagem de erro: `"Nome deve ser kebab-case (ex: contacts, message-templates)"`.

Outros args (`--path`, `--dry-run`, `--skip-import`) ficam suportados implicitamente pelo NestJS CLI mas não documentados pra forçar uso uniforme.

---

## 6. Wrapper / alias

`package.json`:

```json
"scripts": {
  "g:feature": "nest g --collection ./schematics feature"
}
```

Uso:

```bash
pnpm g:feature contacts
pnpm g:feature message-templates
```

---

## 7. Doc fixes incluídos no mesmo PR

Para evitar deixar referências stale, este PR também atualiza:

### `ARCHITECTURE.md` §3.3

- Remove linha `feature-name.application.service.spec.ts` da árvore de exemplo (alinha com decisão (b) sobre testes).

### `ROADMAP.md` Fase 0 → "Gerador de boilerplate (3 camadas) — NOVO"

- Item de testes: lista 2 arquivos (`domain.service.spec.ts` + `controller.e2e-spec.ts`) ao invés de só 1.
- Comando alvo atualizado: `pnpm g:feature <nome>` (alias) ou `pnpm nest g --collection ./schematics feature <nome>` (forma longa).
- Item validação manual atualizado pra usar o alias.

### `README.md`

- Nova seção "Gerador de feature" com:
  - Comando: `pnpm g:feature <nome>`
  - Nome em kebab-case
  - Lista do que é gerado
  - Lembrete: schema Prisma e schemas Zod ficam com TODO

### `CONTRIBUTING.md`

- Parágrafo curto na seção apropriada (criar/editar módulo): "antes de criar módulo manualmente, use `pnpm g:feature`".

### `src/modules/CLAUDE.md`

- Linha 30 (`Use \`pnpm nest g feature <nome>\`...`): atualizar pro comando real (`pnpm g:feature`).

---

## 8. Validação manual ao final do PR

1. `pnpm g:feature example-feature` cria toda estrutura sob `src/modules/example-feature/`.
2. `app.module.ts` ganha import + entrada em `imports` automáticos.
3. `pnpm typecheck` passa.
4. `pnpm test` passa (specs gerados estão `.skip`).
5. `pnpm test:e2e` passa.
6. `pnpm build` compila.
7. `pnpm lint` passa (configuração ajustada pra ignorar `schematics/`).
8. **Cleanup:** apagar `src/modules/example-feature/` + reverter mudança em `app.module.ts` antes do commit final do PR.

---

## 9. Riscos e mitigações

| Risco                                                            | Mitigação                                                                                                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regex pra atualizar `app.module.ts` quebra com mudança de estilo | Schematic emite warning explícito quando âncora não é encontrada; geração da feature continua. Swap pra ts-morph é cirúrgico.                        |
| `@angular-devkit/schematics` API muda em major                   | Lock no `pnpm-lock.yaml`; bump consciente quando tocar.                                                                                              |
| Templates desatualizam vs. padrão real                           | `health/` continua sendo módulo de referência viva; quando `health/` evoluir (ex: ganhar e2e real), atualiza-se template. Code review captura drift. |
| Dev novo não conhece o gerador                                   | README + CONTRIBUTING documentam. CLAUDE.md raiz já cita o workflow.                                                                                 |

---

## 10. Decisões registradas

| Decisão                                 | Alternativa rejeitada  | Motivo                                                                       |
| --------------------------------------- | ---------------------- | ---------------------------------------------------------------------------- |
| Schematic NestJS (Opção A)              | Script Node puro       | Idiomática, integra com ecossistema.                                         |
| `index.js` (não TS)                     | TS compilado           | ~80 linhas; sem ganho real de tipos vs. custo de build step.                 |
| 2 testes por feature (`domain` + `e2e`) | Só `domain` / 3 testes | Application service spec é mock-fest de baixo valor; e2e cobre multi-tenant. |
| Regex em `app.module.ts`                | ts-morph / AST         | Simplicidade > robustez teórica; estrutura controlada.                       |
| Não gera `events/`, `processors/`       | Gerar tudo opcional    | YAGNI; cria sob demanda.                                                     |

---

## 11. Próximo passo

Invocar skill `superpowers:writing-plans` pra produzir plano de implementação multi-step a partir desta spec.
