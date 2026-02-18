"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { adminDeleteBarbershopAction } from "@/actions/admin-delete-barbershop";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface BarbershopDeleteButtonProps {
  barbershopId: string;
  barbershopName: string;
}

const getValidationError = (validationErrors: unknown) => {
  if (!validationErrors || typeof validationErrors !== "object") {
    return null;
  }

  const errors = (validationErrors as { _errors?: unknown })._errors;

  if (!Array.isArray(errors)) {
    return null;
  }

  return typeof errors[0] === "string" ? errors[0] : null;
};

const BarbershopDeleteButton = ({
  barbershopId,
  barbershopName,
}: BarbershopDeleteButtonProps) => {
  const router = useRouter();
  const { executeAsync, isPending } = useAction(adminDeleteBarbershopAction);

  const handleDelete = async () => {
    const result = await executeAsync({ barbershopId });
    const validationError = getValidationError(result.validationErrors);

    if (validationError) {
      toast.error(validationError);
      return;
    }

    if (result.serverError || !result.data) {
      toast.error("Falha ao excluir barbearia.");
      return;
    }

    toast.success("Barbearia excluida com sucesso.");
    router.push("/admin/barbershops");
    router.refresh();
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" disabled={isPending}>
          Excluir barbearia
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir barbearia</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acao remove definitivamente &quot;{barbershopName}&quot; apenas se nao
            houver dependencias. Caso existam, o sistema bloqueara a exclusao e
            orientara inativar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={isPending}>
            {isPending ? "Excluindo..." : "Confirmar exclusao"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default BarbershopDeleteButton;
