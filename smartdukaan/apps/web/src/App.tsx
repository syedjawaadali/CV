import type { ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PERMISSIONS, type Permission } from '@smartdukaan/shared';
import { useAuth } from './auth/AuthContext';
import { Loading } from './components/ui';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { RegisterPage } from './pages/Register';
import { DashboardPage } from './pages/Dashboard';
import { NewSalePage } from './pages/NewSale';
import { SalesPage } from './pages/Sales';
import { KhataPage } from './pages/Khata';
import { CustomersPage } from './pages/Customers';
import { ProductsPage } from './pages/Products';
import { InventoryPage } from './pages/Inventory';
import { ExpensesPage } from './pages/Expenses';
import { ClosingPage } from './pages/Closing';
import { EmployeesPage } from './pages/Employees';
import { SettingsPage } from './pages/Settings';

/** Gate a route on a permission; fall back to the dashboard if not allowed. */
function Guard({ permission, children }: { permission?: Permission; children: ReactElement }) {
  const { can } = useAuth();
  if (permission && !can(permission)) return <Navigate to="/" replace />;
  return children;
}

export function App() {
  const { user, ready } = useAuth();

  if (!ready) {
    return <div className="flex h-full items-center justify-center"><Loading /></div>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Guard permission={PERMISSIONS.REPORT_VIEW}><DashboardPage /></Guard>} />
        <Route path="/sales/new" element={<Guard permission={PERMISSIONS.SALE_CREATE}><NewSalePage /></Guard>} />
        <Route path="/sales" element={<Guard permission={PERMISSIONS.SALE_VIEW}><SalesPage /></Guard>} />
        <Route path="/khata" element={<Guard permission={PERMISSIONS.KHATA_VIEW}><KhataPage /></Guard>} />
        <Route path="/customers" element={<Guard permission={PERMISSIONS.CUSTOMER_VIEW}><CustomersPage /></Guard>} />
        <Route path="/products" element={<Guard permission={PERMISSIONS.PRODUCT_VIEW}><ProductsPage /></Guard>} />
        <Route path="/inventory" element={<Guard permission={PERMISSIONS.INVENTORY_VIEW}><InventoryPage /></Guard>} />
        <Route path="/expenses" element={<Guard permission={PERMISSIONS.EXPENSE_MANAGE}><ExpensesPage /></Guard>} />
        <Route path="/closing" element={<Guard permission={PERMISSIONS.CLOSING_MANAGE}><ClosingPage /></Guard>} />
        <Route path="/employees" element={<Guard permission={PERMISSIONS.EMPLOYEE_MANAGE}><EmployeesPage /></Guard>} />
        <Route path="/settings" element={<Guard permission={PERMISSIONS.SHOP_MANAGE}><SettingsPage /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
