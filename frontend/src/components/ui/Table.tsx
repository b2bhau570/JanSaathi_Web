import type { ReactNode } from 'react';

/* ───── Table Root ───── */
interface TableProps {
  children: ReactNode;
  className?: string;
}

export function Table({ children, className = '' }: TableProps) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm text-left">{children}</table>
    </div>
  );
}

/* ───── Head ───── */
export function TableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-creamdeep border-b border-ink/14">
      {children}
    </thead>
  );
}

/* ───── Body ───── */
export function TableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-ink/8">{children}</tbody>;
}

/* ───── Row ───── */
interface TableRowProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function TableRow({ children, onClick, className = '' }: TableRowProps) {
  return (
    <tr
      onClick={onClick}
      className={`
        transition-colors duration-200
        ${onClick ? 'cursor-pointer hover:bg-creamdeep' : ''}
        ${className}
      `}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      role={onClick ? 'button' : undefined}
    >
      {children}
    </tr>
  );
}

/* ───── Header Cell ───── */
interface TableHeaderProps {
  children: ReactNode;
  sortable?: boolean;
  sorted?: 'asc' | 'desc' | false;
  onSort?: () => void;
  className?: string;
}

export function TableHeader({
  children,
  sortable,
  sorted,
  onSort,
  className = '',
}: TableHeaderProps) {
  return (
    <th
      scope="col"
      className={`
        px-4 py-3 text-xs font-semibold uppercase tracking-wider text-inkmute
        ${sortable ? 'cursor-pointer select-none hover:text-ink' : ''}
        ${className}
      `}
      onClick={sortable ? onSort : undefined}
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortable && sorted === 'asc' && (
          <iconify-icon icon="ph:arrow-up-bold" width="12" height="12"></iconify-icon>
        )}
        {sortable && sorted === 'desc' && (
          <iconify-icon icon="ph:arrow-down-bold" width="12" height="12"></iconify-icon>
        )}
      </div>
    </th>
  );
}

/* ───── Data Cell ───── */
interface TableCellProps {
  children: ReactNode;
  className?: string;
}

export function TableCell({ children, className = '' }: TableCellProps) {
  return (
    <td className={`px-4 py-3 text-ink ${className}`}>{children}</td>
  );
}
