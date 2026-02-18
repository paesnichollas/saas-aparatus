import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { demoteOwnerToCustomerByAdmin, promoteUserToOwnerByAdmin } from "@/data/owner-assignment";
import { cancelFuturePendingBarbershopNotificationJobs } from "@/lib/notifications/notification-jobs";
import { buildPublicSlugCandidate, getPublicSlugBase } from "@/lib/public-slug";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
const MAX_SLUG_GENERATION_ATTEMPTS = 100;

export type AdminBarbershopActionErrorCode =
  | "VALIDATION"
  | "UNIQUE"
  | "FK"
  | "NOT_FOUND"
  | "UNKNOWN";

export interface AdminBarbershopActionErrorPayload {
  message: string;
  code: AdminBarbershopActionErrorCode;
  field?: string;
}

type AdminBarbershopErrorOptions = {
  message: string;
  code: AdminBarbershopActionErrorCode;
  field?: string;
  cause?: unknown;
};

export class AdminBarbershopError extends Error {
  readonly code: AdminBarbershopActionErrorCode;
  readonly field?: string;
  readonly cause?: unknown;

  constructor({ message, code, field, cause }: AdminBarbershopErrorOptions) {
    super(message);
    this.name = "AdminBarbershopError";
    this.code = code;
    this.field = field;
    this.cause = cause;
  }
}

const normalizeTargetFields = (target: unknown) => {
  if (Array.isArray(target)) {
    return target.filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
  }

  if (typeof target === "string" && target.trim().length > 0) {
    return [target];
  }

  return [] as string[];
};

const getFieldFromPrismaTarget = (targetFields: string[]) => {
  const normalizedTargetFields = targetFields.map((field) => field.toLowerCase());

  if (normalizedTargetFields.some((field) => field.includes("publicslug"))) {
    return "publicSlug";
  }

  if (normalizedTargetFields.some((field) => field.includes("slug"))) {
    return "slug";
  }

  if (normalizedTargetFields.some((field) => field.includes("ownerid"))) {
    return "ownerId";
  }

  if (normalizedTargetFields.some((field) => field.includes("imageurl"))) {
    return "imageUrl";
  }

  if (normalizedTargetFields.some((field) => field.includes("logourl"))) {
    return "logoUrl";
  }

  if (normalizedTargetFields.some((field) => field.includes("barbershopid"))) {
    return "barbershopId";
  }

  return targetFields[0];
};

const mapPrismaKnownErrorToPayload = (
  error: Prisma.PrismaClientKnownRequestError,
): AdminBarbershopActionErrorPayload => {
  const targetFields = normalizeTargetFields(error.meta?.target);
  const field = getFieldFromPrismaTarget(targetFields);

  if (error.code === "P2002") {
    if (field === "slug" || field === "publicSlug") {
      return {
        message: "Slug ja esta em uso. Tente outro slug.",
        code: "UNIQUE",
        field,
      };
    }

    if (field === "ownerId") {
      return {
        message: "Este owner ja esta vinculado a outra barbearia.",
        code: "UNIQUE",
        field,
      };
    }

    return {
      message: "Ja existe um registro com os mesmos dados unicos.",
      code: "UNIQUE",
      field,
    };
  }

  if (error.code === "P2003") {
    if (field === "ownerId") {
      return {
        message: "OwnerID invalido ou usuario nao encontrado.",
        code: "FK",
        field: "ownerId",
      };
    }

    return {
      message: "Falha de integridade de relacionamento ao salvar dados.",
      code: "FK",
      field,
    };
  }

  if (error.code === "P2025") {
    return {
      message: "Registro nao encontrado para concluir a operacao.",
      code: "NOT_FOUND",
      field,
    };
  }

  return {
    message: "Erro inesperado ao salvar barbearia.",
    code: "UNKNOWN",
    field,
  };
};

