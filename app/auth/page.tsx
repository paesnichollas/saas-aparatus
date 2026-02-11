import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/rbac";

import AuthPageClient from "./auth-page-client";

const AuthPageFallback = () => {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <p className="text-sm">Carregando autenticacao...</p>
    </main>
  );
};

const AuthPage = async () => {
  const user = await getSessionUser();

  if (user) {
    redirect("/");
  }

  return (
    <Suspense fallback={<AuthPageFallback />}>
      <AuthPageClient />
    </Suspense>
  );
};

export default AuthPage;
