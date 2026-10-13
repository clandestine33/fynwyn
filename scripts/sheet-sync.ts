/**
 * npm run sheet:sync            catch up on everything changed since SHEET_SYNC_SINCE
 * npm run sheet:sync -- --all   backfill EVERY row in the database (ignores SHEET_SYNC_SINCE; use deliberately!)
 */
import { PrismaClient } from '@prisma/client';
import { runSheetSync } from '../src/server/sheet-sync';

const db = new PrismaClient();
runSheetSync({ all: process.argv.includes('--all') })
  .then((r) => { console.log(JSON.stringify(r, null, 2)); if (r.errors.length) process.exitCode = 1; })
  .finally(() => db.$disconnect());
