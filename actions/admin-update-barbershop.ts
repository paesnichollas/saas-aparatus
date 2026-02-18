"use server";

import { adminUpdateBarbershop } from "@/data/admin/barbershops";
import { adminActionClient } from "@/lib/action-client";
import { getActionErrorMessage } from "@/lib/action-errors";
import { revalidatePublicBarbershopCache } from "@/lib/cache-invalidation";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z.object({
  barbershopId: z.uuid(),
  name: z.string().trim().min(2).max(80),
  phones: z.array(z.string().trim().min(8).max(30)).min(1).max(6),
  exclusiveBarber: z.boolean(),
  stripeEnabled: z.boolean(),
  ownerId: z.union([z.string().trim().min(1), z.null()]).optional(),
});

export const adminUpdateBarbershopAction = adminActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput }) => {
    try {
      const updatedBarbershop = await adminUpdateBarbershop(parsedInput);

      revalidatePath("/admin");
      revalidatePath("/admin/barbershops");
      revalidatePath(`/admin/barbershops/${updatedBarbershop.id}`);
      revalidatePath("/owner");
      revalidatePublicBarbershopCache({
        barbershopId: updatedBarbershop.id,
        slug: updatedBarbershop.slug,
        publicSlug: updatedBarbershop.publicSlug,
      });

      return updatedBarbershop;
    } catch (error) {
      returnValidationErrors(inputSchema, {
        _errors: [getActionErrorMessage(error, "Falha ao atualizar barbearia.")],
      });
    }
  });
