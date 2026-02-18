import Link from "next/link";

import BarbershopAdminForm from "@/components/admin/barbershop-admin-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const AdminBarbershopCreatePage = () => {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Nova barbearia</h2>
        <Link
          href="/admin/barbershops"
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          Voltar para listagem
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Criar barbearia</CardTitle>
          <CardDescription>
            Preencha os dados principais para cadastrar uma nova barbearia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BarbershopAdminForm mode="create" />
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminBarbershopCreatePage;
