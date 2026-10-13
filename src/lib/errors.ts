/** Errors whose message is safe to show to the user. Anything else becomes a generic message. */
export class UserError extends Error {}

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string };

export const ok = <T = undefined>(message?: string, data?: T): ActionResult<T> => ({ ok: true, message, data });
export const fail = (error: string): ActionResult<never> => ({ ok: false, error });

/** After any successful change, nudge the Google Sheet mirror (no-op unless configured; never blocks or throws). */
function mirror() {
  void import('@/server/sheet-sync').then((m) => m.triggerSheetSync()).catch(() => undefined);
}

export async function safe<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    const res = await fn();
    if (res.ok) mirror();
    return res;
  } catch (e) {
    // Next.js control-flow errors (redirect/notFound) must propagate. A redirect is how most actions report success.
    if (e && typeof e === 'object' && 'digest' in e && typeof (e as { digest: unknown }).digest === 'string') {
      if ((e as { digest: string }).digest.startsWith('NEXT_REDIRECT')) mirror();
      throw e;
    }
    if (e instanceof UserError) return fail(e.message);
    if (e && typeof e === 'object' && 'issues' in e) {
      const issues = (e as { issues: { message: string }[] }).issues;
      return fail(issues[0]?.message ?? 'Invalid input');
    }
    console.error('[action error]', e);
    return fail('Something went wrong. Please try again.');
  }
}
