# Feature Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar um schematic NestJS local que gera a estrutura completa de 3 camadas para uma nova feature (`pnpm g:feature <nome>`), com atualização automática de `app.module.ts`.

**Architecture:** Schematic NestJS em `schematics/feature/` (JS puro, sem build step). Lê templates `.ts` de `schematics/feature/files/__name@dasherize__/`, processa via `applyTemplates` do Angular DevKit, emite em `src/modules/<name>/`. Atualiza `src/app.module.ts` por âncoras de string (regex). Spec da decisão: `docs/superpowers/specs/2026-04-30-feature-generator-design.md`.

**Tech Stack:** NestJS CLI 11 (já instalado), `@angular-devkit/schematics` (novo), `@angular-devkit/core` (novo), Vitest, `@angular-devkit/schematics/testing` (vem com `@angular-devkit/schematics`).

---

## File Structure

**Novos arquivos (criar):**

- `schematics/collection.json` — registry com 1 schematic (`feature`).
- `schematics/feature/schema.json` — JSON Schema dos args do CLI.
- `schematics/feature/index.js` — Rule factory (JS puro com JSDoc).
- `schematics/feature/files/__name@dasherize__/__name@dasherize__.module.ts` — template do `Module`.
- `schematics/feature/files/__name@dasherize__/controllers/__name@dasherize__.controller.ts` — template do controller.
- `schematics/feature/files/__name@dasherize__/services/__name@dasherize__.application.service.ts` — template do app service.
- `schematics/feature/files/__name@dasherize__/services/__name@dasherize__.domain.service.ts` — template do domain service.
- `schematics/feature/files/__name@dasherize__/schemas/create-__name@dasherize__.schema.ts` — template Zod create.
- `schematics/feature/files/__name@dasherize__/schemas/update-__name@dasherize__.schema.ts` — template Zod update.
- `schematics/feature/files/__name@dasherize__/schemas/__name@dasherize__-response.schema.ts` — template Zod response.
- `schematics/feature/files/__name@dasherize__/tests/__name@dasherize__.domain.service.spec.ts` — template spec do domain.
- `schematics/feature/files/__name@dasherize__/tests/__name@dasherize__.controller.e2e-spec.ts` — template spec e2e.
- `test/schematics/feature.schematic.spec.ts` — testes do schematic via `SchematicTestRunner`.

**Arquivos a modificar:**

- `package.json` — adicionar 2 devDeps + script `g:feature`.
- `eslint.config.mjs` — adicionar `schematics/**` ao `ignores`.
- `vitest.config.ts` — incluir `test/**/*.spec.ts`.
- `src/app.module.ts` — sem mudança no plano (a feature gerada de validação adiciona um import, depois é revertido).
- `ARCHITECTURE.md` — corrigir §3.3 (remover `application.service.spec.ts`).
- `ROADMAP.md` — Fase 0, seção "Gerador de boilerplate": atualizar comando e lista de testes.
- `src/modules/CLAUDE.md` — atualizar linha 30 com comando real (`pnpm g:feature`).
- `README.md` — adicionar seção "Gerador de feature" e remover item da lista "Próximos passos da Fase 0" (vai ser feito).
- `CONTRIBUTING.md` — apontar pro gerador na seção 6 (Padrões de código → Estrutura de módulo).

**Arquivos transitórios (criados durante validação manual e revertidos):**

- `src/modules/example-feature/...` (toda a árvore gerada, pra validar typecheck/test/build) — apagado antes do PR.
- `src/app.module.ts` — entrada `ExampleFeatureModule` adicionada e revertida.

---

### Task 1: Adicionar devDeps + script `g:feature` + ajustar tooling config

**Files:**

- Modify: `package.json` (devDeps + scripts)
- Modify: `eslint.config.mjs:6-8`
- Modify: `vitest.config.ts:9`

- [ ] **Step 1.1: Instalar devDeps**

```bash
pnpm add -D @angular-devkit/schematics @angular-devkit/core
```

Esperado: `package.json` ganha as 2 entradas em `devDependencies`. `pnpm-lock.yaml` atualizado.

- [ ] **Step 1.2: Adicionar script `g:feature` em `package.json`**

Editar a seção `scripts` adicionando logo após o último script:

```json
"test:e2e": "vitest run --config vitest.e2e.config.ts",
"g:feature": "nest g --collection ./schematics feature"
```

- [ ] **Step 1.3: Ignorar `schematics/**` no ESLint\*\*

Editar `eslint.config.mjs` linhas 6-8:

```javascript
{
  ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'schematics/**'],
},
```

- [ ] **Step 1.4: Incluir `test/**/\*.spec.ts` no vitest unit scope\*\*

Editar `vitest.config.ts` linha 9:

```typescript
include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
```

- [ ] **Step 1.5: Validar setup**

Rodar:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Esperado: tudo passa (lint não reclama da pasta `schematics/` ainda inexistente, typecheck passa, testes do `health` passam).

- [ ] **Step 1.6: Commit**

```bash
git add package.json pnpm-lock.yaml eslint.config.mjs vitest.config.ts
git commit -m "chore(deps): add angular-devkit schematics deps + g:feature script"
```

---

### Task 2: Esqueleto do schematic (collection + schema + factory mínima)

**Files:**

- Create: `schematics/collection.json`
- Create: `schematics/feature/schema.json`
- Create: `schematics/feature/index.js`
- Create: `test/schematics/feature.schematic.spec.ts`

- [ ] **Step 2.1: Criar `test/schematics/feature.schematic.spec.ts` (teste falha)**

