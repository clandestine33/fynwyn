import Link from 'next/link';

export function Pager({ base, page, total }: { base: string; page: number; total: number }) {
  const pages = Math.ceil(total / 25);
  if (pages <= 1) return null;
  const sep = base.includes('?') ? '&' : '?';
  return (
    <div className="mt-4 flex items-center gap-3 text-sm">
      {page > 1 && <Link className="underline" href={`${base}${sep}page=${page - 1}`}>← Newer</Link>}
      <span className="text-muted">Page {page} of {pages}</span>
      {page < pages && <Link className="underline" href={`${base}${sep}page=${page + 1}`}>Older →</Link>}
    </div>
  );
}
