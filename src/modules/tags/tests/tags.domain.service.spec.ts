import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import type { Company } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { TagsDomainService } from '../services/tags.domain.service';
import { createCompany, createTag, truncateAll } from '../../../../test/e2e/factories';
import { getPrisma } from '../../../../test/setup-prisma';

describe('TagsDomainService.findById', () => {
  let service: TagsDomainService;
  let companyA: Company;
  let companyB: Company;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TagsDomainService, { provide: PrismaService, useValue: getPrisma() }],
    }).compile();
    service = moduleRef.get(TagsDomainService);
  });

  afterAll(async () => {
    await truncateAll(getPrisma());
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    companyA = await createCompany(getPrisma());
    companyB = await createCompany(getPrisma());
  });

  it('retorna tag quando existe no tenant', async () => {
    const tag = await createTag(getPrisma(), companyA.id, { name: 'VIP' });
    const found = await service.findById(tag.id, companyA.id);
    expect(found.id).toBe(tag.id);
    expect(found.name).toBe('VIP');
  });

  it('lança 404 quando tag não existe', async () => {
    await expect(
      service.findById('00000000-0000-0000-0000-000000000000', companyA.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lança 404 quando tag pertence a outro tenant (cross-tenant guard)', async () => {
    const tag = await createTag(getPrisma(), companyB.id);
    await expect(service.findById(tag.id, companyA.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TagsDomainService.list', () => {
  let service: TagsDomainService;
  let companyA: Company;
  let companyB: Company;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TagsDomainService, { provide: PrismaService, useValue: getPrisma() }],
    }).compile();
    service = moduleRef.get(TagsDomainService);
  });

  beforeEach(async () => {
    await truncateAll(getPrisma());
    companyA = await createCompany(getPrisma());
    companyB = await createCompany(getPrisma());
  });

  it('retorna apenas tags do tenant solicitado (multi-tenant)', async () => {
    await createTag(getPrisma(), companyA.id, { name: 'A1' });
    await createTag(getPrisma(), companyB.id, { name: 'B1' });
    const { items } = await service.list(companyA.id, { sort: 'createdAt' }, { limit: 10 });
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('A1');
  });

  it('sem filtro de active retorna ativas e inativas', async () => {
    await createTag(getPrisma(), companyA.id, { name: 'Ativa', active: true });
    await createTag(getPrisma(), companyA.id, { name: 'Inativa', active: false });
    const { items } = await service.list(companyA.id, { sort: 'createdAt' }, { limit: 10 });
    expect(items).toHaveLength(2);
  });

  it('filtro active=true retorna apenas ativas', async () => {
    await createTag(getPrisma(), companyA.id, { name: 'Ativa', active: true });
    await createTag(getPrisma(), companyA.id, { name: 'Inativa', active: false });
    const { items } = await service.list(
      companyA.id,
      { active: true, sort: 'createdAt' },
      { limit: 10 },
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('Ativa');
  });

  it('filtro search é case-insensitive contains', async () => {
    await createTag(getPrisma(), companyA.id, { name: 'Cliente VIP' });
    await createTag(getPrisma(), companyA.id, { name: 'Suporte' });
    const { items } = await service.list(
      companyA.id,
      { search: 'vip', sort: 'createdAt' },
      { limit: 10 },
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('Cliente VIP');
  });

  it('scope=TICKET retorna TICKET + BOTH (semântica de aplicabilidade)', async () => {
    await createTag(getPrisma(), companyA.id, { name: 'T', scope: 'TICKET' });
    await createTag(getPrisma(), companyA.id, { name: 'C', scope: 'CONTACT' });
    await createTag(getPrisma(), companyA.id, { name: 'B', scope: 'BOTH' });
    const { items } = await service.list(
      companyA.id,
      { scope: 'TICKET', sort: 'name' },
      { limit: 10 },
    );
    expect(items.map((t) => t.name).sort()).toEqual(['B', 'T']);
  });

  it('scope=CONTACT retorna CONTACT + BOTH', async () => {
    await createTag(getPrisma(), companyA.id, { name: 'T', scope: 'TICKET' });
    await createTag(getPrisma(), companyA.id, { name: 'C', scope: 'CONTACT' });
    await createTag(getPrisma(), companyA.id, { name: 'B', scope: 'BOTH' });
    const { items } = await service.list(
      companyA.id,
      { scope: 'CONTACT', sort: 'name' },
      { limit: 10 },
    );
    expect(items.map((t) => t.name).sort()).toEqual(['B', 'C']);
  });

  it('scope=BOTH retorna apenas BOTH (literal)', async () => {
    await createTag(getPrisma(), companyA.id, { name: 'T', scope: 'TICKET' });
    await createTag(getPrisma(), companyA.id, { name: 'B', scope: 'BOTH' });
    const { items } = await service.list(
      companyA.id,
      { scope: 'BOTH', sort: 'createdAt' },
      { limit: 10 },
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.name).toBe('B');
  });

  it('sort=name ordena alfabeticamente', async () => {
    await createTag(getPrisma(), companyA.id, { name: 'C' });
    await createTag(getPrisma(), companyA.id, { name: 'A' });
    await createTag(getPrisma(), companyA.id, { name: 'B' });
    const { items } = await service.list(companyA.id, { sort: 'name' }, { limit: 10 });
    expect(items.map((t) => t.name)).toEqual(['A', 'B', 'C']);
  });

  it('sort=createdAt ordena desc (mais nova primeiro)', async () => {
    const t1 = await createTag(getPrisma(), companyA.id, { name: 'T1' });
    await new Promise((r) => setTimeout(r, 5));
    const t2 = await createTag(getPrisma(), companyA.id, { name: 'T2' });
    const { items } = await service.list(companyA.id, { sort: 'createdAt' }, { limit: 10 });
    expect(items[0]!.id).toBe(t2.id);
    expect(items[1]!.id).toBe(t1.id);
  });

  it('paginação cursor cobre todas as tags exatamente uma vez', async () => {
    await createTag(getPrisma(), companyA.id, { name: 'A' });
    await createTag(getPrisma(), companyA.id, { name: 'B' });
    await createTag(getPrisma(), companyA.id, { name: 'C' });
    await createTag(getPrisma(), companyA.id, { name: 'D' });
    await createTag(getPrisma(), companyA.id, { name: 'E' });

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const result = await service.list(
        companyA.id,
        { sort: 'name' },
        cursor !== undefined ? { cursor, limit: 2 } : { limit: 2 },
      );
      seen.push(...result.items.map((t) => t.name));
      if (!result.hasMore) break;
      const last = result.items[result.items.length - 1]!;
      cursor = Buffer.from(JSON.stringify({ name: last.name, id: last.id })).toString('base64url');
    }
    expect(seen.sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});
