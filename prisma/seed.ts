import { PrismaClient, type Product } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();
const k = (naira: number) => BigInt(naira * 100);

async function main() {
  await db.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1, supportEmail: 'support@fynwyn.com' } });

  const products = [
    ['Moët & Chandon Impérial', 'Champagne', 'FDB-CHP-001', 95000, 40],
    ['Hennessy VS', 'Cognac', 'FDB-COG-001', 52000, 60],
    ['Johnnie Walker Black Label', 'Whisky', 'FDB-WHI-001', 38000, 80],
    ['Baileys Original 1L', 'Liqueur', 'FDB-LIQ-001', 21000, 50],
    ['Veuve Clicquot Brut', 'Champagne', 'FDB-CHP-002', 105000, 30],
    ['Smirnoff Vodka 75cl', 'Vodka', 'FDB-VOD-001', 9500, 150],
    ['Chivita Active (carton)', 'Soft drinks', 'FDB-SFT-001', 6500, 200],
    ['Eva Water (carton)', 'Water', 'FDB-WAT-001', 2800, 300],
  ] as const;
  const created: Product[] = [];
  for (const [name, category, sku, price, stock] of products) {
    const p = await db.product.upsert({ where: { sku }, update: {}, create: { name, category, sku, unitPrice: k(price), onHand: stock } });
    created.push(p);
  }
  const prod = (sku: string) => created.find((p) => p.sku === sku)!;

  const packages = [
    { slug: 'sip', name: 'Sip', tagline: 'Intimate gatherings', target: 100_000, desc: 'A great start for small celebrations of up to 20 guests.', featured: false,
      benefits: [[0, 'Dedicated planner dashboard', undefined], [50_000, '1 carton of Eva Water on us', 'FDB-WAT-001']] },
    { slug: 'toast', name: 'Toast', tagline: 'Most popular', target: 500_000, desc: 'Our best-value plan for birthdays, naming ceremonies and mid-sized parties.', featured: true,
      benefits: [[0, 'Priority order approval', undefined], [250_000, 'Free bottle of Baileys Original', 'FDB-LIQ-001'], [500_000, '5% bonus drink credit', undefined]] },
    { slug: 'celebrate', name: 'Celebrate', tagline: 'Weddings & big days', target: 1_500_000, desc: 'Built for weddings, milestone birthdays and anniversaries with 100+ guests.', featured: false,
      benefits: [[0, 'Dedicated account manager', undefined], [750_000, 'Free bottle of Moët & Chandon', 'FDB-CHP-001'], [1_500_000, 'Complimentary delivery & ice service', undefined]] },
    { slug: 'grand', name: 'Grand', tagline: 'Landmark occasions', target: 5_000_000, desc: 'Full-service drinks planning for corporate events and large receptions.', featured: false,
      benefits: [[0, 'Dedicated account manager', undefined], [2_500_000, 'Two bottles of Veuve Clicquot', 'FDB-CHP-002'], [5_000_000, 'Free on-site bar consultation', undefined]] },
  ];
  let sort = 10;
  for (const p of packages) {
    const pkg = await db.package.upsert({
      where: { slug: p.slug }, update: {},
      create: { slug: p.slug, name: p.name, tagline: p.tagline, description: p.desc, targetAmount: k(p.target), featured: p.featured, sortOrder: sort },
    });
    sort += 10;
    if ((await db.packageBenefit.count({ where: { packageId: pkg.id } })) === 0) {
      let i = 10;
      for (const [milestone, title, sku] of p.benefits as [number, string, string | undefined][]) {
        await db.packageBenefit.create({ data: { packageId: pkg.id, title, milestoneAmount: k(milestone), productId: sku ? prod(sku).id : undefined, sortOrder: i } });
        i += 10;
      }
    }
  }

  const email = (process.env.SEED_STAFF_EMAIL || 'admin@fynwyn.local').toLowerCase();
  const pw = process.env.SEED_STAFF_PASSWORD;
  if (!(await db.staffUser.findUnique({ where: { email } }))) {
    if (process.env.NODE_ENV === 'production' && !pw) {
      console.log('Skipped staff seeding in production (set SEED_STAFF_PASSWORD or use `npm run staff:create`).');
    } else {
      const password = pw || 'ChangeMe-Now-123';
      await db.staffUser.create({ data: { email, name: 'Super Admin', role: 'SUPER_ADMIN', passwordHash: await bcrypt.hash(password, 12) } });
      console.log(`Created staff ${email}${pw ? '' : ` with DEV password "${password}" — change it immediately`}`);
    }
  }
  console.log('Seed complete.');
}
main().finally(() => db.$disconnect());
