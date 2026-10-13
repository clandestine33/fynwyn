/** npm run staff:create -- you@company.com "Full Name" ROLE  (password is prompted via STAFF_PASSWORD env) */
import { PrismaClient, StaffRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const [email, name, role = 'SUPPORT'] = process.argv.slice(2);
const password = process.env.STAFF_PASSWORD;
if (!email || !name || !password || password.length < 12) {
  console.error('Usage: STAFF_PASSWORD=<12+ chars> npm run staff:create -- email "Name" [SUPER_ADMIN|FINANCE|OPERATIONS|SUPPORT]');
  process.exit(1);
}
if (!(role in StaffRole)) { console.error('Invalid role'); process.exit(1); }
const db = new PrismaClient();
db.staffUser
  .create({ data: { email: email.toLowerCase(), name, role: role as StaffRole, passwordHash: bcrypt.hashSync(password, 12) } })
  .then((s) => console.log('Created', s.email, s.role))
  .finally(() => db.$disconnect());
