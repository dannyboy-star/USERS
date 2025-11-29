import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserController } from '../controllers/user.controller';
import { UserService } from '../services/user.service';
import { User } from '../entities/user.entity';
import { Balance } from '../entities/balance.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Balance])],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}

