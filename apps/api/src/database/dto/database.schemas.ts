import { z } from 'zod';

/** Query for the paginated row browser. */
export const listRowsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Capped well below "select the whole table" — the browser renders every
  // returned row, and an unbounded page would stall both API and UI.
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.string().min(1).max(100).optional(),
  direction: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().min(1).max(200).optional(),
});

export type ListRowsQuery = z.infer<typeof listRowsQuerySchema>;

/**
 * Row payloads are validated against the live model in `coerceRowInput`, which
 * knows each column's type. Here we only assert the envelope shape.
 */
export const rowInputSchema = z.object({
  values: z.record(z.unknown()),
});

export type RowInputDto = z.infer<typeof rowInputSchema>;
