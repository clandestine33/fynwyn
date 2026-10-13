const bool = (v: string | undefined, d = false) => (v === undefined || v === '' ? d : v.toLowerCase() === 'true');

export const env = {
  get appUrl() { return process.env.APP_URL || 'http://localhost:3000'; },
  get isProd() { return process.env.NODE_ENV === 'production'; },
  get customerSecret() { return secret('CUSTOMER_SESSION_SECRET'); },
  get staffSecret() { return secret('STAFF_SESSION_SECRET'); },
  get adminEnabled() { return bool(process.env.ADMIN_ENABLED, true); },
  get adminHost() { return (process.env.ADMIN_HOST || '').trim().toLowerCase(); },
  get adminAllowedIps() { return (process.env.ADMIN_ALLOWED_IPS || '').split(',').map((s) => s.trim()).filter(Boolean); },
  get paystackSecret() { return process.env.PAYSTACK_SECRET_KEY || ''; },
  get paystackEnabled() { return !!process.env.PAYSTACK_SECRET_KEY; },
  get bank() {
    return {
      name: process.env.BANK_NAME || '',
      accountName: process.env.BANK_ACCOUNT_NAME || '',
      accountNumber: process.env.BANK_ACCOUNT_NUMBER || '',
    };
  },
};

function secret(name: string): Uint8Array {
  const v = process.env[name];
  if (!v || v.length < 32) throw new Error(`${name} must be set to a random string of at least 32 characters`);
  return new TextEncoder().encode(v);
}
