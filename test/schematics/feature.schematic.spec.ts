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
});
