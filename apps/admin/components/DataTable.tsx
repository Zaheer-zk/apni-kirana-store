export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  isLoading?: boolean;
  isError?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string;
  skeletonRows?: number;
  /**
   * Minimum table width applied via Tailwind utility (default `min-w-[720px]`).
   * Ensures content does not squish on narrow viewports — the wrapper scrolls
   * horizontally instead.
   */
  minWidthClass?: string;
}

export default function DataTable<T extends { id: string }>({
  columns,
  rows,
  isLoading = false,
  isError = false,
  emptyMessage = 'No data found.',
  onRowClick,
  skeletonRows = 6,
  minWidthClass = 'min-w-[720px]',
}: DataTableProps<T>) {
  // First column gets sticky behaviour on mobile so the primary identifier
  // remains visible while users scroll horizontally through wide tables.
  const stickyHeadCls =
    'sticky left-0 z-10 bg-gray-50 sm:static sm:bg-transparent';
  const stickyCellCls =
    'sticky left-0 z-[1] bg-white sm:static sm:bg-transparent';

  return (
    <div className="w-full overflow-x-auto">
      <table className={`w-full text-sm ${minWidthClass}`}>
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {columns.map((col, idx) => (
              <th
                key={col.key}
                className={`whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 sm:px-6 ${
                  idx === 0 ? stickyHeadCls : ''
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {isLoading ? (
            Array.from({ length: skeletonRows }).map((_, rowIdx) => (
              <tr key={rowIdx} className="bg-white">
                {columns.map((col, idx) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 sm:px-6 ${idx === 0 ? stickyCellCls : ''}`}
                  >
                    <div className="h-4 w-full max-w-[120px] animate-pulse rounded bg-gray-100" />
                  </td>
                ))}
              </tr>
            ))
          ) : isError ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-sm text-red-500 sm:px-6"
              >
                Failed to load data. Please refresh and try again.
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-sm text-gray-400 sm:px-6"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick?.(row)}
                className={`bg-white transition-colors hover:bg-gray-50/50 ${
                  onRowClick ? 'cursor-pointer' : ''
                }`}
              >
                {columns.map((col, idx) => (
                  <td
                    key={col.key}
                    className={`whitespace-nowrap px-4 py-3.5 sm:px-6 ${
                      idx === 0 ? stickyCellCls : ''
                    }`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
