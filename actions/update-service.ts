"use server";

import { getOwnerBarbershopIdByUserId } from "@/data/barbershops";
import { getServiceById, updateServiceById } from "@/data/services";
import { protectedActionClient } from "@/lib/action-client";
import { revalidatePublicBarbershopCache } from "@/lib/cache-invalidation";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const inputSchema = z.object({
  serviceId: z.uuid(),
  name: z.string().trim().min(2).max(80),
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

export const updateService = protectedActionClient
  .inputSchema(inputSchema)
  .action(
    async ({
      parsedInput: {
        serviceId,
        name,
        description,
        imageUrl,
        priceInCents,
        durationInMinutes,
      },
      ctx: { user },
    }) => {
      const ownerBarbershop = await getOwnerBarbershopIdByUserId(user.id);

      if (!ownerBarbershop) {
        returnValidationErrors(inputSchema, {
          _errors: ["Barbearia do owner nao encontrada."],
        });
      }

      const service = await getServiceById(serviceId);

      if (!service) {
        returnValidationErrors(inputSchema, {
          _errors: ["Serviço não encontrado."],
        });
      }

      if (service.barbershopId !== ownerBarbershop.id) {
        throw new Error(
          "403: Você não tem permissão para editar serviços de outra barbearia.",
        );
      }

      const normalizedDescription = normalizeOptionalValue(description);
      const normalizedImageUrl = normalizeOptionalValue(imageUrl);

      if (normalizedImageUrl && !hasValidImageUrl(normalizedImageUrl)) {
        returnValidationErrors(inputSchema, {
          _errors: ["A imagem enviada é inválida."],
        });
      }

      const updatedService = await updateServiceById(service.id, {
        name: name.trim(),
        description: normalizedDescription,
        imageUrl: normalizedImageUrl,
        priceInCents,
        durationInMinutes,
      });

      revalidatePath("/owner");
      revalidatePublicBarbershopCache({
        barbershopId: service.barbershop.id,
        slug: service.barbershop.slug,
        publicSlug: service.barbershop.publicSlug,
      });

      return updatedService;
    },
  );