```typescript
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SchematicTestRunner } from '@angular-devkit/schematics/testing';
import { Tree } from '@angular-devkit/schematics';

const COLLECTION_PATH = resolve(__dirname, '../../schematics/collection.json');

function buildSeedTree(): Tree {
  const tree = Tree.empty();
  tree.create(
    'src/app.module.ts',
    [
      `import { Module } from '@nestjs/common';`,
      `import { HealthModule } from './modules/health/health.module';`,
      ``,
      `@Module({`,
      `  imports: [`,
      `    HealthModule,`,
      `  ],`,
      `})`,
      `export class AppModule {}`,
      ``,
    ].join('\n'),
  );
  return tree;
}

describe('feature schematic', () => {
  const runner = new SchematicTestRunner('schematics', COLLECTION_PATH);

  it('runs without errors and creates the feature folder', async () => {
    const tree = await runner.runSchematic('feature', { name: 'contacts' }, buildSeedTree());
    const files = tree.files.filter((f) => f.startsWith('/src/modules/contacts/'));
    expect(files.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2.2: Rodar teste e ver falha**

```bash
pnpm test test/schematics/feature.schematic.spec.ts
```

Esperado: FAIL — `collection.json` ou `index.js` não existe.

- [ ] **Step 2.3: Criar `schematics/collection.json`**

```json
{
  "$schema": "../node_modules/@angular-devkit/schematics/collection-schema.json",
  "schematics": {
    "feature": {
      "description": "Gera módulo de 3 camadas (controller + application service + domain service + schemas + tests)",
      "factory": "./feature/index#feature",
      "schema": "./feature/schema.json"
    }
  }
}
```

- [ ] **Step 2.4: Criar `schematics/feature/schema.json`**

```json
{
  "$schema": "http://json-schema.org/schema",
  "$id": "Feature",
  "title": "Feature Generator",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Nome da feature em kebab-case (ex: contacts, message-templates)",
      "$default": { "$source": "argv", "index": 0 },
      "x-prompt": "Qual o nome da feature (kebab-case)?",
      "pattern": "^[a-z][a-z0-9-]*$"
    }
  },
  "required": ["name"]
}
```

- [ ] **Step 2.5: Criar `schematics/feature/index.js` mínimo**

```javascript
'use strict';

const { apply, mergeWith, move, template, url, chain } = require('@angular-devkit/schematics');
const { strings } = require('@angular-devkit/core');

/**
 * @typedef {Object} FeatureOptions
 * @property {string} name
 */

/**
 * @param {FeatureOptions} options
 */
function feature(options) {
  return chain([
    (tree, context) => {
      const sourceTemplates = url('./files');
      const sourceParametrized = apply(sourceTemplates, [
        template({
          ...strings,
          name: options.name,
        }),
        move('src/modules'),
      ]);
      return mergeWith(sourceParametrized)(tree, context);
    },
  ]);
}

exports.feature = feature;
```

- [ ] **Step 2.6: Criar placeholder `schematics/feature/files/__name@dasherize__/.gitkeep`**

```bash
mkdir -p schematics/feature/files/__name@dasherize__
touch schematics/feature/files/__name@dasherize__/.gitkeep
```

(Sem template real ainda — precisa só de algum arquivo pra `mergeWith` não vazar.)

- [ ] **Step 2.7: Rodar teste e ver passa**

```bash
pnpm test test/schematics/feature.schematic.spec.ts
```

Esperado: PASS.

- [ ] **Step 2.8: Commit**

```bash
git add schematics test/schematics
git commit -m "feat(schematics): bootstrap feature schematic skeleton"
```

---

### Task 3: Template do `Module` (com TDD)

**Files:**

- Create: `schematics/feature/files/__name@dasherize__/__name@dasherize__.module.ts`
- Modify: `test/schematics/feature.schematic.spec.ts`
- Delete: `schematics/feature/files/__name@dasherize__/.gitkeep`

- [ ] **Step 3.1: Adicionar teste do module**

Adicionar dentro do `describe('feature schematic', ...)`:

```typescript
it('generates module file with correct class name and providers', async () => {
  const tree = await runner.runSchematic('feature', { name: 'contacts' }, buildSeedTree());
  const path = '/src/modules/contacts/contacts.module.ts';
  expect(tree.exists(path)).toBe(true);
  const content = tree.readContent(path);
  expect(content).toContain(`import { Module } from '@nestjs/common';`);
  expect(content).toContain(
    `import { ContactsController } from './controllers/contacts.controller';`,
  );
  expect(content).toContain(
    `import { ContactsApplicationService } from './services/contacts.application.service';`,
  );
  expect(content).toContain(
    `import { ContactsDomainService } from './services/contacts.domain.service';`,
  );
  expect(content).toContain(`export class ContactsModule {}`);
  expect(content).toContain(`controllers: [ContactsController]`);
  expect(content).toContain(`providers: [ContactsApplicationService, ContactsDomainService]`);
  expect(content).toContain(`exports: [ContactsApplicationService]`);
});

it('handles multi-word kebab-case names correctly', async () => {
  const tree = await runner.runSchematic('feature', { name: 'message-templates' }, buildSeedTree());
  const content = tree.readContent('/src/modules/message-templates/message-templates.module.ts');
  expect(content).toContain(`export class MessageTemplatesModule {}`);
  expect(content).toContain(`MessageTemplatesController`);
});
```

- [ ] **Step 3.2: Rodar e ver falha**

```bash
pnpm test test/schematics/feature.schematic.spec.ts
```

Esperado: FAIL — arquivo `contacts.module.ts` não existe.

- [ ] **Step 3.3: Apagar `.gitkeep` e criar template do module**

```bash
rm schematics/feature/files/__name@dasherize__/.gitkeep
```

Criar `schematics/feature/files/__name@dasherize__/__name@dasherize__.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { <%= classify(name) %>Controller } from './controllers/<%= dasherize(name) %>.controller';
import { <%= classify(name) %>ApplicationService } from './services/<%= dasherize(name) %>.application.service';
import { <%= classify(name) %>DomainService } from './services/<%= dasherize(name) %>.domain.service';

