"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Mail, Phone, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { updateMyProfile } from "@/actions/update-my-profile";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { getBrPhoneDigits } from "@/lib/phone-normalization";
import { type UserProvider } from "@/lib/user-provider";
import { formatPhoneBR } from "@/lib/utils";

interface ProfilePageClientProps {
  initialName: string;
  initialPhone: string;
  initialContactEmail: string;
  accountEmail: string;
  provider: UserProvider;
  isCompleteMode: boolean;
  returnTo: string;
}

const MIN_PHONE_LENGTH = 10;
const MAX_PHONE_LENGTH = 11;

const normalizePhoneDigits = (value: string) => {
  return value.replace(/\D/g, "");
};

const isValidContactEmail = (value: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const createProfileFormSchema = ({
  requiresPhone,
  canEditContactEmail,
}: {
  requiresPhone: boolean;
  canEditContactEmail: boolean;
}) => {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(2, "Informe um nome valido.")
        .max(120, "Informe um nome com no maximo 120 caracteres."),
      phone: z.string().optional(),
      contactEmail: z.string().optional(),
    })
    .superRefine((values, ctx) => {
      if (requiresPhone) {
        const phoneDigits = normalizePhoneDigits(values.phone ?? "");

        if (
          phoneDigits.length < MIN_PHONE_LENGTH ||
          phoneDigits.length > MAX_PHONE_LENGTH
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["phone"],
            message: "Informe um telefone valido.",
          });
        }
      }

      if (canEditContactEmail) {
        const normalizedContactEmail = values.contactEmail?.trim().toLowerCase() ?? "";

        if (normalizedContactEmail && !isValidContactEmail(normalizedContactEmail)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["contactEmail"],
            message: "Informe um email valido.",
          });
        }
      }
    });
};

type FormValues = {
  name: string;
  phone?: string;
  contactEmail?: string;
};

const getValidationMessage = (fieldErrors?: { _errors?: string[] }) => {
  return fieldErrors?._errors?.[0] ?? null;
};

const ProfilePageClient = ({
  initialName,
  initialPhone,
  initialContactEmail,
  accountEmail,
  provider,
  isCompleteMode,
  returnTo,
}: ProfilePageClientProps) => {
  const router = useRouter();
  const requiresPhone = provider === "phone" || provider === "google";
  const canEditContactEmail = provider === "phone";
  const shouldShowReadOnlyEmail = provider === "credentials";

  const formSchema = useMemo(
    () => createProfileFormSchema({ requiresPhone, canEditContactEmail }),
    [canEditContactEmail, requiresPhone],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialName,
      phone: getBrPhoneDigits(initialPhone).slice(0, MAX_PHONE_LENGTH),
      contactEmail: initialContactEmail,
    },
  });

  const { executeAsync: executeUpdateMyProfile, isPending } =
    useAction(updateMyProfile);

  const handleSubmit = async (values: FormValues) => {
    const normalizedPhone = normalizePhoneDigits(values.phone ?? "").slice(
      0,
      MAX_PHONE_LENGTH,
    );
    const result = await executeUpdateMyProfile({
      name: values.name.trim(),
      ...(requiresPhone ? { phone: normalizedPhone } : {}),
      ...(canEditContactEmail
        ? { contactEmail: values.contactEmail?.trim().toLowerCase() ?? "" }
        : {}),
    });

    if (result.validationErrors) {
      const nameError = getValidationMessage(result.validationErrors.name);
      const phoneError = getValidationMessage(result.validationErrors.phone);
      const contactEmailError = getValidationMessage(
        result.validationErrors.contactEmail,
      );
      const rootError = getValidationMessage(result.validationErrors);

      if (nameError) {
        form.setError("name", {
          message: nameError,
        });
      }

      if (phoneError) {
        form.setError("phone", {
          message: phoneError,
        });
      }

      if (contactEmailError) {
        form.setError("contactEmail", {
          message: contactEmailError,
        });
      }

      if (rootError) {
        toast.error(rootError);
      } else if (!nameError && !phoneError && !contactEmailError) {
        toast.error("Nao foi possivel salvar seus dados.");
      }
      return;
    }

    if (result.serverError) {
      toast.error("Nao foi possivel salvar seus dados.");
      return;
    }

    if (!result.data) {
      toast.error("Nao foi possivel salvar seus dados.");
      return;
    }

    toast.success("Perfil atualizado com sucesso.");

    if (isCompleteMode && result.data.profileComplete) {
      router.replace(returnTo);
      router.refresh();
      return;
    }

    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-bold">
          {isCompleteMode ? "Finalize seu cadastro" : "Meu perfil"}
        </h1>
        <p className="text-muted-foreground text-sm">
          Atualize seus dados para manter sua conta completa.
        </p>
      </div>

      <Form {...form}>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit(handleSubmit)}
          noValidate
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <div className="relative">
                  <UserRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                  <FormControl>
                    <Input
                      placeholder="Seu nome completo"
                      autoComplete="name"
                      className="pl-9"
                      disabled={isPending}
                      {...field}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {requiresPhone ? (
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <div className="relative">
                    <Phone className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                    <FormControl>
                      <Input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="(11) 99999-9999"
                        className="pl-9"
                        value={formatPhoneBR(normalizePhoneDigits(field.value ?? ""))}
                        onChange={(event) => {
                          field.onChange(
                            normalizePhoneDigits(event.target.value).slice(
                              0,
                              MAX_PHONE_LENGTH,
                            ),
                          );
                        }}
                        disabled={isPending}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}

          {shouldShowReadOnlyEmail ? (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <div className="relative">
                <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  type="email"
                  value={accountEmail}
                  readOnly
                  className="pl-9"
                  disabled
                />
              </div>
              <FormDescription>
                O email principal da conta nao pode ser alterado nesta etapa.
              </FormDescription>
            </FormItem>
          ) : null}

          {canEditContactEmail ? (
            <FormField
              control={form.control}
              name="contactEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email (opcional)</FormLabel>
                  <div className="relative">
                    <Mail className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder="voce@exemplo.com"
                        className="pl-9"
                        disabled={isPending}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                  <FormDescription>
                    Esse email e usado para contato e recuperacao da conta.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : isCompleteMode ? (
              "Concluir cadastro"
            ) : (
              "Salvar alteracoes"
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
};

export default ProfilePageClient;
