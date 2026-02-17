import "server-only";

import { createHash, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import { prisma } from "./prisma";

const PHONE_OTP_IDENTIFIER_PREFIX = "phone-verification";
const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_WINDOW_MINUTES = 15;
const OTP_MAX_SENDS_PER_WINDOW = 5;
const OTP_MAX_CONFIRM_ATTEMPTS = 5;

interface PhoneOtpState {
  phone: string;
  codeHash: string;
  attempts: number;
  sentAt: string;
  windowStartedAt: string;
  sentCountInWindow: number;
}

interface PhoneOtpRateLimit {
  retryAfterSeconds: number;
}

type StartPhoneOtpResult =
  | {
      ok: true;
      code: string;
      expiresAt: Date;
      retryAfterSeconds: number;
    }
  | {
      ok: false;
      reason: "rate_limited";
      rateLimit: PhoneOtpRateLimit;
    };

type ConfirmPhoneOtpResult =
  | {
      ok: true;
      phone: string;
    }
  | {
      ok: false;
      reason: "missing" | "expired" | "invalid_code" | "too_many_attempts";
    };

const getPhoneOtpIdentifier = (userId: string) => {
  return `${PHONE_OTP_IDENTIFIER_PREFIX}:${userId}`;
};

const getOtpSecret = () => {
  return process.env.BETTER_AUTH_SECRET ?? "phone-otp-fallback-secret";
};

const hashOtpCode = (code: string) => {
  return createHash("sha256")
    .update(`${getOtpSecret()}:${code}`)
    .digest("hex");
};

const getOtpCode = () => {
  return randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, "0");
};

const parsePhoneOtpState = (value: string): PhoneOtpState | null => {
  try {
    const parsedValue = JSON.parse(value) as Partial<PhoneOtpState>;

    if (
      typeof parsedValue.phone !== "string" ||
      typeof parsedValue.codeHash !== "string" ||
      typeof parsedValue.attempts !== "number" ||
      typeof parsedValue.sentAt !== "string" ||
      typeof parsedValue.windowStartedAt !== "string" ||
      typeof parsedValue.sentCountInWindow !== "number"
    ) {
      return null;
    }

    return {
      phone: parsedValue.phone,
      codeHash: parsedValue.codeHash,
      attempts: parsedValue.attempts,
      sentAt: parsedValue.sentAt,
      windowStartedAt: parsedValue.windowStartedAt,
      sentCountInWindow: parsedValue.sentCountInWindow,
    };
  } catch {
    return null;
  }
};

const hasReachedSendLimit = (state: PhoneOtpState, now: Date) => {
  const sentAtTimestamp = new Date(state.sentAt).getTime();
  const windowStartedAtTimestamp = new Date(state.windowStartedAt).getTime();
  const nowTimestamp = now.getTime();

  const retryAfterSeconds =
    OTP_RESEND_COOLDOWN_SECONDS -
    Math.floor((nowTimestamp - sentAtTimestamp) / 1000);

  if (retryAfterSeconds > 0) {
    return {
      limited: true,
      retryAfterSeconds,
      sentCountInWindow: state.sentCountInWindow,
      windowStartedAt: new Date(windowStartedAtTimestamp),
    };
  }

  const isWithinWindow =
    nowTimestamp - windowStartedAtTimestamp < OTP_WINDOW_MINUTES * 60_000;
  const windowStart = isWithinWindow ? new Date(windowStartedAtTimestamp) : now;
  const sentCount = isWithinWindow ? state.sentCountInWindow : 0;

  if (sentCount >= OTP_MAX_SENDS_PER_WINDOW) {
    return {
      limited: true,
      retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      sentCountInWindow: sentCount,
      windowStartedAt: windowStart,
    };
  }

  return {
    limited: false,
    retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    sentCountInWindow: sentCount,
    windowStartedAt: windowStart,
  };
};

const isOtpCodeMatch = (providedCode: string, expectedCodeHash: string) => {
  const providedCodeHash = hashOtpCode(providedCode);
  const providedBuffer = Buffer.from(providedCodeHash);
  const expectedBuffer = Buffer.from(expectedCodeHash);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
};

const findLatestPhoneOtp = async (userId: string) => {
  return prisma.verification.findFirst({
    where: {
      identifier: getPhoneOtpIdentifier(userId),
    },
    orderBy: {
      createdAt: "desc",
    },
  });
};

