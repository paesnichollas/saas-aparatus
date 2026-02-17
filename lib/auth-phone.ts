import { createHash } from "node:crypto";

const PHONE_AUTH_PASSWORD_NAMESPACE = "phone-auth";
const PHONE_AUTH_EMAIL_DOMAIN = "phone.local";
const MIN_PHONE_LENGTH = 10;
const MAX_PHONE_LENGTH = 15;
const PHONE_AUTH_EMAIL_SUFFIX = `@${PHONE_AUTH_EMAIL_DOMAIN}`;

export const normalizePhoneNumber = (phoneNumber: string) => {
  return phoneNumber.replace(/\D/g, "");
};

export const isValidPhoneNumber = (phoneNumber: string) => {
  return (
    phoneNumber.length >= MIN_PHONE_LENGTH &&
    phoneNumber.length <= MAX_PHONE_LENGTH
  );
};

export const getPhoneAuthEmail = (normalizedPhoneNumber: string) => {
  return `${normalizedPhoneNumber}${PHONE_AUTH_EMAIL_SUFFIX}`;
};

export const isPhoneAuthEmail = (email: string) => {
  return email.trim().toLowerCase().endsWith(PHONE_AUTH_EMAIL_SUFFIX);
};

export const getPhoneNumberFromPhoneAuthEmail = (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();

  if (!isPhoneAuthEmail(normalizedEmail)) {
    return null;
  }

  const phoneNumber = normalizedEmail.slice(0, -PHONE_AUTH_EMAIL_SUFFIX.length);

  if (!/^\d+$/.test(phoneNumber)) {
    return null;
  }

  if (!isValidPhoneNumber(phoneNumber)) {
    return null;
  }

  return phoneNumber;
};

export const getPhoneAuthPassword = (normalizedPhoneNumber: string) => {
  const authSecret = process.env.BETTER_AUTH_SECRET;

  if (!authSecret) {
    throw new Error("BETTER_AUTH_SECRET is required for phone auth.");
  }

  return createHash("sha256")
    .update(
      `${PHONE_AUTH_PASSWORD_NAMESPACE}:${normalizedPhoneNumber}:${authSecret}`,
    )
    .digest("hex");
};
