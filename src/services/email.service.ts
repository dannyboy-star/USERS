import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private isEmailConfigured: boolean;

  constructor(private configService: ConfigService) {
    const emailHost = this.configService.get<string>('EMAIL_HOST');
    const emailUser = this.configService.get<string>('EMAIL_USER');
    const emailPassword = this.configService.get<string>('EMAIL_PASSWORD');

    this.isEmailConfigured = !!(emailHost && emailUser && emailPassword);

    if (this.isEmailConfigured) {
      this.transporter = nodemailer.createTransport({
        host: emailHost,
        port: this.configService.get<number>('EMAIL_PORT', 587),
        secure: false, 
        auth: {
          user: emailUser,
          pass: emailPassword,
        },
      });
      this.logger.log('Email service configured');
    } else {
      this.logger.warn('Email service not configured - emails will not be sent');
    }
  }

  async sendVerificationEmail(email: string, token: string): Promise<void> {
    if (!this.isEmailConfigured || !this.transporter) {
      this.logger.warn(`Email not configured - skipping verification email to ${email}`);
      throw new Error('Email service not configured');
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const verificationUrl = `${frontendUrl}/verify-email?token=${token}`;

    const mailOptions = {
      from: this.configService.get<string>('EMAIL_FROM', 'noreply@fintech.com'),
      to: email,
      subject: 'Verify Your Email Address',
      html: `
        <h2>Welcome to Fintech Solution!</h2>
        <p>Thank you for registering. Please verify your email address by clicking the link below:</p>
        <p><a href="${verificationUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a></p>
        <p>Or copy and paste this link into your browser:</p>
        <p>${verificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create an account, please ignore this email.</p>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Verification email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${email}`, error);
      throw new Error('Failed to send verification email');
    }
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    if (!this.isEmailConfigured || !this.transporter) {
      this.logger.warn(`Email not configured - skipping password reset email to ${email}`);
      throw new Error('Email service not configured');
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    const mailOptions = {
      from: this.configService.get<string>('EMAIL_FROM', 'noreply@fintech.com'),
      to: email,
      subject: 'Reset Your Password',
      html: `
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password. Click the link below to reset it:</p>
        <p><a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
        <p>Or copy and paste this link into your browser:</p>
        <p>${resetUrl}</p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request a password reset, please ignore this email and your password will remain unchanged.</p>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}`, error);
      throw new Error('Failed to send password reset email');
    }
  }

  async sendTransactionConfirmationEmail(
    email: string,
    transactionType: string,
    amount: number,
    balance: number,
  ): Promise<void> {
    if (!this.isEmailConfigured || !this.transporter) {
      // Silently skip - transaction confirmation emails are optional
      return;
    }

    const mailOptions = {
      from: this.configService.get<string>('EMAIL_FROM', 'noreply@fintech.com'),
      to: email,
      subject: `Transaction Confirmation: ${transactionType}`,
      html: `
        <h2>Transaction Confirmed</h2>
        <p>Your ${transactionType} transaction has been completed successfully.</p>
        <p><strong>Amount:</strong> $${amount.toFixed(2)}</p>
        <p><strong>New Balance:</strong> $${balance.toFixed(2)}</p>
        <p>If you didn't make this transaction, please contact support immediately.</p>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Transaction confirmation email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send transaction confirmation email to ${email}`, error);
      // Don't throw error here - transaction is already completed
    }
  }
}

