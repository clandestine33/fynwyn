import { NextResponse } from 'next/server';
import { safeEqual } from '@/lib/crypto';
import { runSheetSync } from '@/server/sheet-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Scheduled catch-up (e.g. every 5 minutes) for anything the after-change trigger missed. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  if (!secret || secret.length < 16 || !safeEqual(given, secret)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json(await runSheetSync());
}
