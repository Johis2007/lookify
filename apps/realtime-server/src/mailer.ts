import nodemailer, { type Transporter } from 'nodemailer';
import { ACTIVATION_VIGENCIA_MS } from './activation.js';

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type SendMail = (message: MailMessage) => Promise<void>;

export class MailNotConfiguredError extends Error {
  constructor() {
    super('smtp_not_configured');
    this.name = 'MailNotConfiguredError';
  }
}

let cached: { signature: string; transporter: Transporter } | null = null;

function envFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function transporterFor(env: NodeJS.ProcessEnv): Transporter {
  const url = env.SMTP_URL?.trim();
  const host = env.SMTP_HOST?.trim();
  if (!url && !host) throw new MailNotConfiguredError();

  const port = Number(env.SMTP_PORT || 587);
  const secure = envFlag(env.SMTP_SECURE, port === 465);
  const requireTLS = envFlag(env.SMTP_REQUIRE_TLS, false);
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  const rejectUnauthorized = envFlag(env.SMTP_TLS_REJECT_UNAUTHORIZED, true);
  const signature = JSON.stringify({
    url,
    host,
    port,
    secure,
    requireTLS,
    user,
    rejectUnauthorized,
  });
  if (cached?.signature === signature) return cached.transporter;

  const transporter = url
    ? nodemailer.createTransport(url)
    : nodemailer.createTransport({
        host,
        port,
        secure,
        requireTLS,
        auth: user ? { user, pass: pass ?? '' } : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
        tls: { rejectUnauthorized },
      });
  cached = { signature, transporter };
  return transporter;
}

export async function sendSmtpMail(
  message: MailMessage,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const from = env.SMTP_FROM?.trim();
  if (!from) throw new MailNotConfiguredError();
  const transporter = transporterFor(env);
  await transporter.sendMail({
    from,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}

export function buildActivationEmail(input: {
  to: string;
  code: string;
}): MailMessage {
  const minutes = Math.round(ACTIVATION_VIGENCIA_MS / 60_000);
  return {
    to: input.to,
    subject: 'Tu solicitud en Lookify PRO fue aprobada',
    text: [
      'Hola,',
      '',
      'Tu solicitud para prestar servicios en Lookify PRO fue aprobada.',
      '',
      `Abre la app Lookify PRO e ingresa este código de ${input.code.length} dígitos:`,
      '',
      input.code,
      '',
      `El código vence en ${minutes} minutos.`,
      '',
      'Si no solicitaste esta cuenta, ignora este mensaje.',
      '',
      'Equipo Lookify',
    ].join('\n'),
  };
}
