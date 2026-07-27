import { z } from 'zod';
import { ALL_ROLES } from './roles.js';

/**
 * Shared zod schemas. The server uses these to validate request bodies
 * (security + correctness); the web app uses them for form validation
 * (usability). Money amounts entered by users are in MAJOR units (rupees) and
 * converted to integer minor units (paisa) on the server.
 */

export const phonePk = z
  .string()
  .trim()
  .regex(/^(\+92|0)?3\d{9}$/u, 'Enter a valid Pakistani mobile number');

export const money = z
  .number({ invalid_type_error: 'Enter an amount' })
  .nonnegative('Amount cannot be negative')
  .max(100_000_000, 'Amount is too large');

export const quantity = z
  .number({ invalid_type_error: 'Enter a quantity' })
  .positive('Quantity must be greater than zero')
  .max(1_000_000, 'Quantity is too large');

// --- Auth -------------------------------------------------------------------

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  shopName: z.string().trim().min(2, 'Shop name is too short').max(160),
  shopCategory: z.string().trim().max(80).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});
export type LoginInput = z.infer<typeof loginSchema>;

// --- Shop / employee --------------------------------------------------------

export const updateShopSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  category: z.string().trim().max(80).nullable().optional(),
  address: z.string().trim().max(400).nullable().optional(),
  phone: phonePk.nullable().optional(),
  language: z.enum(['en', 'ur']).optional(),
});
export type UpdateShopInput = z.infer<typeof updateShopSchema>;

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  role: z.enum(ALL_ROLES as [string, ...string[]]),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  role: z.enum(ALL_ROLES as [string, ...string[]]).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

// --- Customer ---------------------------------------------------------------

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  phone: phonePk.nullable().optional(),
  locality: z.string().trim().max(160).nullable().optional(),
  note: z.string().trim().max(400).nullable().optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();

// --- Product ----------------------------------------------------------------

export const createProductSchema = z.object({
  name: z.string().trim().min(1, 'Enter a product name').max(160),
  nameUr: z.string().trim().max(160).nullable().optional(),
  barcode: z.string().trim().max(64).nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  unit: z.string().trim().max(24).default('piece'),
  imageUrl: z.string().trim().max(1_500_000).nullable().optional(),
  perishable: z.boolean().optional(),
  costPrice: money.default(0),
  sellingPrice: money,
  openingStock: quantity.optional(),
  lowStockThreshold: z.number().nonnegative().max(1_000_000).default(0),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial().omit({ openingStock: true });

// --- Sales ------------------------------------------------------------------

export const saleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: quantity,
  unitPrice: money, // major units; overrideable at point of sale
});

export const paymentMethod = z.enum(['cash', 'credit', 'digital']);

export const createSaleSchema = z
  .object({
    customerId: z.string().uuid().nullable().optional(),
    paymentMethod,
    items: z.array(saleItemSchema).max(200).optional(),
    // Amount-only quick sale (no line items): total entered directly.
    amountOnly: money.optional(),
    discount: money.default(0),
    note: z.string().trim().max(400).nullable().optional(),
  })
  .refine(
    (v) => (v.items && v.items.length > 0) || typeof v.amountOnly === 'number',
    { message: 'Add at least one product or enter a sale amount', path: ['items'] },
  )
  .refine((v) => v.paymentMethod !== 'credit' || !!v.customerId, {
    message: 'Select a customer for a credit sale',
    path: ['customerId'],
  });
export type CreateSaleInput = z.infer<typeof createSaleSchema>;

// --- Khata ------------------------------------------------------------------

export const khataCreditSchema = z.object({
  customerId: z.string().uuid(),
  amount: money.refine((v) => v > 0, 'Amount must be greater than zero'),
  note: z.string().trim().max(400).nullable().optional(),
});

export const khataPaymentSchema = z.object({
  customerId: z.string().uuid(),
  amount: money.refine((v) => v > 0, 'Amount must be greater than zero'),
  method: z.enum(['cash', 'digital']).default('cash'),
  note: z.string().trim().max(400).nullable().optional(),
});

// --- Inventory --------------------------------------------------------------

export const stockAdjustmentSchema = z.object({
  productId: z.string().uuid(),
  quantityDelta: z
    .number()
    .refine((v) => Number.isFinite(v) && v !== 0, 'Enter a non-zero adjustment'),
  reason: z.enum(['damage', 'expiry', 'count_correction', 'theft', 'personal_use', 'other']),
  note: z.string().trim().max(400).nullable().optional(),
});

// --- Suppliers / purchases --------------------------------------------------

export const createSupplierSchema = z.object({
  name: z.string().trim().min(1).max(160),
  phone: phonePk.nullable().optional(),
  note: z.string().trim().max(400).nullable().optional(),
});

export const purchaseItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: quantity,
  unitCost: money,
});

export const createPurchaseSchema = z.object({
  supplierId: z.string().uuid().nullable().optional(),
  items: z.array(purchaseItemSchema).min(1, 'Add at least one product'),
  note: z.string().trim().max(400).nullable().optional(),
});

// --- Expenses ---------------------------------------------------------------

export const createExpenseSchema = z.object({
  category: z.enum([
    'rent', 'electricity', 'salary', 'transport', 'supplies',
    'personal', 'repair', 'other',
  ]),
  amount: money.refine((v) => v > 0, 'Amount must be greater than zero'),
  note: z.string().trim().max(400).nullable().optional(),
});

// --- Daily closing ----------------------------------------------------------

export const dailyClosingSchema = z.object({
  businessDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'Invalid date'),
  countedCash: money,
  note: z.string().trim().max(400).nullable().optional(),
});

// --- Pagination -------------------------------------------------------------

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  q: z.string().trim().max(120).optional(),
});
