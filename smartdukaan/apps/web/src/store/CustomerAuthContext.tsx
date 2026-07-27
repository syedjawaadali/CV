import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import type { StoreAuthResponse, StoreCustomer } from '@smartdukaan/shared';
import { storeApi, getStoreToken, setStoreToken } from '../lib/storeApi';

interface CustomerAuthValue {
  customer: StoreCustomer | null;
  ready: boolean;
  register: (input: { phone: string; name: string; password: string }) => Promise<void>;
  login: (input: { phone: string; password: string }) => Promise<void>;
  logout: () => void;
}

const CustomerAuthContext = createContext<CustomerAuthValue | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<StoreCustomer | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (getStoreToken()) {
        try {
          const me = await storeApi.get<{ customer: StoreCustomer }>('/auth/me');
          if (!cancelled) setCustomer(me.customer);
        } catch {
          setStoreToken(null);
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const register = useCallback(async (input: { phone: string; name: string; password: string }) => {
    const res = await storeApi.post<StoreAuthResponse>('/auth/register', input);
    setStoreToken(res.token);
    setCustomer(res.customer);
  }, []);

  const login = useCallback(async (input: { phone: string; password: string }) => {
    const res = await storeApi.post<StoreAuthResponse>('/auth/login', input);
    setStoreToken(res.token);
    setCustomer(res.customer);
  }, []);

  const logout = useCallback(() => {
    setStoreToken(null);
    setCustomer(null);
  }, []);

  const value = useMemo<CustomerAuthValue>(
    () => ({ customer, ready, register, login, logout }),
    [customer, ready, register, login, logout],
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCustomerAuth(): CustomerAuthValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used within CustomerAuthProvider');
  return ctx;
}
