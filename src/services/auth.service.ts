import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '../entities/user.entity';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { EmailService } from './email.service';
import { ConfigService } from '@nestjs/config';
import { AuditService, AuditAction } from './audit.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private emailService: EmailService,
    private configService: ConfigService,
    private dataSource: DataSource,
    private auditService: AuditService,
  ) {}

  async register(registerDto: RegisterDto): Promise<{ message: string; user: Partial<User> }> {
    const { email, username, password } = registerDto;

   
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

   
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

  
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');


    const user = this.userRepository.create({
      email,
      username,
      passwordHash,
      emailVerificationToken,
      balance: 0,
      emailVerified: false,
    });

    const savedUser = await this.userRepository.save(user);


    let emailSent = false;
    try {
      await this.emailService.sendVerificationEmail(email, emailVerificationToken);
      emailSent = true;
    } catch (error) {
   
      console.error('Failed to send verification email:', error);
    }

    const { passwordHash: _, ...userResponse } = savedUser;
    
 
    const isDevelopment = this.configService.get<string>('NODE_ENV') !== 'production';
    const response: any = {
      message: emailSent
        ? 'Registration successful. Please check your email to verify your account.'
        : 'Registration successful. Email verification token included below (email service not configured).',
      user: { ...userResponse, emailVerificationToken: undefined },
    };

   
    if (isDevelopment && !emailSent) {
      response.verificationToken = emailVerificationToken;
      response.verificationUrl = `${this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000')}/verify-email?token=${emailVerificationToken}`;
    }

    return response;
  }

  async login(loginDto: LoginDto): Promise<{ accessToken: string; user: Partial<User> }> {
    const { email, password } = loginDto;

    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

   
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

  
    if (!user.emailVerified) {
      throw new UnauthorizedException('Please verify your email address before logging in');
    }

  
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

  
    this.auditService.log(AuditAction.LOGIN, user.id);

  
    const { passwordHash: _, emailVerificationToken: __, passwordResetToken: ___, ...userResponse } = user;
    return {
      accessToken,
      user: userResponse,
    };
  }

  async verifyEmail(token: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { emailVerificationToken: token },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    user.emailVerified = true;
    user.emailVerificationToken = null;
    await this.userRepository.save(user);

  
    this.auditService.log(AuditAction.EMAIL_VERIFIED, user.id);

    return { message: 'Email verified successfully' };
  }

  async forgotPassword(email: string): Promise<{ message: string; resetToken?: string; resetUrl?: string }> {
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
     
      return { message: 'If the email exists, a password reset link has been sent' };
    }

   
    const passwordResetToken = crypto.randomBytes(32).toString('hex');
    const passwordResetExpires = new Date();
    passwordResetExpires.setHours(passwordResetExpires.getHours() + 1); // 1 hour expiry

    user.passwordResetToken = passwordResetToken;
    user.passwordResetExpires = passwordResetExpires;
    await this.userRepository.save(user);

 
    let emailSent = false;
    try {
      await this.emailService.sendPasswordResetEmail(email, passwordResetToken);
      emailSent = true;
    } catch (error) {  // Log error but don't fail the request
      console.error('Failed to send password reset email:', error);
    }

    const isDevelopment = this.configService.get<string>('NODE_ENV') !== 'production';
    const response: any = {
      message: emailSent
        ? 'If the email exists, a password reset link has been sent'
        : 'Password reset token generated. Token included below (email service not configured).',
    };

    
    if (isDevelopment && !emailSent) {
      const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
      response.resetToken = passwordResetToken;
      response.resetUrl = `${frontendUrl}/reset-password?token=${passwordResetToken}`;
    }

    return response;
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { passwordResetToken: token },
    });

    if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      throw new BadRequestException('Invalid or expired reset token');
    }


    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    user.passwordHash = passwordHash;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await this.userRepository.save(user);


    this.auditService.log(AuditAction.PASSWORD_RESET, user.id);

    return { message: 'Password reset successfully' };
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id: userId },
    });
  }

  async getVerificationToken(email: string): Promise<{ token: string; verificationUrl: string }> {
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.emailVerified) {
      throw new BadRequestException('Email is already verified');
    }

    if (!user.emailVerificationToken) {
      throw new BadRequestException('No verification token found. Please register again.');
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const verificationUrl = `${frontendUrl}/verify-email?token=${user.emailVerificationToken}`;

    return {
      token: user.emailVerificationToken,
      verificationUrl,
    };
  }
}

