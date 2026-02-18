import "server-only";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { IMAGE_UPLOADER_ENDPOINT } from "@/lib/uploadthing-endpoints";
import { type FileRouter, createUploadthing } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";

const f = createUploadthing();

const resolveUploadActor = async (request: Request) => {
  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user?.id) {
    throw new UploadThingError("Nao autorizado.");
  }

  const actor = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    select: {
      id: true,
      role: true,
    },
  });

  if (!actor) {
    throw new UploadThingError("Nao autorizado.");
  }

  return actor;
};

const getOwnedBarbershopId = async (ownerId: string) => {
  const barbershop = await prisma.barbershop.findFirst({
    where: {
      ownerId,
    },
    select: {
      id: true,
    },
  });

  if (!barbershop) {
    throw new UploadThingError("Owner sem barbearia vinculada para upload.");
  }

  return barbershop.id;
};

export const uploadRouter = {
  [IMAGE_UPLOADER_ENDPOINT]: f(
    {
      image: {
        maxFileCount: 1,
        maxFileSize: "8MB",
      },
    },
    {
      awaitServerData: false,
    },
  )
    .middleware(async ({ req }) => {
      const actor = await resolveUploadActor(req);

      if (actor.role === "ADMIN") {
        return {
          userId: actor.id,
          barbershopId: null,
        };
      }

      if (actor.role !== "OWNER") {
        throw new UploadThingError("Somente OWNER ou ADMIN podem enviar imagens.");
      }

      const barbershopId = await getOwnedBarbershopId(actor.id);

      return {
        userId: actor.id,
        barbershopId,
      };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return {
        uploadedBy: metadata.userId,
        barbershopId: metadata.barbershopId,
        url: file.ufsUrl ?? file.url,
      };
    }),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
