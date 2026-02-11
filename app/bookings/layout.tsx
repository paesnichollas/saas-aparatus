import { requireAuthenticatedUser } from "@/lib/rbac";

const BookingsLayout = async ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  await requireAuthenticatedUser();

  return children;
};

export default BookingsLayout;
