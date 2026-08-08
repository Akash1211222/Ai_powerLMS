'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Search, Plus, X, Trash2, AlertTriangle, KeyRound } from 'lucide-react';
import { Card, Button, Badge, Spinner, Alert, Input, Select, Textarea } from '@fca/ui';
import { useAuth } from '@/lib/auth-context';
import {
  databaseApi,
  type ColumnMeta,
  type DatabaseRow,
  type DeleteImpact,
  type TableSchema,
} from '@/lib/database-admin-api';

/**
 * Raw database browser (SUPER_ADMIN only).
 *
 * Edits here bypass every business rule the API normally enforces, so the UI
 * leans on the server's guard rails rather than reimplementing them: columns
 * the API marks read-only are rendered disabled, credential columns never
 * arrive at all, and deleting always goes through the cascade preview.
 */
export default function DatabaseAdminPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [selected, setSelected] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<string | null>(null);
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [editing, setEditing] = useState<DatabaseRow | null>(null);
  const [creating, setCreating] = useState(false);

  const canUse = user?.permissions.includes('database:admin');

  const overviewQ = useQuery({
    queryKey: ['db-admin', 'overview'],
    queryFn: () => databaseApi.overview(),
    enabled: Boolean(canUse),
  });

  const schemaQ = useQuery({
    queryKey: ['db-admin', 'schema', selected],
    queryFn: () => databaseApi.schema(selected!),
    enabled: Boolean(selected),
  });

  const rowsQ = useQuery({
    queryKey: ['db-admin', 'rows', selected, page, sort, direction, search],
    queryFn: () =>
      databaseApi.rows(selected!, {
        page,
        pageSize: 25,
        sort: sort ?? undefined,
        direction,
        search: search || undefined,
      }),
    enabled: Boolean(selected),
  });

  const tables = useMemo(() => {
    const all = overviewQ.data?.tables ?? [];
    const q = tableFilter.trim().toLowerCase();
    return q ? all.filter((t) => t.name.toLowerCase().includes(q) || t.table.includes(q)) : all;
  }, [overviewQ.data, tableFilter]);

  function openTable(name: string) {
    setSelected(name);
    setPage(1);
    setSort(null);
    setSearch('');
    setSearchInput('');
    setEditing(null);
    setCreating(false);
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ['db-admin'] });
  }

  if (!canUse) {
    return <Alert tone="error">This area requires the database:admin permission.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">
          <span className="gradient-text">Database</span>
        </h1>
        <p className="mt-1 text-faint">
          Every table in the platform.{' '}
          {overviewQ.data && (
            <>
              {overviewQ.data.totalTables} tables · {overviewQ.data.totalRows.toLocaleString()}{' '}
              rows.
            </>
          )}
        </p>
      </div>

      <Alert tone="warning">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="text-sm">
            Changes here write straight to the database, skipping the validation and business rules
            the rest of the app applies. Every edit is recorded in the audit log. Password and token
            columns are never shown or writable.
          </div>
        </div>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Table list */}
        <Card className="h-fit lg:sticky lg:top-4">
          <div className="mb-3 flex items-center gap-2">
            <Database className="h-4 w-4 text-faint" />
            <h2 className="font-bold">Tables</h2>
          </div>
          <Input
            placeholder="Filter tables…"
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
          />
          {overviewQ.isLoading && <Spinner />}
          {overviewQ.error && <Alert tone="error">Could not load tables.</Alert>}
          <ul className="mt-3 max-h-[60vh] overflow-y-auto text-sm">
            {tables.map((t) => (
              <li key={t.name}>
                <button
                  type="button"
                  onClick={() => openTable(t.name)}
                  className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                    selected === t.name ? 'bg-accent/15 font-semibold' : 'hover:bg-chip'
                  }`}
                >
                  <span className="truncate">
                    {t.name}
                    {t.hasRedactedColumns && (
                      <KeyRound
                        className="ml-1 inline h-3 w-3 text-faint"
                        aria-label="has hidden credential columns"
                      />
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-faint">{t.rows.toLocaleString()}</span>
                </button>
              </li>
            ))}
            {tables.length === 0 && !overviewQ.isLoading && (
              <li className="px-2 py-2 text-faint">No tables match.</li>
            )}
          </ul>
        </Card>

        {/* Rows */}
        <div className="min-w-0">
          {!selected && (
            <Card>
              <p className="text-faint">Pick a table to browse its rows.</p>
            </Card>
          )}

          {selected && (
            <Card>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-bold">{selected}</h2>
                  <p className="text-xs text-faint">
                    {schemaQ.data?.table}
                    {rowsQ.data && <> · {rowsQ.data.meta.total.toLocaleString()} rows</>}
                    {schemaQ.data && schemaQ.data.redactedColumns.length > 0 && (
                      <> · {schemaQ.data.redactedColumns.length} hidden credential column(s)</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <form
                    className="flex items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setSearch(searchInput);
                      setPage(1);
                    }}
                  >
                    <Input
                      placeholder="Search text columns…"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className="w-48"
                    />
                    <Button type="submit" variant="ghost" aria-label="Search">
                      <Search className="h-4 w-4" />
                    </Button>
                  </form>
                  <Button
                    type="button"
                    onClick={() => {
                      setCreating(true);
                      setEditing(null);
                    }}
                  >
                    <Plus className="mr-1 h-4 w-4" /> New row
                  </Button>
                </div>
              </div>

              {rowsQ.isLoading && <Spinner />}
              {rowsQ.error && (
                <Alert tone="error">
                  {rowsQ.error instanceof Error ? rowsQ.error.message : 'Could not load rows.'}
                </Alert>
              )}

              {rowsQ.data && schemaQ.data && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-max text-left text-sm">
                      <thead className="border-b border-hair text-xs uppercase text-faint">
                        <tr>
                          {schemaQ.data.columns.map((c) => (
                            <th key={c.name} className="whitespace-nowrap px-2 py-2 font-semibold">
                              <button
                                type="button"
                                className="hover:text-ink"
                                onClick={() => {
                                  const next =
                                    sort === c.name && direction === 'desc' ? 'asc' : 'desc';
                                  setSort(c.name);
                                  setDirection(next);
                                  setPage(1);
                                }}
                              >
                                {c.name}
                                {sort === c.name && (direction === 'asc' ? ' ↑' : ' ↓')}
                              </button>
                            </th>
                          ))}
                          <th className="px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {rowsQ.data.data.map((row) => (
                          <tr
                            key={row._id}
                            className="cursor-pointer border-b border-hair hover:bg-chip"
                            onClick={() => {
                              setEditing(row);
                              setCreating(false);
                            }}
                          >
                            {schemaQ.data!.columns.map((c) => (
                              <td key={c.name} className="max-w-[22rem] truncate px-2 py-1.5">
                                <CellValue value={row[c.name]} />
                              </td>
                            ))}
                            <td className="px-2 py-1.5 text-right text-xs text-faint">edit</td>
                          </tr>
                        ))}
                        {rowsQ.data.data.length === 0 && (
                          <tr>
                            <td
                              colSpan={schemaQ.data.columns.length + 1}
                              className="px-2 py-6 text-center text-faint"
                            >
                              No rows{search && ' match that search'}.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-faint">
                      Page {rowsQ.data.meta.page} of {rowsQ.data.meta.totalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={page >= rowsQ.data.meta.totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </Card>
          )}
        </div>
      </div>

      {selected && schemaQ.data && (editing || creating) && (
        <RowEditor
          model={selected}
          schema={schemaQ.data}
          row={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/** Renders any column value compactly, without throwing on odd shapes. */
function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-faint">null</span>;
  if (typeof value === 'boolean') {
    return <Badge tone={value ? 'success' : 'neutral'}>{String(value)}</Badge>;
  }
  if (typeof value === 'object') {
    return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
  }
  return <span className="font-mono text-xs">{String(value)}</span>;
}

/** Converts a stored value into something an <input> can hold. */
function toInputValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function RowEditor({
  model,
  schema,
  row,
  onClose,
  onSaved,
}: {
  model: string;
  schema: TableSchema;
  row: DatabaseRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = row === null;
  const editable = schema.columns.filter((c) => !c.isReadOnly);

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(editable.map((c) => [c.name, row ? toInputValue(row[c.name]) : ''])),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const impactQ = useQuery({
    queryKey: ['db-admin', 'impact', model, row?._id],
    queryFn: () => databaseApi.impact(model, row!._id),
    enabled: confirmDelete && Boolean(row),
  });

  /**
   * Only changed columns are sent. Sending every field would rewrite untouched
   * columns and make the audit diff useless for working out what happened.
   */
  const changed = useMemo(() => {
    if (isNew) {
      return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''));
    }
    return Object.fromEntries(
      Object.entries(values).filter(([k, v]) => v !== toInputValue(row?.[k])),
    );
  }, [values, row, isNew]);

  const save = useMutation({
    mutationFn: () =>
      isNew ? databaseApi.create(model, changed) : databaseApi.update(model, row!._id, changed),
    onSuccess: onSaved,
  });

  const remove = useMutation({
    mutationFn: () => databaseApi.remove(model, row!._id),
    onSuccess: onSaved,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <Card className="my-8 w-full max-w-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-bold">{isNew ? `New ${model} row` : `Edit ${model}`}</h2>
            {!isNew && <p className="font-mono text-xs text-faint">{row?._id}</p>}
          </div>
          <Button type="button" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {schema.redactedColumns.length > 0 && (
          <p className="mb-3 text-xs text-faint">
            Hidden for safety: {schema.redactedColumns.join(', ')}
          </p>
        )}

        {save.isError && (
          <Alert tone="error">
            {save.error instanceof Error ? save.error.message : 'Could not save.'}
          </Alert>
        )}
        {remove.isError && (
          <Alert tone="error">
            {remove.error instanceof Error ? remove.error.message : 'Could not delete.'}
          </Alert>
        )}

        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {/* Read-only columns give context while editing (ids, timestamps). */}
          {!isNew && (
            <div className="rounded border border-hair p-2 text-xs">
              {schema.columns
                .filter((c) => c.isReadOnly)
                .map((c) => (
                  <div key={c.name} className="flex justify-between gap-4 py-0.5">
                    <span className="text-faint">{c.name}</span>
                    <span className="truncate font-mono">{toInputValue(row?.[c.name]) || '—'}</span>
                  </div>
                ))}
            </div>
          )}

          {editable.map((c) => (
            <label key={c.name} className="grid gap-1 text-sm">
              <span className="flex items-center gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-faint">
                  {c.type}
                  {c.isRequired ? ' · required' : ' · nullable'}
                  {c.hasDefault && ' · has default'}
                </span>
              </span>
              <ColumnInput
                column={c}
                value={values[c.name] ?? ''}
                onChange={(v) => setValues((prev) => ({ ...prev, [c.name]: v }))}
              />
            </label>
          ))}

          {editable.length === 0 && (
            <p className="text-sm text-faint">This table has no editable columns.</p>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button type="submit" disabled={save.isPending || Object.keys(changed).length === 0}>
                {save.isPending ? 'Saving…' : isNew ? 'Create row' : 'Save changes'}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
            </div>
            {!isNew && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                className="text-danger"
              >
                <Trash2 className="mr-1 h-4 w-4" /> Delete
              </Button>
            )}
          </div>

          {Object.keys(changed).length > 0 && (
            <p className="text-xs text-faint">Will write: {Object.keys(changed).join(', ')}</p>
          )}
        </form>

        {confirmDelete && row && (
          <DeleteConfirm
            impact={impactQ.data}
            loading={impactQ.isLoading}
            pending={remove.isPending}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={() => remove.mutate()}
          />
        )}
      </Card>
    </div>
  );
}

/** A typed control per column, so the API rarely has to reject the value. */
function ColumnInput({
  column,
  value,
  onChange,
}: {
  column: ColumnMeta;
  value: string;
  onChange: (v: string) => void;
}) {
  if (column.kind === 'enum' && column.enumValues) {
    return (
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{column.isRequired ? 'Select…' : '(null)'}</option>
        {column.enumValues.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </Select>
    );
  }
  if (column.type === 'Boolean') {
    return (
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{column.isRequired ? 'Select…' : '(null)'}</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </Select>
    );
  }
  if (column.type === 'Json') {
    return (
      <Textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder='JSON, e.g. {"key": "value"}'
        className="font-mono text-xs"
      />
    );
  }
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={column.type === 'DateTime' ? '2026-08-08T12:00:00Z' : ''}
      className="font-mono text-xs"
    />
  );
}

/**
 * Delete confirmation that leads with the cascade count.
 *
 * The schema has 119 cascading foreign keys, so removing a well-connected row
 * can take thousands of others with it. The count is shown before the button
 * is enabled rather than in a message afterwards.
 */
function DeleteConfirm({
  impact,
  loading,
  pending,
  onCancel,
  onConfirm,
}: {
  impact?: DeleteImpact;
  loading: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const blocked = (impact?.blockedBy.length ?? 0) > 0;

  return (
    <div className="mt-4 rounded border border-danger/40 bg-danger/10 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">Delete this row?</p>

          {loading && <Spinner />}

          {impact && impact.dependents.length === 0 && (
            <p className="mt-1 text-faint">Nothing else references it.</p>
          )}

          {impact && impact.dependents.length > 0 && (
            <>
              <p className="mt-1">
                {impact.cascadeRows > 0 ? (
                  <>
                    This will also delete at least{' '}
                    <strong>{impact.cascadeRows.toLocaleString()}</strong> row(s) in other tables
                    {impact.deepens && ', and cascades continue below those'}.
                  </>
                ) : (
                  <>Other tables reference this row.</>
                )}
              </p>
              <ul className="mt-2 max-h-40 overflow-y-auto text-xs">
                {impact.dependents.map((d) => (
                  <li key={`${d.table}.${d.column}`} className="flex justify-between gap-3 py-0.5">
                    <span className="truncate font-mono">
                      {d.table}.{d.column}
                    </span>
                    <span className="shrink-0">
                      {d.rows.toLocaleString()} · {d.action}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {blocked && (
            <p className="mt-2 text-xs">
              Rows marked <strong>restrict</strong> will make this delete fail until they are
              removed or repointed.
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Keep it
            </Button>
            <Button type="button" onClick={onConfirm} disabled={loading || pending}>
              {pending ? 'Deleting…' : 'Delete permanently'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
