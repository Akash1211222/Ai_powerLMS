import { Prisma } from '@fca/database';

/**
 * Model catalogue for the raw database browser (/admin/database).
 *
 * Everything here is derived from Prisma's DMMF rather than hand-maintained,
 * so a new model or column shows up in the UI as soon as it is migrated. The
 * catalogue is also the security boundary for the feature:
 *
 *  - Model and column names are only ever *looked up* in this catalogue, never
 *    interpolated into SQL. A request naming an unknown table is rejected
 *    before it reaches Prisma, so there is no injection surface.
 *  - Secret columns are redacted on read and refused on write (see REDACTED).
 */

export type FieldKind = 'scalar' | 'enum' | 'object' | 'unsupported';

export interface CatalogField {
  name: string;
  /** Scalar type (String, Int, DateTime, …) or the enum/model name. */
  type: string;
  kind: FieldKind;
  isId: boolean;
  isRequired: boolean;
  isList: boolean;
  /** Has a Prisma/database default, so a create may legitimately omit it. */
  hasDefault: boolean;
  /** Never returned to the client and rejected if supplied on a write. */
  isRedacted: boolean;
  /** Present in the row view but not editable (ids, relations, updatedAt). */
  isReadOnly: boolean;
  enumValues?: string[];
}

export interface CatalogModel {
  /** Prisma model name, e.g. `User`. */
  name: string;
  /** Physical table name, e.g. `users`. */
  table: string;
  /** PrismaClient property, e.g. `user`. */
  delegate: string;
  /** Primary key columns — one for most models, two for join tables. */
  primaryKey: string[];
  /**
   * Prisma's compound-key argument name for composite primary keys
   * (`roleId_permissionId`), or null when the key is a single column.
   */
  compoundKey: string | null;
  fields: CatalogField[];
}

/**
 * Columns that must never leave the server.
 *
 * These are not merely private — they are directly exploitable. `passwordHash`
 * and the `*TokenHash` columns are credential material: anyone able to read
 * them can mount an offline cracking attempt, and anyone able to *write* one
 * could set a hash they know and authenticate as that user. So they are
 * stripped from every read and rejected on every write, for SUPER_ADMIN too.
 */
const REDACTED = new Set([
  'User.passwordHash',
  'Session.refreshTokenHash',
  'EmailVerificationToken.tokenHash',
  'PasswordResetToken.tokenHash',
]);

/**
 * Defence in depth for columns added after this file was written: any string
 * column whose name looks like credential material is redacted even if nobody
 * remembered to list it above. Deliberately narrow so ordinary content columns
 * (`instructions`, `body`, …) are unaffected.
 */
const REDACTED_NAME_PATTERN = /(passwordhash|tokenhash|secret|apikey|privatekey)/i;

function isRedactedField(modelName: string, field: { name: string; type: string }): boolean {
  if (REDACTED.has(`${modelName}.${field.name}`)) return true;
  return field.type === 'String' && REDACTED_NAME_PATTERN.test(field.name);
}

function buildCatalog(): Map<string, CatalogModel> {
  const enums = new Map(
    Prisma.dmmf.datamodel.enums.map((e) => [e.name, e.values.map((v) => v.name)]),
  );
  const catalog = new Map<string, CatalogModel>();

  for (const model of Prisma.dmmf.datamodel.models) {
    const primaryKey = model.primaryKey?.fields
      ? [...model.primaryKey.fields]
      : model.fields.filter((f) => f.isId).map((f) => f.name);

    // Prisma names the compound-key argument after the @@id column list when
    // the key is unnamed: `@@id([roleId, permissionId])` -> `roleId_permissionId`.
    const compoundKey =
      primaryKey.length > 1 ? (model.primaryKey?.name ?? primaryKey.join('_')) : null;

    const fields: CatalogField[] = model.fields.map((f) => {
      const isRedacted = isRedactedField(model.name, f);
      return {
        name: f.name,
        type: f.type,
        kind: f.kind as FieldKind,
        isId: Boolean(f.isId) || primaryKey.includes(f.name),
        isRequired: f.isRequired,
        isList: f.isList,
        hasDefault: f.hasDefaultValue,
        isRedacted,
        // Relations are edited through their foreign-key column, primary keys
        // are immutable, and updatedAt is maintained by Prisma.
        isReadOnly:
          isRedacted ||
          f.kind === 'object' ||
          f.isList ||
          Boolean(f.isId) ||
          primaryKey.includes(f.name) ||
          Boolean(f.isUpdatedAt) ||
          Boolean(f.isGenerated),
        enumValues: f.kind === 'enum' ? enums.get(f.type) : undefined,
      };
    });

    catalog.set(model.name, {
      name: model.name,
      table: model.dbName ?? model.name,
      delegate: model.name.charAt(0).toLowerCase() + model.name.slice(1),
      primaryKey,
      compoundKey,
      fields,
    });
  }

  return catalog;
}

/** Built once at module load — the datamodel cannot change at runtime. */
export const CATALOG: ReadonlyMap<string, CatalogModel> = buildCatalog();

/** Resolves a client-supplied model name, or null if it is not a real model. */
export function findModel(name: string): CatalogModel | null {
  return CATALOG.get(name) ?? null;
}

/** Models a browser can list, ordered alphabetically. */
export function listModels(): CatalogModel[] {
  return [...CATALOG.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Scalar + enum columns, i.e. everything selectable as a table column. */
export function displayFields(model: CatalogModel): CatalogField[] {
  return model.fields.filter((f) => f.kind !== 'object' && !f.isList && !f.isRedacted);
}

/** Columns a write is allowed to set. */
export function writableFields(model: CatalogModel): CatalogField[] {
  return model.fields.filter((f) => !f.isReadOnly);
}

/** Strips redacted columns and relation payloads from a row before it is sent. */
export function redactRow(
  model: CatalogModel,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of model.fields) {
    if (field.isRedacted || field.kind === 'object') continue;
    if (field.name in row) out[field.name] = row[field.name];
  }
  return out;
}
