"use server";

import { protectedActionClient } from "@/lib/action-client";
import { revalidatePublicBarbershopCache } from "@/lib/cache-invalidation";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z.object({
  barbershopId: z.uuid(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  priceInCents: z.number().int().min(0).max(1_000_000),
  durationInMinutes: z.number().int().min(5).max(240),
});

const normalizeOptionalValue = (value: string | null | undefined) => {
  const normalizedValue = value?.trim() ?? "";
  return normalizedValue.length > 0 ? normalizedValue : null;
};

const hasValidImageUrl = (value: string) => {
  if (value.startsWith("/")) {
    return true;
  }

  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
};

export const createService = protectedActionClient
  .inputSchema(inputSchema)
  .action(
    async ({
      parsedInput: {
        barbershopId,
        name,
        description,
        imageUrl,
        priceInCents,
        durationInMinutes,
      },
      ctx: { user },
    }) => {
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

      const normalizedDescription = normalizeOptionalValue(description);
      const normalizedImageUrl = normalizeOptionalValue(imageUrl);

      if (normalizedImageUrl && !hasValidImageUrl(normalizedImageUrl)) {
        returnValidationErrors(inputSchema, {
          _errors: ["A imagem enviada é inválida."],
        });
      }

      const createdService = await prisma.barbershopService.create({
        data: {
          barbershopId: barbershop.id,
          name: name.trim(),
          description: normalizedDescription,
          imageUrl: normalizedImageUrl,
          priceInCents,
          durationInMinutes,
        },
        select: {
          id: true,
          name: true,
          description: true,
          imageUrl: true,
          priceInCents: true,
          durationInMinutes: true,
        },
      });

      revalidatePath("/owner");
      revalidatePublicBarbershopCache({
        barbershopId: barbershop.id,
        slug: barbershop.slug,
        publicSlug: barbershop.publicSlug,
      });

      return createdService;
    },
  );

