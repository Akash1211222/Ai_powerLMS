import { describe, it, expect } from 'vitest';
import { DEFAULT_ROLE_PERMISSIONS, type RoleName } from '@fca/shared';
import { buildNav } from './nav-items';

/**
 * Pins the menu each role is offered, against the real permission matrix rather
 * than a copy of it. If somebody adds a page and forgets to say who it is for,
 * or widens a permission, a named role's menu changes here and the test says so.
 *
 * The failure this exists to prevent already happened: seven items were pinned
 * visible for everyone, so a Batch Manager was shown Career, Mentorship and
 * Alumni — screens they cannot act on.
 */

const menuFor = (role: RoleName) =>
  buildNav({ permissions: DEFAULT_ROLE_PERMISSIONS[role] as string[] }).map((n) => n.label);

describe('the menu each role is offered', () => {
  it('gives a Batch Manager their job and nothing else', () => {
    const menu = menuFor('BATCH_MANAGER');

    // Their actual work.
    expect(menu).toEqual(
      expect.arrayContaining(['Batches', 'Attendance', 'Courses', 'Insights', 'Dashboard']),
    );
    // Community stays: batch announcements go out through it.
    expect(menu).toContain('Community');
    // What they were being shown and cannot act on.
    expect(menu).not.toContain('Career');
    expect(menu).not.toContain('Mentorship');
    expect(menu).not.toContain('Alumni');
    expect(menu).not.toContain('Assignments');
    expect(menu).not.toContain('Assessments');
  });

  it('gives a Trainer the teaching screens, not the placement desk', () => {
    const menu = menuFor('TRAINER');

    expect(menu).toEqual(
      expect.arrayContaining(['Courses', 'Assignments', 'Assessments', 'Attendance', 'Batches']),
    );
    expect(menu).not.toContain('Career');
    expect(menu).not.toContain('Alumni');
    expect(menu).not.toContain('Opportunities');
  });

  it('gives a Placement Officer hiring screens, not teaching ones', () => {
    const menu = menuFor('PLACEMENT_OFFICER');

    expect(menu).toEqual(expect.arrayContaining(['Opportunities', 'Career', 'Alumni']));
    expect(menu).not.toContain('Courses');
    expect(menu).not.toContain('Assignments');
    expect(menu).not.toContain('Assessments');
    expect(menu).not.toContain('Attendance');
    // No reason to sit in a live class.
    expect(menu).not.toContain('Live');
  });

  it('gives a Mentor their mentees, not the batch desk', () => {
    const menu = menuFor('MENTOR');

    expect(menu).toContain('Mentorship');
    expect(menu).toContain('Courses');
    expect(menu).not.toContain('Batches');
    expect(menu).not.toContain('Attendance');
    expect(menu).not.toContain('Opportunities');
  });

  it('gives a Student their own work and the things sold to them', () => {
    const menu = menuFor('STUDENT');

    expect(menu).toEqual(
      expect.arrayContaining([
        'Courses',
        'Assignments',
        'Assessments',
        'Attendance',
        'Live',
        'Skills',
        'Career',
        'Mentorship',
        'Community',
        'Reports',
      ]),
    );
    // Staff-only surfaces.
    expect(menu).not.toContain('Batches');
    expect(menu).not.toContain('Insights');
    expect(menu).not.toContain('Admin');
    expect(menu).not.toContain('Database');
  });

  it('gives a Recruiter almost nothing', () => {
    // One permission, and it should look like it.
    const menu = menuFor('RECRUITER');
    expect(menu).toEqual(['Dashboard', 'Opportunities', 'Calendar', 'Profile']);
  });

  it('keeps the raw database browser for the platform owner alone', () => {
    expect(menuFor('SUPER_ADMIN')).toContain('Database');
    for (const role of ['COLLEGE_ADMIN', 'BATCH_MANAGER', 'TRAINER', 'STUDENT'] as RoleName[]) {
      expect(menuFor(role)).not.toContain('Database');
    }
  });

  it('shows the admin area only to those who administer something', () => {
    expect(menuFor('COLLEGE_ADMIN')).toContain('Admin');
    for (const role of ['BATCH_MANAGER', 'TRAINER', 'MENTOR', 'STUDENT'] as RoleName[]) {
      expect(menuFor(role)).not.toContain('Admin');
    }
  });
});

describe('the menu as a whole', () => {
  it('never offers a screen to somebody with no permissions at all', () => {
    // A member whose role grant failed should land on a shell, not the product.
    const menu = buildNav({ permissions: [] }).map((n) => n.label);
    expect(menu).toEqual(['Dashboard', 'Calendar', 'Profile']);
  });

  it('gets smaller as the role narrows', () => {
    // The whole point of the change: seniority should be visible in the menu.
    const size = (r: RoleName) => menuFor(r).length;
    expect(size('SUPER_ADMIN')).toBeGreaterThan(size('COLLEGE_ADMIN'));
    expect(size('COLLEGE_ADMIN')).toBeGreaterThan(size('BATCH_MANAGER'));
    expect(size('BATCH_MANAGER')).toBeGreaterThan(size('RECRUITER'));
  });

  it('offers the portfolio only to somebody with more than one college', () => {
    // Almost everyone belongs to one organisation. A page comparing it with
    // itself is a menu item that answers nothing.
    const perms = DEFAULT_ROLE_PERMISSIONS.OPERATIONAL_LEAD as string[];
    expect(buildNav({ permissions: perms, orgCount: 1 }).map((n) => n.label)).not.toContain(
      'Your colleges',
    );
    expect(buildNav({ permissions: perms, orgCount: 3 }).map((n) => n.label)).toContain(
      'Your colleges',
    );
    // Unknown count behaves like one, so nothing appears before the org list loads.
    expect(buildNav({ permissions: perms }).map((n) => n.label)).not.toContain('Your colleges');
  });

  it('leaves no duplicate destinations', () => {
    const hrefs = buildNav({ permissions: DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN as string[] }).map(
      (n) => n.href,
    );
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
