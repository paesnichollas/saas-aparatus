"use server";

import { adminUpdateUserRole } from "@/data/admin/users";
import { adminActionClient } from "@/lib/action-client";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z.object({
  userId: z.string().trim().min(1),
  role: z.enum(["CUSTOMER", "ADMIN"]),
});

export const adminUpdateUserRoleAction = adminActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput }) => {
    try {
      const updatedUser = await adminUpdateUserRole(parsedInput);

      revalidatePath("/admin");
      revalidatePath("/admin/owners");
      revalidatePath("/owner");

      return updatedUser;
    } catch (error) {
      returnValidationErrors(inputSchema, {
        _errors: [error instanceof Error ? error.message : "Falha ao atualizar papel do usuario."],
      });
    }
  });
