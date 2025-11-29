import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionController } from '../controllers/transaction.controller';
import { TransactionService } from '../services/transaction.service';
import { EmailService } from '../services/email.service';
import { AuditService } from '../services/audit.service';
import { Transaction } from '../entities/transaction.entity';
import { User } from '../entities/user.entity';
import { Balance } from '../entities/balance.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, User, Balance])],
  controllers: [TransactionController],
  providers: [TransactionService, EmailService, AuditService],
})
export class TransactionModule {}

