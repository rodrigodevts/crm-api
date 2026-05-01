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
    const tree = await runner.runSchematic(
      'feature',
      { name: 'message-templates' },
      buildSeedTree(),
    );
    const content = tree.readContent('/src/modules/message-templates/message-templates.module.ts');
    expect(content).toContain(`export class MessageTemplatesModule {}`);
    expect(content).toContain(`MessageTemplatesController`);
  });

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
    expect(content).toContain(`list(_companyId: string)`);
    expect(content).toContain(`getById(_id: string, _companyId: string)`);
    expect(content).toContain(`create(_companyId: string, _input: unknown)`);
    expect(content).toContain(`update(_id: string, _companyId: string, _input: unknown)`);
    expect(content).toContain(`remove(_id: string, _companyId: string)`);
    expect((content.match(/throw new NotImplementedException\(\);/g) ?? []).length).toBe(5);
  });

  it('generates domain service with companyId in signatures', async () => {
    const tree = await runner.runSchematic('feature', { name: 'contacts' }, buildSeedTree());
    const content = tree.readContent('/src/modules/contacts/services/contacts.domain.service.ts');
    expect(content).toContain(
      `import { Injectable, NotImplementedException } from '@nestjs/common';`,
    );
    expect(content).toContain(`export class ContactsDomainService`);
    expect(content).toContain(`list(_companyId: string)`);
    expect(content).toContain(`getById(_id: string, _companyId: string)`);
    expect(content).toContain(`// TODO: injetar PrismaService quando criado o módulo Prisma`);
  });

  it('generates controller with 5 CRUD stubs', async () => {
    const tree = await runner.runSchematic('feature', { name: 'contacts' }, buildSeedTree());
    const content = tree.readContent('/src/modules/contacts/controllers/contacts.controller.ts');
    expect(content).toContain(`@ApiTags('contacts')`);
    expect(content).toContain(`@Controller('contacts')`);
    expect(content).toContain(`export class ContactsController`);
    expect(content).toContain(`private readonly applicationService: ContactsApplicationService`);
    expect(content).toMatch(/@Get\(\)\s+@ZodSerializerDto\(ContactsResponseDto\)\s+list\(\)/);
    expect(content).toMatch(/@Get\(':id'\).*getById/s);
    expect(content).toMatch(/@Post\(\).*create/s);
    expect(content).toMatch(/@Patch\(':id'\).*update/s);
    expect(content).toMatch(/@Delete\(':id'\).*remove/s);
    expect((content.match(/throw new NotImplementedException\(\);/g) ?? []).length).toBe(5);
  });

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

  it('adds import line to app.module.ts', async () => {
    const tree = await runner.runSchematic('feature', { name: 'contacts' }, buildSeedTree());
    const content = tree.readContent('/src/app.module.ts');
    expect(content).toContain(
      `import { ContactsModule } from './modules/contacts/contacts.module';`,
    );
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
});