export const toAdminBarbershopActionErrorPayload = (
  error: unknown,
  fallbackMessage: string,
): AdminBarbershopActionErrorPayload => {
  if (error instanceof AdminBarbershopError) {
    return {
      message: error.message,
      code: error.code,
      field: error.field,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return mapPrismaKnownErrorToPayload(error);
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return {
      message: error.message,
      code: "UNKNOWN",
    };
  }

  return {
    message: fallbackMessage,
    code: "UNKNOWN",
  };
};

export const logAdminBarbershopError = (
  operation: "create" | "update",
  error: unknown,
) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error(`[ADMIN][${operation}Barbershop] error:`, {
      code: error.code,
      meta: error.meta,
      message: error.message,
      stack: error.stack,
    });
    return;
  }

  console.error(`[ADMIN][${operation}Barbershop] error:`, error);
};

const BARBERSHOP_LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  publicSlug: true,
  shareSlug: true,
  phones: true,
  exclusiveBarber: true,
  stripeEnabled: true,
  isActive: true,
  plan: true,
  whatsappProvider: true,
  whatsappEnabled: true,
  ownerId: true,
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} satisfies Prisma.BarbershopSelect;

const BARBERSHOP_DETAILS_SELECT = {
  id: true,
  name: true,
  slug: true,
  publicSlug: true,
  shareSlug: true,
  address: true,
  description: true,
  imageUrl: true,
  logoUrl: true,
  phones: true,
  exclusiveBarber: true,
  stripeEnabled: true,
  isActive: true,
  plan: true,
  whatsappProvider: true,
  whatsappFrom: true,
  whatsappEnabled: true,
  whatsappSettings: {
    select: {
      sendBookingConfirmation: true,
      sendReminder24h: true,
      sendReminder1h: true,
    },
  },
  ownerId: true,
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
} satisfies Prisma.BarbershopSelect;

const normalizePage = (page: number | undefined) => {
  if (!page || Number.isNaN(page) || page < 1) {
    return 1;
  }

  return Math.floor(page);
};

const normalizePageSize = (pageSize: number | undefined) => {
  if (!pageSize || Number.isNaN(pageSize) || pageSize < 1) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(Math.floor(pageSize), MAX_PAGE_SIZE);
};

const normalizeSearch = (search: string | undefined) => {
  const normalizedSearch = search?.trim();
  return normalizedSearch?.length ? normalizedSearch : null;
};

const normalizePhones = (phones: string[] | undefined) => {
  if (!phones) {
    return undefined;
  }

  const normalizedPhones = phones.map((phone) => phone.trim()).filter(Boolean);

  if (normalizedPhones.length === 0) {
    throw new AdminBarbershopError({
      message: "Informe pelo menos um telefone valido.",
      code: "VALIDATION",
      field: "phones",
    });
  }

  return normalizedPhones;
};

const normalizeOptionalValue = (value: string | null | undefined) => {
  const normalizedValue = value?.trim() ?? "";
  return normalizedValue.length > 0 ? normalizedValue : null;
};

const normalizeOptionalOwnerId = (ownerId: string | null | undefined) => {
  const normalizedOwnerId = ownerId?.trim() ?? "";
  return normalizedOwnerId.length > 0 ? normalizedOwnerId : null;
};

