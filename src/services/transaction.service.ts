import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Transaction, TransactionType, TransactionStatus } from '../entities/transaction.entity';
import { User } from '../entities/user.entity';
import { DepositDto, WithdrawDto, TransferDto } from '../dto/transaction.dto';
import { EmailService } from './email.service';
import { AuditService } from './audit.service';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private dataSource: DataSource,
    private emailService: EmailService,
    private auditService: AuditService,
  ) {}

  async deposit(userId: string, depositDto: DepositDto): Promise<Transaction> {
    const { amount, description } = depositDto;

    return this.dataSource.transaction(async (manager) => {
      // Lock user row for update to prevent race conditions
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      // Update balance atomically
      const oldBalance = Number(user.balance);
      const newBalance = oldBalance + Number(amount);
      user.balance = newBalance;
      await manager.save(user);

      // Create transaction record
      const transaction = manager.create(Transaction, {
        userId,
        type: TransactionType.DEPOSIT,
        amount: Number(amount),
        status: TransactionStatus.COMPLETED,
        description: description || 'Deposit',
        balanceAfter: newBalance,
      });

      const savedTransaction = await manager.save(transaction);

      // Audit log
      this.auditService.logBalanceChange(userId, oldBalance, newBalance, 'Deposit');
      this.auditService.logTransaction(userId, savedTransaction.id, 'DEPOSIT', Number(amount));

      // Send confirmation email (don't fail transaction if email fails)
      this.emailService
        .sendTransactionConfirmationEmail(user.email, 'Deposit', Number(amount), newBalance)
        .catch((error) => {
          this.logger.error('Failed to send deposit confirmation email', error);
        });

      return savedTransaction;
    });
  }

  async withdraw(userId: string, withdrawDto: WithdrawDto): Promise<Transaction> {
    const { amount, description } = withdrawDto;

    return this.dataSource.transaction(async (manager) => {
      // Lock user row for update
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const currentBalance = Number(user.balance);
      const withdrawalAmount = Number(amount);

      // Check sufficient balance
      if (currentBalance < withdrawalAmount) {
        throw new BadRequestException('Insufficient funds');
      }

      // Update balance atomically
      const newBalance = currentBalance - withdrawalAmount;
      user.balance = newBalance;
      await manager.save(user);

      // Create transaction record
      const transaction = manager.create(Transaction, {
        userId,
        type: TransactionType.WITHDRAWAL,
        amount: withdrawalAmount,
        status: TransactionStatus.COMPLETED,
        description: description || 'Withdrawal',
        balanceAfter: newBalance,
      });

      const savedTransaction = await manager.save(transaction);

      // Audit log
      this.auditService.logBalanceChange(userId, currentBalance, newBalance, 'Withdrawal');
      this.auditService.logTransaction(userId, savedTransaction.id, 'WITHDRAWAL', withdrawalAmount);

      // Send confirmation email
      this.emailService
        .sendTransactionConfirmationEmail(user.email, 'Withdrawal', withdrawalAmount, newBalance)
        .catch((error) => {
          this.logger.error('Failed to send withdrawal confirmation email', error);
        });

      return savedTransaction;
    });
  }

  async transfer(userId: string, transferDto: TransferDto): Promise<Transaction> {
    const { recipientEmail, amount, description } = transferDto;

    return this.dataSource.transaction(async (manager) => {
      // Find recipient
      const recipient = await manager.findOne(User, {
        where: { email: recipientEmail },
      });

      if (!recipient) {
        throw new NotFoundException('Recipient not found');
      }

      if (recipient.id === userId) {
        throw new BadRequestException('Cannot transfer to yourself');
      }

      // Lock both user rows for update
      const sender = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!sender) {
        throw new NotFoundException('Sender not found');
      }

      const recipientLocked = await manager.findOne(User, {
        where: { id: recipient.id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!recipientLocked) {
        throw new NotFoundException('Recipient not found');
      }

      const transferAmount = Number(amount);
      const senderBalance = Number(sender.balance);

      // Check sufficient balance
      if (senderBalance < transferAmount) {
        throw new BadRequestException('Insufficient funds');
      }

      // Update both balances atomically
      const senderNewBalance = senderBalance - transferAmount;
      const recipientNewBalance = Number(recipientLocked.balance) + transferAmount;

      sender.balance = senderNewBalance;
      recipientLocked.balance = recipientNewBalance;

      await manager.save(sender);
      await manager.save(recipientLocked);

      // Create transaction record for sender
      const transaction = manager.create(Transaction, {
        userId,
        type: TransactionType.TRANSFER,
        amount: transferAmount,
        status: TransactionStatus.COMPLETED,
        description: description || `Transfer to ${recipientEmail}`,
        recipientUserId: recipient.id,
        balanceAfter: senderNewBalance,
      });

      const savedTransaction = await manager.save(transaction);

      // Audit log
      this.auditService.logBalanceChange(userId, senderBalance, senderNewBalance, 'Transfer');
      this.auditService.logTransaction(userId, savedTransaction.id, 'TRANSFER', transferAmount);

      // Create transaction record for recipient
      const recipientTransaction = manager.create(Transaction, {
        userId: recipient.id,
        type: TransactionType.TRANSFER,
        amount: transferAmount,
        status: TransactionStatus.COMPLETED,
        description: description || `Transfer from ${sender.email}`,
        recipientUserId: userId,
        balanceAfter: recipientNewBalance,
      });

      await manager.save(recipientTransaction);

      // Send confirmation emails
      this.emailService
        .sendTransactionConfirmationEmail(sender.email, 'Transfer', transferAmount, senderNewBalance)
        .catch((error) => {
          this.logger.error('Failed to send transfer confirmation email to sender', error);
        });

      this.emailService
        .sendTransactionConfirmationEmail(
          recipient.email,
          'Transfer Received',
          transferAmount,
          recipientNewBalance,
        )
        .catch((error) => {
          this.logger.error('Failed to send transfer confirmation email to recipient', error);
        });

      return savedTransaction;
    });
  }

  async getTransactions(
    userId: string,
    page: number = 1,
    limit: number = 10,
    type?: TransactionType,
  ): Promise<{ transactions: Transaction[]; total: number; page: number; limit: number }> {
    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .where('transaction.userId = :userId', { userId })
      .orderBy('transaction.createdAt', 'DESC');

    if (type) {
      queryBuilder.andWhere('transaction.type = :type', { type });
    }

    const [transactions, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      transactions,
      total,
      page,
      limit,
    };
  }
}

