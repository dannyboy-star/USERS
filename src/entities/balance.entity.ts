import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Transaction } from './transaction.entity';

@Entity('balances')
@Index(['user', 'createdAt'])
export class Balance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  @Index()
  userId: string;

  @ManyToOne(() => Transaction, { nullable: true })
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction | null;

  @Column({ nullable: true })
  transactionId: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  balanceBefore: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  balanceAfter: number;

  @Column({ nullable: true })
  description: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

