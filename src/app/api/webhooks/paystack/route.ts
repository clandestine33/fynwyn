import { NextResponse } from 'next/server';
import { finalizePaystack, verifyPaystackSignature } from '@/server/payments';
import { triggerSheetSync } from '@/server/sheet-sync';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyPaystackSignature(raw, req.headers.get('x-paystack-signature'))) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  try {
    const evt = JSON.parse(raw) as { event?: string; data?: { reference?: string } };
    if (evt.event === 'charge.success' && evt.data?.reference) { await finalizePaystack(evt.data.reference); triggerSheetSync(); }
  } catch (e) {
    console.error('[paystack webhook]', e);
    return NextResponse.json({ error: 'processing error' }, { status: 500 }); // Paystack retries on non-2xx
  }
  return NextResponse.json({ received: true });
}
