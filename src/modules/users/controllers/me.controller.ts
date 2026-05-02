import { Body, Controller, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { UpdateMeDto } from '../schemas/update-me.schema';
import { UserResponseSchema } from '../schemas/user-response.schema';
import type { UserResponseDto } from '../schemas/user-response.schema';
import { UsersApplicationService } from '../services/users.application.service';

@ApiTags('me')
@Controller('me')
export class MeController {
  constructor(private readonly users: UsersApplicationService) {}

  @Patch()
  @ZodSerializerDto(UserResponseSchema)
  async updateMe(
    @Body() body: UpdateMeDto,
    @CurrentUser() currentUser: User,
  ): Promise<UserResponseDto> {
    return this.users.updateMe(currentUser, body);
  }
}
