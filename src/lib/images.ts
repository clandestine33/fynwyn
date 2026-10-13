/** Pure helpers for Cloudinary delivery URLs (safe to import from client components). */
const UPLOAD = '/image/upload/';

/** Serve a resized, auto-format/quality version of a Cloudinary image. Other URLs are returned unchanged. */
export function optimizedImage(url: string | null | undefined, w: number, h?: number): string | null {
  if (!url) return null;
  const i = url.indexOf(UPLOAD);
  if (!url.startsWith('https://res.cloudinary.com/') || i < 0) return url;
  const t = ['f_auto', 'q_auto', `w_${w}`, ...(h ? [`h_${h}`, 'c_fill'] : ['c_limit'])].join(',');
  return `${url.slice(0, i + UPLOAD.length)}${t}/${url.slice(i + UPLOAD.length)}`;
}

/** https://res.cloudinary.com/<cloud>/image/upload/v123/folder/name.jpg -> folder/name */
export function publicIdFromUrl(url: string): string | null {
  const i = url.indexOf(UPLOAD);
  if (i < 0) return null;
  const rest = url.slice(i + UPLOAD.length).split('?')[0].replace(/^(?:[a-z]{1,3}_[^/]+\/)*/, '').replace(/^v\d+\//, '');
  return rest.replace(/\.[a-zA-Z0-9]+$/, '') || null;
}
