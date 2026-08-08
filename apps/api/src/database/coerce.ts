import { BadRequestException } from '@nestjs/common';
import type { CatalogField, CatalogModel } from './catalog';
import { writableFields } from './catalog';

/**
 * Turns JSON sent by the browser into the exact types Prisma expects.
 *
 * The row editor bypasses the service layer, so this is the only validation a
 * written value gets. It is deliberately strict: an unparseable date or a
 * non-integer Int is rejected with a message naming the column, rather than
 * being coerced into something plausible-but-wrong and persisted.
 */

function fail(field: CatalogField, detail: string): never {
  throw new BadRequestException(`${field.name}: ${detail}`);
}

/** Coerces one JSON value to the Prisma type for `field`. */
export function coerceValue(field: CatalogField, raw: unknown): unknown {
  // Empty string from an <input> means "clear this column" for nullable
  // non-string columns; a genuine empty string is only meaningful for String.
  const value = raw === '' && field.type !== 'String' ? null : raw;

  if (value === null || value === undefined) {
    if (field.isRequired) fail(field, 'is required and cannot be null');
    return null;
  }

  if (field.kind === 'enum') {
    const allowed = field.enumValues ?? [];
    if (typeof value !== 'string' || !allowed.includes(value)) {
      fail(field, `must be one of ${allowed.join(', ')}`);
    }
    return value;
  }

  switch (field.type) {
    case 'String':
      if (typeof value !== 'string') fail(field, 'must be a string');
      return value;

    case 'Boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return fail(field, 'must be true or false');

    case 'Int':
    case 'BigInt': {
      const n = typeof value === 'number' ? value : Number(String(value).trim());
      if (!Number.isFinite(n) || !Number.isInteger(n)) fail(field, 'must be a whole number');
      return field.type === 'BigInt' ? BigInt(n) : n;
    }

    case 'Float':
    case 'Decimal': {
      const n = typeof value === 'number' ? value : Number(String(value).trim());
      if (!Number.isFinite(n)) fail(field, 'must be a number');
      return n;
    }

    case 'DateTime': {
      if (value instanceof Date) return value;
      if (typeof value !== 'string' && typeof value !== 'number') {
        fail(field, 'must be an ISO date string');
      }
      const d = new Date(value as string | number);
      if (Number.isNaN(d.getTime())) fail(field, 'is not a valid date');
      return d;
    }

    case 'Json':
      if (typeof value !== 'string') return value;
      try {
        return JSON.parse(value);
      } catch {
        return fail(field, 'is not valid JSON');
      }

    // Binary columns have no sane text representation in a table editor.
    case 'Bytes':
      return fail(field, 'binary columns cannot be edited here');

    default:
      // Unknown scalar (e.g. an Unsupported() column) — refuse rather than
      // guess, so nothing is written in a shape Prisma may not round-trip.
      return fail(field, `columns of type ${field.type} cannot be edited here`);
  }
}

/**
 * Validates and coerces a whole payload against a model.
 *
 * Unknown columns and read-only columns (primary keys, relations, `updatedAt`,
 * and every redacted credential column) are rejected outright rather than
 * silently dropped — a caller who thinks they just changed `passwordHash`
 * should be told they did not.
 */
export function coerceRowInput(
  model: CatalogModel,
  input: Record<string, unknown>,
  { partial }: { partial: boolean },
): Record<string, unknown> {
  const writable = new Map(writableFields(model).map((f) => [f.name, f]));
  const data: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(input)) {
    const field = writable.get(key);
    if (!field) {
      const known = model.fields.find((f) => f.name === key);
      if (!known) throw new BadRequestException(`${key}: no such column on ${model.name}`);
      throw new BadRequestException(`${key}: is not editable`);
    }
    data[key] = coerceValue(field, raw);
  }

  if (!partial) {
    // On create, every required column must be supplied unless the schema
    // provides a default (createdAt, cuid ids, enum defaults, …).
    for (const field of writable.values()) {
      if (field.isRequired && !field.hasDefault && !(field.name in data)) {
        throw new BadRequestException(`${field.name}: is required`);
      }
    }
  }

  if (Object.keys(data).length === 0) {
    throw new BadRequestException('No editable columns supplied');
  }
  return data;
}
