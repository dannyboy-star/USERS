import { Injectable, Logger } from '@nestjs/common';

export enum AuditAction {
  BALANCE_CHANGE = 'BALANCE_CHANGE',
  PASSWORD_RESET = 'PASSWORD_RESET',
  EMAIL_VERIFIED = 'EMAIL_VERIFIED',
  TRANSACTION_CREATED = 'TRANSACTION_CREATED',
  USER_REGISTERED = 'USER_REGISTERED',
  LOGIN = 'LOGIN',
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  log(action: AuditAction, userId: string, details: Record<string, any> = {}) {
    const auditLog = {
      timestamp: new Date().toISOString(),
      action,
      userId,
      details,
    };

    
    this.logger.log(`[AUDIT] ${JSON.stringify(auditLog)}`);

  
    if ([AuditAction.BALANCE_CHANGE, AuditAction.PASSWORD_RESET].includes(action)) {
      this.logger.warn(`[AUDIT] ${JSON.stringify(auditLog)}`);
    }
  }

  logBalanceChange(userId: string, oldBalance: number, newBalance: number, reason: string) {
    this.log(AuditAction.BALANCE_CHANGE, userId, {
      oldBalance,
      newBalance,
      change: newBalance - oldBalance,
      reason,
    });
  }

  logTransaction(userId: string, transactionId: string, type: string, amount: number) {
    this.log(AuditAction.TRANSACTION_CREATED, userId, {
      transactionId,
      type,
      amount,
    });
  }
}

