"use client";

import { Loader2, Mail, Phone, UserRound } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBrPhoneDigits } from "@/lib/phone-normalization";
import {
  EMAIL_IN_USE_CODE,
  PROFILE_INCOMPLETE_FIELDS_CODE,
} from "@/lib/profile-completion";
import { type UserProvider } from "@/lib/user-provider";
import { formatPhoneBR } from "@/lib/utils";

interface CompleteProfilePageClientProps {
  initialName: string;
  initialPhone: string;
  initialContactEmail: string;
  initialPhoneVerified: boolean;
  provider: UserProvider;
  hasPasswordAccount: boolean;
  returnTo: string;
}

interface ApiErrorResponse {
  code?: string;
  error?: string;
  fields?: Record<string, string>;
  devCode?: string;
  expiresAt?: string;
  retryAfterSeconds?: number;
}

interface FormFieldErrors {
  name?: string;
  phone?: string;
  phoneVerified?: string;
  contactEmail?: string;
  code?: string;
  password?: string;
}

const MIN_NAME_LENGTH = 2;
const MIN_PHONE_LENGTH = 10;
const MAX_PHONE_LENGTH = 11;

const normalizePhoneNumber = (phoneNumber: string) => {
  return phoneNumber.replace(/\D/g, "");
};

const isValidContactEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const CompleteProfilePageClient = ({
  initialName,
  initialPhone,
  initialContactEmail,
  initialPhoneVerified,
  provider,
  hasPasswordAccount,
  returnTo,
}: CompleteProfilePageClientProps) => {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [phoneDigits, setPhoneDigits] = useState(
    getBrPhoneDigits(initialPhone).slice(0, MAX_PHONE_LENGTH),
  );
  const [contactEmail, setContactEmail] = useState(initialContactEmail);
  const [otpCode, setOtpCode] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
  const [isPhoneVerified, setIsPhoneVerified] = useState(initialPhoneVerified);
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({});
  const [isStartingVerification, setIsStartingVerification] = useState(false);
  const [isConfirmingVerification, setIsConfirmingVerification] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requiresPhoneVerification = useMemo(() => {
    return provider === "phone" || provider === "google";
  }, [provider]);

  const canCompleteProfile = useMemo(() => {
    const normalizedName = name.trim().replace(/\s+/g, " ");

    if (normalizedName.length < MIN_NAME_LENGTH) {
      return false;
    }

    if (requiresPhoneVerification && !isPhoneVerified) {
      return false;
    }

    if (provider === "credentials" && !hasPasswordAccount) {
      return false;
    }

    return true;
  }, [hasPasswordAccount, isPhoneVerified, name, provider, requiresPhoneVerification]);

  const clearFieldError = (fieldName: keyof FormFieldErrors) => {
    setFieldErrors((previousErrors) => {
      if (!previousErrors[fieldName]) {
        return previousErrors;
      }

      const nextErrors = { ...previousErrors };
      delete nextErrors[fieldName];
      return nextErrors;
    });
  };

  const applyApiErrorResponse = (responseJson: ApiErrorResponse | null) => {
    if (!responseJson) {
      return;
    }

    if (responseJson.fields && typeof responseJson.fields === "object") {
      setFieldErrors((previousErrors) => ({
        ...previousErrors,
        ...responseJson.fields,
      }));
    }
  };

  const handleStartPhoneVerification = async () => {
    const normalizedPhone = normalizePhoneNumber(phoneDigits).slice(
      0,
      MAX_PHONE_LENGTH,
    );

    if (
      normalizedPhone.length < MIN_PHONE_LENGTH ||
      normalizedPhone.length > MAX_PHONE_LENGTH
    ) {
      setFieldErrors((previousErrors) => ({
        ...previousErrors,
        phone: "Informe um telefone valido.",
      }));
      return;
    }

    clearFieldError("phone");
    clearFieldError("phoneVerified");
    clearFieldError("code");
    setIsStartingVerification(true);

    try {
      const response = await fetch("/api/users/me/phone/start-verification", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          phone: normalizedPhone,
        }),
      });

      let responseJson: ApiErrorResponse | null = null;

      try {
        responseJson = (await response.json()) as ApiErrorResponse;
      } catch {
        responseJson = null;
      }

      if (!response.ok) {
        applyApiErrorResponse(responseJson);
        toast.error(
          responseJson?.error ??
            "Nao foi possivel iniciar a verificacao de telefone.",
        );
        return;
      }

      setIsPhoneVerified(false);
      setOtpExpiresAt(responseJson?.expiresAt ?? null);

      if (responseJson?.devCode) {
        toast.success(`Codigo enviado. Use ${responseJson.devCode} para validar.`);
      } else {
        toast.success("Codigo enviado por SMS.");
      }
    } catch {
      toast.error("Nao foi possivel iniciar a verificacao de telefone.");
    } finally {
      setIsStartingVerification(false);
    }
  };

  const handleConfirmPhoneVerification = async () => {
    const normalizedCode = otpCode.trim();

    if (!/^\d{6}$/.test(normalizedCode)) {
      setFieldErrors((previousErrors) => ({
        ...previousErrors,
        code: "Informe o codigo de 6 digitos.",
      }));
      return;
    }

    clearFieldError("code");
    setIsConfirmingVerification(true);

    try {
      const response = await fetch("/api/users/me/phone/confirm-verification", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          code: normalizedCode,
        }),
      });

      let responseJson: ApiErrorResponse | null = null;

      try {
        responseJson = (await response.json()) as ApiErrorResponse;
      } catch {
        responseJson = null;
      }

      if (!response.ok) {
        applyApiErrorResponse(responseJson);
        toast.error(responseJson?.error ?? "Codigo invalido ou expirado.");
        return;
      }

      setIsPhoneVerified(true);
      clearFieldError("phoneVerified");
      setOtpCode("");
      toast.success("Telefone verificado com sucesso.");
    } catch {
      toast.error("Nao foi possivel confirmar o codigo.");
    } finally {
      setIsConfirmingVerification(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = name.trim().replace(/\s+/g, " ");
    const normalizedContactEmail = contactEmail.trim().toLowerCase();

    const nextFieldErrors: FormFieldErrors = {};

    if (normalizedName.length < MIN_NAME_LENGTH) {
      nextFieldErrors.name = "Informe um nome valido.";
    }

    if (normalizedContactEmail && !isValidContactEmail(normalizedContactEmail)) {
      nextFieldErrors.contactEmail = "Informe um email valido.";
    }

    if (requiresPhoneVerification && !isPhoneVerified) {
      nextFieldErrors.phoneVerified =
        "Verifique seu telefone antes de concluir o cadastro.";
    }

    if (provider === "credentials" && !hasPasswordAccount) {
      nextFieldErrors.password =
        "Defina uma senha na conta para concluir o cadastro.";
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/users/me/complete-profile", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: normalizedName,
          contactEmail: normalizedContactEmail,
        }),
      });

      let responseJson: ApiErrorResponse | null = null;

      try {
        responseJson = (await response.json()) as ApiErrorResponse;
      } catch {
        responseJson = null;
      }

      if (!response.ok) {
        if (
          response.status === 422 &&
          responseJson?.code === PROFILE_INCOMPLETE_FIELDS_CODE
        ) {
          applyApiErrorResponse(responseJson);
        }

        if (response.status === 409 && responseJson?.code === EMAIL_IN_USE_CODE) {
          setFieldErrors((previousErrors) => ({
            ...previousErrors,
            contactEmail:
              responseJson?.fields?.contactEmail ??
              responseJson?.error ??
              "Este email ja esta em uso.",
          }));
        }

        toast.error(responseJson?.error ?? "Nao foi possivel concluir seu cadastro.");
        return;
      }

      toast.success("Cadastro concluido com sucesso.");
      router.replace(returnTo);
      router.refresh();
    } catch {
      toast.error("Nao foi possivel concluir seu cadastro.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-2">
          <CardTitle>Complete seu cadastro</CardTitle>
          <p className="text-muted-foreground text-sm">
            Precisamos de alguns dados antes de liberar reservas e acesso ao
            painel.
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="complete-profile-name">Nome</Label>
              <div className="relative">
                <UserRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  id="complete-profile-name"
                  value={name}
                  autoComplete="name"
                  onChange={(event) => {
                    setName(event.target.value);
                    clearFieldError("name");
                  }}
                  className="pl-9"
                  placeholder="Seu nome completo"
                  required
                  disabled={isSubmitting}
                />
              </div>
              {fieldErrors.name ? (
                <p className="text-destructive text-xs">{fieldErrors.name}</p>
              ) : null}
            </div>

            {requiresPhoneVerification ? (
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="complete-profile-phone">Telefone</Label>
                  {isPhoneVerified ? (
                    <Badge variant="outline">Telefone verificado</Badge>
                  ) : null}
                </div>

                <div className="relative">
                  <Phone className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <Input
                    id="complete-profile-phone"
                    type="tel"
                    inputMode="tel"
                    value={formatPhoneBR(phoneDigits)}
                    autoComplete="tel"
                    onChange={(event) => {
                      setPhoneDigits(
                        normalizePhoneNumber(event.target.value).slice(
                          0,
                          MAX_PHONE_LENGTH,
                        ),
                      );
                      setIsPhoneVerified(false);
                      clearFieldError("phone");
                      clearFieldError("phoneVerified");
                    }}
                    className="pl-9"
                    placeholder="(11) 99999-9999"
                    required
                    disabled={
                      isSubmitting || isStartingVerification || isConfirmingVerification
                    }
                  />
                </div>

                {fieldErrors.phone ? (
                  <p className="text-destructive text-xs">{fieldErrors.phone}</p>
                ) : null}

                {!isPhoneVerified ? (
                  <div className="space-y-3">
                    <p className="text-muted-foreground text-xs">
                      Verifique seu telefone com o codigo OTP para concluir o
                      cadastro.
                    </p>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleStartPhoneVerification}
                        disabled={
                          isSubmitting ||
                          isStartingVerification ||
                          isConfirmingVerification
                        }
                      >
                        {isStartingVerification ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          "Enviar codigo"
                        )}
                      </Button>

                      <div className="flex flex-1 gap-2">
                        <Input
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={6}
                          value={otpCode}
                          onChange={(event) => {
                            setOtpCode(
                              event.target.value.replace(/\D/g, "").slice(0, 6),
                            );
                            clearFieldError("code");
                          }}
                          placeholder="Codigo de 6 digitos"
                          disabled={
                            isSubmitting ||
                            isStartingVerification ||
                            isConfirmingVerification
                          }
                        />
                        <Button
                          type="button"
                          onClick={handleConfirmPhoneVerification}
                          disabled={
                            isSubmitting ||
                            isStartingVerification ||
                            isConfirmingVerification
                          }
                        >
                          {isConfirmingVerification ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            "Confirmar"
                          )}
                        </Button>
                      </div>
                    </div>

                    {otpExpiresAt ? (
                      <p className="text-muted-foreground text-xs">
                        Codigo valido ate{" "}
                        {new Date(otpExpiresAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        .
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {fieldErrors.code ? (
                  <p className="text-destructive text-xs">{fieldErrors.code}</p>
                ) : null}
                {fieldErrors.phoneVerified ? (
                  <p className="text-destructive text-xs">
                    {fieldErrors.phoneVerified}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="complete-profile-contact-email">Email (opcional)</Label>
              <div className="relative">
                <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  id="complete-profile-contact-email"
                  type="email"
                  value={contactEmail}
                  autoComplete="email"
                  onChange={(event) => {
                    setContactEmail(event.target.value);
                    clearFieldError("contactEmail");
                  }}
                  className="pl-9"
                  placeholder="voce@exemplo.com"
                  disabled={isSubmitting}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Se tiver, ajuda na recuperacao da conta e recebimento de
                comprovantes.
              </p>
              {provider === "phone" ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    setContactEmail("");
                    clearFieldError("contactEmail");
                  }}
                  disabled={isSubmitting}
                >
                  Pular email por enquanto
                </Button>
              ) : null}
              {fieldErrors.contactEmail ? (
                <p className="text-destructive text-xs">
                  {fieldErrors.contactEmail}
                </p>
              ) : null}
            </div>

            {fieldErrors.password ? (
              <p className="text-destructive text-xs">{fieldErrors.password}</p>
            ) : null}

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || !canCompleteProfile}
            >
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Concluir cadastro"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
};

export default CompleteProfilePageClient;
