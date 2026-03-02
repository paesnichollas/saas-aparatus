import { google } from "@ai-sdk/google";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import { NextResponse } from "next/server";
import z from "zod";

import { createBookingCheckoutSession } from "@/actions/create-booking-checkout-session";
import { getDateAvailableTimeSlots } from "@/actions/get-date-available-time-slots";
import { listBarbersByBarbershop } from "@/data/barbers";
import { Prisma } from "@/generated/prisma/client";
import { parseBookingDateOnly, parseBookingDateTime } from "@/lib/booking-time";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const CHAT_BARBERSHOP_RESULT_LIMIT = 20;

const CHAT_BARBERSHOP_SELECT = {
  id: true,
  name: true,
  address: true,
  slug: true,
  exclusiveBarber: true,
  isActive: true,
  services: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      description: true,
      priceInCents: true,
      durationInMinutes: true,
    },
  },
} satisfies Prisma.BarbershopSelect;

type ChatBarbershop = Prisma.BarbershopGetPayload<{
  select: typeof CHAT_BARBERSHOP_SELECT;
}>;

const INVALID_BARBERSHOP_CONTEXT_MESSAGE = "Contexto da barbearia inválido";
const FORBIDDEN_BARBERSHOP_CONTEXT_ERROR_CODE = "FORBIDDEN_CONTEXT";
const INVALID_DATE_ONLY_MESSAGE = "Data inválida. Use o formato YYYY-MM-DD.";
const INVALID_BOOKING_DATE_TIME_MESSAGE =
  "Data e horário inválidos. Use o formato YYYY-MM-DDTHH:mm:ss.";

const getValidationErrorMessage = (validationErrors: unknown) => {
  if (!validationErrors || typeof validationErrors !== "object") {
    return null;
  }

  const rootErrors = (validationErrors as { _errors?: unknown })._errors;
  if (!Array.isArray(rootErrors) || rootErrors.length === 0) {
    return null;
  }

  return typeof rootErrors[0] === "string" ? rootErrors[0] : null;
};

const getServerErrorMessage = (serverError: unknown) => {
  if (typeof serverError === "string" && serverError.trim().length > 0) {
    return serverError.trim();
  }

  return null;
};

const normalizeForMessageMatch = (value: string) => {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
};

const isUnauthorizedErrorMessage = (message: string | null) => {
  if (!message) {
    return false;
  }

  const normalizedMessage = normalizeForMessageMatch(message);
  return (
    normalizedMessage.includes("nao autorizado") ||
    normalizedMessage.includes("não autorizado") ||
    normalizedMessage.includes("login")
  );
};

