"use server";

import { type Prisma } from "@/generated/prisma/client";
import { protectedActionClient } from "@/lib/action-client";
import { PAID_BOOKING_PAYMENT_WHERE } from "@/lib/booking-payment";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/rbac";
import { startOfDay, subDays } from "date-fns";
import { returnValidationErrors } from "next-safe-action";
import { z } from "zod";

const reportRangeSchema = z.enum(["WEEK", "MONTH"]);

const inputSchema = z.object({
  range: reportRangeSchema,
  barbershopId: z.uuid().optional(),
  from: z.date().optional(),
  to: z.date().optional(),
});

const getRollingWindow = (range: z.infer<typeof reportRangeSchema>) => {
  const now = new Date();

  if (range === "WEEK") {
    return {
      from: startOfDay(subDays(now, 6)),
      to: now,
    };
  }

  return {
    from: startOfDay(subDays(now, 29)),
    to: now,
  };
};

const buildDateWindow = ({
  range,
  from,
  to,
}: {
  range: z.infer<typeof reportRangeSchema>;
  from?: Date;
  to?: Date;
}) => {
  if (!from && !to) {
    return getRollingWindow(range);
  }

  if (!from || !to) {
    return null;
  }

  if (from > to) {
    return null;
  }

  return {
    from,
    to,
  };
};

const getOwnerBarbershopWhere = (userId: string, barbershopId?: string) => {
  const baseWhere: Prisma.BarbershopWhereInput = {
    OR: [
      {
        ownerId: userId,
      },
      {
        users: {
          some: {
            id: userId,
          },
        },
      },
    ],
  };

  if (!barbershopId) {
    return baseWhere;
  }

  return {
    ...baseWhere,
    id: barbershopId,
  } satisfies Prisma.BarbershopWhereInput;
};

export const getOwnerReport = protectedActionClient
  .inputSchema(inputSchema)
  .action(
    async ({
      parsedInput: { range, barbershopId: requestedBarbershopId, from, to },
      ctx: { user: sessionUser },
    }) => {
      const user = await prisma.user.findUnique({
        where: {
          id: sessionUser.id,
        },
        select: {
          id: true,
          role: true,
        },
      });

      if (!user) {
        returnValidationErrors(inputSchema, {
          _errors: ["Usuário não encontrado."],
        });
      }

      if (!isAdmin(user.role) && user.role !== "OWNER") {
        returnValidationErrors(inputSchema, {
          _errors: ["Apenas owners e administradores podem acessar este relatório."],
        });
      }

      const dateWindow = buildDateWindow({ range, from, to });

      if (!dateWindow) {
        returnValidationErrors(inputSchema, {
          _errors: ["Período inválido para gerar o relatório."],
        });
      }

      let barbershopId = requestedBarbershopId;

      if (isAdmin(user.role)) {
        if (!barbershopId) {
          returnValidationErrors(inputSchema, {
            _errors: ["Selecione uma barbearia para gerar o relatório."],
          });
        }

        const barbershop = await prisma.barbershop.findUnique({
          where: {
            id: barbershopId,
          },
          select: {
            id: true,
          },
        });

        if (!barbershop) {
          returnValidationErrors(inputSchema, {
            _errors: ["Barbearia não encontrada."],
          });
        }
      } else {
        const ownerBarbershop = await prisma.barbershop.findFirst({
          where: getOwnerBarbershopWhere(user.id, barbershopId),
          select: {
            id: true,
          },
        });

        if (!ownerBarbershop) {
          returnValidationErrors(inputSchema, {
            _errors: ["Barbearia não encontrada ou sem permissão para visualizar."],
          });
        }

        barbershopId = ownerBarbershop.id;
      }

      const report = await prisma.booking.aggregate({
        where: {
          barbershopId,
          createdAt: {
            gte: dateWindow.from,
            lte: dateWindow.to,
          },
          cancelledAt: null,
          ...PAID_BOOKING_PAYMENT_WHERE,
        },
        _count: {
          _all: true,
        },
        _sum: {
          totalPriceInCents: true,
        },
      });

      const totalOrders = report._count._all;
      const revenueInCents = report._sum.totalPriceInCents ?? 0;
      const averageTicketInCents =
        totalOrders > 0 ? Math.round(revenueInCents / totalOrders) : 0;

      return {
        barbershopId,
        range,
        from: dateWindow.from.toISOString(),
        to: dateWindow.to.toISOString(),
        totalOrders,
        revenueInCents,
        averageTicketInCents,
      };
    },
  );
