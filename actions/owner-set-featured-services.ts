"use server";

import { protectedActionClient } from "@/lib/action-client";
import { revalidatePublicBarbershopCache } from "@/lib/cache-invalidation";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z
  .object({
    serviceIds: z.array(z.uuid()).max(100),
  })
  .superRefine((input, context) => {
    const uniqueIds = new Set(input.serviceIds);
    if (uniqueIds.size !== input.serviceIds.length) {
      context.addIssue({
        code: "custom",
        message: "Nao pode haver servicos duplicados.",
        path: ["serviceIds"],
      });
    }
  });

export const ownerSetFeaturedServices = protectedActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput: { serviceIds }, ctx: { user } }) => {
    const barbershop = await prisma.barbershop.findFirst({
      where: {
        ownerId: user.id,
      },
      select: {
        id: true,
        slug: true,
        publicSlug: true,
        exclusiveBarber: true,
      },
    });

    if (!barbershop) {
      returnValidationErrors(inputSchema, {
        _errors: ["Barbearia do owner nao encontrada."],
      });
    }

    if (!barbershop.exclusiveBarber) {
      returnValidationErrors(inputSchema, {
        _errors: ["Personalizacao disponivel apenas para barbearias exclusivas."],
      });
    }

    if (serviceIds.length > 0) {
      const validServices = await prisma.barbershopService.findMany({
        where: {
          id: {
            in: serviceIds,
          },
          barbershopId: barbershop.id,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (validServices.length !== serviceIds.length) {
        returnValidationErrors(inputSchema, {
          _errors: ["Um ou mais servicos nao pertencem a sua barbearia."],
        });
      }
    }

    await prisma.$transaction([
      prisma.barbershopService.updateMany({
        where: {
          barbershopId: barbershop.id,
          deletedAt: null,
        },
        data: {
          isFeatured: false,
        },
      }),
      ...(serviceIds.length > 0
        ? [
            prisma.barbershopService.updateMany({
              where: {
                id: {
                  in: serviceIds,
                },
                barbershopId: barbershop.id,
                deletedAt: null,
              },
              data: {
                isFeatured: true,
              },
            }),
          ]
        : []),
    ]);

    revalidatePath("/owner");
    revalidatePublicBarbershopCache({
      barbershopId: barbershop.id,
      slug: barbershop.slug,
      publicSlug: barbershop.publicSlug,
    });

    return {
      success: true,
      featuredServiceIds: serviceIds,
    };
  });
