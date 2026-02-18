"use client";

import { Loader2, Mail, Phone, UserRound } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
  provider: UserProvider;
  hasPasswordAccount: boolean;
  returnTo: string;
}

interface ApiErrorResponse {
  code?: string;
  error?: string;
  fields?: Record<string, string>;
}

interface FormFieldErrors {
  name?: string;
  phone?: string;
  contactEmail?: string;
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
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const shouldShowContactEmail = provider !== "google";

  const requiresPhone = useMemo(() => {
    return provider === "phone" || provider === "google";
  }, [provider]);

  const canCompleteProfile = useMemo(() => {
    const normalizedName = name.trim().replace(/\s+/g, " ");

    if (normalizedName.length < MIN_NAME_LENGTH) {
      return false;
    }

    if (requiresPhone) {
      const normalizedPhone = normalizePhoneNumber(phoneDigits).slice(
        0,
        MAX_PHONE_LENGTH,
      );

      if (
        normalizedPhone.length < MIN_PHONE_LENGTH ||
        normalizedPhone.length > MAX_PHONE_LENGTH
      ) {
        return false;
      }
    }

    if (provider === "credentials" && !hasPasswordAccount) {
      return false;
    }

    return true;
  }, [hasPasswordAccount, name, phoneDigits, provider, requiresPhone]);

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = name.trim().replace(/\s+/g, " ");
    const normalizedContactEmail = contactEmail.trim().toLowerCase();
    const normalizedPhone = normalizePhoneNumber(phoneDigits).slice(
      0,
      MAX_PHONE_LENGTH,
    );

    const nextFieldErrors: FormFieldErrors = {};

    if (normalizedName.length < MIN_NAME_LENGTH) {
      nextFieldErrors.name = "Informe um nome valido.";
    }

    if (
      requiresPhone &&
      (normalizedPhone.length < MIN_PHONE_LENGTH ||
        normalizedPhone.length > MAX_PHONE_LENGTH)
    ) {
      nextFieldErrors.phone = "Informe um telefone valido.";
    }

    if (
      shouldShowContactEmail &&
      normalizedContactEmail &&
      !isValidContactEmail(normalizedContactEmail)
    ) {
      nextFieldErrors.contactEmail = "Informe um email valido.";
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
          ...(requiresPhone ? { phone: normalizedPhone } : {}),
          ...(shouldShowContactEmail
            ? { contactEmail: normalizedContactEmail }
            : {}),
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

        if (response.status === 409) {
          applyApiErrorResponse(responseJson);

          if (responseJson?.code === EMAIL_IN_USE_CODE) {
            setFieldErrors((previousErrors) => ({
              ...previousErrors,
              contactEmail:
                responseJson?.fields?.contactEmail ??
                responseJson?.error ??
                "Este email ja esta em uso.",
            }));
          }
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

            {requiresPhone ? (
              <div className="space-y-2 rounded-lg border p-4">
                <Label htmlFor="complete-profile-phone">Telefone</Label>
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
                      clearFieldError("phone");
                    }}
                    className="pl-9"
                    placeholder="(11) 99999-9999"
                    required
                    disabled={isSubmitting}
                  />
                </div>

                {fieldErrors.phone ? (
                  <p className="text-destructive text-xs">{fieldErrors.phone}</p>
                ) : null}
              </div>
            ) : null}

            {shouldShowContactEmail ? (
              <div className="space-y-2">
                <Label htmlFor="complete-profile-contact-email">
                  Email (opcional)
                </Label>
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
            ) : null}

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
