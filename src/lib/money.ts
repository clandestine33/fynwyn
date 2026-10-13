/** Money is stored as integer kobo (BigInt in the DB). DTOs sent to the UI use naira as a JS number. */
export const toKobo = (naira: number): bigint => BigInt(Math.round(naira * 100));
export const toNaira = (kobo: bigint | number): number => Number(kobo) / 100;

export const MIN_PAYMENT_NAIRA = 100;
export const MAX_PAYMENT_NAIRA = 50_000_000;

export function formatNaira(naira: number | null | undefined): string {
  return '₦' + Number(naira ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });
}
