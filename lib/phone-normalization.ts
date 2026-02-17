const E164_PHONE_REGEX = /^\+[1-9]\d{9,14}$/;
const BRAZIL_COUNTRY_CODE = "55";

const getDigits = (value: string) => {
  return value.replace(/\D/g, "");
};

export const isValidE164Phone = (phone: string | null | undefined) => {
  if (!phone) {
    return false;
  }

  return E164_PHONE_REGEX.test(phone.trim());
};

export const normalizePhoneToE164 = (value: string) => {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.startsWith("+")) {
    const digits = getDigits(normalizedValue);
    const e164Phone = `+${digits}`;
    return isValidE164Phone(e164Phone) ? e164Phone : null;
  }

  let digits = getDigits(normalizedValue);
  if (!digits) {
    return null;
  }

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (/^\d{10,11}$/.test(digits)) {
    digits = `${BRAZIL_COUNTRY_CODE}${digits}`;
  } else if (!/^\d{11,15}$/.test(digits)) {
    return null;
  }

  const e164Phone = `+${digits}`;
  return isValidE164Phone(e164Phone) ? e164Phone : null;
};

export const getBrPhoneDigits = (value: string | null | undefined) => {
  if (!value) {
    return "";
  }

  const digits = getDigits(value);
  if (!digits) {
    return "";
  }

  if (digits.startsWith(BRAZIL_COUNTRY_CODE) && digits.length >= 12) {
    return digits.slice(2, 13);
  }

  if (digits.length > 11) {
    return digits.slice(-11);
  }

  return digits;
};