const normalizeRequiredText = ({
  value,
  fieldName,
  min,
  max,
}: {
  value: string;
  fieldName: string;
  min: number;
  max: number;
}) => {
  const normalizedValue = value.trim();

  if (normalizedValue.length < min || normalizedValue.length > max) {
    throw new AdminBarbershopError({
      message: `Campo ${fieldName} invalido.`,
      code: "VALIDATION",
      field: fieldName,
    });
  }

  return normalizedValue;
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

const resolveUniqueBarbershopFieldValue = async ({
  field,
  baseValue,
  excludeBarbershopId,
}: {
  field: "slug" | "publicSlug";
  baseValue: string;
  excludeBarbershopId?: string;
}) => {
  const normalizedBase = getPublicSlugBase(baseValue);

  for (let suffix = 1; suffix <= MAX_SLUG_GENERATION_ATTEMPTS; suffix += 1) {
    const candidateValue = buildPublicSlugCandidate(normalizedBase, suffix);

    const existingBarbershop = await prisma.barbershop.findFirst({
      where: {
        [field]: candidateValue,
        ...(excludeBarbershopId
          ? {
              NOT: {
                id: excludeBarbershopId,
              },
            }
          : {}),
      } as Prisma.BarbershopWhereInput,
      select: {
        id: true,
      },
    });

    if (!existingBarbershop) {
      return candidateValue;
    }
  }

  throw new AdminBarbershopError({
    message: "Nao foi possivel gerar um slug unico.",
    code: "UNIQUE",
    field,
  });
};

type PlanConfigInput = {
  plan: "BASIC" | "PRO";
  whatsappProvider: "NONE" | "TWILIO";
  whatsappFrom: string | null | undefined;
  whatsappEnabled: boolean;
};

const resolvePlanConfig = ({
  plan,
  whatsappProvider,
  whatsappFrom,
  whatsappEnabled,
}: PlanConfigInput) => {
  const normalizedPlan = plan;
  const normalizedWhatsappFrom = normalizeOptionalValue(whatsappFrom);

  if (normalizedPlan === "BASIC") {
    return {
      plan: "BASIC" as const,
      whatsappProvider: "NONE" as const,
      whatsappFrom: null,
      whatsappEnabled: false,
    };
  }

  if (whatsappEnabled && whatsappProvider !== "TWILIO") {
    throw new AdminBarbershopError({
      message: "Para habilitar WhatsApp no plano PRO, selecione o provider TWILIO.",
      code: "VALIDATION",
      field: "whatsappProvider",
    });
  }

  return {
    plan: "PRO" as const,
    whatsappProvider,
    whatsappFrom: normalizedWhatsappFrom,
    whatsappEnabled,
  };
};

const assertTargetOwner = async (targetOwnerId: string) => {
  const targetOwner = await prisma.user.findUnique({
    where: {
      id: targetOwnerId,
    },
    select: {
      id: true,
      role: true,
    },
  });

  if (!targetOwner) {
    throw new AdminBarbershopError({
      message: "OwnerID invalido ou usuario nao encontrado.",
      code: "FK",
      field: "ownerId",
    });
  }

  if (targetOwner.role === "ADMIN") {
    throw new AdminBarbershopError({
      message: "Nao vincule um ADMIN como owner por esta tela.",
      code: "VALIDATION",
      field: "ownerId",
    });
  }
};

const syncBarbershopOwner = async ({
  adminUserId,
  barbershopId,
  currentOwnerId,
  ownerId,
}: {
  adminUserId: string;
  barbershopId: string;
  currentOwnerId: string | null;
  ownerId: string | null | undefined;
}) => {
  if (ownerId === undefined) {
    return;
  }

  const normalizedOwnerId = normalizeOptionalOwnerId(ownerId);

  if (!normalizedOwnerId && currentOwnerId) {
    await demoteOwnerToCustomerByAdmin({
      actorUserId: adminUserId,
      userId: currentOwnerId,
    });
    return;
  }

  if (!normalizedOwnerId || normalizedOwnerId === currentOwnerId) {
    return;
  }

  await assertTargetOwner(normalizedOwnerId);

  await promoteUserToOwnerByAdmin({
    actorUserId: adminUserId,
    userId: normalizedOwnerId,
    barbershopId,
    allowTransfer: true,
  });
};

const upsertWhatsAppSettings = async (
  tx: Prisma.TransactionClient,
  barbershopId: string,
) => {
  await tx.barbershopWhatsAppSettings.upsert({
    where: {
      barbershopId,
    },
    update: {},
    create: {
      barbershopId,
    },
    select: {
      id: true,
    },
  });
};

const isSlugUniqueConstraintError = (error: unknown) => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2002") {
    return false;
  }

  const targetFields = normalizeTargetFields(error.meta?.target).map((field) =>
    field.toLowerCase(),
  );

  return targetFields.some(
    (field) => field.includes("slug") || field.includes("publicslug"),
  );
};

