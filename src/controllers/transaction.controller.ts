import { Controller, Post, Get, Body, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TransactionService } from '../services/transaction.service';
import { CurrentUser } from '../decorators/current-user.decorator';
import { User } from '../entities/user.entity';
import { DepositDto, WithdrawDto, TransferDto } from '../dto/transaction.dto';
import { TransactionType } from '../entities/transaction.entity';

@ApiTags('transactions')
@ApiBearerAuth('JWT-auth')
@Controller('transactions')
export class TransactionController {
  constructor(private transactionService: TransactionService) {}

  @Post('deposit')
  @ApiOperation({ summary: 'Deposit funds into account' })
  @ApiResponse({ status: 201, description: 'Deposit successful' })
  @ApiResponse({ status: 400, description: 'Invalid amount' })
  async deposit(@CurrentUser() user: User, @Body() depositDto: DepositDto) {
    return this.transactionService.deposit(user.id, depositDto);
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Withdraw funds from account' })
  @ApiResponse({ status: 201, description: 'Withdrawal successful' })
  @ApiResponse({ status: 400, description: 'Insufficient funds or invalid amount' })
  async withdraw(@CurrentUser() user: User, @Body() withdrawDto: WithdrawDto) {
    return this.transactionService.withdraw(user.id, withdrawDto);
  }

  @Post('transfer')
  @ApiOperation({ summary: 'Transfer funds to another user' })
  @ApiResponse({ status: 201, description: 'Transfer successful' })
  @ApiResponse({ status: 400, description: 'Insufficient funds or invalid recipient' })
  async transfer(@CurrentUser() user: User, @Body() transferDto: TransferDto) {
    return this.transactionService.transfer(user.id, transferDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get transaction history' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'type', required: false, enum: TransactionType, description: 'Filter by transaction type' })
  @ApiResponse({ status: 200, description: 'Transactions retrieved successfully' })
  async getTransactions(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('type') type?: TransactionType,
  ) {
    return this.transactionService.getTransactions(user.id, page, limit, type);
  }
}

