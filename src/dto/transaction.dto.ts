import { IsNumber, IsPositive, IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DepositDto {
  @ApiProperty({ description: 'Deposit amount', minimum: 0.01, maximum: 1000000, example: 100.50 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Amount must be a positive number' })
  @Min(0.01, { message: 'Minimum deposit amount is 0.01' })
  @Max(1000000, { message: 'Maximum deposit amount is 1,000,000' })
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({ description: 'Optional description for the deposit', example: 'Salary deposit' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class WithdrawDto {
  @ApiProperty({ description: 'Withdrawal amount', minimum: 0.01, maximum: 1000000, example: 50.00 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Amount must be a positive number' })
  @Min(0.01, { message: 'Minimum withdrawal amount is 0.01' })
  @Max(1000000, { message: 'Maximum withdrawal amount is 1,000,000' })
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({ description: 'Optional description for the withdrawal', example: 'ATM withdrawal' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class TransferDto {
  @ApiProperty({ description: 'Recipient email address', example: 'recipient@example.com' })
  @IsString()
  recipientEmail: string;

  @ApiProperty({ description: 'Transfer amount', minimum: 0.01, maximum: 1000000, example: 25.75 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Amount must be a positive number' })
  @Min(0.01, { message: 'Minimum transfer amount is 0.01' })
  @Max(1000000, { message: 'Maximum transfer amount is 1,000,000' })
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({ description: 'Optional description for the transfer', example: 'Payment for services' })
  @IsOptional()
  @IsString()
  description?: string;
}

