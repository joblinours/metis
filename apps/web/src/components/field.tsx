export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-[1.5px] text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}
