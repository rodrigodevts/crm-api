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
