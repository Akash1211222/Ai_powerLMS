import { apiRequest } from './api-client';

export type ReferralStatus = 'PENDING' | 'ACKNOWLEDGED' | 'DECLINED';

interface Person {
  id: string;
  email: string;
  profile: { firstName: string; lastName: string } | null;
}

export interface Referral {
  id: string;
  opportunityId: string;
  studentId: string;
  referrerId: string;
  note: string;
  status: ReferralStatus;
  createdAt: string;
  opportunity: { id: string; title: string; companyName: string; status: string };
  student?: Person;
  referrer?: Person;
}

export const referralsApi = {
  mine: () =>
    apiRequest<{ canRefer: boolean; made: Referral[]; received: Referral[] }>('/me/referrals', { auth: true }),
  create: (opportunityId: string, studentEmail: string, note: string) =>
    apiRequest<Referral>(`/opportunities/${opportunityId}/referrals`, {
      method: 'POST',
      body: { studentEmail, note },
      auth: true,
    }),
  forOpportunity: (opportunityId: string) =>
    apiRequest<Referral[]>(`/opportunities/${opportunityId}/referrals`, { auth: true }),
  review: (id: string, status: 'ACKNOWLEDGED' | 'DECLINED') =>
    apiRequest<Referral>(`/referrals/${id}/status`, { method: 'PATCH', body: { status }, auth: true }),
};
