export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border bg-card mb-4 rounded-2xl border p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {subtitle && <p className="text-muted-foreground mb-3 text-sm">{subtitle}</p>}
      <div className={subtitle ? 'mt-3' : 'mt-1'}>{children}</div>
    </div>
  );
}
