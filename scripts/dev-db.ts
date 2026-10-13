/**
 * Local development Postgres (no Docker needed). Data persists in ./.dev-db.
 * Usage: npm run db:dev   (leave running), then in another shell: npm run db:migrate && npm run db:seed
 */
import fs from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';

const dir = './.dev-db';
const port = Number(process.env.DEV_DB_PORT || 5433);
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'postgres', password: 'postgres', port, persistent: true });

async function main() {
  const fresh = !fs.existsSync(`${dir}/PG_VERSION`);
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase('fynwyn');
  console.log(`Postgres ready on postgresql://postgres:postgres@localhost:${port}/fynwyn`);
  const stop = async () => { await pg.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
main().catch((e) => { console.error(e); process.exit(1); });
