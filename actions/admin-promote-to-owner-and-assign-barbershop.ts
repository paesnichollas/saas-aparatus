"use server";

import { adminPromoteToOwnerAndAssignBarbershop } from "@/data/admin/users";
import { adminActionClient } from "@/lib/action-client";
import { getActionErrorMessage } from "@/lib/action-errors";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z.object({
  userId: z.string().trim().min(1),
  barbershopId: z.uuid(),
  allowTransfer: z.boolean().optional(),
});

export const adminPromoteToOwnerAndAssignBarbershopAction = adminActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput }) => {
    try {
      const result = await adminPromoteToOwnerAndAssignBarbershop({
        ...parsedInput,
        allowTransfer: parsedInput.allowTransfer ?? true,
      });

      revalidatePath("/admin");
      revalidatePath("/admin/owners");
      revalidatePath("/admin/barbershops");
      revalidatePath(`/admin/barbershops/${parsedInput.barbershopId}`);
      revalidatePath("/owner");

      return result;
    } catch (error) {
      returnValidationErrors(inputSchema, {
        _errors: [
          getActionErrorMessage(error, "Falha ao promover usuario para owner."),
        ],
      });
    }
  });
