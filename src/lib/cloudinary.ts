import { createHash } from 'node:crypto';
import { publicIdFromUrl } from './images';

/**
 * Cloudinary (signed uploads). Server-side only: it reads CLOUDINARY_API_SECRET, so never import it from a client component.
 * The browser uploads straight to Cloudinary using a short-lived signature we issue to
 * signed-in staff; the API secret never leaves the server.
 */
export const ALLOWED_FORMATS = 'jpg,jpeg,png,webp';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const cfg = () => ({
  cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  apiKey: process.env.CLOUDINARY_API_KEY || '',
  apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  folder: (process.env.CLOUDINARY_FOLDER || 'fynwyn/products').replace(/^\/+|\/+$/g, ''),
});
const base = () => process.env.CLOUDINARY_API_BASE || 'https://api.cloudinary.com'; // override is for tests only

export const cloudinaryEnabled = () => { const c = cfg(); return !!(c.cloudName && c.apiKey && c.apiSecret); };

/** Cloudinary's signature: sha1 of the params sorted by name ("a=1&b=2") with the API secret appended. */
export function signParams(params: Record<string, string | number>, secret: string): string {
  const str = Object.keys(params).filter((k) => params[k] !== '' && params[k] != null).sort().map((k) => `${k}=${params[k]}`).join('&');
  return createHash('sha1').update(str + secret).digest('hex');
}

export function uploadTicket() {
  const c = cfg();
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = { allowed_formats: ALLOWED_FORMATS, folder: c.folder, timestamp };
  return { cloudName: c.cloudName, apiKey: c.apiKey, ...signed, signature: signParams(signed, c.apiSecret) };
}

/** Only images that live in OUR Cloudinary account and upload folder are accepted as product images. */
export function acceptImageUrl(url: string): { url: string; publicId: string } | null {
  const c = cfg();
  const prefix = `https://res.cloudinary.com/${c.cloudName}/image/upload/`;
  if (!c.cloudName || !url.startsWith(prefix) || url.length > 500) return null;
  const publicId = publicIdFromUrl(url);
  if (!publicId || !publicId.startsWith(`${c.folder}/`) || publicId.includes('..')) return null;
  return { url, publicId };
}

/** Best-effort delete of a replaced/removed image. Never throws. */
export async function destroyImage(publicId: string | null | undefined): Promise<void> {
  const c = cfg();
  if (!publicId || !cloudinaryEnabled()) return;
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const res = await fetch(`${base()}/v1_1/${c.cloudName}/image/destroy`, {
      method: 'POST',
      body: new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), api_key: c.apiKey, signature: signParams({ public_id: publicId, timestamp }, c.apiSecret) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error('[cloudinary] destroy failed', res.status);
  } catch (e) {
    console.error('[cloudinary] destroy error', e instanceof Error ? e.message : e);
  }
}
