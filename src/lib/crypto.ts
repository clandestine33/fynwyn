import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');
export const randomRef = (len = 6) => randomBytes(8).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, len).toUpperCase();

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
