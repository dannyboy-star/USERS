import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../entities/user.entity';
import { Transaction } from '../entities/transaction.entity';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const password = configService.get<string>('DB_PASSWORD') || '';
  
  return {
    type: 'postgres',
    host: configService.get<string>('DB_HOST', 'localhost'),
    port: configService.get<number>('DB_PORT', 5432),
    username: configService.get<string>('DB_USERNAME', 'postgres'),
    password: String(password), 
    database: configService.get<string>('DB_DATABASE', 'USERS'),
    entities: [User, Transaction],
    synchronize: configService.get<string>('NODE_ENV') !== 'production', 
    logging: configService.get<string>('NODE_ENV') === 'development',
  };
};

