import { requireAuthenticatedUser } from "@/lib/rbac";

const BarbershopsLayout = async ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  await requireAuthenticatedUser();

  return children;
};

export default BarbershopsLayout;
