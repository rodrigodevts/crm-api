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
