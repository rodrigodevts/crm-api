import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import type { FastifyRequest } from 'fastify';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { AuthResponseDto } from '../schemas/auth-response.schema';
import { LoginDto } from '../schemas/login.schema';
import { LogoutDto } from '../schemas/logout.schema';
import { RefreshDto } from '../schemas/refresh.schema';
import { AuthApplicationService } from '../services/auth.application.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthApplicationService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(AuthResponseDto)
  async login(@Body() body: LoginDto, @Req() request: FastifyRequest): Promise<AuthResponseDto> {
    return this.auth.login(
      body.email,
      body.password,
      request.ip ?? null,
      request.headers['user-agent'] ?? null,
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(AuthResponseDto)
  async refresh(
    @Body() body: RefreshDto,
    @Req() request: FastifyRequest,
  ): Promise<AuthResponseDto> {
    return this.auth.refresh(
      body.refreshToken,
      request.ip ?? null,
      request.headers['user-agent'] ?? null,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: LogoutDto, @CurrentUser() user: User): Promise<void> {
    await this.auth.logout(body.refreshToken, user);
  }
}