export const startPhoneVerificationOtp = async ({
  userId,
  phone,
}: {
  userId: string;
  phone: string;
}): Promise<StartPhoneOtpResult> => {
  const existingOtp = await findLatestPhoneOtp(userId);
  const now = new Date();

  let nextSentCount = 1;
  let windowStartedAt = now;

  if (existingOtp) {
    const existingState = parsePhoneOtpState(existingOtp.value);
    const isExpired = existingOtp.expiresAt.getTime() <= now.getTime();

    if (existingState && !isExpired) {
      const rateLimitInfo = hasReachedSendLimit(existingState, now);

      if (rateLimitInfo.limited) {
        return {
          ok: false,
          reason: "rate_limited",
          rateLimit: {
            retryAfterSeconds: Math.max(1, rateLimitInfo.retryAfterSeconds),
          },
        };
      }

      nextSentCount = rateLimitInfo.sentCountInWindow + 1;
      windowStartedAt = rateLimitInfo.windowStartedAt;
    }
  }

  const code = getOtpCode();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60_000);
  const nextState: PhoneOtpState = {
    phone,
    codeHash: hashOtpCode(code),
    attempts: 0,
    sentAt: now.toISOString(),
    windowStartedAt: windowStartedAt.toISOString(),
    sentCountInWindow: nextSentCount,
  };

  await prisma.verification.deleteMany({
    where: {
      identifier: getPhoneOtpIdentifier(userId),
    },
  });

  await prisma.verification.create({
    data: {
      id: randomUUID(),
      identifier: getPhoneOtpIdentifier(userId),
      value: JSON.stringify(nextState),
      expiresAt,
    },
    select: {
      id: true,
    },
  });

  return {
    ok: true,
    code,
    expiresAt,
    retryAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
  };
};

export const confirmPhoneVerificationOtp = async ({
  userId,
  code,
}: {
  userId: string;
  code: string;
}): Promise<ConfirmPhoneOtpResult> => {
  const existingOtp = await findLatestPhoneOtp(userId);
  const now = new Date();

  if (!existingOtp) {
    return {
      ok: false,
      reason: "missing",
    };
  }

  const existingState = parsePhoneOtpState(existingOtp.value);
  if (!existingState) {
    await prisma.verification.delete({
      where: {
        id: existingOtp.id,
      },
    });

    return {
      ok: false,
      reason: "missing",
    };
  }

  if (existingOtp.expiresAt.getTime() <= now.getTime()) {
    await prisma.verification.delete({
      where: {
        id: existingOtp.id,
      },
    });

    return {
      ok: false,
      reason: "expired",
    };
  }

  if (existingState.attempts >= OTP_MAX_CONFIRM_ATTEMPTS) {
    await prisma.verification.delete({
      where: {
        id: existingOtp.id,
      },
    });

    return {
      ok: false,
      reason: "too_many_attempts",
    };
  }

  const normalizedCode = code.trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    const nextAttempts = existingState.attempts + 1;

    if (nextAttempts >= OTP_MAX_CONFIRM_ATTEMPTS) {
      await prisma.verification.delete({
        where: {
          id: existingOtp.id,
        },
      });

      return {
        ok: false,
        reason: "too_many_attempts",
      };
    }

    await prisma.verification.update({
      where: {
        id: existingOtp.id,
      },
      data: {
        value: JSON.stringify({
          ...existingState,
          attempts: nextAttempts,
        } satisfies PhoneOtpState),
      },
      select: {
        id: true,
      },
    });

    return {
      ok: false,
      reason: "invalid_code",
    };
  }

  const isMatchingCode = isOtpCodeMatch(normalizedCode, existingState.codeHash);
  if (!isMatchingCode) {
    const nextAttempts = existingState.attempts + 1;

    if (nextAttempts >= OTP_MAX_CONFIRM_ATTEMPTS) {
      await prisma.verification.delete({
        where: {
          id: existingOtp.id,
        },
      });

      return {
        ok: false,
        reason: "too_many_attempts",
      };
    }

    await prisma.verification.update({
      where: {
        id: existingOtp.id,
      },
      data: {
        value: JSON.stringify({
          ...existingState,
          attempts: nextAttempts,
        } satisfies PhoneOtpState),
      },
      select: {
        id: true,
      },
    });

    return {
      ok: false,
      reason: "invalid_code",
    };
  }

  await prisma.verification.delete({
    where: {
      id: existingOtp.id,
    },
  });

  return {
    ok: true,
    phone: existingState.phone,
  };
};
