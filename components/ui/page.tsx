export const PageContainer = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-5 lg:px-8">
      {children}
    </div>
  );
};

export const PageSectionTitle = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return <h3 className="text-xs font-bold uppercase">{children}</h3>;
};

export const PageSectionContent = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return <div className="space-y-3">{children}</div>;
};

export const PageSectionScroller = ({
  children,
  variant = "grid",
}: {
  children: React.ReactNode;
  variant?: "grid" | "scroll";
}) => {
  const gridClasses =
    variant === "grid"
      ? "lg:grid lg:grid-cols-2 lg:overflow-visible xl:grid-cols-3 2xl:grid-cols-4"
      : "";

  return (
    <div
      className={`flex gap-4 overflow-x-auto [&::-webkit-scrollbar]:hidden ${gridClasses}`}
    >
      {children}
    </div>
  );
};
