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
  status: string;
  profile: { firstName: string; lastName: string; avatarUrl: string | null } | null;
  roles: Array<{ role: string; organizationId: string | null; organizationName: string | null }>;
  permissions: string[];
}

export const authApi = {
  register: (input: { email: string; password: string; firstName: string; lastName: string }) =>
    apiRequest<{ userId: string }>('/auth/register', { method: 'POST', body: input }),

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

  resetPassword: (token: string, password: string) =>
    apiRequest<{ success: true }>('/auth/reset-password', {
      method: 'POST',
      body: { token, password },
    }),
};
