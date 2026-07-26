import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3, Boxes, ClipboardCheck, LogOut, Menu, Package, Receipt,
  ShoppingCart, Store, Users, UsersRound, Wallet, X, Languages, Truck,
} from 'lucide-react';
import { PERMISSIONS, type Permission } from '@smartdukaan/shared';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import type { StringKey } from '../i18n/strings';

interface NavItem { to: string; label: StringKey; icon: typeof BarChart3; permission: Permission }

const NAV: NavItem[] = [
  { to: '/', label: 'nav_dashboard', icon: BarChart3, permission: PERMISSIONS.REPORT_VIEW },
  { to: '/sales/new', label: 'nav_new_sale', icon: ShoppingCart, permission: PERMISSIONS.SALE_CREATE },
  { to: '/sales', label: 'nav_sales', icon: Receipt, permission: PERMISSIONS.SALE_VIEW },
  { to: '/khata', label: 'nav_khata', icon: Wallet, permission: PERMISSIONS.KHATA_VIEW },
  { to: '/customers', label: 'nav_customers', icon: Users, permission: PERMISSIONS.CUSTOMER_VIEW },
  { to: '/products', label: 'nav_products', icon: Package, permission: PERMISSIONS.PRODUCT_VIEW },
  { to: '/inventory', label: 'nav_inventory', icon: Boxes, permission: PERMISSIONS.INVENTORY_VIEW },
  { to: '/restock', label: 'nav_restock', icon: Truck, permission: PERMISSIONS.PRODUCT_VIEW },
  { to: '/expenses', label: 'nav_expenses', icon: Wallet, permission: PERMISSIONS.EXPENSE_MANAGE },
  { to: '/closing', label: 'nav_closing', icon: ClipboardCheck, permission: PERMISSIONS.CLOSING_MANAGE },
  { to: '/employees', label: 'nav_employees', icon: UsersRound, permission: PERMISSIONS.EMPLOYEE_MANAGE },
  { to: '/settings', label: 'nav_settings', icon: Store, permission: PERMISSIONS.SHOP_MANAGE },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, can } = useAuth();
  const { t, toggle, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const items = NAV.filter((item) => can(item.permission));

  const NavList = () => (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`
          }
        >
          <Icon className="h-5 w-5 shrink-0" aria-hidden />
          {t(label)}
        </NavLink>
      ))}
    </nav>
  );

  const Brand = () => (
    <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-700 text-white">
        <Store className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-bold text-slate-900">{t('app_name')}</p>
        <p className="truncate text-xs text-slate-500">{user?.shopName}</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-e border-slate-200 bg-white lg:flex">
        <Brand />
        <NavList />
        <UserFooter />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/40" />
          <aside
            className="absolute inset-y-0 start-0 flex w-72 flex-col bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <Brand />
            <NavList />
            <UserFooter />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">
            <Menu className="h-6 w-6" />
          </button>
          <h1 className="text-base font-semibold text-slate-900 lg:text-lg">
            {t(items.find((i) => i.to === location.pathname)?.label ?? 'nav_dashboard')}
          </h1>
          <button
            onClick={toggle}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            title="Switch language"
          >
            <Languages className="h-5 w-5" />
            <span>{lang === 'en' ? 'اردو' : 'EN'}</span>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );

  function UserFooter() {
    return (
      <div className="border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-slate-900">{user?.name}</p>
            <p className="truncate text-xs capitalize text-slate-500">{user?.role}</p>
          </div>
        </div>
        <button
          onClick={() => { void logout(); }}
          className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <LogOut className="h-5 w-5" /> {t('logout')}
        </button>
      </div>
    );
  }
}
