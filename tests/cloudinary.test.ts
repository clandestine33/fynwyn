import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acceptImageUrl, destroyImage, signParams, uploadTicket } from '@/lib/cloudinary';
import { optimizedImage, publicIdFromUrl } from '@/lib/images';

const ENV = { CLOUDINARY_CLOUD_NAME: 'acme', CLOUDINARY_API_KEY: 'key123', CLOUDINARY_API_SECRET: 'sekret', CLOUDINARY_FOLDER: 'fynwyn/products' };
beforeEach(() => { Object.assign(process.env, ENV); });
afterEach(() => { for (const k of Object.keys(ENV)) delete process.env[k]; delete process.env.CLOUDINARY_API_BASE; vi.unstubAllGlobals(); });

describe('cloudinary signing', () => {
  it("matches Cloudinary's documented example signature", () => {
    // from https://cloudinary.com/documentation/authentication_signatures
    expect(signParams({ eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop', public_id: 'sample_image', timestamp: '1315060510' }, 'abcd')).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });
  it('signs exactly the params the browser must send, and never exposes the secret', () => {
    const t = uploadTicket();
    expect(t).toMatchObject({ cloudName: 'acme', apiKey: 'key123', folder: 'fynwyn/products', allowed_formats: 'jpg,jpeg,png,webp' });
    expect(t.signature).toBe(signParams({ allowed_formats: t.allowed_formats, folder: t.folder, timestamp: t.timestamp }, 'sekret'));
    expect(JSON.stringify(t)).not.toContain('sekret');
    expect(Math.abs(t.timestamp - Date.now() / 1000)).toBeLessThan(5);
  });
});

describe('image URL handling', () => {
  const good = 'https://res.cloudinary.com/acme/image/upload/v1700000000/fynwyn/products/abc123.jpg';
  it('extracts the public id', () => {
    expect(publicIdFromUrl(good)).toBe('fynwyn/products/abc123');
    expect(publicIdFromUrl('https://res.cloudinary.com/acme/image/upload/f_auto,w_300/v17/fynwyn/products/x.png')).toBe('fynwyn/products/x');
    expect(publicIdFromUrl('https://example.com/a.png')).toBeNull();
  });
  it('accepts only images from our account and upload folder', () => {
    expect(acceptImageUrl(good)).toEqual({ url: good, publicId: 'fynwyn/products/abc123' });
    expect(acceptImageUrl('https://res.cloudinary.com/someone-else/image/upload/v1/fynwyn/products/a.jpg')).toBeNull(); // other account
    expect(acceptImageUrl('https://res.cloudinary.com/acme/image/upload/v1/other-folder/a.jpg')).toBeNull();            // other folder
    expect(acceptImageUrl('https://res.cloudinary.com/acme/image/upload/v1/fynwyn/products/../../secret.jpg')).toBeNull();
    expect(acceptImageUrl('https://evil.example/res.cloudinary.com/acme/image/upload/v1/fynwyn/products/a.jpg')).toBeNull();
    expect(acceptImageUrl('http://res.cloudinary.com/acme/image/upload/v1/fynwyn/products/a.jpg')).toBeNull();           // not https
    expect(acceptImageUrl('javascript:alert(1)')).toBeNull();
  });
  it('builds resized, auto-format delivery URLs (and leaves other URLs alone)', () => {
    expect(optimizedImage(good, 400, 224)).toBe('https://res.cloudinary.com/acme/image/upload/f_auto,q_auto,w_400,h_224,c_fill/v1700000000/fynwyn/products/abc123.jpg');
    expect(optimizedImage(good, 300)).toContain('/f_auto,q_auto,w_300,c_limit/');
    expect(optimizedImage('https://cdn.example.com/x.jpg', 300)).toBe('https://cdn.example.com/x.jpg');
    expect(optimizedImage(null, 300)).toBeNull();
  });
});

describe('destroyImage', () => {
  it('sends a signed destroy request, and never throws', async () => {
    const calls: { url: string; body: URLSearchParams }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => { calls.push({ url, body: init.body as URLSearchParams }); return new Response('{}', { status: 200 }); }));
    await destroyImage('fynwyn/products/abc123');
    expect(calls[0].url).toBe('https://api.cloudinary.com/v1_1/acme/image/destroy');
    const b = calls[0].body;
    expect(b.get('public_id')).toBe('fynwyn/products/abc123');
    expect(b.get('signature')).toBe(signParams({ public_id: 'fynwyn/products/abc123', timestamp: b.get('timestamp')! }, 'sekret'));
    expect(b.get('api_secret')).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    await expect(destroyImage('x')).resolves.toBeUndefined();
    await expect(destroyImage(null)).resolves.toBeUndefined();
  });
  it('does nothing when Cloudinary is not configured', async () => {
    delete process.env.CLOUDINARY_API_SECRET;
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    await destroyImage('fynwyn/products/abc'); expect(f).not.toHaveBeenCalled();
  });
});
