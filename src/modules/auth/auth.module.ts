import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './controllers/auth.controller';
import { AuthApplicationService } from './services/auth.application.service';
import { AuthDomainService } from './services/auth.domain.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({}), ConfigModule],
  controllers: [AuthController],
  providers: [AuthApplicationService, AuthDomainService, JwtStrategy],
  exports: [AuthApplicationService, AuthDomainService],
})
export class AuthModule {}
