// Tiny CSV parser wrapper. Pulls in csv-parse (sync mode) — keeps the rest of
// the codebase free of csv-parse-specific imports.
import { parse } from 'csv-parse/sync';

export interface CsvParseResult<T> {
  rows: T[];
  errors: Array<{ line: number; message: string }>;
}

/**
 * Parse a CSV string into typed rows.
 * - First non-empty line is treated as header.
 * - Empty lines are skipped.
 * - Each row is validated via the supplied `validator`. Validators should throw
 *   on bad input; the error message is captured per-line.
 */
export function parseCsv<T>(
  csv: string,
  validator: (raw: Record<string, string>, line: number) => T,
): CsvParseResult<T> {
  const records: Record<string, string>[] = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  });

  const rows: T[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  records.forEach((rec, idx) => {
    const lineNumber = idx + 2; // +1 header, +1 1-indexed
    try {
      rows.push(validator(rec, lineNumber));
    } catch (err) {
      errors.push({
        line: lineNumber,
        message: err instanceof Error ? err.message : 'Invalid row',
      });
    }
  });

  return { rows, errors };
}
