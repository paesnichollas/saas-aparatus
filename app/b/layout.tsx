import { requireAuthenticatedUser } from "@/lib/rbac";

const BarbershopSlugLayout = async ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  await requireAuthenticatedUser();

  return children;
};

export default BarbershopSlugLayout;
