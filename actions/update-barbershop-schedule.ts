"use server";

import { protectedActionClient } from "@/lib/action-client";
import { revalidatePublicBarbershopCache } from "@/lib/cache-invalidation";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const openingHourSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    openMinute: z.number().int().min(0).max(1439),
    closeMinute: z.number().int().min(1).max(1440),
    closed: z.boolean(),
  })
  .superRefine((openingHour, ctx) => {
    if (!openingHour.closed && openingHour.closeMinute <= openingHour.openMinute) {
      ctx.addIssue({
        code: "custom",
        message: "O horário de fechamento deve ser maior do que o de abertura.",
        path: ["closeMinute"],
      });
    }
  });

const inputSchema = z
  .object({
    barbershopId: z.uuid(),
    openingHours: z.array(openingHourSchema).length(7),
  })
  .superRefine((input, ctx) => {
    const dayOfWeekSet = new Set(input.openingHours.map((openingHour) => openingHour.dayOfWeek));
    if (dayOfWeekSet.size !== input.openingHours.length) {
      ctx.addIssue({
        code: "custom",
        message: "Não pode haver dias da semana duplicados.",
        path: ["openingHours"],
      });
    }
  });

export const updateBarbershopSchedule = protectedActionClient
  .inputSchema(inputSchema)
  .action(
    async ({ parsedInput: { barbershopId, openingHours }, ctx: { user } }) => {
      const barbershop = await prisma.barbershop.findFirst({
        where: {
          id: barbershopId,
          ownerId: user.id,
        },
        select: {
          id: true,
          slug: true,
          publicSlug: true,
        },
      });

      if (!barbershop) {
        returnValidationErrors(inputSchema, {
          _errors: ["Barbearia não encontrada ou sem permissão de edição."],
        });
      }

      await prisma.$transaction(
        openingHours.map((openingHour) =>
          prisma.barbershopOpeningHours.upsert({
            where: {
              barbershopId_dayOfWeek: {
                barbershopId,
                dayOfWeek: openingHour.dayOfWeek,
              },
            },
            update: {
              openMinute: openingHour.openMinute,
              closeMinute: openingHour.closeMinute,
              closed: openingHour.closed,
            },
            create: {
              barbershopId,
              dayOfWeek: openingHour.dayOfWeek,
              openMinute: openingHour.openMinute,
              closeMinute: openingHour.closeMinute,
              closed: openingHour.closed,
            },
          }),
        ),
      );

      revalidatePath("/owner");
      revalidatePublicBarbershopCache({
        barbershopId: barbershop.id,
        slug: barbershop.slug,
        publicSlug: barbershop.publicSlug,
      });

      return {
        success: true,
      };
    },
  );

