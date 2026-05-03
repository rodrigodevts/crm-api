import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { ZodError } from 'zod';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../database/prisma.service';
import { AuthDomainService } from '../../auth/services/auth.domain.service';
import type { CreateUserDto } from '../schemas/create-user.schema';
import type { ListUsersQueryDto } from '../schemas/list-users.schema';
import type { UpdateMeDto } from '../schemas/update-me.schema';
import { UpdateMeSchema } from '../schemas/update-me.schema';
import type { UpdateUserDto } from '../schemas/update-user.schema';
import { UpdateUserSchema } from '../schemas/update-user.schema';
import type { UserListResponseDto, UserResponseDto } from '../schemas/user-response.schema';
import {
  UsersDomainService,
  type UpdateUserPatch,
  type UserWithDepartments,
} from './users.domain.service';

const BCRYPT_COST = 12;
const EMAIL_DUPLICATED_MESSAGE = 'Email já cadastrado';

@Injectable()
export class UsersApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersDomain: UsersDomainService,
    private readonly authDomain: AuthDomainService,
  ) {}

  async create(input: CreateUserDto, companyId: string): Promise<UserResponseDto> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    try {
      const user = await this.prisma.$transaction((tx) =>
        this.usersDomain.create(
          {
            name: input.name,
            email: input.email,
            passwordHash,
            role: input.role,
            departmentIds: input.departmentIds,
          },
          companyId,
          tx,
        ),
      );
      return this.toDto(user);
    } catch (err) {
      throw this.mapEmailConflict(err);
    }
  }

  async list(companyId: string, query: ListUsersQueryDto): Promise<UserListResponseDto> {
    // Build filters object, omitting undefined values due to exactOptionalPropertyTypes.
    // We use 'any' to construct the filters object dynamically, suppressing linting.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filters: any = {};
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (query.role !== undefined) filters.role = query.role;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (query.active !== undefined) filters.active = query.active;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (query.departmentId !== undefined) filters.departmentId = query.departmentId;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (query.search !== undefined) filters.search = query.search;

    // Build pagination object, omitting undefined cursor due to exactOptionalPropertyTypes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pagination: any = { limit: query.limit };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (query.cursor !== undefined) pagination.cursor = query.cursor;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const result = await this.usersDomain.list(companyId, filters, pagination);
    return {
      items: result.items.map((u) => this.toDto(u)),
      pagination: { nextCursor: result.nextCursor, hasMore: result.hasMore },
    };
  }

  async findById(id: string, companyId: string): Promise<UserResponseDto> {
    const user = await this.usersDomain.findByIdWithDepartments(id, companyId);
    return this.toDto(user);
  }

  async updateById(id: string, companyId: string, input: UpdateUserDto): Promise<UserResponseDto> {
    this.assertStrict(UpdateUserSchema, input);
    const patch = await this.toPatch(input);
    try {
      const user = await this.prisma.$transaction((tx) =>
        this.usersDomain.update(id, companyId, patch, tx),
      );
      return this.toDto(user);
    } catch (err) {
      throw this.mapEmailConflict(err);
    }
  }

  async updateMe(currentUser: User, input: UpdateMeDto): Promise<UserResponseDto> {
    this.assertStrict(UpdateMeSchema, input);

    const patch: UpdateUserPatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.password) patch.passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    if ('absenceMessage' in input) patch.absenceMessage = input.absenceMessage ?? null;
    if (input.absenceActive !== undefined) patch.absenceActive = input.absenceActive;

    const user = await this.prisma.$transaction((tx) =>
      this.usersDomain.update(currentUser.id, currentUser.companyId, patch, tx),
    );
    return this.toDto(user);
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    await this.prisma.$transaction((tx) => this.usersDomain.softDelete(id, companyId, tx));
  }

  async forceLogout(targetId: string, companyId: string): Promise<void> {
    const target = await this.usersDomain.findByIdWithDepartments(targetId, companyId);
    this.usersDomain.assertNotSuperAdmin(target);
    await this.authDomain.revokeAllRefreshTokens(targetId, companyId);
  }

  private async toPatch(input: UpdateUserDto): Promise<UpdateUserPatch> {
    const patch: UpdateUserPatch = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.email !== undefined) patch.email = input.email;
    if (input.password) patch.passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    if (input.role !== undefined) patch.role = input.role;
    if (input.departmentIds !== undefined) patch.departmentIds = input.departmentIds;
    if ('absenceMessage' in input) patch.absenceMessage = input.absenceMessage ?? null;
    if (input.absenceActive !== undefined) patch.absenceActive = input.absenceActive;
    return patch;
  }

  private toDto(user: UserWithDepartments): UserResponseDto {
    return {
      id: user.id,
      companyId: user.companyId,
      name: user.name,
      email: user.email,
      role: user.role,
      absenceMessage: user.absenceMessage,
      absenceActive: user.absenceActive,
      lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
      departments: user.departments.map((ud) => ({
        id: ud.department.id,
        name: ud.department.name,
      })),
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private assertStrict(schema: { parse: (value: unknown) => unknown }, input: unknown): void {
    try {
      schema.parse(input);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'Validação falhou',
          errors: error.issues.map((issue) => ({
            field: issue.path.join('.') || '<root>',
            message: issue.message,
            code: issue.code,
          })),
        });
      }
      throw error;
    }
  }

  private mapEmailConflict(err: unknown): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      Array.isArray((err.meta as { target?: string[] } | undefined)?.target) &&
      (err.meta as { target: string[] }).target.includes('email')
    ) {
      return new ConflictException(EMAIL_DUPLICATED_MESSAGE);
    }
    return err;
  }
}
