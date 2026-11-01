// Building blocks shared by the sections of the option editor.

export function Section({
  title,
  children,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">{title}</h4>
        {actions}
      </div>
      {children}
    </section>
  );
}
