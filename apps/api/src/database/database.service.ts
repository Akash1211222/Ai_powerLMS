import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@fca/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CATALOG,
  displayFields,
  findModel,
  listModels,
  redactRow,
  writableFields,
  type CatalogModel,
} from './catalog';
import { coerceRowInput } from './coerce';
import type { ListRowsQuery } from './dto/database.schemas';

/** Prisma delegate surface used by the browser — every model exposes these. */
type Delegate = {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  findUnique(args: unknown): Promise<Record<string, unknown> | null>;
  count(args?: unknown): Promise<number>;
  create(args: unknown): Promise<Record<string, unknown>>;
  update(args: unknown): Promise<Record<string, unknown>>;
  delete(args: unknown): Promise<Record<string, unknown>>;
};

@Injectable()
export class DatabaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Resolves a model name from the request, 404-ing on anything unknown. */
  private model(name: string): CatalogModel {
    const model = findModel(name);
    if (!model) throw new NotFoundException(`No such table: ${name}`);
    return model;
  }

  private delegate(model: CatalogModel): Delegate {
    const delegate = (this.prisma as unknown as Record<string, Delegate | undefined>)[
      model.delegate
    ];
    // Unreachable via the API (the catalogue is built from the same client),
    // but a missing delegate would otherwise fail as an opaque "not a function".
    if (!delegate) throw new NotFoundException(`No such table: ${model.name}`);
    return delegate;
  }

  /**
   * Builds the Prisma `where` that identifies exactly one row, handling both
   * single-column keys and the compound keys used by join tables.
   */
  private whereId(model: CatalogModel, id: string): Record<string, unknown> {
    const [firstKey] = model.primaryKey;
    if (!firstKey) {
      throw new BadRequestException(
        `${model.name} has no primary key and cannot be addressed by row`,
      );
    }
    if (!model.compoundKey) return { [firstKey]: id };

    // Composite keys arrive as `value1~value2` in path position.
    const parts = id.split('~');
    if (parts.length !== model.primaryKey.length) {
      throw new BadRequestException(
        `${model.name} has a composite key — expected ${model.primaryKey.join(' ~ ')}`,
      );
    }
    const key = Object.fromEntries(model.primaryKey.map((f, i) => [f, parts[i]]));
    return { [model.compoundKey]: key };
  }

  /** The opaque row id the UI sends back for a given row. */
  private rowId(model: CatalogModel, row: Record<string, unknown>): string {
    return model.primaryKey.map((f) => String(row[f])).join('~');
  }

  // --- Reads -------------------------------------------------------------

  /**
   * Every table with its row count, for the dashboard landing view.
   *
   * Counts come from one generated UNION ALL rather than 90 round trips. The
   * table names are interpolated, but they come from Prisma's DMMF via the
   * catalogue — never from the request — so no caller input reaches the SQL.
   */
  async overview() {
    const models = listModels();
    const union = models
      .map((m) => `SELECT '${m.name}' AS model, count(*)::int AS rows FROM "${m.table}"`)
      .join(' UNION ALL ');

    const counted = await this.prisma.$queryRawUnsafe<{ model: string; rows: number }[]>(union);
    const byModel = new Map(counted.map((r) => [r.model, r.rows]));

    return {
      totalTables: models.length,
      totalRows: counted.reduce((sum, r) => sum + r.rows, 0),
      tables: models.map((m) => ({
        name: m.name,
        table: m.table,
        rows: byModel.get(m.name) ?? 0,
        columns: displayFields(m).length,
        editableColumns: writableFields(m).length,
        primaryKey: m.primaryKey,
        hasRedactedColumns: m.fields.some((f) => f.isRedacted),
      })),
    };
  }

  /** Column metadata for one table, so the UI can render a typed editor. */
  schema(name: string) {
    const model = this.model(name);
    return {
      name: model.name,
      table: model.table,
      primaryKey: model.primaryKey,
      isCompositeKey: Boolean(model.compoundKey),
      columns: displayFields(model).map((f) => ({
        name: f.name,
        type: f.type,
        kind: f.kind,
        isRequired: f.isRequired,
        isReadOnly: f.isReadOnly,
        hasDefault: f.hasDefault,
        enumValues: f.enumValues,
      })),
      redactedColumns: model.fields.filter((f) => f.isRedacted).map((f) => f.name),
      relations: model.fields
        .filter((f) => f.kind === 'object')
        .map((f) => ({ name: f.name, target: f.type, isList: f.isList })),
    };
  }

  async listRows(name: string, query: ListRowsQuery) {
    const model = this.model(name);
    const { page, pageSize, sort, direction, search } = query;

    const select = Object.fromEntries(displayFields(model).map((f) => [f.name, true]));

    // Free-text search spans every string column on the table.
    let where: Record<string, unknown> | undefined;
    if (search) {
      const stringFields = displayFields(model).filter((f) => f.type === 'String');
      if (stringFields.length > 0) {
        where = {
          OR: stringFields.map((f) => ({
            [f.name]: { contains: search, mode: 'insensitive' },
          })),
        };
      }
    }

    // An unknown sort column is ignored rather than rejected, so a stale
    // bookmark still renders the table instead of erroring.
    const sortField = sort && displayFields(model).some((f) => f.name === sort) ? sort : null;
    const [firstKey] = model.primaryKey;
    const orderBy = sortField
      ? { [sortField]: direction }
      : model.primaryKey.length === 1 && firstKey
        ? { [firstKey]: 'desc' as const }
        : undefined;

    const delegate = this.delegate(model);
    const [rows, total] = await Promise.all([
      delegate.findMany({
        select,
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      delegate.count(where ? { where } : undefined),
    ]);

    return {
      data: rows.map((row) => ({ _id: this.rowId(model, row), ...redactRow(model, row) })),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async getRow(name: string, id: string) {
    const model = this.model(name);
    const row = await this.delegate(model).findUnique({
      where: this.whereId(model, id),
      select: Object.fromEntries(displayFields(model).map((f) => [f.name, true])),
    });
    if (!row) throw new NotFoundException(`No ${model.name} row with key ${id}`);
    return { _id: this.rowId(model, row), ...redactRow(model, row) };
  }

  // --- Writes ------------------------------------------------------------

  async createRow(actorId: string, name: string, input: Record<string, unknown>) {
    const model = this.model(name);
    const data = coerceRowInput(model, input, { partial: false });

    const row = await this.run(() => this.delegate(model).create({ data }));
    const rowId = this.rowId(model, row);

    await this.audit.record({
      action: 'database.row.created',
      actorUserId: actorId,
      targetType: model.name,
      targetId: rowId,
      metadata: { table: model.table, columns: Object.keys(data) },
    });
    return { _id: rowId, ...redactRow(model, row) };
  }

  async updateRow(actorId: string, name: string, id: string, input: Record<string, unknown>) {
    const model = this.model(name);
    const data = coerceRowInput(model, input, { partial: true });
    const where = this.whereId(model, id);

    // Captured before the write so the audit entry records what was replaced,
    // not just what it was replaced with.
    const before = await this.delegate(model).findUnique({ where });
    if (!before) throw new NotFoundException(`No ${model.name} row with key ${id}`);

    const row = await this.run(() => this.delegate(model).update({ where, data }));

    await this.audit.record({
      action: 'database.row.updated',
      actorUserId: actorId,
      targetType: model.name,
      targetId: id,
      metadata: {
        table: model.table,
        changed: Object.fromEntries(
          Object.keys(data).map((k) => [k, { from: serialize(before[k]), to: serialize(row[k]) }]),
        ),
      },
    });
    return { _id: this.rowId(model, row), ...redactRow(model, row) };
  }

  /**
   * What else disappears if this row is deleted.
   *
   * The schema declares 119 `onDelete: Cascade` relations, so deleting a
   * well-connected row (an Organization, a User) silently removes thousands of
   * dependent rows. The UI shows this before asking for confirmation — without
   * it, a single click in a table view could empty the platform.
   *
   * Only direct dependents are counted; cascades continue past them, so the
   * reported number is a floor, not a ceiling.
   */
  async deleteImpact(name: string, id: string) {
    const model = this.model(name);
    const where = this.whereId(model, id);
    const row = await this.delegate(model).findUnique({ where });
    if (!row) throw new NotFoundException(`No ${model.name} row with key ${id}`);

    // Composite-key rows are not referenced by a single column, so there is no
    // simple dependent lookup for them.
    if (model.compoundKey) {
      return {
        table: model.name,
        id,
        dependents: [],
        cascadeRows: 0,
        blockedBy: [],
        deepens: false,
      };
    }

    const foreignKeys = await this.prisma.$queryRaw<
      { child_table: string; child_column: string; on_delete: string }[]
    >`
      SELECT src.relname AS child_table, att.attname AS child_column,
             con.confdeltype AS on_delete
      FROM pg_constraint con
      JOIN pg_class src ON src.oid = con.conrelid
      JOIN pg_class tgt ON tgt.oid = con.confrelid
      JOIN unnest(con.conkey) AS k(attnum) ON true
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
      WHERE con.contype = 'f' AND tgt.relname = ${model.table}
    `;

    const keyValue = row[model.primaryKey[0] as string];
    const dependents: { table: string; column: string; rows: number; action: string }[] = [];

    for (const fk of foreignKeys) {
      // Identifiers come from pg_constraint (the database's own catalogue),
      // never from the request; the row key is parameterised.
      const counted = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT count(*)::bigint AS count FROM "${fk.child_table}" WHERE "${fk.child_column}" = $1`,
        keyValue,
      );
      const rows = Number(counted[0]?.count ?? 0);
      if (rows > 0) {
        dependents.push({
          table: fk.child_table,
          column: fk.child_column,
          rows,
          action: DELETE_ACTIONS[fk.on_delete] ?? fk.on_delete,
        });
      }
    }

    const cascading = dependents.filter((d) => d.action === 'cascade');
    return {
      table: model.name,
      id,
      dependents: dependents.sort((a, b) => b.rows - a.rows),
      cascadeRows: cascading.reduce((sum, d) => sum + d.rows, 0),
      // Restrict/no-action dependents make the delete fail outright.
      blockedBy: dependents.filter((d) => d.action === 'restrict' || d.action === 'no action'),
      // Cascades continue below these rows, so the count understates the total.
      deepens: cascading.length > 0,
    };
  }

  async deleteRow(actorId: string, name: string, id: string) {
    const model = this.model(name);
    const where = this.whereId(model, id);

    const before = await this.delegate(model).findUnique({ where });
    if (!before) throw new NotFoundException(`No ${model.name} row with key ${id}`);

    // Recorded alongside the delete so the audit entry says how much went with
    // it, not just which row was named.
    const impact = await this.deleteImpact(name, id).catch(() => null);

    await this.run(() => this.delegate(model).delete({ where }));

    await this.audit.record({
      action: 'database.row.deleted',
      actorUserId: actorId,
      targetType: model.name,
      targetId: id,
      // The deleted row is kept in the audit trail (minus redacted columns) so
      // an accidental delete can be reconstructed.
      metadata: {
        table: model.table,
        deleted: serializeRow(redactRow(model, before)),
        cascaded: impact?.dependents ?? [],
      },
    });
    return { deleted: true, id, cascaded: impact?.dependents ?? [] };
  }

  /**
   * Translates Prisma's constraint errors into messages that say what to do.
   * Without this the UI would surface "P2003" to someone who just wants to
   * know which table still references the row they tried to delete.
   */
  private async run<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        const meta = (err.meta ?? {}) as Record<string, unknown>;
        if (err.code === 'P2002') {
          throw new ConflictException(
            `A row with that ${[meta.target].flat().join(', ')} already exists`,
          );
        }
        if (err.code === 'P2003') {
          throw new ConflictException(
            `Other rows still reference this one (${String(meta.field_name ?? 'foreign key')}). ` +
              'Delete or repoint them first.',
          );
        }
        if (err.code === 'P2025') throw new NotFoundException('That row no longer exists');
        throw new BadRequestException(`${err.code}: ${err.message.split('\n').pop()}`);
      }
      throw err;
    }
  }
}

/** Postgres `confdeltype` codes for a foreign key's ON DELETE behaviour. */
const DELETE_ACTIONS: Record<string, string> = {
  a: 'no action',
  r: 'restrict',
  c: 'cascade',
  n: 'set null',
  d: 'set default',
};

/** JSON-safe rendering for audit metadata (Dates, BigInt, Decimal). */
function serialize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') return value.toString();
  if (value && typeof value === 'object' && 'toString' in value && !Array.isArray(value)) {
    return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
  }
  return value;
}

function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, serialize(v)]));
}

/** Exposed for the module's health/diagnostics and tests. */
export const MODEL_COUNT = CATALOG.size;
