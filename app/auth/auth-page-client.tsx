"use client";

import { Loader2, LogIn, Phone, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const MIN_PHONE_LENGTH = 10;
const MAX_PHONE_LENGTH = 15;

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
  const [phone, setPhone] = useState("");
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
    const normalizedPhoneNumber = normalizePhoneNumber(phone);

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
      let errorMessage = "Nao foi possivel autenticar com nome e telefone.";

      try {
        const responseJson = (await response.json()) as { error?: string };
        if (responseJson.error) {
          errorMessage = responseJson.error;
        }
      } catch {
        // No-op.
      }

      toast.error(errorMessage);
      return;
    }

    window.location.href = authCallbackUrl;
  };

  const isSubmitting = isGoogleLoading || isPhoneLoading;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">Entrar na Aparatus</CardTitle>
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
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
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
