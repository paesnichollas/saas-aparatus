"use server";

import {
  type AdminBarbershopActionErrorCode,
  adminCreateBarbershop,
  logAdminBarbershopError,
  toAdminBarbershopActionErrorPayload,
} from "@/data/admin/barbershops";
import { adminActionClient } from "@/lib/action-client";
import { revalidatePublicBarbershopCache } from "@/lib/cache-invalidation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const inputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().min(5).max(200),
  description: z.string().trim().min(10).max(1000),
  imageUrl: z.union([z.string().trim().max(500), z.null()]).optional(),
  logoUrl: z.union([z.string().trim().max(500), z.null()]).optional(),
  phones: z.array(z.string().trim().min(8).max(30)).min(1).max(6),
  slug: z.string().trim().min(3).max(80).regex(slugRegex).optional(),
  exclusiveBarber: z.boolean(),
  stripeEnabled: z.boolean(),
  ownerId: z.union([z.string().trim().uuid("OwnerID invalido."), z.null()]).optional(),
  plan: z.enum(["BASIC", "PRO"]),
  whatsappProvider: z.enum(["NONE", "TWILIO"]),
  whatsappFrom: z.union([z.string().trim().max(60), z.null()]).optional(),
  whatsappEnabled: z.boolean(),
});

type AdminCreateBarbershopActionSuccess = {
  ok: true;
  data: Awaited<ReturnType<typeof adminCreateBarbershop>>;
};

type AdminCreateBarbershopActionFailure = {
  ok: false;
  message: string;
  code?: AdminBarbershopActionErrorCode;
  field?: string;
};

type AdminCreateBarbershopActionResult =
  | AdminCreateBarbershopActionSuccess
  | AdminCreateBarbershopActionFailure;

export const adminCreateBarbershopAction = adminActionClient
  .inputSchema(inputSchema)
  .action(async ({ parsedInput }): Promise<AdminCreateBarbershopActionResult> => {
    try {
      const createdBarbershop = await adminCreateBarbershop(parsedInput);

      revalidatePath("/admin");
      revalidatePath("/admin/barbershops");
      revalidatePath(`/admin/barbershops/${createdBarbershop.id}`);
      revalidatePath("/admin/owners");
      revalidatePath("/owner/reports");
      revalidatePublicBarbershopCache({
        barbershopId: createdBarbershop.id,
        slug: createdBarbershop.slug,
        publicSlug: createdBarbershop.publicSlug,
      });

      return {
        ok: true,
        data: createdBarbershop,
      };
    } catch (error) {
      logAdminBarbershopError("create", error);

      const mappedError = toAdminBarbershopActionErrorPayload(
        error,
        "Falha ao criar barbearia.",
      );

      return {
        ok: false,
        message: mappedError.message,
        code: mappedError.code,
        field: mappedError.field,
      };
    }
  });
