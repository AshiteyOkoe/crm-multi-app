import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({ page, pages, onPage, total }: { page: number; pages: number; onPage: (p: number) => void; total?: number }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-gray-100 px-2 py-3">
      <p className="text-xs text-gray-500">
        Page {page} of {pages}
        {total !== undefined && ` · ${total} records`}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPage(Math.max(page - 1, 1))}
          disabled={page <= 1}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <button
          onClick={() => onPage(Math.min(page + 1, pages))}
          disabled={page >= pages}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
