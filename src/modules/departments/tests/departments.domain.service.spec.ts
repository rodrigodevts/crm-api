import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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

function encodeBadCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

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

  describe('list', () => {
    it('lança BadRequestException pra cursor com shape errado quando sort=name', async () => {
      await expect(
        service.list(
          'c1',
          { active: true, sort: 'name' },
          {
            cursor: encodeBadCursor({ createdAt: '2026-05-03T00:00:00.000Z', id: 'a' }),
            limit: 20,
          },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('lança BadRequestException pra cursor com shape errado quando sort=createdAt', async () => {
      await expect(
        service.list(
          'c1',
          { active: true, sort: 'createdAt' },
          { cursor: encodeBadCursor({ name: 'Suporte', id: 'a' }), limit: 20 },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('lança BadRequestException pra cursor base64 quebrado', async () => {
      await expect(
        service.list(
          'c1',
          { active: true, sort: 'createdAt' },
          { cursor: '!!!quebrado!!!', limit: 20 },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('softDelete', () => {
    it('chama userDepartment.deleteMany ANTES de update (atomicidade da $transaction)', async () => {
      const dept = { id: 'd1', companyId: 'c1', deletedAt: null };
      tx.department.findFirst.mockResolvedValue(dept);
      tx.userDepartment.deleteMany.mockResolvedValue({ count: 2 });
      tx.department.update.mockResolvedValue({ ...dept, deletedAt: new Date() });

      await service.softDelete('d1', 'c1', tx as never);

      // invocationCallOrder é um contador global crescente — comparar a ordem relativa
      // garante que deleteMany foi chamado ANTES de update no mesmo tx.
      const deleteCallOrder = tx.userDepartment.deleteMany.mock.invocationCallOrder[0]!;
      const updateCallOrder = tx.department.update.mock.invocationCallOrder[0]!;
      expect(deleteCallOrder).toBeLessThan(updateCallOrder);
    });

    it('lança NotFoundException quando depto não existe ou é de outro tenant', async () => {
      tx.department.findFirst.mockResolvedValue(null);
      await expect(service.softDelete('d1', 'c1', tx as never)).rejects.toThrow(NotFoundException);
      expect(tx.userDepartment.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('skipa assertNameAvailable quando patch.name === existing.name', async () => {
      const dept = { id: 'd1', companyId: 'c1', name: 'Suporte', deletedAt: null };
      tx.department.findFirst.mockResolvedValueOnce(dept); // findById
      tx.department.update.mockResolvedValue({ ...dept });

      await service.update('d1', 'c1', { name: 'Suporte' }, tx as never);
      // assertNameAvailable não foi chamado: findFirst só rodou 1x (do findById)
      expect(tx.department.findFirst).toHaveBeenCalledTimes(1);
    });

    it('chama assertNameAvailable quando patch.name é diferente', async () => {
      const dept = { id: 'd1', companyId: 'c1', name: 'Suporte', deletedAt: null };
      tx.department.findFirst
        .mockResolvedValueOnce(dept) // findById
        .mockResolvedValueOnce(null); // assertNameAvailable
      tx.department.update.mockResolvedValue({ ...dept, name: 'Atendimento' });

      await service.update('d1', 'c1', { name: 'Atendimento' }, tx as never);
      expect(tx.department.findFirst).toHaveBeenCalledTimes(2);
    });
  });
});
