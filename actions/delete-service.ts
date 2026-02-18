"use server";

import { protectedActionClient } from "@/lib/action-client";
import { revalidatePublicBarbershopCache } from "@/lib/cache-invalidation";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z.object({
  serviceId: z.uuid(),
});

export const deleteService = protectedActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput: { serviceId }, ctx: { user } }) => {
    const service = await prisma.barbershopService.findFirst({
      where: {
        id: serviceId,
        deletedAt: null,
        barbershop: {
          ownerId: user.id,
        },
      },
      select: {
        id: true,
        barbershop: {
          select: {
            id: true,
            slug: true,
            publicSlug: true,
          },
        },
      },
    });

    if (!service) {
      returnValidationErrors(inputSchema, {
        _errors: ["Serviço não encontrado ou sem permissão de remoção."],
      });
    }

    await prisma.barbershopService.update({
      where: {
        id: service.id,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    revalidatePath("/owner");
    revalidatePublicBarbershopCache({
      barbershopId: service.barbershop.id,
      slug: service.barbershop.slug,
      publicSlug: service.barbershop.publicSlug,
    });

    return {
      success: true,
      serviceId: service.id,
    };
  });

