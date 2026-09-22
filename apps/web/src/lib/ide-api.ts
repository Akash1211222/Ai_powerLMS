import { apiRequest } from './api-client';

export interface IdeStatus {
  enabled: boolean;
}

/** Browser VS Code (code-server). One workspace per learner, kept between visits. */
export const ideApi = {
  status: () => apiRequest<IdeStatus>('/ide/status', { auth: true }),
  /** Starts the caller's workspace if needed; the URL carries a one-minute, single-use ticket. */
  open: () => apiRequest<{ url: string }>('/ide/session', { method: 'POST', auth: true }),
  stop: () => apiRequest<null>('/ide/session', { method: 'DELETE', auth: true }),
};
