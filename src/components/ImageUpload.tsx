'use client';
import { useEffect, useRef, useState } from 'react';
import { optimizedImage } from '@/lib/images';

type Ticket = { cloudName: string; apiKey: string; timestamp: number; folder: string; allowed_formats: string; signature: string };
type GetTicket = () => Promise<{ ok: true; data?: Ticket } | { ok: false; error: string }>;

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX = 5 * 1024 * 1024;

/** Uploads straight to Cloudinary with a server-signed ticket and keeps the resulting URL in a hidden form field. */
export function ImageUpload({ name = 'imageUrl', initial, getTicket, enabled }: { name?: string; initial?: string | null; getTicket: GetTicket; enabled: boolean }) {
  const [url, setUrl] = useState(initial ?? '');
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const hidden = useRef<HTMLInputElement>(null);

  // When the surrounding form is reset (e.g. after adding a product), clear the preview too.
  useEffect(() => {
    const form = hidden.current?.form;
    const onReset = () => { setUrl(initial ?? ''); setErr(''); };
    form?.addEventListener('reset', onReset);
    return () => form?.removeEventListener('reset', onReset);
  }, [initial]);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setErr('');
    if (!TYPES.includes(file.type)) return setErr('Use a JPG, PNG or WebP image.');
    if (file.size > MAX) return setErr('Image is too large (max 5 MB).');
    setBusy(0);
    try {
      const t = await getTicket();
      if (!t.ok || !t.data) throw new Error(t.ok ? 'Could not start the upload.' : t.error);
      const fd = new FormData();
      fd.set('file', file); fd.set('api_key', t.data.apiKey); fd.set('timestamp', String(t.data.timestamp)); fd.set('folder', t.data.folder);
      fd.set('allowed_formats', t.data.allowed_formats); fd.set('signature', t.data.signature);
      const secureUrl = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${t.data!.cloudName}/image/upload`);
        xhr.upload.onprogress = (e) => e.lengthComputable && setBusy(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () => {
          try { const j = JSON.parse(xhr.responseText); xhr.status < 300 && j.secure_url ? resolve(j.secure_url) : reject(new Error(j.error?.message ?? 'Upload failed.')); }
          catch { reject(new Error('Upload failed.')); }
        };
        xhr.onerror = () => reject(new Error('Network error while uploading.'));
        xhr.send(fd);
      });
      setUrl(secureUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(null);
      if (input.current) input.current.value = '';
    }
  }

  const preview = optimizedImage(url, 160, 160);
  return (
    <div>
      <span className="label">Product image</span>
      <input ref={hidden} type="hidden" name={name} value={url} readOnly />
      <div className="flex items-center gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-sunken text-[10px] tracking-widest text-faint">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview} alt="Product preview" className="h-full w-full object-cover" /> : 'NO IMAGE'}
        </div>
        <div className="min-w-0">
          <input ref={input} type="file" accept={TYPES.join(',')} className="sr-only" id={`${name}-file`} disabled={!enabled || busy !== null} onChange={(e) => onPick(e.target.files?.[0])} />
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${name}-file`} className={`btn btn-secondary btn-sm ${!enabled || busy !== null ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
              {busy !== null ? `Uploading… ${busy}%` : url ? 'Replace image' : 'Upload image'}
            </label>
            {url && busy === null && <button type="button" onClick={() => setUrl('')} className="btn btn-secondary btn-sm">Remove</button>}
          </div>
          <p className="mt-1 text-xs text-muted">{enabled ? 'JPG, PNG or WebP, up to 5 MB. Save the product to apply.' : 'Image upload isn’t configured yet (set the CLOUDINARY_* values).'}</p>
          {err && <p role="alert" className="mt-1 text-xs text-danger-text">{err}</p>}
        </div>
      </div>
    </div>
  );
}
