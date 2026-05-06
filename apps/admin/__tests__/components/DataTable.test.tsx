import React from 'react';
import { render, screen } from '@testing-library/react';
import DataTable, { Column } from '@/components/DataTable';

interface Row {
  id: string;
  name: string;
}

const cols: Column<Row>[] = [
  { key: 'name', header: 'Name', render: (r) => r.name },
];

describe('DataTable', () => {
  it('renders rows', () => {
    render(
      <DataTable
        columns={cols}
        rows={[
          { id: '1', name: 'Alice' },
          { id: '2', name: 'Bob' },
        ]}
      />
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('renders empty message when no rows', () => {
    render(<DataTable columns={cols} rows={[]} emptyMessage="Nothing here." />);
    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
  });

  it('renders skeleton rows when loading', () => {
    const { container } = render(
      <DataTable columns={cols} rows={[]} isLoading skeletonRows={3} />
    );
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });

  it('renders error message when isError', () => {
    render(<DataTable columns={cols} rows={[]} isError />);
    expect(screen.getByText(/Failed to load data/i)).toBeInTheDocument();
  });
});
