import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env';

// Delivery: Resend when RESEND_API_KEY is set (production), else SMTP when SMTP_HOST is set
// (Mailpit in dev), else the message is printed to the server console.

let transport: Transporter | null = null;
function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

async function sendViaResend(apiKey: string, to: string, subject: string, text: string, html?: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend send failed (${res.status}): ${body.slice(0, 500)}`);
  }
}

export async function sendMail(to: string, subject: string, text: string, html?: string) {
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) return sendViaResend(resendKey, to, subject, text, html);

  const t = getTransport();
  if (!t) {
    console.log(`\n[email:dev] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  await t.sendMail({ from: process.env.EMAIL_FROM, to, subject, text, html: html ?? undefined });
}

export const link = (path: string) => `${env.appUrl}${path}`;
