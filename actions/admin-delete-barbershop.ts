"use server";

import { adminDeleteBarbershopSafely } from "@/data/admin/barbershops";
import { adminActionClient } from "@/lib/action-client";
import { getActionErrorMessage } from "@/lib/action-errors";
import { revalidatePublicBarbershopCache } from "@/lib/cache-invalidation";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z.object({
  barbershopId: z.uuid(),
});

export const adminDeleteBarbershopAction = adminActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput: { barbershopId } }) => {
    try {
      const deletedBarbershop = await adminDeleteBarbershopSafely(barbershopId);

      revalidatePath("/admin");
      revalidatePath("/admin/barbershops");
      revalidatePath("/admin/owners");
      revalidatePath("/owner/reports");
      revalidatePublicBarbershopCache({
        barbershopId: deletedBarbershop.id,
        slug: deletedBarbershop.slug,
        publicSlug: deletedBarbershop.publicSlug,
      });

      return deletedBarbershop;
    } catch (error) {
      returnValidationErrors(inputSchema, {
        _errors: [getActionErrorMessage(error, "Falha ao excluir barbearia.")],
      });
    }
  });
