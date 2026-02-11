"use client";

import { Loader2, LogIn, Phone, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { formatPhoneBR } from "@/lib/utils";

const MIN_PHONE_LENGTH = 10;
const MAX_PHONE_LENGTH = 11;
const PHONE_ALREADY_REGISTERED_ERROR_MESSAGE =
  "J\u00E1 h\u00E1 um usu\u00E1rio cadastrado com esse telefone.";

const normalizePhoneNumber = (phoneNumber: string) => {
  return phoneNumber.replace(/\D/g, "");
};

const getSafeCallbackUrl = (callbackUrl: string | null) => {
  if (!callbackUrl) {
    return "/";
  }

  if (!callbackUrl.startsWith("/")) {
    return "/";
  }

  if (callbackUrl.startsWith("//")) {
    return "/";
  }

  return callbackUrl;
};

const AuthPage = () => {
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(() => {
    return getSafeCallbackUrl(searchParams.get("callbackUrl"));
  }, [searchParams]);

  const [name, setName] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isPhoneLoading, setIsPhoneLoading] = useState(false);

  const authCallbackUrl = `/auth/callback?callbackUrl=${encodeURIComponent(
    callbackUrl,
  )}`;

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);

    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: authCallbackUrl,
    });

    setIsGoogleLoading(false);

    if (error) {
      toast.error(error.message);
    }
  };

  const handlePhoneSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedName = name.trim();
    const normalizedPhoneNumber = normalizePhoneNumber(phoneDigits).slice(
      0,
      MAX_PHONE_LENGTH,
    );

    if (normalizedName.length < 2) {
      toast.error("Informe um nome valido.");
      return;
    }

    if (
      normalizedPhoneNumber.length < MIN_PHONE_LENGTH ||
      normalizedPhoneNumber.length > MAX_PHONE_LENGTH
    ) {
      toast.error("Informe um telefone valido.");
      return;
    }

    setIsPhoneLoading(true);

    const response = await fetch("/api/auth/phone", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: normalizedName,
        phone: normalizedPhoneNumber,
        callbackUrl,
      }),
    });

    setIsPhoneLoading(false);

    if (!response.ok) {
      let responseErrorMessage: string | null = null;

      try {
        const responseJson = (await response.json()) as { error?: string };
        if (responseJson.error) {
          responseErrorMessage = responseJson.error;
        }
      } catch {
        // No-op.
      }

      if (response.status === 409) {
        toast.error(
          responseErrorMessage ?? PHONE_ALREADY_REGISTERED_ERROR_MESSAGE,
        );
        return;
      }

      toast.error(
        responseErrorMessage ?? "Nao foi possivel autenticar com nome e telefone.",
      );
      return;
    }

    window.location.href = authCallbackUrl;
  };

  const isSubmitting = isGoogleLoading || isPhoneLoading;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <CardTitle className="flex justify-center">
            <Image
              src="/logo.svg"
              alt="Aparatus"
              width={192}
              height={40}
              className="h-10 w-auto dark:invert"
              priority
            />
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Continue com Google ou acesse com nome e telefone.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting}
          >
            {isGoogleLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LogIn className="size-4" />
            )}
            Entrar com Google
          </Button>

          <div className="text-muted-foreground text-center text-xs uppercase">
            ou
          </div>

          <form className="space-y-4" onSubmit={handlePhoneSignIn}>
            <div className="space-y-2">
              <Label htmlFor="auth-name">Nome</Label>
              <div className="relative">
                <UserRound className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  id="auth-name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="pl-9"
                  placeholder="Seu nome"
                  disabled={isSubmitting}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="auth-phone">Telefone</Label>
              <div className="relative">
                <Phone className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  id="auth-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={formatPhoneBR(phoneDigits)}
                  onChange={(event) =>
                    setPhoneDigits(
                      normalizePhoneNumber(event.target.value).slice(
                        0,
                        MAX_PHONE_LENGTH,
                      ),
                    )
                  }
                  className="pl-9"
                  placeholder="(11) 99999-9999"
                  disabled={isSubmitting}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isPhoneLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Continuar"
              )}
            </Button>
          </form>

          <p className="text-muted-foreground text-center text-xs">
            Ao continuar, voce concorda com os termos da plataforma.
          </p>
        </CardContent>
      </Card>
    </main>
  );
};

export default AuthPage;
