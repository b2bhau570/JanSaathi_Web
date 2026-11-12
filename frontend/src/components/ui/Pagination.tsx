interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-1 mt-6">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="p-2 rounded-xl text-inkmute hover:bg-creamdeep disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-magenta/30 transition-colors"
        aria-label="Previous page"
      >
        <iconify-icon icon="ph:caret-left-bold" width="16" height="16"></iconify-icon>
      </button>
      {pages.map((page, i) =>
        page === '...' ? (
          <span key={`dots-${i}`} className="px-2 text-inkmute">
            …
          </span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            aria-current={page === currentPage ? 'page' : undefined}
            className={`
              min-w-[36px] h-9 rounded-xl text-sm font-medium
              focus:outline-none focus:ring-2 focus:ring-magenta/30 transition-all duration-200
              ${
                page === currentPage
                  ? 'bg-ink text-cream'
                  : 'text-ink hover:bg-creamdeep'
              }
            `}
          >
            {page}
          </button>
        ),
      )}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="p-2 rounded-xl text-inkmute hover:bg-creamdeep disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-magenta/30 transition-colors"
        aria-label="Next page"
      >
        <iconify-icon icon="ph:caret-right-bold" width="16" height="16"></iconify-icon>
      </button>
    </nav>
  );
}
