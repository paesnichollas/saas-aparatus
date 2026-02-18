"use server";

import { protectedActionClient } from "@/lib/action-client";
import { revalidatePublicBarbershopCache } from "@/lib/cache-invalidation";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z.object({
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().min(10).max(500),
  chips: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
});

const normalizeChips = (chips: string[]) => {
  const seen = new Set<string>();
  const normalizedChips: string[] = [];

  for (const chip of chips) {
    const normalizedChip = chip.trim();
    if (!normalizedChip) {
      continue;
    }

    const dedupeKey = normalizedChip.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    normalizedChips.push(normalizedChip);
  }

  return normalizedChips;
};

export const ownerUpdateHomePremium = protectedActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput: { title, description, chips }, ctx: { user } }) => {
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

    const normalizedChips = normalizeChips(chips);
    if (normalizedChips.length === 0) {
      returnValidationErrors(inputSchema, {
        _errors: ["Informe pelo menos uma tag valida."],
      });
    }

    const updatedBarbershop = await prisma.barbershop.update({
      where: {
        id: barbershop.id,
      },
      data: {
        homePremiumTitle: title.trim(),
        homePremiumDescription: description.trim(),
        homePremiumChips: normalizedChips,
      },
      select: {
        homePremiumTitle: true,
        homePremiumDescription: true,
        homePremiumChips: true,
      },
    });

    revalidatePath("/owner");
    revalidatePublicBarbershopCache({
      barbershopId: barbershop.id,
      slug: barbershop.slug,
      publicSlug: barbershop.publicSlug,
    });

    return {
      success: true,
      homePremiumTitle: updatedBarbershop.homePremiumTitle,
      homePremiumDescription: updatedBarbershop.homePremiumDescription,
      homePremiumChips: updatedBarbershop.homePremiumChips,
    };
  });
