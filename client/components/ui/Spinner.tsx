export function Spinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand-200 border-t-brand-600" />
      <span className="mt-3 text-sm">{label}</span>
    </div>
  );
}

export function InlineSpinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />;
}
