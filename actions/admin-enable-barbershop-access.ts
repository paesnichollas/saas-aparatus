"use server";

import { adminEnableBarbershopAccess } from "@/data/admin/users";
import { protectedActionClient } from "@/lib/action-client";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z.object({
  barbershopId: z.string().trim().min(1),
});

export const adminEnableBarbershopAccessAction = protectedActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput, ctx: { user } }) => {
    try {
      const result = await adminEnableBarbershopAccess({
        actorUserId: user.id,
        barbershopId: parsedInput.barbershopId,
      });

      revalidatePath("/admin/owners");
      revalidatePath("/admin/barbershops");
      revalidatePath("/");

      return result;
    } catch (error) {
      returnValidationErrors(inputSchema, {
        _errors: [
          error instanceof Error
            ? error.message
            : "Falha ao reativar acesso da barbearia.",
        ],
      });
    }
  });