@Module({
  controllers: [<%= classify(name) %>Controller],
  providers: [<%= classify(name) %>ApplicationService, <%= classify(name) %>DomainService],
  exports: [<%= classify(name) %>ApplicationService],
})
export class <%= classify(name) %>Module {}
```

- [ ] **Step 3.4: Rodar e ver passa**

```bash
pnpm test test/schematics/feature.schematic.spec.ts
```

Esperado: PASS (3 testes — incluindo o `it` original).

- [ ] **Step 3.5: Commit**

```bash
git add schematics/feature/files test/schematics/feature.schematic.spec.ts
git commit -m "feat(schematics): add feature module template"
```

---

### Task 4: Templates de service (application + domain)

**Files:**

- Create: `schematics/feature/files/__name@dasherize__/services/__name@dasherize__.application.service.ts`
- Create: `schematics/feature/files/__name@dasherize__/services/__name@dasherize__.domain.service.ts`
- Modify: `test/schematics/feature.schematic.spec.ts`

- [ ] **Step 4.1: Adicionar testes**

Adicionar dentro do `describe`:

```typescript
it('generates application service with domain service injection', async () => {
  const tree = await runner.runSchematic('feature', { name: 'contacts' }, buildSeedTree());
  const content = tree.readContent(
    '/src/modules/contacts/services/contacts.application.service.ts',
  );
  expect(content).toContain(
    `import { Injectable, NotImplementedException } from '@nestjs/common';`,
  );
  expect(content).toContain(`import { ContactsDomainService } from './contacts.domain.service';`);
  expect(content).toContain(`export class ContactsApplicationService`);
  expect(content).toContain(`private readonly domainService: ContactsDomainService`);
  expect(content).toContain(`async list(_companyId: string)`);
  expect(content).toContain(`async getById(_id: string, _companyId: string)`);
  expect(content).toContain(`async create(_companyId: string, _input: unknown)`);
  expect(content).toContain(`async update(_id: string, _companyId: string, _input: unknown)`);
  expect(content).toContain(`async remove(_id: string, _companyId: string)`);
  expect((content.match(/throw new NotImplementedException\(\);/g) ?? []).length).toBe(5);
});

it('generates domain service with companyId in signatures', async () => {
  const tree = await runner.runSchematic('feature', { name: 'contacts' }, buildSeedTree());
  const content = tree.readContent('/src/modules/contacts/services/contacts.domain.service.ts');
  expect(content).toContain(
    `import { Injectable, NotImplementedException } from '@nestjs/common';`,
  );
  expect(content).toContain(`export class ContactsDomainService`);
  expect(content).toContain(`async list(_companyId: string)`);
  expect(content).toContain(`async getById(_id: string, _companyId: string)`);
  expect(content).toContain(`// TODO: injetar PrismaService quando criado o módulo Prisma`);
});
```

- [ ] **Step 4.2: Rodar e ver falha**

```bash
pnpm test test/schematics/feature.schematic.spec.ts
```

Esperado: FAIL — arquivos não existem.

- [ ] **Step 4.3: Criar template `<dash>.application.service.ts`**

`schematics/feature/files/__name@dasherize__/services/__name@dasherize__.application.service.ts`:

```typescript
import { Injectable, NotImplementedException } from '@nestjs/common';
import { <%= classify(name) %>DomainService } from './<%= dasherize(name) %>.domain.service';

