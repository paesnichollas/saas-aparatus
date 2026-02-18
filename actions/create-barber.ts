"use server";

import { protectedActionClient } from "@/lib/action-client";
import { revalidatePublicBarbershopCache } from "@/lib/cache-invalidation";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z.object({
  barbershopId: z.uuid(),
  name: z.string().trim().min(2).max(80),
  imageUrl: z.string().trim().max(500).nullable().optional(),
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

export const createBarber = protectedActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput: { barbershopId, name, imageUrl }, ctx: { user } }) => {
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
        _errors: ["Barbearia nao encontrada ou sem permissao de edicao."],
      });
    }

    const normalizedImageUrl = normalizeOptionalValue(imageUrl);

    if (normalizedImageUrl && !hasValidImageUrl(normalizedImageUrl)) {
      returnValidationErrors(inputSchema, {
        _errors: ["A imagem enviada e invalida."],
      });
    }

    const createdBarber = await prisma.barber.create({
      data: {
        barbershopId: barbershop.id,
        name: name.trim(),
        imageUrl: normalizedImageUrl,
      },
      select: {
        id: true,
        name: true,
        imageUrl: true,
      },
    });

    revalidatePath("/owner");
    revalidatePublicBarbershopCache({
      barbershopId: barbershop.id,
      slug: barbershop.slug,
      publicSlug: barbershop.publicSlug,
    });

    return createdBarber;
  });