interface AdminListBarbershopsInput {
  search?: string;
  page?: number;
  pageSize?: number;
  status?: "ALL" | "ACTIVE" | "INACTIVE";
  exclusive?: "ALL" | "EXCLUSIVE" | "NON_EXCLUSIVE";
}

export const adminListBarbershops = async (input: AdminListBarbershopsInput = {}) => {
  await requireAdmin({ onUnauthorized: "throw" });

  const page = normalizePage(input.page);
  const pageSize = normalizePageSize(input.pageSize);
  const search = normalizeSearch(input.search);
  const status = input.status ?? "ALL";
  const exclusive = input.exclusive ?? "ALL";

  const where: Prisma.BarbershopWhereInput = {
    ...(status === "ACTIVE" ? { isActive: true } : {}),
    ...(status === "INACTIVE" ? { isActive: false } : {}),
    ...(exclusive === "EXCLUSIVE" ? { exclusiveBarber: true } : {}),
    ...(exclusive === "NON_EXCLUSIVE" ? { exclusiveBarber: false } : {}),
    ...(search
      ? {
          OR: [
            {
              name: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              slug: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              publicSlug: {
                contains: search,
                mode: "insensitive",
              },
            },
            {
              owner: {
                is: {
                  OR: [
                    {
                      name: {
                        contains: search,
                        mode: "insensitive",
                      },
                    },
                    {
                      email: {
                        contains: search,
                        mode: "insensitive",
                      },
                    },
                  ],
                },
              },
            },
          ],
        }
      : {}),
  };

  const [totalCount, items] = await Promise.all([
    prisma.barbershop.count({ where }),
    prisma.barbershop.findMany({
      where,
      orderBy: {
        name: "asc",
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: BARBERSHOP_LIST_SELECT,
    }),
  ]);

  return {
    items,
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
};

export const adminGetBarbershop = async (barbershopId: string) => {
  await requireAdmin({ onUnauthorized: "throw" });

  const normalizedBarbershopId = barbershopId.trim();

  if (!normalizedBarbershopId) {
    throw new Error("Barbearia invalida.");
  }

  return prisma.barbershop.findUnique({
    where: {
      id: normalizedBarbershopId,
    },
    select: BARBERSHOP_DETAILS_SELECT,
  });
};

interface AdminCreateBarbershopInput {
  name: string;
  address: string;
  description: string;
  imageUrl?: string | null;
  logoUrl?: string | null;
  phones: string[];
  slug?: string;
  exclusiveBarber: boolean;
  stripeEnabled: boolean;
  ownerId?: string | null;
  plan: "BASIC" | "PRO";
  whatsappProvider: "NONE" | "TWILIO";
  whatsappFrom?: string | null;
  whatsappEnabled: boolean;
}

export const adminCreateBarbershop = async ({
  name,
  address,
  description,
  imageUrl,
  logoUrl,
  phones,
  slug,
  exclusiveBarber,
  stripeEnabled,
  ownerId,
  plan,
  whatsappProvider,
  whatsappFrom,
  whatsappEnabled,
}: AdminCreateBarbershopInput) => {
  const adminUser = await requireAdmin({ onUnauthorized: "throw" });

  const normalizedName = normalizeRequiredText({
    value: name,
    fieldName: "name",
    min: 2,
    max: 80,
  });
  const normalizedAddress = normalizeRequiredText({
    value: address,
    fieldName: "address",
    min: 5,
    max: 200,
  });
  const normalizedDescription = normalizeRequiredText({
    value: description,
    fieldName: "description",
    min: 10,
    max: 1000,
  });
  const normalizedPhones = normalizePhones(phones);
  const normalizedImageUrl = normalizeOptionalValue(imageUrl);
  const normalizedLogoUrl = normalizeOptionalValue(logoUrl);

  if (!normalizedPhones) {
    throw new AdminBarbershopError({
      message: "Informe pelo menos um telefone valido.",
      code: "VALIDATION",
      field: "phones",
    });
  }

  if (normalizedImageUrl && !hasValidImageUrl(normalizedImageUrl)) {
    throw new AdminBarbershopError({
      message: "A imagem da barbearia e invalida.",
      code: "VALIDATION",
      field: "imageUrl",
    });
  }

  if (normalizedLogoUrl && !hasValidImageUrl(normalizedLogoUrl)) {
    throw new AdminBarbershopError({
      message: "A logo da barbearia e invalida.",
      code: "VALIDATION",
      field: "logoUrl",
    });
  }

  const baseSlug = getPublicSlugBase(slug?.trim().length ? slug : normalizedName);

  const planConfig = resolvePlanConfig({
    plan,
    whatsappProvider,
    whatsappFrom,
    whatsappEnabled,
  });

  const createBarbershopRecord = async ({
    resolvedSlug,
    resolvedPublicSlug,
  }: {
    resolvedSlug: string;
    resolvedPublicSlug: string;
  }) => {
    return prisma.$transaction(async (tx) => {
      const created = await tx.barbershop.create({
        data: {
          name: normalizedName,
          slug: resolvedSlug,
          publicSlug: resolvedPublicSlug,
          address: normalizedAddress,
          description: normalizedDescription,
          imageUrl: normalizedImageUrl,
          logoUrl: normalizedLogoUrl,
          phones: normalizedPhones,
          exclusiveBarber,
          stripeEnabled,
          plan: planConfig.plan,
          whatsappProvider: planConfig.whatsappProvider,
          whatsappFrom: planConfig.whatsappFrom,
          whatsappEnabled: planConfig.whatsappEnabled,
        },
        select: {
          id: true,
        },
      });

      await upsertWhatsAppSettings(tx, created.id);

      return created;
    });
  };

  let resolvedSlug = await resolveUniqueBarbershopFieldValue({
    field: "slug",
    baseValue: baseSlug,
  });
  let resolvedPublicSlug = await resolveUniqueBarbershopFieldValue({
    field: "publicSlug",
    baseValue: baseSlug,
  });

  let createdBarbershop: { id: string };

  try {
    createdBarbershop = await createBarbershopRecord({
      resolvedSlug,
      resolvedPublicSlug,
    });
  } catch (error) {
    if (!isSlugUniqueConstraintError(error)) {
      throw error;
    }

    resolvedSlug = await resolveUniqueBarbershopFieldValue({
      field: "slug",
      baseValue: baseSlug,
    });
    resolvedPublicSlug = await resolveUniqueBarbershopFieldValue({
      field: "publicSlug",
      baseValue: baseSlug,
    });

    createdBarbershop = await createBarbershopRecord({
      resolvedSlug,
      resolvedPublicSlug,
    });
  }

  try {
    await syncBarbershopOwner({
      adminUserId: adminUser.id,
      barbershopId: createdBarbershop.id,
      currentOwnerId: null,
      ownerId,
    });
  } catch (error) {
    await prisma.barbershop
      .delete({
        where: {
          id: createdBarbershop.id,
        },
      })
      .catch(() => null);

    throw error;
  }

  const barbershop = await prisma.barbershop.findUnique({
    where: {
      id: createdBarbershop.id,
    },
    select: BARBERSHOP_DETAILS_SELECT,
  });

  if (!barbershop) {
    throw new AdminBarbershopError({
      message: "Falha ao buscar barbearia criada.",
      code: "UNKNOWN",
    });
  }

  return barbershop;
};

interface AdminUpdateBarbershopInput {
  barbershopId: string;
  name: string;
  address: string;
  description: string;
  imageUrl?: string | null;
  logoUrl?: string | null;
  phones: string[];
  slug?: string;
  exclusiveBarber: boolean;
  stripeEnabled: boolean;
  ownerId?: string | null;
  plan: "BASIC" | "PRO";
  whatsappProvider: "NONE" | "TWILIO";
  whatsappFrom?: string | null;
  whatsappEnabled: boolean;
}

export const adminUpdateBarbershop = async ({
  barbershopId,
  name,
  address,
  description,
  imageUrl,
  logoUrl,
  phones,
  slug,
  exclusiveBarber,
  stripeEnabled,
  ownerId,
  plan,
  whatsappProvider,
  whatsappFrom,
  whatsappEnabled,
}: AdminUpdateBarbershopInput) => {
  const adminUser = await requireAdmin({ onUnauthorized: "throw" });

  const normalizedBarbershopId = barbershopId.trim();
  const normalizedName = normalizeRequiredText({
    value: name,
    fieldName: "name",
    min: 2,
    max: 80,
  });
  const normalizedAddress = normalizeRequiredText({
    value: address,
    fieldName: "address",
    min: 5,
    max: 200,
  });
  const normalizedDescription = normalizeRequiredText({
    value: description,
    fieldName: "description",
    min: 10,
    max: 1000,
  });
  const normalizedPhones = normalizePhones(phones);
  const normalizedImageUrl = normalizeOptionalValue(imageUrl);
  const normalizedLogoUrl = normalizeOptionalValue(logoUrl);

  if (!normalizedBarbershopId || !normalizedPhones) {
    throw new AdminBarbershopError({
      message: "Dados invalidos para atualizacao da barbearia.",
      code: "VALIDATION",
      field: "barbershopId",
    });
  }

  if (normalizedImageUrl && !hasValidImageUrl(normalizedImageUrl)) {
    throw new AdminBarbershopError({
      message: "A imagem da barbearia e invalida.",
      code: "VALIDATION",
      field: "imageUrl",
    });
  }

  if (normalizedLogoUrl && !hasValidImageUrl(normalizedLogoUrl)) {
    throw new AdminBarbershopError({
      message: "A logo da barbearia e invalida.",
      code: "VALIDATION",
      field: "logoUrl",
    });
  }

  const currentBarbershop = await prisma.barbershop.findUnique({
    where: {
      id: normalizedBarbershopId,
    },
    select: {
      id: true,
      slug: true,
      ownerId: true,
      plan: true,
    },
  });

  if (!currentBarbershop) {
    throw new AdminBarbershopError({
      message: "Barbearia nao encontrada.",
      code: "NOT_FOUND",
      field: "barbershopId",
    });
  }

  await syncBarbershopOwner({
    adminUserId: adminUser.id,
    barbershopId: currentBarbershop.id,
    currentOwnerId: currentBarbershop.ownerId,
    ownerId,
  });

  const baseSlug = getPublicSlugBase(slug?.trim().length ? slug : normalizedName);
  const resolvedSlug = await resolveUniqueBarbershopFieldValue({
    field: "slug",
    baseValue: baseSlug,
    excludeBarbershopId: currentBarbershop.id,
  });

  const planConfig = resolvePlanConfig({
    plan,
    whatsappProvider,
    whatsappFrom,
    whatsappEnabled,
  });

  const updatedBarbershop = await prisma.$transaction(async (tx) => {
    const updated = await tx.barbershop.update({
      where: {
        id: currentBarbershop.id,
      },
      data: {
        name: normalizedName,
        address: normalizedAddress,
        description: normalizedDescription,
        imageUrl: normalizedImageUrl,
        logoUrl: normalizedLogoUrl,
        phones: normalizedPhones,
        slug: resolvedSlug,
        exclusiveBarber,
        stripeEnabled,
        plan: planConfig.plan,
        whatsappProvider: planConfig.whatsappProvider,
        whatsappFrom: planConfig.whatsappFrom,
        whatsappEnabled: planConfig.whatsappEnabled,
      },
      select: BARBERSHOP_DETAILS_SELECT,
    });

    await upsertWhatsAppSettings(tx, updated.id);

    if (currentBarbershop.plan === "PRO" && planConfig.plan === "BASIC") {
      await cancelFuturePendingBarbershopNotificationJobs(
        currentBarbershop.id,
        "plan_downgrade",
        tx,
      );
    }

    return updated;
  });

  return {
    ...updatedBarbershop,
    previousSlug: currentBarbershop.slug,
  };
};

interface AdminSetBarbershopActiveInput {
  barbershopId: string;
  isActive: boolean;
}

export const adminSetBarbershopActive = async ({
  barbershopId,
  isActive,
}: AdminSetBarbershopActiveInput) => {
  await requireAdmin({ onUnauthorized: "throw" });

  const normalizedBarbershopId = barbershopId.trim();

  if (!normalizedBarbershopId) {
    throw new Error("Barbearia invalida.");
  }

  const updateResult = await prisma.barbershop.updateMany({
    where: {
      id: normalizedBarbershopId,
    },
    data: {
      isActive,
    },
  });

  if (updateResult.count === 0) {
    throw new Error("Barbearia nao encontrada.");
  }

  const barbershop = await prisma.barbershop.findUnique({
    where: {
      id: normalizedBarbershopId,
    },
    select: {
      id: true,
      slug: true,
      publicSlug: true,
      isActive: true,
    },
  });

  if (!barbershop) {
    throw new Error("Barbearia nao encontrada.");
  }

  return barbershop;
};

const buildDeleteDependencyError = ({
  ownerId,
  dependencies,
}: {
  ownerId: string | null;
  dependencies: {
    barbers: number;
    services: number;
    bookings: number;
    customerBarbershops: number;
    users: number;
    currentUsers: number;
  };
}) => {
  const reasons: string[] = [];

  if (ownerId) {
    reasons.push("owner vinculado");
  }

  if (dependencies.bookings > 0) {
    reasons.push(`${dependencies.bookings} agendamento(s)`);
  }

  if (dependencies.services > 0) {
    reasons.push(`${dependencies.services} servico(s)`);
  }

  if (dependencies.barbers > 0) {
    reasons.push(`${dependencies.barbers} barbeiro(s)`);
  }

  if (dependencies.customerBarbershops > 0) {
    reasons.push(`${dependencies.customerBarbershops} vinculo(s) com cliente`);
  }

  if (dependencies.users > 0) {
    reasons.push(`${dependencies.users} usuario(s) vinculado(s)`);
  }

  if (dependencies.currentUsers > 0) {
    reasons.push(`${dependencies.currentUsers} contexto(s) ativo(s) de usuario`);
  }

  if (reasons.length === 0) {
    return null;
  }

  return `Nao e possivel excluir esta barbearia porque existem dependencias: ${reasons.join(", ")}. Inative a barbearia em vez de excluir.`;
};

export const adminDeleteBarbershopSafely = async (barbershopId: string) => {
  await requireAdmin({ onUnauthorized: "throw" });

  const normalizedBarbershopId = barbershopId.trim();

  if (!normalizedBarbershopId) {
    throw new Error("Barbearia invalida.");
  }

  const barbershop = await prisma.barbershop.findUnique({
    where: {
      id: normalizedBarbershopId,
    },
    select: {
      id: true,
      slug: true,
      publicSlug: true,
      ownerId: true,
      _count: {
        select: {
          barbers: true,
          services: true,
          bookings: true,
          customerBarbershops: true,
          users: true,
          currentUsers: true,
        },
      },
    },
  });

  if (!barbershop) {
    throw new Error("Barbearia nao encontrada.");
  }

  const dependencyError = buildDeleteDependencyError({
    ownerId: barbershop.ownerId,
    dependencies: barbershop._count,
  });

  if (dependencyError) {
    throw new Error(dependencyError);
  }

  await prisma.barbershop.delete({
    where: {
      id: barbershop.id,
    },
  });

  return {
    id: barbershop.id,
    slug: barbershop.slug,
    publicSlug: barbershop.publicSlug,
  };
};
