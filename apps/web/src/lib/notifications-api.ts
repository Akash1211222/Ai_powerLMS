import { apiRequest } from './api-client';

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  deepLink: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  data: Notification[];
  unread: number;
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export const notificationsApi = {
  list: () => apiRequest<NotificationList>('/notifications?pageSize=20', { auth: true }),
  unreadCount: () => apiRequest<{ unread: number }>('/notifications/unread-count', { auth: true }),
  markRead: (id: string) =>
    apiRequest<{ success: true }>(`/notifications/${id}/read`, { method: 'POST', auth: true }),
  markAllRead: () =>
    apiRequest<{ success: true }>('/notifications/read-all', { method: 'POST', auth: true }),
};
