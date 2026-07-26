import type { Role } from '@smartdukaan/shared';

/** Request-scoped context attached by middleware. */
export interface RequestAuth {
  userId: string;
  tenantId: string;
  shopId: string;
  role: Role;
  name: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
      auth?: RequestAuth;
    }
  }
}

export {};
