// components/dashboard/MetricBar.tsx
type Props = {
  label: string;
  value: string;
  helper?: string;
  percent: number;
  color?: string;
};

export function MetricBar({
  label,
  value,
  helper,
  percent,
  color = "var(--brand-orange)",
}: Props) {
  const safe = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span
          className="text-xs font-medium"
          style={{ color: "var(--muted-foreground)" }}
        >
          {label}
        </span>
        <span className="text-xs font-bold" style={{ color }}>
          {value}
        </span>
      </div>

      <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
        <div className="h-full rounded-full" style={{ width: `${safe}%`, background: color }} />
      </div>

      {helper && (
        <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
          {helper}
        </p>
      )}
    </div>
  );
}