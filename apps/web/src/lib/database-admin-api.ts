import { apiRequest } from './api-client';

/** Client for the raw table browser (/admin/database). SUPER_ADMIN only. */

export interface TableSummary {
  name: string;
  table: string;
  rows: number;
  columns: number;
  editableColumns: number;
  primaryKey: string[];
  hasRedactedColumns: boolean;
}

export interface DatabaseOverview {
  totalTables: number;
  totalRows: number;
  tables: TableSummary[];
}

export interface ColumnMeta {
  name: string;
  type: string;
  kind: 'scalar' | 'enum' | 'object' | 'unsupported';
  isRequired: boolean;
  isReadOnly: boolean;
  hasDefault: boolean;
  enumValues?: string[];
}

export interface TableSchema {
  name: string;
  table: string;
  primaryKey: string[];
  isCompositeKey: boolean;
  columns: ColumnMeta[];
  redactedColumns: string[];
  relations: { name: string; target: string; isList: boolean }[];
}

/** A row always carries `_id` — the opaque key the API addresses it by. */
export type DatabaseRow = Record<string, unknown> & { _id: string };

export interface RowPage {
  data: DatabaseRow[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface DeleteImpact {
  table: string;
  id: string;
  dependents: { table: string; column: string; rows: number; action: string }[];
  cascadeRows: number;
  blockedBy: { table: string; column: string; rows: number; action: string }[];
  deepens: boolean;
}

export interface ListRowsParams {
  page?: number;
  pageSize?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
  search?: string;
}

const base = '/admin/database';

export const databaseApi = {
  overview: () => apiRequest<DatabaseOverview>(`${base}/tables`, { auth: true }),

  schema: (model: string) =>
    apiRequest<TableSchema>(`${base}/tables/${encodeURIComponent(model)}/schema`, { auth: true }),

  rows: (model: string, params: ListRowsParams = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') qs.set(k, String(v));
    }
    const query = qs.toString();
    return apiRequest<RowPage>(
      `${base}/tables/${encodeURIComponent(model)}/rows${query ? `?${query}` : ''}`,
      { auth: true },
    );
  },

  create: (model: string, values: Record<string, unknown>) =>
    apiRequest<DatabaseRow>(`${base}/tables/${encodeURIComponent(model)}/rows`, {
      method: 'POST',
      body: { values },
      auth: true,
    }),

  update: (model: string, id: string, values: Record<string, unknown>) =>
    apiRequest<DatabaseRow>(
      `${base}/tables/${encodeURIComponent(model)}/rows/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: { values }, auth: true },
    ),

  impact: (model: string, id: string) =>
    apiRequest<DeleteImpact>(
      `${base}/tables/${encodeURIComponent(model)}/rows/${encodeURIComponent(id)}/impact`,
      { auth: true },
    ),

  /**
   * `confirm=true` is required by the API: cascading foreign keys mean a
   * delete can remove far more than the named row, so callers must opt in
   * after seeing `impact()`.
   */
  remove: (model: string, id: string) =>
    apiRequest<{ deleted: boolean; id: string; cascaded: DeleteImpact['dependents'] }>(
      `${base}/tables/${encodeURIComponent(model)}/rows/${encodeURIComponent(id)}?confirm=true`,
      { method: 'DELETE', auth: true },
    ),
};
