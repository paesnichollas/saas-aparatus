import Footer from "@/components/footer";
import Header from "@/components/header";
import { Badge } from "@/components/ui/badge";
import { PageContainer } from "@/components/ui/page";
import { isAdmin, requireOwnerOrAdminWithCompleteProfile } from "@/lib/rbac";

const OwnerLayout = async ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  const user = await requireOwnerOrAdminWithCompleteProfile("/owner");

  return (
    <div>
      <Header homeHref="/" />
      <PageContainer>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Area Administrador</h1>
          <Badge variant={isAdmin(user.role) ? "secondary" : "default"}>
            {isAdmin(user.role) ? "Acesso de administrador" : "Owner"}
          </Badge>
        </div>
        {children}
      </PageContainer>
      <Footer />
    </div>
  );
};

export default OwnerLayout;
