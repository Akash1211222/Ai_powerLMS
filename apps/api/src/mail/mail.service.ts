import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Email delivery abstraction (§32). Uses SMTP (Mailhog locally, SES/Resend in
 * prod). Delivery is best-effort: if SMTP is unreachable in development, the
 * message (and any action link) is logged so flows remain testable without a
 * mail server. The underlying token is always persisted regardless of delivery.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly webBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.from = this.config.get<string>('MAIL_FROM') ?? 'FutureCorp Academy <no-reply@localhost>';
    this.webBaseUrl = this.config.get<string>('WEB_BASE_URL') ?? 'http://localhost:3000';
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('MAIL_HOST') ?? 'localhost',
      port: Number(this.config.get<string>('MAIL_PORT') ?? 1025),
      secure: false,
      auth: this.config.get<string>('MAIL_USER')
        ? {
            user: this.config.get<string>('MAIL_USER'),
            pass: this.config.get<string>('MAIL_PASSWORD'),
          }
        : undefined,
    });
  }

  private async send(to: string, subject: string, html: string, devLink?: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
    } catch (err) {
      this.logger.warn(
        `Email to ${to} ("${subject}") not delivered: ${(err as Error).message}` +
          (devLink ? ` — dev link: ${devLink}` : ''),
      );
    }
  }

  async sendEmailVerification(to: string, token: string): Promise<void> {
    const link = `${this.webBaseUrl}/verify-email?token=${token}`;
    await this.send(
      to,
      'Verify your FutureCorp Academy email',
      `<p>Welcome! Confirm your email to activate your account.</p><p><a href="${link}">Verify email</a></p>`,
      link,
    );
  }

  async sendNotification(to: string, title: string, body: string, deepLink?: string): Promise<void> {
    const link = deepLink ? `${this.webBaseUrl}${deepLink}` : this.webBaseUrl;
    await this.send(
      to,
      title,
      `<p>${escapeHtml(body)}</p><p><a href="${link}">Open FutureCorp Academy</a></p>`,
      link,
    );
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const link = `${this.webBaseUrl}/reset-password?token=${token}`;
    await this.send(
      to,
      'Reset your FutureCorp Academy password',
      `<p>We received a request to reset your password.</p><p><a href="${link}">Reset password</a></p><p>If you didn't request this, ignore this email.</p>`,
      link,
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
