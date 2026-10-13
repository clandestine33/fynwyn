# FYNWYN Drink Bank

Plan a celebration, save toward it, redeem premium drinks on the day. Rebuild of the original Google Apps Script prototype as a proper app.

**Stack:** Next.js 14 (App Router) · TypeScript · Prisma · PostgreSQL · Tailwind · Paystack · Vitest

## What changed vs the prototype

| Prototype (Apps Script + Sheets) | This app |
|---|---|
| Generic savings pot | **Celebration plans** (occasion, date, guests) with a live "save ₦X/month" schedule; several plans per customer |
| Join via external Google Form | Self-serve register, email verification, password reset, lockout, rate limits |
| Spreadsheet as database, race-prone | PostgreSQL, **append-only ledger**, row locks: credit and stock can't be double-spent |
| Manual payments only | **Paystack** (webhook + callback, amount re-verified server-side) **and** manual transfer with staff verification |
| One shared admin secret in the customer page | **Separate staff console**, individual accounts, roles, audit log, session revocation |
| Packages have a target only | Packages have **benefits unlocked at savings milestones**, re-evaluated automatically |

## Run locally

```bash
npm install
cp .env.example .env        # set the two SESSION secrets (openssl rand -base64 48), they must differ
npm run db:dev              # OPTIONAL embedded Postgres on :5433 (no Docker). Skip if you use your own Postgres: set DATABASE_URL in .env
npm run db:migrate && npm run db:seed && npm run db:demo   # new shell
npm run dev                 # http://localhost:3000
npm test                    # unit + integration (needs the DB running)
```

Dev logins: staff `admin@fynwyn.local` / `ChangeMe-Now-123` at `/admin/login` · customer `demo@fynwyn.local` / `Demo-Password-1`.
Emails (verify / reset links): run `npm run mail:dev` (Mailpit; `brew install mailpit`) and open http://localhost:8025 to read them. `.env` already points `SMTP_*` at it. With `SMTP_HOST` empty they print to the server console instead.

## Keeping staff away from customers

One codebase, but the console is walled off in layers:

1. **Deploy switch:** `ADMIN_ENABLED=false` on the public deployment → `/admin` and `/api/admin` return 404.
2. **Host split:** `ADMIN_HOST=staff.yourdomain.com` → console only answers on that host (404 elsewhere), and that host serves nothing else.
3. Optional `ADMIN_ALLOWED_IPS` allow-list.
4. **Separate credentials:** staff cookie/secret/audience differ from the customer ones; neither validates as the other. Staff are a separate table.
5. **Every staff server action re-checks** session, role and deployment context itself (never relies on middleware alone); sessions are revocable (`sessionVersion`).
6. Admin code lives in its own route group, so it is not part of customer pages' bundles; responses are `no-store` + `noindex`.

Recommended production: run two deployments of this repo, public (`ADMIN_ENABLED=false`) and staff (`ADMIN_HOST=…`, behind VPN/SSO if possible), sharing one database.

## Google Sheet mirror
The app database is the source of truth. A copy is kept up to date in your Google Sheet, **one tab per record type**, updated in place as things change in the app (verifying a payment, approving an order, a customer verifying their email…).

| App | Sheet tab |
|---|---|
| Customers (a package chosen at sign-up, otherwise filled in from their first plan; updated on upgrade) | `CUSTOMERS` |
| Payments (Paystack + transfers) | `TRANSACTIONS` |
| Orders / their items | `ORDERS` / `ORDER_ITEMS` |
| Rewards earned | `REWARD_ENTITLEMENTS` |
| Packages / package perks | `PACKAGES` / `PACKAGE_REWARDS` |
| Products / stock movements | `PRODUCTS` / `INVENTORY_MOVEMENTS` |
| Staff & system actions | `AUDIT_LOG` |

Not mirrored on purpose: `CUSTOMER_AUTH` (credentials), `CONFIG`, `FORM_LINKS`.

**Set up**
1. Google Cloud: create a service account, enable the **Google Sheets API**, create a JSON key.
2. Share the spreadsheet with the service account's email as **Editor**.
3. In `.env` set `GOOGLE_SHEETS_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and **`SHEET_SYNC_SINCE`** (a date, e.g. `2026-10-14`).

`SHEET_SYNC_SINCE` is the safety switch: only records created or changed on/after that date are pushed, so demo data and old test rows never reach the real sheet. Nothing is written until it is set.

**How it behaves**
- IDs continue each tab's existing numbering (`FDB-00003` after `FDB-00002`, `PAY-00008` after `PAY-00007`…).
- Columns are matched by **header name**, so you can reorder them or add your own extra columns (they're never overwritten). If a column the app needs is missing/renamed, that tab is skipped and the error is logged.
- Unchanged rows cause no writes. Failed writes are retried automatically; nothing is duplicated.
- It runs right after every change in the app. For a safety net, call `GET /api/cron/sheet-sync` on a schedule with `Authorization: Bearer $CRON_SECRET` (needed on serverless hosts), or run `npm run sheet:sync`.
- Edit data in the app, not the sheet: the sheet is a one-way copy and app changes overwrite the cells they own.
- Retire the old Apps Script app (or stop it writing to these tabs) first, or both will number rows independently.
- `npm run sheet:sync -- --all` pushes **every** record in the database regardless of date. Use only on a database you want fully copied.
- Update the privacy notice (Settings) to say account and order details are also stored in a Google Sheet.

## Light / dark mode
Both themes come from CSS variables in `src/app/globals.css` (`:root` for light, `.dark` for dark), mapped to Tailwind colours in `tailwind.config.ts` (`bg-surface`, `text-ink`, `border-line`, …). Use those tokens instead of hex values so new UI themes itself. A header toggle cycles System → Light → Dark (remembered per browser; "System" follows the OS live), and a tiny inline script sets the theme before first paint so there is no flash. The logo and tab icon swap automatically.

## Roles
`SUPER_ADMIN` everything (staff, settings, packages) · `FINANCE` payments, reversals, credit adjustments, rewards · `OPERATIONS` orders, inventory, rewards · `SUPPORT` read-only. Create staff: `STAFF_PASSWORD=… npm run staff:create -- you@co.com "Name" FINANCE`.

## Money model
Amounts are integer kobo. Balances are derived from `LedgerEntry` (CONTRIBUTION, REVERSAL, ADJUSTMENT, RESERVE, RELEASE, SPEND), never stored. Unique constraints make crediting a payment / reserving an order idempotent. ₦1 verified = ₦1 drink credit.

## Paystack
Set `PAYSTACK_SECRET_KEY`; register webhook `{APP_URL}/api/webhooks/paystack`. Credit is granted only after we re-fetch the transaction from Paystack and confirm status, currency (NGN) and exact amount. Without a key the online option is hidden and transfers still work. Set real bank details in `BANK_*`.

## Production checklist
- Strong, distinct `CUSTOMER_SESSION_SECRET` / `STAFF_SESSION_SECRET`; HTTPS only (cookies are `__Host-` + Secure in production).
- `npm run db:deploy` for migrations; create the first staff with `staff:create` (don't ship the dev seed password).
- The rate limiter is in-memory; move it to Redis if you run several instances.
- Customer password reset / email verification need real email: set `RESEND_API_KEY` and an `EMAIL_FROM` on a domain verified in Resend (add its DNS records under Resend > Domains).
- Not built (yet): staff 2FA, refunds to bank, image upload (products take an image URL), SMS.
