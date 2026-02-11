import { requireAuthenticatedUser } from "@/lib/rbac";

const ChatLayout = async ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  await requireAuthenticatedUser();

  return children;
};

export default ChatLayout;
