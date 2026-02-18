"use server";

import { adminSetBarbershopActive } from "@/data/admin/barbershops";
import { adminActionClient } from "@/lib/action-client";
import { revalidatePublicBarbershopCache } from "@/lib/cache-invalidation";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z.object({
  barbershopId: z.uuid(),
  isActive: z.boolean(),
});

export const adminSetBarbershopActiveAction = adminActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput }) => {
    try {
      const updatedBarbershop = await adminSetBarbershopActive(parsedInput);

      revalidatePath("/admin/barbershops");
      revalidatePath(`/admin/barbershops/${updatedBarbershop.id}`);
      revalidatePath("/admin/owners");
      revalidatePath("/");
      revalidatePath("/barbershops");
      revalidatePath(`/b/${updatedBarbershop.slug}`);
      revalidatePath(`/barbershops/${updatedBarbershop.id}`);
      revalidatePath(`/exclusive/${updatedBarbershop.id}`);
      revalidatePublicBarbershopCache({
        barbershopId: updatedBarbershop.id,
        slug: updatedBarbershop.slug,
        publicSlug: updatedBarbershop.publicSlug,
      });

      return updatedBarbershop;
    } catch (error) {
      returnValidationErrors(inputSchema, {
        _errors: [
          error instanceof Error
            ? error.message
            : "Falha ao atualizar status da barbearia.",
        ],
      });
    }
  });
