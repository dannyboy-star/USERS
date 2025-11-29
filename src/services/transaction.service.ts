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
import { Balance } from '../entities/balance.entity';
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
    @InjectRepository(Balance)
    private balanceRepository: Repository<Balance>,
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

      // Get current balance from latest balance record
      const latestBalance = await manager.findOne(Balance, {
        where: { userId },
        order: { createdAt: 'DESC' },
      });

      const balanceBefore = latestBalance ? Number(latestBalance.balanceAfter) : 0;
      const balanceAfter = balanceBefore + Number(amount);

      // Create transaction record
      const transaction = manager.create(Transaction, {
        userId,
        type: TransactionType.DEPOSIT,
        amount: Number(amount),
        status: TransactionStatus.COMPLETED,
        description: description || 'Deposit',
        balanceBefore,
        balanceAfter,
      });

      const savedTransaction = await manager.save(transaction);

      // Create balance record
      const balance = manager.create(Balance, {
        userId,
        transactionId: savedTransaction.id,
        balanceBefore,
        balanceAfter,
        description: description || 'Deposit',
      });

      await manager.save(balance);

      // Audit log
      this.auditService.logBalanceChange(userId, balanceBefore, balanceAfter, 'Deposit');
      this.auditService.logTransaction(userId, savedTransaction.id, 'DEPOSIT', Number(amount));

      // Send confirmation email (don't fail transaction if email fails)
      this.emailService
        .sendTransactionConfirmationEmail(user.email, 'Deposit', Number(amount), balanceAfter)
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

      // Get current balance from latest balance record
      const latestBalance = await manager.findOne(Balance, {
        where: { userId },
        order: { createdAt: 'DESC' },
      });

      const balanceBefore = latestBalance ? Number(latestBalance.balanceAfter) : 0;
      const withdrawalAmount = Number(amount);

      // Check sufficient balance
      if (balanceBefore < withdrawalAmount) {
        throw new BadRequestException('Insufficient funds');
      }

      const balanceAfter = balanceBefore - withdrawalAmount;

      // Create transaction record
      const transaction = manager.create(Transaction, {
        userId,
        type: TransactionType.WITHDRAWAL,
        amount: withdrawalAmount,
        status: TransactionStatus.COMPLETED,
        description: description || 'Withdrawal',
        balanceBefore,
        balanceAfter,
      });

      const savedTransaction = await manager.save(transaction);

      // Create balance record
      const balance = manager.create(Balance, {
        userId,
        transactionId: savedTransaction.id,
        balanceBefore,
        balanceAfter,
        description: description || 'Withdrawal',
      });

      await manager.save(balance);

      // Audit log
      this.auditService.logBalanceChange(userId, balanceBefore, balanceAfter, 'Withdrawal');
      this.auditService.logTransaction(userId, savedTransaction.id, 'WITHDRAWAL', withdrawalAmount);

      // Send confirmation email
      this.emailService
        .sendTransactionConfirmationEmail(user.email, 'Withdrawal', withdrawalAmount, balanceAfter)
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

      // Get current balances for both users
      const senderLatestBalance = await manager.findOne(Balance, {
        where: { userId },
        order: { createdAt: 'DESC' },
      });

      const recipientLatestBalance = await manager.findOne(Balance, {
        where: { userId: recipient.id },
        order: { createdAt: 'DESC' },
      });

      const senderBalanceBefore = senderLatestBalance ? Number(senderLatestBalance.balanceAfter) : 0;
      const recipientBalanceBefore = recipientLatestBalance ? Number(recipientLatestBalance.balanceAfter) : 0;

      // Check sufficient balance
      if (senderBalanceBefore < transferAmount) {
        throw new BadRequestException('Insufficient funds');
      }

      // Calculate new balances
      const senderBalanceAfter = senderBalanceBefore - transferAmount;
      const recipientBalanceAfter = recipientBalanceBefore + transferAmount;

      // Create transaction record for sender
      const transaction = manager.create(Transaction, {
        userId,
        type: TransactionType.TRANSFER,
        amount: transferAmount,
        status: TransactionStatus.COMPLETED,
        description: description || `Transfer to ${recipientEmail}`,
        recipientUserId: recipient.id,
        balanceBefore: senderBalanceBefore,
        balanceAfter: senderBalanceAfter,
      });

      const savedTransaction = await manager.save(transaction);

      // Create balance record for sender
      const senderBalance = manager.create(Balance, {
        userId,
        transactionId: savedTransaction.id,
        balanceBefore: senderBalanceBefore,
        balanceAfter: senderBalanceAfter,
        description: description || `Transfer to ${recipientEmail}`,
      });

      await manager.save(senderBalance);

      // Audit log
      this.auditService.logBalanceChange(userId, senderBalanceBefore, senderBalanceAfter, 'Transfer');
      this.auditService.logTransaction(userId, savedTransaction.id, 'TRANSFER', transferAmount);

      // Create transaction record for recipient
      const recipientTransaction = manager.create(Transaction, {
        userId: recipient.id,
        type: TransactionType.TRANSFER,
        amount: transferAmount,
        status: TransactionStatus.COMPLETED,
        description: description || `Transfer from ${sender.email}`,
        recipientUserId: userId,
        balanceBefore: recipientBalanceBefore,
        balanceAfter: recipientBalanceAfter,
      });

      const savedRecipientTransaction = await manager.save(recipientTransaction);

      // Create balance record for recipient
      const recipientBalance = manager.create(Balance, {
        userId: recipient.id,
        transactionId: savedRecipientTransaction.id,
        balanceBefore: recipientBalanceBefore,
        balanceAfter: recipientBalanceAfter,
        description: description || `Transfer from ${sender.email}`,
      });

      await manager.save(recipientBalance);

      // Send confirmation emails
      this.emailService
        .sendTransactionConfirmationEmail(sender.email, 'Transfer', transferAmount, senderBalanceAfter)
        .catch((error) => {
          this.logger.error('Failed to send transfer confirmation email to sender', error);
        });

      this.emailService
        .sendTransactionConfirmationEmail(
          recipient.email,
          'Transfer Received',
          transferAmount,
          recipientBalanceAfter,
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

