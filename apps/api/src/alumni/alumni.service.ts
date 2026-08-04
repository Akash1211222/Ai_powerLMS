import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateAlumniProfileDto } from './dto/alumni.schemas';

/**
 * A profile only enters the directory once the graduate has actually shared
 * something — otherwise merely opening the page would publish an empty entry.
 */
const HAS_SHARED_SOMETHING = {
  OR: [
    { currentCompany: { not: null } },
    { currentRole: { not: null } },
    { story: { not: null } },
  ],
};

export interface AlumniOutcomes {
  totalAlumni: number;
  openToMentoring: number;
  topCompanies: Array<{ company: string; count: number }>;
  topIndustries: Array<{ industry: string; count: number }>;
}

/**
 * Alumni network (§29). Graduates self-maintain where they landed; current
 * students browse the directory as proof-of-outcome and as a network to reach
 * into. Everything is organization-scoped and opt-out via `isPublished`.
 */
@Injectable()
export class AlumniService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Own profile ------------------------------------------------------

  async getOrCreate(userId: string) {
    const existing = await this.prisma.alumniProfile.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.alumniProfile.create({ data: { userId } });
  }

  async update(userId: string, dto: UpdateAlumniProfileDto) {
    await this.getOrCreate(userId);
    return this.prisma.alumniProfile.update({ where: { userId }, data: dto });
  }

  // --- Directory --------------------------------------------------------

  private async orgIds(userId: string): Promise<string[]> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    return memberships.map((m) => m.organizationId);
  }

  /** Published alumni sharing an organization with the caller. */
  async directory(userId: string) {
    const orgIds = await this.orgIds(userId);
    if (orgIds.length === 0) return [];

    const profiles = await this.prisma.alumniProfile.findMany({
      where: {
        isPublished: true,
        user: { orgMemberships: { some: { organizationId: { in: orgIds } } } },
        ...HAS_SHARED_SOMETHING,
      },
      orderBy: [{ graduationYear: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { firstName: true, lastName: true, avatarUrl: true } },
          },
        },
      },
    });

    return profiles.map((p) => ({
      userId: p.userId,
      name: p.user.profile ? `${p.user.profile.firstName} ${p.user.profile.lastName}` : p.user.email,
      avatarUrl: p.user.profile?.avatarUrl ?? null,
      graduationYear: p.graduationYear,
      currentCompany: p.currentCompany,
      currentRole: p.currentRole,
      industry: p.industry,
      location: p.location,
      story: p.story,
      linkedinUrl: p.linkedinUrl,
      openToMentoring: p.openToMentoring,
      openToReferrals: p.openToReferrals,
    }));
  }

  /**
   * Deterministic outcomes rollup for the caller's organization (§17) — what
   * current students most want to know: where do graduates actually land.
   */
  async outcomes(userId: string): Promise<AlumniOutcomes> {
    const orgIds = await this.orgIds(userId);
    const empty: AlumniOutcomes = { totalAlumni: 0, openToMentoring: 0, topCompanies: [], topIndustries: [] };
    if (orgIds.length === 0) return empty;

    const profiles = await this.prisma.alumniProfile.findMany({
      where: {
        isPublished: true,
        user: { orgMemberships: { some: { organizationId: { in: orgIds } } } },
        ...HAS_SHARED_SOMETHING,
      },
      select: { currentCompany: true, industry: true, openToMentoring: true },
    });
    if (profiles.length === 0) return empty;

    const tally = (values: Array<string | null>) => {
      const counts = new Map<string, number>();
      for (const v of values) {
        const key = v?.trim();
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, 5);
    };

    return {
      totalAlumni: profiles.length,
      openToMentoring: profiles.filter((p) => p.openToMentoring).length,
      topCompanies: tally(profiles.map((p) => p.currentCompany)).map((c) => ({ company: c.name, count: c.count })),
      topIndustries: tally(profiles.map((p) => p.industry)).map((i) => ({ industry: i.name, count: i.count })),
    };
  }
}
