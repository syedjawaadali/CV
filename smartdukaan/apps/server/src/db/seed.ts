import { pool, closePool, query } from './pool.js';
import { logger } from '../lib/logger.js';
import { registerOwner } from '../modules/auth/auth.service.js';
import { createEmployee } from '../modules/employees/employees.service.js';
import { createCustomer } from '../modules/customers/customers.service.js';
import { createProduct } from '../modules/products/products.service.js';
import { createSaleStandalone } from '../modules/sales/sales.service.js';
import { addCredit, recordPayment } from '../modules/khata/khata.service.js';

/**
 * Idempotent development seed. Creates a demo shop with realistic Pakistani
 * retail data. Safe to re-run: it removes the previous demo tenant first.
 * Demo login:  owner@demo.pk / demo12345   (and cashier@demo.pk / demo12345)
 * This is DEMO data only — never seed real personal information.
 */

const DEMO_OWNER = 'owner@demo.pk';
const DEMO_PASSWORD = 'demo12345';

async function removeExistingDemo(): Promise<void> {
  const { rows } = await query<{ tenant_id: string }>(
    'SELECT tenant_id FROM users WHERE lower(email) = lower($1)',
    [DEMO_OWNER],
  );
  if (rows[0]) {
    await query('DELETE FROM tenants WHERE id = $1', [rows[0].tenant_id]); // cascades
    logger.info('Removed existing demo tenant');
  }
  await query('DELETE FROM users WHERE lower(email) = lower($1)', ['cashier@demo.pk']);
}

async function seed(): Promise<void> {
  logger.info('Seeding demo data');
  await removeExistingDemo();

  const owner = await registerOwner({
    name: 'Ahmed Raza',
    email: DEMO_OWNER,
    password: DEMO_PASSWORD,
    shopName: 'Demo Kiryana Store',
    shopCategory: 'kiryana',
  });
  const ctx = {
    tenantId: owner.user.tenantId, shopId: owner.user.shopId,
    userId: owner.user.id, role: owner.user.role,
  };

  await createEmployee(ctx, {
    name: 'Bilal Khan', email: 'cashier@demo.pk', password: DEMO_PASSWORD, role: 'cashier',
  });

  const imran = await createCustomer(ctx, { name: 'Imran', phone: '03001234567', locality: 'Gulshan Block 5' }) as { id: string };
  const ayesha = await createCustomer(ctx, { name: 'Ayesha', phone: '03219876543', locality: 'Model Town' }) as { id: string };
  await createCustomer(ctx, { name: 'Bilal', phone: '03331112222', locality: 'Saddar' });

  const milk = await createProduct(ctx, {
    name: 'Olpers Milk 1L', nameUr: 'اولپرز دودھ', unit: 'packet',
    costPrice: 100, sellingPrice: 120, openingStock: 24, lowStockThreshold: 6,
    barcode: '8964000000017', category: 'Dairy',
  }) as { id: string };
  const sugar = await createProduct(ctx, {
    name: 'Sugar 1kg', nameUr: 'چینی', unit: 'kg',
    costPrice: 130, sellingPrice: 150, openingStock: 40, lowStockThreshold: 10, category: 'Grocery',
  }) as { id: string };
  const bread = await createProduct(ctx, {
    name: 'Bread', nameUr: 'ڈبل روٹی', unit: 'packet',
    costPrice: 70, sellingPrice: 90, openingStock: 15, lowStockThreshold: 5, category: 'Bakery',
  }) as { id: string };
  const oil = await createProduct(ctx, {
    name: 'Cooking Oil 1L', nameUr: 'کوکنگ آئل', unit: 'bottle',
    costPrice: 520, sellingPrice: 560, openingStock: 12, lowStockThreshold: 3, category: 'Grocery',
  }) as { id: string };
  await createProduct(ctx, {
    name: 'Tea 250g', nameUr: 'چائے', unit: 'packet',
    costPrice: 280, sellingPrice: 320, openingStock: 4, lowStockThreshold: 6, category: 'Beverages',
  });

  // A few sales.
  await createSaleStandalone(ctx, {
    paymentMethod: 'cash', discount: 0,
    items: [
      { productId: milk.id, quantity: 2, unitPrice: 120 },
      { productId: bread.id, quantity: 1, unitPrice: 90 },
    ],
  });
  await createSaleStandalone(ctx, {
    paymentMethod: 'cash', discount: 0,
    items: [{ productId: sugar.id, quantity: 3, unitPrice: 150 }],
  });
  await createSaleStandalone(ctx, {
    paymentMethod: 'credit', customerId: imran.id, discount: 0,
    items: [{ productId: oil.id, quantity: 1, unitPrice: 560 }],
  });
  await createSaleStandalone(ctx, {
    paymentMethod: 'digital', discount: 0, amountOnly: 250,
  });

  // Khata activity.
  await addCredit(ctx, { customerId: ayesha.id, amount: 800, note: 'Monthly grocery' });
  await recordPayment(ctx, { customerId: imran.id, amount: 200, method: 'cash', note: 'Part payment' });

  // Expenses.
  await query(
    `INSERT INTO expenses (tenant_id, shop_id, category, amount_minor, note, created_by)
     VALUES ($1,$2,'electricity',$3,'Monthly bill',$4), ($1,$2,'rent',$5,'Shop rent',$4)`,
    [ctx.tenantId, ctx.shopId, 500000, ctx.userId, 2500000],
  );

  logger.info('Seed complete', { owner: DEMO_OWNER });
}

seed()
  .then(() => closePool())
  .then(() => {
    // eslint-disable-next-line no-console
    console.log(`\nDemo ready. Login: ${DEMO_OWNER} / ${DEMO_PASSWORD}\n`);
    process.exit(0);
  })
  .catch(async (err) => {
    logger.error('Seed failed', { error: err instanceof Error ? err.message : String(err) });
    await closePool().catch(() => undefined);
    process.exit(1);
  });

void pool; // ensure pool module is initialized
