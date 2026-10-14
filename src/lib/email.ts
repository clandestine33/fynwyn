import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env';

// Delivery: Brevo's HTTPS API when BREVO_API_KEY is set (production; Render's free tier blocks SMTP ports),
// else SMTP when SMTP_HOST is set (Mailpit in dev), else the message is printed to the server console.

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

// EMAIL_FROM is "Name <address>" or a bare address.
function parseFrom(from = '') {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1] || undefined, email: m[2].trim() } : { email: from.trim() };
}

async function sendViaBrevo(apiKey: string, to: string, subject: string, text: string, html?: string) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: parseFrom(process.env.EMAIL_FROM),
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo send failed (${res.status}): ${body.slice(0, 500)}`);
  }
}

export async function sendMail(to: string, subject: string, text: string, html?: string) {
  const brevoKey = process.env.BREVO_API_KEY;
  if (brevoKey) return sendViaBrevo(brevoKey, to, subject, text, html);

  const t = getTransport();
  if (!t) {
    console.log(`\n[email:dev] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  await t.sendMail({ from: process.env.EMAIL_FROM, to, subject, text, html: html ?? undefined });
}

export const link = (path: string) => `${env.appUrl}${path}`;
