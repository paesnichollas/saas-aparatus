import { createBooking } from "@/actions/create-booking";
import { auth } from "@/lib/auth";
import { parseBookingDateTime } from "@/lib/booking-time";
import {
  PROFILE_INCOMPLETE_ERROR_MESSAGE,
  PROFILE_INCOMPLETE_CODE,
  buildCompleteProfileUrl,
  getSafeReturnToPath,
  isProfileIncompleteCode,
} from "@/lib/profile-completion";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
  barbershopId: z.uuid(),
  serviceId: z.uuid(),
  barberId: z.uuid(),
  date: z.string().trim().min(1),
});

const INVALID_REQUEST_MESSAGE = "Requisicao invalida.";
const INVALID_DATE_MESSAGE =
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

const isUnauthorizedErrorMessage = (message: string) => {
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes("nao autorizado") || normalizedMessage.includes("login");
};

const isProfileIncompleteErrorMessage = (message: string) => {
  return isProfileIncompleteCode(message);
};

const isConflictErrorMessage = (message: string) => {
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes("agendad") || normalizedMessage.includes("ocupad");
};

const getCompleteProfileRedirectUrlFromRequest = (request: Request) => {
  const refererHeader = request.headers.get("referer");

  if (!refererHeader) {
    return buildCompleteProfileUrl("/");
  }

  try {
    const refererUrl = new URL(refererHeader);
    const refererPath = `${refererUrl.pathname}${refererUrl.search}`;
    return buildCompleteProfileUrl(getSafeReturnToPath(refererPath));
  } catch {
    return buildCompleteProfileUrl("/");
  }
};

export const POST = async (request: Request) => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return NextResponse.json(
      {
        error: "Nao autorizado.",
      },
      { status: 401 },
    );
  }

  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: INVALID_REQUEST_MESSAGE,
      },
      { status: 400 },
    );
  }

  const parsedRequest = requestSchema.safeParse(requestBody);
  if (!parsedRequest.success) {
    return NextResponse.json(
      {
        error: INVALID_REQUEST_MESSAGE,
      },
      { status: 400 },
    );
  }

  const bookingDate = parseBookingDateTime(parsedRequest.data.date);
  if (!bookingDate) {
    return NextResponse.json(
      {
        error: INVALID_DATE_MESSAGE,
      },
      { status: 400 },
    );
  }

  const createBookingResult = await createBooking({
    barbershopId: parsedRequest.data.barbershopId,
    serviceId: parsedRequest.data.serviceId,
    barberId: parsedRequest.data.barberId,
    date: bookingDate,
  });

  const validationMessage = getValidationErrorMessage(
    createBookingResult.validationErrors,
  );
  if (validationMessage) {
    return NextResponse.json(
      {
        error: validationMessage,
      },
      { status: isConflictErrorMessage(validationMessage) ? 409 : 400 },
    );
  }

  const serverMessage = getServerErrorMessage(createBookingResult.serverError);
  if (serverMessage) {
    if (isProfileIncompleteErrorMessage(serverMessage)) {
      return NextResponse.json(
        {
          code: PROFILE_INCOMPLETE_CODE,
          error: PROFILE_INCOMPLETE_ERROR_MESSAGE,
          redirectTo: getCompleteProfileRedirectUrlFromRequest(request),
        },
        { status: 403 },
      );
    }

    return NextResponse.json(
      {
        error: serverMessage,
      },
      { status: isUnauthorizedErrorMessage(serverMessage) ? 401 : 500 },
    );
  }

  if (!createBookingResult.data) {
    return NextResponse.json(
      {
        error: "Nao foi possivel criar a reserva.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      bookingId: createBookingResult.data.id,
    },
    { status: 201 },
  );
};
