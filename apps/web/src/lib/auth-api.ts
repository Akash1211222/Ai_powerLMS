import { apiRequest } from './api-client';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface CurrentUser {
  id: string;
  email: string;
  googleEmail?: string | null;
  status: string;
  /** True while the account still has its admin-issued default password. */
  mustChangePassword?: boolean;
  profile: { firstName: string; lastName: string; avatarUrl: string | null } | null;
  roles: Array<{ role: string; organizationId: string | null; organizationName: string | null }>;
  permissions: string[];
}

export const authApi = {
  // No register(): accounts are created by an admin via POST /admin/members.

  changePassword: (input: { currentPassword: string; password: string }) =>
    apiRequest<AuthTokens>('/auth/change-password', { method: 'POST', body: input, auth: true }),

  login: (input: { email: string; password: string }) =>
    apiRequest<AuthTokens>('/auth/login', { method: 'POST', body: input }),

  refresh: (refreshToken: string) =>
    apiRequest<AuthTokens>('/auth/refresh', { method: 'POST', body: { refreshToken } }),

  logout: (refreshToken: string) =>
    apiRequest<{ success: true }>('/auth/logout', { method: 'POST', body: { refreshToken } }),

  me: () => apiRequest<CurrentUser>('/auth/me', { auth: true }),

  verifyEmail: (token: string) =>
    apiRequest<{ verified: true }>('/auth/verify-email', { method: 'POST', body: { token } }),

  forgotPassword: (email: string) =>
    apiRequest<{ success: true }>('/auth/forgot-password', { method: 'POST', body: { email } }),

  resetPassword: (email: string, otp: string, password: string) =>
    apiRequest<{ success: true }>('/auth/reset-password', {
      method: 'POST',
      body: { email, otp, password },
    }),
};