const getSystemPrompt = (isExclusiveContext: boolean) => {
  const exclusiveModeInstructions = isExclusiveContext
    ? `MODO EXCLUSIVO (OBRIGATÓRIO):
- Você está em contexto exclusivo de UMA barbearia específica.
- NUNCA ofereça, liste ou consulte dados de outras barbearias.
- Em caso de erro de contexto, informe exatamente: "Contexto da barbearia inválido".
- Não tente contornar o contexto pedindo outro barbershopId.`
    : `MODO GLOBAL:
- Você pode buscar e apresentar barbearias normalmente, conforme as ferramentas retornarem dados.`;

  return `Você é o Agenda.ai, um assistente virtual de agendamento de barbearias.

DATA ATUAL: Hoje é ${new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })} (${new Date().toISOString().split("T")[0]})

${exclusiveModeInstructions}

Seu objetivo é ajudar os usuários a:
- Encontrar barbearias (por nome ou todas disponíveis)
- Escolher um barbeiro da barbearia escolhida
- Verificar disponibilidade de horários para um barbeiro específico
- Fornecer informações sobre serviços e preços
- Criar agendamentos quando o usuário confirmar

Fluxo de atendimento:

CENÁRIO 1 - Usuário menciona data/horário na primeira mensagem (ex: "quero um corte pra hoje", "preciso cortar o cabelo amanhã", "quero marcar para sexta"):
1. Use a ferramenta searchBarbershops para buscar barbearias.
2. Quando o usuário escolher uma barbearia, use listBarbersByBarbershop com o barbershopId escolhido.
3. Se não houver barbeiros na barbearia:
   - informe exatamente: "Esta barbearia ainda não possui barbeiros cadastrados. Peça para o estabelecimento cadastrar barbeiros no painel administrativo."
   - NÃO avance para horários e NÃO tente criar agendamento.
4. Depois que o usuário escolher um barbeiro, use getAvailableTimeSlotsForBarbershop para buscar horários.
5. Apresente as opções com horários disponíveis, mostrando:
   - Nome da barbearia
   - Nome do barbeiro
   - Endereço
   - Serviços oferecidos com preços
   - Alguns horários disponíveis (4-5 opções espaçadas)
6. Quando o usuário escolher, forneça o resumo final.

CENÁRIO 2 - Usuário não menciona data/horário inicialmente:
1. Use a ferramenta searchBarbershops para buscar barbearias.
2. Apresente as barbearias encontradas com:
   - Nome da barbearia
   - Endereço
   - Serviços oferecidos com preços
3. Quando o usuário demonstrar interesse em uma barbearia específica, use listBarbersByBarbershop.
4. O usuário precisa escolher um barbeiro antes de consultar horários.
5. Quando o usuário escolher barbeiro e data, use getAvailableTimeSlotsForBarbershop com barbershopId, barberId, serviceId e data.
6. Apresente os horários disponíveis (liste alguns horários, não todos - sugira 4-5 opções espaçadas).

Resumo final (quando o usuário escolher):
- Nome da barbearia
- Endereço
- Barbeiro escolhido
- Serviço escolhido
- Data e horário escolhido
- Preço

Criação do agendamento:
- Após o usuário confirmar explicitamente a escolha (ex: "confirmo", "pode agendar", "quero esse horário"), use createBooking.
- Parâmetros obrigatórios:
  * barbershopId: ID da barbearia escolhida
  * serviceId: ID do serviço escolhido
  * barberId: ID do barbeiro escolhido
  * date: Data e horário no formato ISO (YYYY-MM-DDTHH:mm:ss) - exemplo: "2025-11-05T10:00:00"
  * paymentMethod: use "IN_PERSON" por padrão. Use "STRIPE" apenas quando o usuário pedir explicitamente pagamento online.
- NUNCA tente criar agendamento sem barberId escolhido.
- Se a criação retornar requiresCheckout=true, informe que o agendamento foi reservado e que o pagamento precisa ser concluído no checkout.
- Se a criação retornar requiresCheckout=false, informe ao usuário que o agendamento foi confirmado com sucesso.
- Se houver erro (success: false), explique o erro ao usuário:
  * Se o errorCode for "UNAUTHORIZED", informe que é necessário fazer login para criar um agendamento.
  * Para outros erros, informe que houve um problema e peça para tentar novamente.

Importante:
- NUNCA mostre informações técnicas ao usuário (barbershopId, barberId, serviceId, formatos ISO de data, etc.)
- Seja sempre educado, prestativo e use uma linguagem informal e amigável
- Não liste TODOS os horários disponíveis, sugira apenas 4-5 opções espaçadas ao longo do dia
- Se não houver horários disponíveis, sugira uma data alternativa
- Quando o usuário mencionar "hoje", "amanhã", "depois de amanhã" ou dias da semana, calcule a data correta automaticamente`;
};

const isForbiddenExclusiveContext = (
  isExclusiveContext: boolean,
  exclusiveBarbershopId: string | null,
  requestedBarbershopId: string,
) => {
  if (!isExclusiveContext) {
    return false;
  }

  return Boolean(exclusiveBarbershopId && exclusiveBarbershopId !== requestedBarbershopId);
};

