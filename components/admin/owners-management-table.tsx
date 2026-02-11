"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { adminPromoteToOwnerAndAssignBarbershopAction } from "@/actions/admin-promote-to-owner-and-assign-barbershop";
import { adminUpdateUserRoleAction } from "@/actions/admin-update-user-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface OwnersManagementTableProps {
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: "CUSTOMER" | "OWNER" | "ADMIN";
    barbershopId: string | null;
    ownedBarbershop: {
      id: string;
      name: string;
    } | null;
  }>;
  barbershopOptions: Array<{
    id: string;
    name: string;
  }>;
}

const getValidationErrorMessage = (validationErrors: unknown) => {
  const getFirstErrorFromNode = (value: unknown): string | null => {
    if (!value || typeof value !== "object") {
      return null;
    }

    const errors = (value as { _errors?: unknown })._errors;

    if (Array.isArray(errors)) {
      const firstStringError = errors.find(
        (errorItem): errorItem is string =>
          typeof errorItem === "string" && errorItem.trim().length > 0,
      );

      if (firstStringError) {
        return firstStringError;
      }
    }

    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      const nestedError = getFirstErrorFromNode(nestedValue);

      if (nestedError) {
        return nestedError;
      }
    }

    return null;
  };

  return getFirstErrorFromNode(validationErrors);
};

const OwnersManagementTable = ({
  users,
  barbershopOptions,
}: OwnersManagementTableProps) => {
  const router = useRouter();
  const [selectedBarbershopByUserId, setSelectedBarbershopByUserId] = useState<
    Record<string, string>
  >({});
  const [currentMutationUserId, setCurrentMutationUserId] = useState<string | null>(
    null,
  );

  const { executeAsync: executeUpdateUserRole, isPending: isUpdatingUserRole } =
    useAction(adminUpdateUserRoleAction);
  const {
    executeAsync: executePromoteToOwner,
    isPending: isPromotingToOwner,
  } = useAction(adminPromoteToOwnerAndAssignBarbershopAction);

  const isBusy = isUpdatingUserRole || isPromotingToOwner;

  const handleUpdateRole = async (
    userId: string,
    role: "CUSTOMER" | "ADMIN",
  ) => {
    setCurrentMutationUserId(userId);

    const result = await executeUpdateUserRole({
      userId,
      role,
    });

    const validationError = getValidationErrorMessage(result.validationErrors);

    if (validationError) {
      toast.error(validationError);
      setCurrentMutationUserId(null);
      return;
    }

    if (result.serverError || !result.data) {
      toast.error("Falha ao atualizar papel do usuario.");
      setCurrentMutationUserId(null);
      return;
    }

    toast.success("Papel do usuario atualizado.");
    setCurrentMutationUserId(null);
    router.refresh();
  };

  const handlePromoteToOwner = async (userId: string) => {
    const selectedBarbershopId = selectedBarbershopByUserId[userId]?.trim();

    if (!selectedBarbershopId) {
      toast.error("Informe a barbearia para promover o usuario a owner.");
      return;
    }

    setCurrentMutationUserId(userId);

    const result = await executePromoteToOwner({
      userId,
      barbershopId: selectedBarbershopId,
      allowTransfer: true,
    });

    const validationError = getValidationErrorMessage(result.validationErrors);

    if (validationError) {
      toast.error(validationError);
      setCurrentMutationUserId(null);
      return;
    }

    if (result.serverError || !result.data) {
      toast.error("Falha ao promover usuario para owner.");
      setCurrentMutationUserId(null);
      return;
    }

    toast.success("Usuario promovido para owner com sucesso.");
    setCurrentMutationUserId(null);
    router.refresh();
  };

  return (
    <>
      <datalist id="admin-barbershop-options">
        {barbershopOptions.map((barbershop) => (
          <option key={barbershop.id} value={barbershop.id}>
            {barbershop.name}
          </option>
        ))}
      </datalist>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Usuario</TableHead>
            <TableHead>Papel</TableHead>
            <TableHead>Barbearia owner</TableHead>
            <TableHead>Acoes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length > 0 ? (
            users.map((user) => {
              const isCurrentRowBusy = isBusy && currentMutationUserId === user.id;

              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium">{user.name}</p>
                      <p className="text-muted-foreground text-xs">{user.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell>{user.ownedBarbershop?.name ?? "Sem ownership"}</TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {user.role !== "ADMIN" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isCurrentRowBusy}
                            onClick={() => handleUpdateRole(user.id, "ADMIN")}
                          >
                            Tornar ADMIN
                          </Button>
                        ) : null}

                        {user.role !== "CUSTOMER" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isCurrentRowBusy}
                            onClick={() => handleUpdateRole(user.id, "CUSTOMER")}
                          >
                            Tornar CUSTOMER
                          </Button>
                        ) : null}
                      </div>

                      {user.role === "CUSTOMER" ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            placeholder="ID da barbearia"
                            value={selectedBarbershopByUserId[user.id] ?? ""}
                            list="admin-barbershop-options"
                            onChange={(event) =>
                              setSelectedBarbershopByUserId((currentState) => ({
                                ...currentState,
                                [user.id]: event.target.value,
                              }))
                            }
                            disabled={isCurrentRowBusy}
                            className="w-full md:max-w-72"
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={isCurrentRowBusy}
                            onClick={() => handlePromoteToOwner(user.id)}
                          >
                            Tornar OWNER
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="text-muted-foreground text-sm">
                Nenhum usuario encontrado.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </>
  );
};

export default OwnersManagementTable;
