import { importPKCS8, SignJWT } from 'jose';

/**
 * Minimal Google Sheets client (service account, no SDK).
 *
 * Setup: create a service account, enable the Google Sheets API, then share the spreadsheet with the
 * service account's email as "Editor". Put its email + private key in the GOOGLE_* env vars.
 */
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const API = () => process.env.GOOGLE_SHEETS_API_BASE || 'https://sheets.googleapis.com'; // override is for tests only
const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';

export type Cell = string | number | boolean;

/** Sync is on only when credentials AND a start date are configured (the start date stops old/demo data being pushed). */
export const sheetsEnabled = () =>
  !!(process.env.GOOGLE_SHEETS_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.SHEET_SYNC_SINCE);

let token: { value: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const key = await importPKCS8(process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n'), 'RS256');
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!)
    .setSubject(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('55m')
    .sign(key);
  const res = await fetch(TOKEN_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google auth failed: ${json.error_description ?? res.status}`);
  token = { value: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return token.value;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API()}/v4/spreadsheets/${process.env.GOOGLE_SHEETS_ID}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const hint = res.status === 403 || res.status === 404 ? ' (is the sheet shared with the service account as Editor?)' : '';
    throw new Error(`Sheets ${method} ${path.split('?')[0].slice(0, 60)} failed: ${res.status}${hint} ${(await res.text()).slice(0, 160)}`);
  }
  return (await res.json()) as T;
}

const q = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

/** 0-based column index -> A1 letters (0 -> A, 26 -> AA). */
export const colLetter = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

export async function readHeader(tab: string): Promise<string[]> {
  const r = await call<{ values?: string[][] }>('GET', `/values/${encodeURIComponent(`${q(tab)}!1:1`)}`);
  return (r.values?.[0] ?? []).map((h) => String(h).trim());
}

/** Values of one column (whole column), as a flat array where index i is sheet row i+1. */
export async function readColumn(tab: string, colIndex: number): Promise<string[]> {
  const L = colLetter(colIndex);
  const r = await call<{ values?: string[][] }>('GET', `/values/${encodeURIComponent(`${q(tab)}!${L}:${L}`)}`);
  return (r.values ?? []).map((row) => String(row[0] ?? ''));
}

export interface RangeWrite { tab: string; startCol: number; row: number; values: Cell[] }

/** Overwrite specific cell runs in place (never touches columns outside each run). */
export async function updateRanges(writes: RangeWrite[]): Promise<void> {
  for (let i = 0; i < writes.length; i += 200) {
    const chunk = writes.slice(i, i + 200);
    await call('POST', '/values:batchUpdate', {
      valueInputOption: 'USER_ENTERED',
      data: chunk.map((w) => ({
        range: `${q(w.tab)}!${colLetter(w.startCol)}${w.row}:${colLetter(w.startCol + w.values.length - 1)}${w.row}`,
        values: [w.values],
      })),
    });
  }
}

export async function appendRows(tab: string, rows: Cell[][]): Promise<void> {
  for (let i = 0; i < rows.length; i += 200) {
    await call('POST', `/values/${encodeURIComponent(`${q(tab)}!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { values: rows.slice(i, i + 200) });
  }
}

/** Stop free text being read as a formula (=, +, -, @) or losing leading zeros (phone numbers). */
export const asText = (v: string | null | undefined) => {
  const s = (v ?? '').trim();
  return s && /^[=+\-@0-9]/.test(s) ? `'${s}` : s;
};