export const POST = async (request: Request) => {
  const requestUrl = new URL(request.url);
  const hasBarbershopPublicSlugParam =
    requestUrl.searchParams.has("barbershopPublicSlug");
  const requestedBarbershopPublicSlug =
    requestUrl.searchParams.get("barbershopPublicSlug")?.trim() ?? "";

  let exclusiveBarbershop: ChatBarbershop | null = null;

  if (hasBarbershopPublicSlugParam && requestedBarbershopPublicSlug.length > 0) {
    exclusiveBarbershop = await prisma.barbershop.findUnique({
      where: {
        slug: requestedBarbershopPublicSlug,
      },
      select: CHAT_BARBERSHOP_SELECT,
    });
  }

  const isExclusiveContext =
    Boolean(exclusiveBarbershop?.exclusiveBarber) && Boolean(exclusiveBarbershop?.isActive);

  if (hasBarbershopPublicSlugParam && !isExclusiveContext) {
    return NextResponse.json(
      {
        error: INVALID_BARBERSHOP_CONTEXT_MESSAGE,
      },
      {
        status: 400,
      },
    );
  }

  const exclusiveBarbershopId = exclusiveBarbershop?.id ?? null;

  const requestBody = (await request.json()) as {
    messages?: unknown;
  };
  const messages = Array.isArray(requestBody.messages) ? requestBody.messages : [];

  const result = streamText({
    model: google("gemini-2.5-flash-lite"),
    messages: convertToModelMessages(messages),
    stopWhen: stepCountIs(10),
    system: getSystemPrompt(isExclusiveContext),
    tools: {
      searchBarbershops: tool({
        description:
          "Pesquisa barbearias pelo nome. Se nenhum nome é passado, retorna todas as barbearias.",
        inputSchema: z.object({
          name: z
            .string()
            .optional()
            .describe(
              "O nome da barbearia a ser pesquisada. Se nenhum nome é passado, retorna todas as barbearias.",
            ),
        }),
        execute: async ({ name }) => {
          if (isExclusiveContext && exclusiveBarbershop) {
            const normalizedName = name?.trim().toLowerCase();

            if (!normalizedName) {
              return [exclusiveBarbershop];
            }

            return exclusiveBarbershop.name.toLowerCase().includes(normalizedName)
              ? [exclusiveBarbershop]
              : [];
          }

          if (!name?.trim()) {
            return prisma.barbershop.findMany({
              where: {
                isActive: true,
              },
              select: CHAT_BARBERSHOP_SELECT,
              orderBy: {
                name: "asc",
              },
              take: CHAT_BARBERSHOP_RESULT_LIMIT,
            });
          }

          return prisma.barbershop.findMany({
            where: {
              isActive: true,
              name: {
                contains: name,
                mode: "insensitive",
              },
            },
            select: CHAT_BARBERSHOP_SELECT,
            orderBy: {
              name: "asc",
            },
            take: CHAT_BARBERSHOP_RESULT_LIMIT,
          });
        },
      }),
      listBarbersByBarbershop: tool({
        description:
          "Lista os barbeiros ativos de uma barbearia para o usuário escolher antes do horário.",
        inputSchema: z.object({
          barbershopId: z.uuid(),
        }),
        execute: async ({ barbershopId }) => {
          if (
            isForbiddenExclusiveContext(
              isExclusiveContext,
              exclusiveBarbershopId,
              barbershopId,
            )
          ) {
            return {
              success: false,
              errorCode: FORBIDDEN_BARBERSHOP_CONTEXT_ERROR_CODE,
              message: INVALID_BARBERSHOP_CONTEXT_MESSAGE,
              barbershopId,
              barbers: [],
            };
          }

          const barbers = await listBarbersByBarbershop(barbershopId);

          return {
            success: true,
            barbershopId,
            barbers,
          };
        },
      }),
      getAvailableTimeSlotsForBarbershop: tool({
        description:
          "Obtém os horários disponíveis para uma barbearia e barbeiro específicos.",
        inputSchema: z.object({
          barbershopId: z.string().uuid(),
          barberId: z.string().uuid(),
          serviceId: z.string().uuid(),
          date: z
            .string()
            .describe(
              "A data no formato ISO (YYYY-MM-DD) para a qual você deseja verificar os horários disponíveis.",
            ),
        }),
        execute: async ({ barbershopId, barberId, serviceId, date }) => {
          if (
            isForbiddenExclusiveContext(
              isExclusiveContext,
              exclusiveBarbershopId,
              barbershopId,
            )
          ) {
            return {
              success: false,
              errorCode: FORBIDDEN_BARBERSHOP_CONTEXT_ERROR_CODE,
              message: INVALID_BARBERSHOP_CONTEXT_MESSAGE,
              barbershopId,
              barberId,
              serviceId,
              date,
              availableTimeSlots: [],
            };
          }

          const parsedDate = parseBookingDateOnly(date);
          if (!parsedDate) {
            return {
              success: false,
              errorCode: "VALIDATION_ERROR",
              message: INVALID_DATE_ONLY_MESSAGE,
              barbershopId,
              barberId,
              serviceId,
              date,
              availableTimeSlots: [],
            };
          }

          try {
            const availableTimeSlotsResult = await getDateAvailableTimeSlots({
              barbershopId,
              barberId,
              serviceId,
              date: parsedDate,
            });

            const validationMessage = getValidationErrorMessage(
              availableTimeSlotsResult.validationErrors,
            );
            if (validationMessage) {
              return {
                success: false,
                errorCode: "VALIDATION_ERROR",
                message: validationMessage,
                barbershopId,
                barberId,
                serviceId,
                date,
                availableTimeSlots: [],
              };
            }

            const serverMessage = getServerErrorMessage(
              availableTimeSlotsResult.serverError,
            );
            if (serverMessage) {
              return {
                success: false,
                errorCode: "SERVER_ERROR",
                message: serverMessage,
                barbershopId,
                barberId,
                serviceId,
                date,
                availableTimeSlots: [],
              };
            }

            return {
              success: true,
              barbershopId,
              barberId,
              serviceId,
              date,
              availableTimeSlots: availableTimeSlotsResult.data ?? [],
            };
          } catch (error) {
            console.error("getAvailableTimeSlotsForBarbershop error", error);
            return {
              success: false,
              errorCode: "SERVER_ERROR",
              message: "Não foi possível consultar os horários agora.",
              barbershopId,
              barberId,
              serviceId,
              date,
              availableTimeSlots: [],
            };
          }
        },
      }),
      createBooking: tool({
        description:
          "Cria um novo agendamento para um serviço específico em uma data específica.",
        inputSchema: z.object({
          barbershopId: z.uuid(),
          serviceId: z.uuid(),
          barberId: z.uuid(),
          date: z
            .string()
            .describe(
              "A data e horário no formato ISO (YYYY-MM-DDTHH:mm:ss) para criar o agendamento.",
            ),
          paymentMethod: z.enum(["STRIPE", "IN_PERSON"]).optional(),
        }),
        execute: async ({
          barbershopId,
          serviceId,
          barberId,
          date,
          paymentMethod,
        }) => {
          if (
            isForbiddenExclusiveContext(
              isExclusiveContext,
              exclusiveBarbershopId,
              barbershopId,
            )
          ) {
            return {
              success: false,
              errorCode: FORBIDDEN_BARBERSHOP_CONTEXT_ERROR_CODE,
              message: INVALID_BARBERSHOP_CONTEXT_MESSAGE,
            };
          }

          const parsedDate = parseBookingDateTime(date);
          if (!parsedDate) {
            return {
              success: false,
              errorCode: "VALIDATION_ERROR",
              message: INVALID_BOOKING_DATE_TIME_MESSAGE,
            };
          }

          try {
            const createBookingResult = await createBookingCheckoutSession({
              barbershopId,
              barberId,
              serviceIds: [serviceId],
              startAt: parsedDate,
              paymentMethod: paymentMethod ?? "IN_PERSON",
            });

            const validationMessage = getValidationErrorMessage(
              createBookingResult.validationErrors,
            );
            if (validationMessage) {
              return {
                success: false,
                errorCode: "VALIDATION_ERROR",
                message: validationMessage,
              };
            }

            const serverMessage = getServerErrorMessage(createBookingResult.serverError);
            if (serverMessage) {
              return {
                success: false,
                errorCode: isUnauthorizedErrorMessage(serverMessage)
                  ? "UNAUTHORIZED"
                  : "SERVER_ERROR",
                message: serverMessage,
              };
            }

            const checkoutResult = createBookingResult.data;
            if (!checkoutResult) {
              return {
                success: false,
                errorCode: "UNKNOWN_ERROR",
                message: "Não foi possível criar o agendamento.",
              };
            }

            if (checkoutResult.kind === "stripe") {
              return {
                success: true,
                bookingId: checkoutResult.bookingId,
                requiresCheckout: true,
                sessionId: checkoutResult.sessionId,
                checkoutUrl: checkoutResult.checkoutUrl,
              };
            }

            return {
              success: true,
              bookingId: checkoutResult.bookingId,
              requiresCheckout: false,
            };
          } catch (error) {
            console.error("createBooking error", error);

            const errorMessage =
              error instanceof Error ? error.message : "Erro desconhecido ao criar agendamento.";

            return {
              success: false,
              errorCode: isUnauthorizedErrorMessage(errorMessage)
                ? "UNAUTHORIZED"
                : "SERVER_ERROR",
              message: errorMessage,
            };
          }
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse();
};
