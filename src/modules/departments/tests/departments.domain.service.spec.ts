import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaService } from '@/database/prisma.service';
import { DepartmentsDomainService } from '../services/departments.domain.service';

type Tx = {
  department: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  userDepartment: {
    deleteMany: ReturnType<typeof vi.fn>;
  };
};

function makeTx(): Tx {
  return {
    department: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    userDepartment: {
      deleteMany: vi.fn(),
    },
  };
}

describe('DepartmentsDomainService', () => {
  let service: DepartmentsDomainService;
  let tx: Tx;

  beforeEach(async () => {
    tx = makeTx();
    const module: TestingModule = await Test.createTestingModule({
      providers: [DepartmentsDomainService, { provide: PrismaService, useValue: tx }],
    }).compile();
    service = module.get(DepartmentsDomainService);
  });

  describe('findById', () => {
    it('retorna o department quando existe e pertence ao tenant', async () => {
      const dept = { id: 'd1', companyId: 'c1', deletedAt: null };
      tx.department.findFirst.mockResolvedValue(dept);
      const result = await service.findById('d1', 'c1', tx as never);
      expect(result).toEqual(dept);
      expect(tx.department.findFirst).toHaveBeenCalledWith({
        where: { id: 'd1', companyId: 'c1', deletedAt: null },
      });
    });

    it('lança NotFoundException quando não existe', async () => {
      tx.department.findFirst.mockResolvedValue(null);
      await expect(service.findById('xxx', 'c1', tx as never)).rejects.toThrow(NotFoundException);
    });

    it('lança NotFoundException quando pertence a outro tenant (companyId no where)', async () => {
      // O mock retorna null porque o where filtra por companyId.
      tx.department.findFirst.mockResolvedValue(null);
      await expect(service.findById('d1', 'c2', tx as never)).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertNameAvailable', () => {
    it('passa quando nome livre', async () => {
      tx.department.findFirst.mockResolvedValue(null);
      await expect(
        service.assertNameAvailable('Suporte', 'c1', tx as never),
      ).resolves.not.toThrow();
    });

    it('lança ConflictException quando outro depto do mesmo tenant tem o nome', async () => {
      tx.department.findFirst.mockResolvedValue({ id: 'd1' });
      await expect(service.assertNameAvailable('Suporte', 'c1', tx as never)).rejects.toThrow(
        ConflictException,
      );
    });

    it('passa quando o único colidindo é o próprio (exceptId)', async () => {
      tx.department.findFirst.mockResolvedValue({ id: 'd1' });
      await expect(
        service.assertNameAvailable('Suporte', 'c1', tx as never, 'd1'),
      ).resolves.not.toThrow();
    });

    it('filtra deletedAt: null no where (intenção de reusar nome de soft-deletado)', async () => {
      tx.department.findFirst.mockResolvedValue(null);
      await service.assertNameAvailable('Suporte', 'c1', tx as never);
      expect(tx.department.findFirst).toHaveBeenCalledWith({
        where: { companyId: 'c1', name: 'Suporte', deletedAt: null },
      });
    });
  });
});
