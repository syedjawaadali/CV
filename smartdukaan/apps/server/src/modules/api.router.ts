import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { authRouter } from './auth/auth.routes.js';
import { shopRouter } from './shops/shops.routes.js';
import { employeeRouter } from './employees/employees.routes.js';
import { customerRouter } from './customers/customers.routes.js';
import { productRouter } from './products/products.routes.js';
import { saleRouter } from './sales/sales.routes.js';
import { khataRouter } from './khata/khata.routes.js';
import { inventoryRouter } from './inventory/inventory.routes.js';
import { supplierRouter } from './suppliers/suppliers.routes.js';
import { purchaseRouter } from './purchases/purchases.routes.js';
import { expenseRouter } from './expenses/expenses.routes.js';
import { closingRouter } from './closing/closing.routes.js';
import { dashboardRouter } from './dashboard/dashboard.routes.js';
import { catalogRouter } from './catalog/catalog.routes.js';
import { distributorRouter } from './distributors/distributors.routes.js';
import { suggestionRouter } from './suggestions/suggestions.routes.js';
import { storeRouter } from './store/store.routes.js';
import { orderRouter } from './orders/orders.routes.js';
import { knowledgeRouter } from './knowledge/knowledge.routes.js';

/** Mounts all API routes under /api. Auth is public; everything else requires a session. */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);

// Buyer-facing storefront: its own customer-token auth, applied per-route inside.
apiRouter.use('/store', storeRouter);

// All routes below require retailer (staff) authentication.
apiRouter.use(requireAuth);
apiRouter.use('/orders', orderRouter);
apiRouter.use('/kb', knowledgeRouter);
apiRouter.use('/shop', shopRouter);
apiRouter.use('/employees', employeeRouter);
apiRouter.use('/customers', customerRouter);
apiRouter.use('/products', productRouter);
apiRouter.use('/sales', saleRouter);
apiRouter.use('/khata', khataRouter);
apiRouter.use('/inventory', inventoryRouter);
apiRouter.use('/suppliers', supplierRouter);
apiRouter.use('/purchases', purchaseRouter);
apiRouter.use('/expenses', expenseRouter);
apiRouter.use('/closing', closingRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/catalog', catalogRouter);
apiRouter.use('/distributors', distributorRouter);
apiRouter.use('/suggestions', suggestionRouter);
