import { google } from "@ai-sdk/google";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import { NextResponse } from "next/server";
import z from "zod";

import { createBooking } from "@/actions/create-booking";
import { getDateAvailableTimeSlots } from "@/actions/get-date-available-time-slots";
import { listBarbersByBarbershop } from "@/data/barbers";
import { parseBookingDateOnly, parseBookingDateTime } from "@/lib/booking-time";
import { prisma } from "@/lib/prisma";

const INVALID_BARBERSHOP_CONTEXT_MESSAGE = "Contexto da barbearia inválido";
const FORBIDDEN_BARBERSHOP_CONTEXT_ERROR_CODE = "FORBIDDEN_CONTEXT";
const INVALID_DATE_ONLY_MESSAGE = "Data invalida. Use o formato YYYY-MM-DD.";
const INVALID_BOOKING_DATE_TIME_MESSAGE =
  "Data e horario invalidos. Use o formato YYYY-MM-DDTHH:mm:ss.";

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

const isUnauthorizedErrorMessage = (message: string | null) => {
  if (!message) {
    return false;
  }

  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes("nao autorizado") || normalizedMessage.includes("login");
};

const getSystemPrompt = (isExclusiveContext: boolean) => {
  const exclusiveModeInstructions = isExclusiveContext
    ? `MODO EXCLUSIVO (OBRIGATORIO):
- Voce esta em contexto exclusivo de UMA barbearia especifica.
- NUNCA ofereca, liste ou consulte dados de outras barbearias.
- Em caso de erro de contexto, informe exatamente: "Contexto da barbearia inválido".
- Nao tente contornar o contexto pedindo outro barbershopId.`
    : `MODO GLOBAL:
- Voce pode buscar e apresentar barbearias normalmente, conforme as ferramentas retornarem dados.`;

  return `Voce e o Agenda.ai, um assistente virtual de agendamento de barbearias.

DATA ATUAL: Hoje e ${new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })} (${new Date().toISOString().split("T")[0]})

${exclusiveModeInstructions}

Seu objetivo e ajudar os usuarios a:
- Encontrar barbearias (por nome ou todas disponiveis)
- Escolher um barbeiro da barbearia escolhida
- Verificar disponibilidade de horarios para um barbeiro especifico
- Fornecer informacoes sobre servicos e precos
- Criar agendamentos quando o usuario confirmar

Fluxo de atendimento:

CENARIO 1 - Usuario menciona data/horario na primeira mensagem (ex: "quero um corte pra hoje", "preciso cortar o cabelo amanha", "quero marcar para sexta"):
1. Use a ferramenta searchBarbershops para buscar barbearias.
2. Quando o usuario escolher uma barbearia, use listBarbersByBarbershop com o barbershopId escolhido.
3. Se nao houver barbeiros na barbearia:
   - informe exatamente: "Esta barbearia ainda nao possui barbeiros cadastrados. Peca para o estabelecimento cadastrar barbeiros no painel administrativo."
   - NAO avance para horarios e NAO tente criar reserva.
4. Depois que o usuario escolher um barbeiro, use getAvailableTimeSlotsForBarbershop para buscar horarios.
5. Apresente as opcoes com horarios disponiveis, mostrando:
   - Nome da barbearia
   - Nome do barbeiro
   - Endereco
   - Servicos oferecidos com precos
   - Alguns horarios disponiveis (4-5 opcoes espacadas)
6. Quando o usuario escolher, forneca o resumo final.

CENARIO 2 - Usuario nao menciona data/horario inicialmente:
1. Use a ferramenta searchBarbershops para buscar barbearias.
2. Apresente as barbearias encontradas com:
   - Nome da barbearia
   - Endereco
   - Servicos oferecidos com precos
3. Quando o usuario demonstrar interesse em uma barbearia especifica, use listBarbersByBarbershop.
4. O usuario precisa escolher um barbeiro antes de consultar horarios.
5. Quando o usuario escolher barbeiro e data, use getAvailableTimeSlotsForBarbershop com barbershopId, barberId, serviceId e data.
6. Apresente os horarios disponiveis (liste alguns horarios, nao todos - sugira 4-5 opcoes espacadas).

Resumo final (quando o usuario escolher):
- Nome da barbearia
- Endereco
- Barbeiro escolhido
- Servico escolhido
- Data e horario escolhido
- Preco

Criacao da reserva:
- Apos o usuario confirmar explicitamente a escolha (ex: "confirmo", "pode agendar", "quero esse horario"), use createBooking.
- Parametros obrigatorios:
  * barbershopId: ID da barbearia escolhida
  * serviceId: ID do servico escolhido
  * barberId: ID do barbeiro escolhido
  * date: Data e horario no formato ISO (YYYY-MM-DDTHH:mm:ss) - exemplo: "2025-11-05T10:00:00"
- NUNCA tente criar reserva sem barberId escolhido.
- Se a criacao for bem-sucedida (success: true), informe ao usuario que a reserva foi confirmada com sucesso.
- Se houver erro (success: false), explique o erro ao usuario:
  * Se o errorCode for "UNAUTHORIZED", informe que e necessario fazer login para criar uma reserva.
  * Para outros erros, informe que houve um problema e peca para tentar novamente.

Importante:
- NUNCA mostre informacoes tecnicas ao usuario (barbershopId, barberId, serviceId, formatos ISO de data, etc.)
- Seja sempre educado, prestativo e use uma linguagem informal e amigavel
- Nao liste TODOS os horarios disponiveis, sugira apenas 4-5 opcoes espacadas ao longo do dia
- Se nao houver horarios disponiveis, sugira uma data alternativa
- Quando o usuario mencionar "hoje", "amanha", "depois de amanha" ou dias da semana, calcule a data correta automaticamente`;
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

  let exclusiveBarbershop: Awaited<
    ReturnType<typeof prisma.barbershop.findUnique>
  > | null = null;

  if (hasBarbershopPublicSlugParam && requestedBarbershopPublicSlug.length > 0) {
    exclusiveBarbershop = await prisma.barbershop.findUnique({
      where: {
        slug: requestedBarbershopPublicSlug,
      },
      include: {
        services: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            name: "asc",
          },
        },
      },
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
          "Pesquisa barbearias pelo nome. Se nenhum nome e passado, retorna todas as barbearias.",
        inputSchema: z.object({
          name: z
            .string()
            .optional()
            .describe(
              "O nome da barbearia a ser pesquisada. Se nenhum nome e passado, retorna todas as barbearias.",
            ),
        }),
        execute: async ({ name }) => {
          console.log("searchBarbershops", name, {
            isExclusiveContext,
            exclusiveBarbershopId,
          });

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
              include: {
                services: {
                  where: {
                    deletedAt: null,
                  },
                  orderBy: {
                    name: "asc",
                  },
                },
              },
            });
          }

          return prisma.barbershop.findMany({
            where: {
              name: {
                contains: name,
                mode: "insensitive",
              },
            },
            include: {
              services: {
                where: {
                  deletedAt: null,
                },
                orderBy: {
                  name: "asc",
                },
              },
            },
          });
        },
      }),
      listBarbersByBarbershop: tool({
        description:
          "Lista os barbeiros ativos de uma barbearia para o usuario escolher antes do horario.",
        inputSchema: z.object({
          barbershopId: z.uuid(),
        }),
        execute: async ({ barbershopId }) => {
          console.log("listBarbersByBarbershop", barbershopId, {
            isExclusiveContext,
            exclusiveBarbershopId,
          });

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
          "Obtem os horarios disponiveis para uma barbearia e barbeiro especificos.",
        inputSchema: z.object({
          barbershopId: z.string().uuid(),
          barberId: z.string().uuid(),
          serviceId: z.string().uuid(),
          date: z
            .string()
            .describe(
              "A data no formato ISO (YYYY-MM-DD) para a qual voce deseja verificar os horarios disponiveis.",
            ),
        }),
        execute: async ({ barbershopId, barberId, serviceId, date }) => {
          console.log("getAvailableTimeSlotsForBarbershop", {
            barbershopId,
            barberId,
            serviceId,
            date,
            isExclusiveContext,
            exclusiveBarbershopId,
          });

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
              message: "Nao foi possivel consultar os horarios agora.",
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
          "Cria um novo agendamento para um servico especifico em uma data especifica.",
        inputSchema: z.object({
          barbershopId: z.uuid(),
          serviceId: z.uuid(),
          barberId: z.uuid(),
          date: z
            .string()
            .describe(
              "A data e horario no formato ISO (YYYY-MM-DDTHH:mm:ss) para criar o agendamento.",
            ),
        }),
        execute: async ({ barbershopId, serviceId, barberId, date }) => {
          console.log("createBooking", {
            barbershopId,
            serviceId,
            barberId,
            date,
            isExclusiveContext,
            exclusiveBarbershopId,
          });

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
            const createBookingResult = await createBooking({
              barbershopId,
              serviceId,
              barberId,
              date: parsedDate,
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

            if (!createBookingResult.data) {
              return {
                success: false,
                errorCode: "UNKNOWN_ERROR",
                message: "Nao foi possivel criar a reserva.",
              };
            }

            return {
              success: true,
              bookingId: createBookingResult.data.id,
            };
          } catch (error) {
            console.error("createBooking error", error);

            const errorMessage =
              error instanceof Error ? error.message : "Erro desconhecido ao criar reserva.";

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