@Injectable()
export class <%= classify(name) %>ApplicationService {
  constructor(private readonly domainService: <%= classify(name) %>DomainService) {}

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

- [ ] **Step 4.4: Criar template `<dash>.domain.service.ts`**

`schematics/feature/files/__name@dasherize__/services/__name@dasherize__.domain.service.ts`:

```typescript
import { Injectable, NotImplementedException } from '@nestjs/common';

@Injectable()
export class <%= classify(name) %>DomainService {
  // TODO: injetar PrismaService quando criado o módulo Prisma

  async list(_companyId: string): Promise<unknown[]> {
    // TODO: tx.<%= camelize(name) %>.findMany({ where: { companyId, ... } })
    throw new NotImplementedException();
  }

  async getById(_id: string, _companyId: string): Promise<unknown> {
    // TODO: tx.<%= camelize(name) %>.findFirstOrThrow({ where: { id, companyId } })
    throw new NotImplementedException();
  }

  async create(_companyId: string, _input: unknown): Promise<unknown> {
    // TODO: regra de negócio + tx.<%= camelize(name) %>.create
    throw new NotImplementedException();
  }

  async update(_id: string, _companyId: string, _input: unknown): Promise<unknown> {
    // TODO: regra de negócio + tx.<%= camelize(name) %>.update
    throw new NotImplementedException();
  }

  async remove(_id: string, _companyId: string): Promise<void> {
    // TODO: tx.<%= camelize(name) %>.update({ data: { deletedAt: new Date() } })
    throw new NotImplementedException();
  }
}
```

- [ ] **Step 4.5: Rodar e ver passa**

```bash
pnpm test test/schematics/feature.schematic.spec.ts
```

Esperado: PASS.

- [ ] **Step 4.6: Commit**

```bash
git add schematics/feature/files/__name@dasherize__/services test/schematics/feature.schematic.spec.ts
git commit -m "feat(schematics): add application + domain service templates"
```

---

### Task 5: Template do controller (com 5 endpoints CRUD stub)

**Files:**

- Create: `schematics/feature/files/__name@dasherize__/controllers/__name@dasherize__.controller.ts`
- Modify: `test/schematics/feature.schematic.spec.ts`

- [ ] **Step 5.1: Adicionar teste do controller**

```typescript
it('generates controller with 5 CRUD stubs', async () => {
  const tree = await runner.runSchematic('feature', { name: 'contacts' }, buildSeedTree());
  const content = tree.readContent('/src/modules/contacts/controllers/contacts.controller.ts');
  expect(content).toContain(`@ApiTags('contacts')`);
  expect(content).toContain(`@Controller('contacts')`);
  expect(content).toContain(`export class ContactsController`);
  expect(content).toContain(`private readonly applicationService: ContactsApplicationService`);
  expect(content).toMatch(/@Get\(\)\s+@ZodSerializerDto\(ContactResponseDto\)\s+async list\(\)/);
  expect(content).toMatch(/@Get\(':id'\).*async getById/s);
  expect(content).toMatch(/@Post\(\).*async create/s);
  expect(content).toMatch(/@Patch\(':id'\).*async update/s);
  expect(content).toMatch(/@Delete\(':id'\).*async remove/s);
  expect((content.match(/throw new NotImplementedException\(\);/g) ?? []).length).toBe(5);
});
```

- [ ] **Step 5.2: Rodar e ver falha**

```bash
pnpm test test/schematics/feature.schematic.spec.ts
```

Esperado: FAIL.

- [ ] **Step 5.3: Criar template do controller**

`schematics/feature/files/__name@dasherize__/controllers/__name@dasherize__.controller.ts`:

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
import { <%= classify(name) %>ApplicationService } from '../services/<%= dasherize(name) %>.application.service';
import { Create<%= classify(name) %>Dto } from '../schemas/create-<%= dasherize(name) %>.schema';
import { Update<%= classify(name) %>Dto } from '../schemas/update-<%= dasherize(name) %>.schema';
import { <%= classify(name) %>ResponseDto } from '../schemas/<%= dasherize(name) %>-response.schema';

@ApiTags('<%= dasherize(name) %>')
@Controller('<%= dasherize(name) %>')
export class <%= classify(name) %>Controller {
  constructor(private readonly applicationService: <%= classify(name) %>ApplicationService) {}

  @Get()
  @ZodSerializerDto(<%= classify(name) %>ResponseDto)
  async list(): Promise<<%= classify(name) %>ResponseDto[]> {
    // TODO: extrair @CurrentCompany, paginar, chamar applicationService.list
    throw new NotImplementedException();
  }

  @Get(':id')
  @ZodSerializerDto(<%= classify(name) %>ResponseDto)
  async getById(@Param('id') _id: string): Promise<<%= classify(name) %>ResponseDto> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Post()
  @ZodSerializerDto(<%= classify(name) %>ResponseDto)
  async create(@Body() _input: Create<%= classify(name) %>Dto): Promise<<%= classify(name) %>ResponseDto> {
    // TODO: implementar
    throw new NotImplementedException();
  }

