"use server";

import { adminDisableBarbershopAccess } from "@/data/admin/users";
import { protectedActionClient } from "@/lib/action-client";
import { getActionErrorMessage } from "@/lib/action-errors";
import { revalidatePublicBarbershopCache } from "@/lib/cache-invalidation";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z.object({
  barbershopId: z.string().trim().min(1),
});

export const adminDisableBarbershopAccessAction = protectedActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput, ctx: { user } }) => {
    try {
      const result = await adminDisableBarbershopAccess({
        actorUserId: user.id,
        barbershopId: parsedInput.barbershopId,
      });
      const barbershop = await prisma.barbershop.findUnique({
        where: {
          id: result.barbershopId,
        },
        select: {
          id: true,
          slug: true,
          publicSlug: true,
        },
      });

      revalidatePath("/admin/owners");
      revalidatePath("/admin/barbershops");
      revalidatePath("/admin");

      if (barbershop) {
        revalidatePublicBarbershopCache({
          barbershopId: barbershop.id,
          slug: barbershop.slug,
          publicSlug: barbershop.publicSlug,
        });
      }

      return result;
    } catch (error) {
      returnValidationErrors(inputSchema, {
        _errors: [
          getActionErrorMessage(
            error,
            "Falha ao desabilitar acesso da barbearia.",
          ),
        ],
      });
    }
  });
