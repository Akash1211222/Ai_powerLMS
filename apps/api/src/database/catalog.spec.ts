import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { displayFields, findModel, listModels, redactRow, writableFields } from './catalog';
import { coerceRowInput, coerceValue } from './coerce';

describe('database admin catalogue', () => {
  it('exposes every Prisma model with a resolvable delegate and table name', () => {
    const models = listModels();
    expect(models.length).toBeGreaterThan(50);
    for (const m of models) {
      expect(m.delegate).toBe(m.name.charAt(0).toLowerCase() + m.name.slice(1));
      expect(m.table).toBeTruthy();
    }
  });

  it('rejects unknown model names instead of guessing', () => {
    expect(findModel('User')).toBeTruthy();
    expect(findModel('users')).toBeNull();
    expect(findModel('User; DROP TABLE users')).toBeNull();
    expect(findModel('__proto__')).toBeNull();
  });

  it('describes composite-key models with all their key columns', () => {
    const rp = findModel('RolePermission');
    expect(rp?.primaryKey).toEqual(['roleId', 'permissionId']);
    expect(rp?.compoundKey).toBe('roleId_permissionId');

    const user = findModel('User');
    expect(user?.primaryKey).toEqual(['id']);
    expect(user?.compoundKey).toBeNull();
  });
});

describe('credential redaction', () => {
  it('marks known credential columns as redacted', () => {
    const cases: [string, string][] = [
      ['User', 'passwordHash'],
      ['Session', 'refreshTokenHash'],
      ['EmailVerificationToken', 'tokenHash'],
      ['PasswordResetToken', 'tokenHash'],
    ];
    for (const [modelName, fieldName] of cases) {
      const field = findModel(modelName)!.fields.find((f) => f.name === fieldName);
      expect(field, `${modelName}.${fieldName} should exist`).toBeTruthy();
      expect(field!.isRedacted, `${modelName}.${fieldName} must be redacted`).toBe(true);
    }
  });

  it('never lists a redacted column as displayable or writable', () => {
    const user = findModel('User')!;
    expect(displayFields(user).map((f) => f.name)).not.toContain('passwordHash');
    expect(writableFields(user).map((f) => f.name)).not.toContain('passwordHash');
  });

  it('strips redacted columns and relations from a row', () => {
    const user = findModel('User')!;
    const row = redactRow(user, {
      id: 'u1',
      email: 'a@b.com',
      passwordHash: '$argon2id$v=19$secret',
      profile: { id: 'p1' },
    });
    expect(row).toEqual({ id: 'u1', email: 'a@b.com' });
    expect(row).not.toHaveProperty('passwordHash');
    expect(row).not.toHaveProperty('profile');
  });

  it('refuses a write that targets a credential column', () => {
    const user = findModel('User')!;
    // Setting a known hash would let the caller authenticate as this user.
    expect(() => coerceRowInput(user, { passwordHash: 'x' }, { partial: true })).toThrow(
      /not editable/,
    );
  });

  it('treats primary keys, relations and updatedAt as read-only', () => {
    const user = findModel('User')!;
    expect(() => coerceRowInput(user, { id: 'other' }, { partial: true })).toThrow(/not editable/);
    expect(() =>
      coerceRowInput(user, { updatedAt: new Date().toISOString() }, { partial: true }),
    ).toThrow(/not editable/);
  });

  it('rejects columns that do not exist on the model', () => {
    const user = findModel('User')!;
    expect(() => coerceRowInput(user, { nope: 1 }, { partial: true })).toThrow(/no such column/);
  });
});

describe('value coercion', () => {
  const field = (over: Partial<Parameters<typeof coerceValue>[0]>) =>
    ({
      name: 'f',
      type: 'String',
      kind: 'scalar' as const,
      isId: false,
      isRequired: false,
      isList: false,
      hasDefault: false,
      isRedacted: false,
      isReadOnly: false,
      ...over,
    }) as Parameters<typeof coerceValue>[0];

  it('coerces integers and rejects fractions', () => {
    expect(coerceValue(field({ type: 'Int' }), '42')).toBe(42);
    expect(coerceValue(field({ type: 'Int' }), 42)).toBe(42);
    expect(() => coerceValue(field({ type: 'Int' }), '4.5')).toThrow(BadRequestException);
    expect(() => coerceValue(field({ type: 'Int' }), 'abc')).toThrow(/whole number/);
  });

  it('coerces booleans from checkbox and string forms', () => {
    expect(coerceValue(field({ type: 'Boolean' }), 'true')).toBe(true);
    expect(coerceValue(field({ type: 'Boolean' }), false)).toBe(false);
    expect(() => coerceValue(field({ type: 'Boolean' }), 'yes')).toThrow(/true or false/);
  });

  it('parses dates and rejects unparseable ones', () => {
    expect(coerceValue(field({ type: 'DateTime' }), '2026-08-08T00:00:00Z')).toBeInstanceOf(Date);
    expect(() => coerceValue(field({ type: 'DateTime' }), 'not-a-date')).toThrow(/valid date/);
  });

  it('constrains enums to their declared values', () => {
    const status = field({ kind: 'enum', type: 'UserStatus', enumValues: ['ACTIVE', 'PENDING'] });
    expect(coerceValue(status, 'ACTIVE')).toBe('ACTIVE');
    expect(() => coerceValue(status, 'DELETED')).toThrow(/must be one of ACTIVE, PENDING/);
  });

  it('treats blank input as null for non-strings but keeps empty strings', () => {
    expect(coerceValue(field({ type: 'Int' }), '')).toBeNull();
    expect(coerceValue(field({ type: 'String' }), '')).toBe('');
  });

  it('refuses to null a required column', () => {
    expect(() => coerceValue(field({ type: 'String', isRequired: true }), null)).toThrow(
      /cannot be null/,
    );
  });

  it('rejects binary columns rather than mangling them', () => {
    expect(() => coerceValue(field({ type: 'Bytes' }), 'AAAA')).toThrow(/binary/);
  });
});

describe('create payload validation', () => {
  it('requires columns that have no default', () => {
    const user = findModel('User')!;
    // email is required and has no default; omitting it must fail loudly.
    expect(() => coerceRowInput(user, { googleEmail: 'a@b.com' }, { partial: false })).toThrow(
      /email: is required/,
    );
  });

  it('does not demand columns the schema defaults', () => {
    const user = findModel('User')!;
    const createdAt = user.fields.find((f) => f.name === 'createdAt');
    expect(createdAt?.hasDefault).toBe(true);
  });

  it('rejects an empty payload', () => {
    const user = findModel('User')!;
    expect(() => coerceRowInput(user, {}, { partial: true })).toThrow(/No editable columns/);
  });
});