  @Patch(':id')
  @ZodSerializerDto(<%= classify(name) %>ResponseDto)
  async update(
    @Param('id') _id: string,
    @Body() _input: Update<%= classify(name) %>Dto,
  ): Promise<<%= classify(name) %>ResponseDto> {
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

- [ ] **Step 5.4: Rodar e ver passa**

```bash
pnpm test test/schematics/feature.schematic.spec.ts
```

Esperado: PASS.

- [ ] **Step 5.5: Commit**

```bash
git add schematics/feature/files/__name@dasherize__/controllers test/schematics/feature.schematic.spec.ts
git commit -m "feat(schematics): add controller template with CRUD stubs"
```

---

### Task 6: Templates dos schemas Zod (3 arquivos)

**Files:**

- Create: `schematics/feature/files/__name@dasherize__/schemas/create-__name@dasherize__.schema.ts`
- Create: `schematics/feature/files/__name@dasherize__/schemas/update-__name@dasherize__.schema.ts`
- Create: `schematics/feature/files/__name@dasherize__/schemas/__name@dasherize__-response.schema.ts`
- Modify: `test/schematics/feature.schematic.spec.ts`

- [ ] **Step 6.1: Adicionar testes**

```typescript
it('generates 3 Zod schemas with placeholder structure', async () => {
  const tree = await runner.runSchematic('feature', { name: 'contacts' }, buildSeedTree());

  const create = tree.readContent('/src/modules/contacts/schemas/create-contacts.schema.ts');
  expect(create).toContain(`import { createZodDto } from 'nestjs-zod';`);
  expect(create).toContain(`import { z } from 'zod';`);
  expect(create).toContain(`export const CreateContactsSchema`);
  expect(create).toContain(
    `export class CreateContactsDto extends createZodDto(CreateContactsSchema) {}`,
  );
  expect(create).toContain(`// TODO: definir campos do payload`);

  const update = tree.readContent('/src/modules/contacts/schemas/update-contacts.schema.ts');
  expect(update).toContain(`export const UpdateContactsSchema`);
  expect(update).toContain(
    `export class UpdateContactsDto extends createZodDto(UpdateContactsSchema) {}`,
  );

  const response = tree.readContent('/src/modules/contacts/schemas/contacts-response.schema.ts');
  expect(response).toContain(`export const ContactsResponseSchema`);
  expect(response).toContain(`id: z.string().uuid()`);
  expect(response).toContain(
    `export class ContactsResponseDto extends createZodDto(ContactsResponseSchema) {}`,
  );
});
```

- [ ] **Step 6.2: Rodar e ver falha**

```bash
pnpm test test/schematics/feature.schematic.spec.ts
```

- [ ] **Step 6.3: Criar `create-<dash>.schema.ts`**

```typescript
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const Create<%= classify(name) %>Schema = z
  .object({
    // TODO: definir campos do payload
  })
  .describe('TODO: descrever payload de criação de <%= dasherize(name) %>');

export class Create<%= classify(name) %>Dto extends createZodDto(Create<%= classify(name) %>Schema) {}
```

- [ ] **Step 6.4: Criar `update-<dash>.schema.ts`**

```typescript
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const Update<%= classify(name) %>Schema = z
  .object({
    // TODO: definir campos do payload
  })
  .describe('TODO: descrever payload de atualização de <%= dasherize(name) %>');

export class Update<%= classify(name) %>Dto extends createZodDto(Update<%= classify(name) %>Schema) {}
```

- [ ] **Step 6.5: Criar `<dash>-response.schema.ts`**

```typescript
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const <%= classify(name) %>ResponseSchema = z
  .object({
    id: z.string().uuid(),
    // TODO: definir campos da resposta
  })
  .describe('TODO: descrever resposta de <%= dasherize(name) %>');

export class <%= classify(name) %>ResponseDto extends createZodDto(<%= classify(name) %>ResponseSchema) {}
```

- [ ] **Step 6.6: Rodar e ver passa**

```bash
pnpm test test/schematics/feature.schematic.spec.ts
```

- [ ] **Step 6.7: Commit**

```bash
git add schematics/feature/files/__name@dasherize__/schemas test/schematics/feature.schematic.spec.ts
git commit -m "feat(schematics): add zod schemas templates (create/update/response)"
```

---

### Task 7: Templates de teste (domain spec + controller e2e spec)

**Files:**

- Create: `schematics/feature/files/__name@dasherize__/tests/__name@dasherize__.domain.service.spec.ts`
- Create: `schematics/feature/files/__name@dasherize__/tests/__name@dasherize__.controller.e2e-spec.ts`
- Modify: `test/schematics/feature.schematic.spec.ts`

- [ ] **Step 7.1: Adicionar testes**

```typescript
it('generates domain spec with skipped placeholder test', async () => {
  const tree = await runner.runSchematic('feature', { name: 'contacts' }, buildSeedTree());
  const content = tree.readContent('/src/modules/contacts/tests/contacts.domain.service.spec.ts');
  expect(content).toContain(`import { describe, it } from 'vitest';`);
  expect(content).toContain(`describe('ContactsDomainService'`);
  expect(content).toContain(`it.skip('TODO: cobrir regras de negócio do domain service'`);
});

it('generates controller e2e spec with skipped multi-tenant placeholder', async () => {
  const tree = await runner.runSchematic('feature', { name: 'contacts' }, buildSeedTree());
  const content = tree.readContent('/src/modules/contacts/tests/contacts.controller.e2e-spec.ts');
  expect(content).toContain(`describe('ContactsController (e2e)'`);
  expect(content).toContain(`it.skip('TODO: validar isolamento multi-tenant'`);
});
```

- [ ] **Step 7.2: Rodar e ver falha**

```bash
pnpm test test/schematics/feature.schematic.spec.ts
```

- [ ] **Step 7.3: Criar `<dash>.domain.service.spec.ts`**

```typescript
import { describe, it } from 'vitest';

describe('<%= classify(name) %>DomainService', () => {
  it.skip('TODO: cobrir regras de negócio do domain service', () => {
    // TODO: instanciar service com mock de Prisma e cobrir regras
  });
});
```

- [ ] **Step 7.4: Criar `<dash>.controller.e2e-spec.ts`**

```typescript
import { describe, it } from 'vitest';

describe('<%= classify(name) %>Controller (e2e)', () => {
  it.skip('TODO: validar isolamento multi-tenant', () => {
    // TODO: bootstrar app NestJS e validar que companyId isola
  });
});
```

- [ ] **Step 7.5: Rodar e ver passa**

```bash
pnpm test test/schematics/feature.schematic.spec.ts
```

- [ ] **Step 7.6: Commit**

```bash
git add schematics/feature/files/__name@dasherize__/tests test/schematics/feature.schematic.spec.ts
git commit -m "feat(schematics): add test templates (domain + controller e2e)"
```

---

### Task 8: Atualização automática de `app.module.ts`

**Files:**

- Modify: `schematics/feature/index.js`
- Modify: `test/schematics/feature.schematic.spec.ts`

- [ ] **Step 8.1: Adicionar testes do updater**

Adicionar no `describe`:

```typescript
it('adds import line to app.module.ts', async () => {
  const tree = await runner.runSchematic('feature', { name: 'contacts' }, buildSeedTree());
  const content = tree.readContent('/src/app.module.ts');
  expect(content).toContain(`import { ContactsModule } from './modules/contacts/contacts.module';`);
});

it('adds class to imports array of @Module', async () => {
  const tree = await runner.runSchematic('feature', { name: 'contacts' }, buildSeedTree());
  const content = tree.readContent('/src/app.module.ts');
  const imports = content.match(/imports:\s*\[([\s\S]*?)\]/)?.[1] ?? '';
  expect(imports).toContain('HealthModule,');
  expect(imports).toContain('ContactsModule,');
});

it('is idempotent — running twice does not duplicate import or array entry', async () => {
  const seed = buildSeedTree();
  const treeOnce = await runner.runSchematic('feature', { name: 'contacts' }, seed);
  const treeTwice = await runner.runSchematic('feature', { name: 'contacts' }, treeOnce);
  const content = treeTwice.readContent('/src/app.module.ts');
  const importMatches = content.match(/import \{ ContactsModule \}/g) ?? [];
  expect(importMatches.length).toBe(1);
  const arrayMatches = content.match(/ContactsModule,/g) ?? [];
  expect(arrayMatches.length).toBe(1);
});

it('warns and skips when app.module.ts is missing (does not throw)', async () => {
  const tree = Tree.empty();
  await expect(runner.runSchematic('feature', { name: 'contacts' }, tree)).resolves.toBeDefined();
  expect(tree.exists('/src/app.module.ts')).toBe(false);
});
```

- [ ] **Step 8.2: Rodar e ver falha**

Esperado: 4 novos testes falham (imports não foram adicionados).

- [ ] **Step 8.3: Adicionar updater em `schematics/feature/index.js`**

Substituir o conteúdo de `schematics/feature/index.js` por:

```javascript
'use strict';

const { apply, mergeWith, move, template, url, chain } = require('@angular-devkit/schematics');
const { strings } = require('@angular-devkit/core');

const APP_MODULE_PATH = 'src/app.module.ts';

/**
 * @typedef {Object} FeatureOptions
 * @property {string} name
 */

/** @param {FeatureOptions} options */
function applyFiles(options) {
  return (tree, context) => {
    const sourceTemplates = url('./files');
    const sourceParametrized = apply(sourceTemplates, [
      template({
        ...strings,
        name: options.name,
      }),
      move('src/modules'),
    ]);
    return mergeWith(sourceParametrized)(tree, context);
  };
}

/** @param {FeatureOptions} options */
function updateAppModule(options) {
  return (tree, context) => {
    const buf = tree.read(APP_MODULE_PATH);
    if (!buf) {
      context.logger.warn(`${APP_MODULE_PATH} not found; skipping auto-import. Add it manually.`);
      return tree;
    }
    let content = buf.toString();
    const dash = strings.dasherize(options.name);
    const className = `${strings.classify(options.name)}Module`;
    const importLine = `import { ${className} } from './modules/${dash}/${dash}.module';`;

    let changed = false;

    // Step 1 — add import line
    if (!content.includes(importLine)) {
      const moduleImports = [
        ...content.matchAll(/import \{ \w+Module \} from '\.\/modules\/[\w-]+\/[\w-]+\.module';/g),
      ];
      const fallback = [...content.matchAll(/^import .+;$/gm)];
      const target = moduleImports.length
        ? moduleImports[moduleImports.length - 1]
        : fallback[fallback.length - 1];
      if (!target || target.index === undefined) {
        context.logger.warn(
          `Could not find import anchor in ${APP_MODULE_PATH}. Add manually:\n  ${importLine}`,
        );
        return tree;
      }
      const insertAt = target.index + target[0].length;
      content = content.slice(0, insertAt) + '\n' + importLine + content.slice(insertAt);
      changed = true;
    }

    // Step 2 — add to @Module imports: [...] array
    const arrayMatch = content.match(/(@Module\(\{[\s\S]*?imports:\s*\[)([\s\S]*?)(\n\s*\],?)/);
    if (!arrayMatch) {
      context.logger.warn(
        `@Module imports array not found in ${APP_MODULE_PATH}. Add manually:\n  ${className},`,
      );
      if (changed) tree.overwrite(APP_MODULE_PATH, content);
      return tree;
    }
    const [, head, body, tail] = arrayMatch;
    if (!new RegExp(`\\b${className}\\b`).test(body)) {
      const indentMatch = body.match(/\n(\s+)\S/);
      const indent = indentMatch ? indentMatch[1] : '    ';
      const newBody = `${body.replace(/\s*$/, '')}\n${indent}${className},`;
      content = content.replace(arrayMatch[0], `${head}${newBody}${tail}`);
      changed = true;
    }

    if (changed) tree.overwrite(APP_MODULE_PATH, content);
    return tree;
  };
}

/** @param {FeatureOptions} options */
function feature(options) {
  return chain([applyFiles(options), updateAppModule(options)]);
}

exports.feature = feature;
```

- [ ] **Step 8.4: Rodar e ver passa**

```bash
pnpm test test/schematics/feature.schematic.spec.ts
```

Esperado: todos os testes passam (incluindo idempotência e fallback).

- [ ] **Step 8.5: Commit**

```bash
git add schematics/feature/index.js test/schematics/feature.schematic.spec.ts
git commit -m "feat(schematics): auto-update app.module.ts on feature generation"
```

---

### Task 9: Validação manual end-to-end + cleanup

**Files:**

- Create (transitório): `src/modules/example-feature/...`
- Modify (transitório): `src/app.module.ts`

- [ ] **Step 9.1: Rodar o gerador no projeto real**

```bash
pnpm g:feature example-feature
```

Esperado: criação de `src/modules/example-feature/` com 8 arquivos:

```
src/modules/example-feature/
├── example-feature.module.ts
├── controllers/example-feature.controller.ts
├── services/example-feature.application.service.ts
├── services/example-feature.domain.service.ts
├── schemas/create-example-feature.schema.ts
├── schemas/update-example-feature.schema.ts
├── schemas/example-feature-response.schema.ts
└── tests/
    ├── example-feature.domain.service.spec.ts
    └── example-feature.controller.e2e-spec.ts
```

E `src/app.module.ts` ganhou import e entrada.

- [ ] **Step 9.2: Validar typecheck**

```bash
pnpm typecheck
```

Esperado: PASS sem erros.

- [ ] **Step 9.3: Validar lint**

```bash
pnpm lint
```

Esperado: PASS. Se reclamar de `_id`/`_input` — eslint config já tem `argsIgnorePattern: '^_'`. Se reclamar de outro, ajustar template e re-rodar.

- [ ] **Step 9.4: Validar testes**

```bash
pnpm test
```

Esperado: testes do `health` + schematic + os novos `.skip` da `example-feature` passam.

- [ ] **Step 9.5: Validar build**

```bash
pnpm build
```

Esperado: PASS.

- [ ] **Step 9.6: Cleanup — apagar feature de validação e reverter `app.module.ts`**

```bash
rm -rf src/modules/example-feature
git checkout src/app.module.ts
```

Confirmar:

```bash
git status
```

Não deve haver mudanças não-staged além do que veio das tasks anteriores.

- [ ] **Step 9.7: Sem commit nesta task** — foi só validação. Sem mudanças no working tree pra commitar.

---

### Task 10: Doc fixes

**Files:**

- Modify: `ARCHITECTURE.md` §3.3
- Modify: `ROADMAP.md` Fase 0
- Modify: `src/modules/CLAUDE.md` linha 30
- Modify: `README.md`
- Modify: `CONTRIBUTING.md` §6

- [ ] **Step 10.1: `ARCHITECTURE.md` §3.3 — remover `application.service.spec.ts` da árvore**

Editar trecho atual:

```
└── tests/
    ├── feature-name.domain.service.spec.ts
    ├── feature-name.application.service.spec.ts
    └── feature-name.controller.e2e-spec.ts
```

Para:

```
└── tests/
    ├── feature-name.domain.service.spec.ts
    └── feature-name.controller.e2e-spec.ts
```

- [ ] **Step 10.2: `ROADMAP.md` Fase 0 — atualizar seção do gerador**

Trecho atual (linhas 113-124):

```markdown
### Gerador de boilerplate (3 camadas) — NOVO

- [ ] Schematic customizado do NestJS CLI
- [ ] Comando `pnpm nest g feature <nome>` cria:
  - `feature.module.ts`
  - `controllers/feature.controller.ts` (com endpoints CRUD vazios)
  - `services/feature.application.service.ts` (com métodos vazios)
  - `services/feature.domain.service.ts` (com métodos vazios)
  - `schemas/create-feature.schema.ts`, `update-feature.schema.ts`, `feature-response.schema.ts`
  - `tests/feature.domain.service.spec.ts` (com setup vazio)
- [ ] Documentação de uso em `crm-api/README.md`
```

Substituir por:

```markdown
### Gerador de boilerplate (3 camadas) — NOVO

- [ ] Schematic customizado em `crm-api/schematics/`
- [ ] Comando `pnpm g:feature <nome>` (alias) ou `pnpm nest g --collection ./schematics feature <nome>` cria:
  - `feature.module.ts`
  - `controllers/feature.controller.ts` (5 endpoints CRUD com `NotImplementedException`)
  - `services/feature.application.service.ts` (5 métodos placeholder)
  - `services/feature.domain.service.ts` (5 métodos placeholder, assinaturas com `companyId`)
  - `schemas/create-feature.schema.ts`, `update-feature.schema.ts`, `feature-response.schema.ts` (Zod placeholders com TODO)
  - `tests/feature.domain.service.spec.ts` + `tests/feature.controller.e2e-spec.ts` (vitest, com `it.skip` placeholder)
- [ ] Atualização automática de `src/app.module.ts` (import + entrada em `imports: [...]`)
- [ ] Documentação de uso em `crm-api/README.md` e `crm-api/CONTRIBUTING.md`
```

E na seção "Validação manual" linha 192:

```markdown
- Gerar feature nova com `pnpm nest g feature exemplo` e ver estrutura completa criada
```

Substituir por:

```markdown
- Gerar feature nova com `pnpm g:feature exemplo` e ver estrutura completa + `app.module.ts` atualizado
```

- [ ] **Step 10.3: `src/modules/CLAUDE.md` linha 30 — atualizar comando**

Trecho atual:

```markdown
Use `pnpm nest g feature <nome>` (gerador customizado) pra criar a estrutura.
```

Substituir por:

```markdown
Use `pnpm g:feature <nome>` (gerador customizado) pra criar a estrutura. Por baixo, roda `nest g --collection ./schematics feature <nome>`.
```

- [ ] **Step 10.4: `README.md` — adicionar seção e atualizar lista de próximos passos**

Antes da seção `## Comandos` (linha 67), adicionar nova seção:

````markdown
## Gerador de feature

Use o schematic local pra criar um módulo novo seguindo o padrão de 3 camadas:

```bash
pnpm g:feature <nome>          # nome em kebab-case
# exemplos:
pnpm g:feature contacts
pnpm g:feature message-templates
```
````

Cria sob `src/modules/<nome>/`: módulo, controller (5 endpoints CRUD stub), application service, domain service, 3 schemas Zod placeholder e 2 specs (`domain.service.spec.ts` + `controller.e2e-spec.ts`). Adiciona import + entrada em `src/app.module.ts` automaticamente.

Schemas Zod e regras de negócio ficam com `// TODO` — implementação real é responsabilidade da feature, não do gerador.

````

E na lista "Próximos passos da Fase 0" (linhas 102-112), remover o item 6 (`Gerador 'pnpm nest g feature <nome>'`) e renumerar:

Trecho atual:
```markdown
1. Schema Prisma + migrations + seed
2. Auth (3 camadas) + JWT + decorators
3. Schema do núcleo (Company, Plan, User, Department, Tag, etc)
4. Services foundationais (BusinessHours, TemplateRenderer, Encryption)
5. CRUDs básicos com 3 camadas
6. Gerador `pnpm nest g feature <nome>`
7. CI GitHub Actions
````

Substituir por:

```markdown
1. Schema Prisma + migrations + seed
2. Auth (3 camadas) + JWT + decorators
3. Schema do núcleo (Company, Plan, User, Department, Tag, etc)
4. Services foundationais (BusinessHours, TemplateRenderer, Encryption)
5. CRUDs básicos com 3 camadas
6. CI GitHub Actions
```

- [ ] **Step 10.5: `CONTRIBUTING.md` §6 — atualizar referência ao gerador**

Trecho atual (linha 308):

```markdown
Use `pnpm nest g feature <nome>` (gerador customizado da Fase 0) para criar estrutura.
```

Substituir por:

```markdown
Use `pnpm g:feature <nome>` (gerador local em `schematics/feature/`) para criar estrutura. Evita drift do padrão de 3 camadas e atualiza `app.module.ts` automaticamente.
```

- [ ] **Step 10.6: Validação dos doc fixes**

```bash
pnpm format
git diff --stat
```

Esperado: 5 arquivos modificados (ARCHITECTURE.md, ROADMAP.md, src/modules/CLAUDE.md, README.md, CONTRIBUTING.md).

- [ ] **Step 10.7: Commit**

```bash
git add ARCHITECTURE.md ROADMAP.md src/modules/CLAUDE.md README.md CONTRIBUTING.md
git commit -m "docs: align references with feature schematic implementation"
```

---

### Task 11: Push da branch + abrir PR

- [ ] **Step 11.1: Verificação final**

```bash
git status
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Esperado: working tree limpo, todas as validações passam.

- [ ] **Step 11.2: Push da branch**

```bash
git push -u origin chore/scaffolding-generator
```

- [ ] **Step 11.3: Abrir PR**

```bash
gh pr create --title "chore(schematics): add feature generator (3-layer scaffold)" --body "$(cat <<'EOF'
## O que mudou

Schematic local em `schematics/feature/` que gera a estrutura completa de 3 camadas para uma nova feature do backend, seguindo o padrão obrigatório descrito em `ARCHITECTURE.md` §3 e `src/modules/CLAUDE.md`.

Comando: `pnpm g:feature <nome>` (alias) ou `pnpm nest g --collection ./schematics feature <nome>` (forma longa).

Gera, em `src/modules/<nome>/`:
- `<nome>.module.ts`
- `controllers/<nome>.controller.ts` (5 endpoints CRUD stub com `NotImplementedException`)
- `services/<nome>.application.service.ts` (5 métodos placeholder)
- `services/<nome>.domain.service.ts` (5 métodos placeholder, assinaturas com `companyId`)
- `schemas/create-<nome>.schema.ts`, `update-<nome>.schema.ts`, `<nome>-response.schema.ts` (Zod placeholders)
- `tests/<nome>.domain.service.spec.ts` + `tests/<nome>.controller.e2e-spec.ts` (vitest com `it.skip`)

Atualiza `src/app.module.ts` automaticamente (import + entrada em `imports: [...]`), idempotente.

Doc fixes alinhados no mesmo PR: `ARCHITECTURE.md` §3.3 (remove `application.service.spec.ts` da árvore), `ROADMAP.md` Fase 0 (comando + lista de testes), `src/modules/CLAUDE.md` (comando real), `README.md` (nova seção + remoção do item da lista de próximos passos), `CONTRIBUTING.md` §6.

## Por que

Item da Fase 0 do `ROADMAP.md`. Spec aprovada em `docs/superpowers/specs/2026-04-30-feature-generator-design.md`.

## Como testar

\`\`\`bash
pnpm install
pnpm g:feature example-feature
pnpm typecheck && pnpm lint && pnpm test && pnpm build
# verificar que src/modules/example-feature/ existe e src/app.module.ts ganhou ExampleFeatureModule
# cleanup: rm -rf src/modules/example-feature && git checkout src/app.module.ts
\`\`\`

Testes do schematic via `SchematicTestRunner`: \`pnpm test test/schematics/feature.schematic.spec.ts\`.

## Checklist

- [x] Multi-tenant: domain services gerados recebem `companyId` em assinaturas
- [x] Testes do schematic passando (vitest)
- [x] Lint e typecheck passando
- [x] Sem credenciais ou secrets no diff
- [x] Documentação atualizada (`ARCHITECTURE.md`, `ROADMAP.md`, `src/modules/CLAUDE.md`, `README.md`, `CONTRIBUTING.md`)
EOF
)"
```

- [ ] **Step 11.4: Verificar URL do PR**

A saída do `gh pr create` retorna a URL. Reportar ao usuário.

---

## Self-review

**Spec coverage:** todos os requisitos da spec têm task associada — schematic em `schematics/feature/` (Tasks 2-7), atualização automática de `app.module.ts` (Task 8), validação manual end-to-end (Task 9), doc fixes (Task 10), PR (Task 11). Trade-off de "não usar ts-morph" cumprido (regex em Task 8). Itens "fora de escopo" da spec (schema Prisma, schemas Zod com campos reais, `events/`, `processors/`, application.service.spec) intencionalmente ausentes do plano. ✓

**Placeholder scan:** todos os steps têm código completo. Nenhum "TODO" ou "implementar depois" no plano (os TODOs presentes são literais nos templates gerados — esperado). ✓

**Type consistency:** nomes consistentes — `feature` é o nome do schematic do começo ao fim; `applyFiles`, `updateAppModule`, `chain`, `feature` são as funções em `index.js` consistentes em todas as referências. ✓

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-30-feature-generator.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach?
