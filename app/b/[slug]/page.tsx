import BackToTopButton from "@/components/back-to-top-button";
import BarbershopDetails from "@/components/barbershop-details";
import ExclusiveBarbershopLanding from "@/components/exclusive-barbershop-landing";
import Footer from "@/components/footer";
import Header from "@/components/header";
import { getBarbershopBySlug } from "@/data/barbershops";
import { requireAuthenticatedUser } from "@/lib/rbac";
import { notFound } from "next/navigation";

const BarbershopBySlugPage = async ({ params }: PageProps<"/b/[slug]">) => {
  const { slug } = await params;
  const barbershop = await getBarbershopBySlug(slug);

  if (!barbershop) {
    notFound();
  }

  if (barbershop.exclusiveBarber) {
    const authenticatedUser = await requireAuthenticatedUser();
    const homeHref =
      authenticatedUser.role === "OWNER" ? `/b/${barbershop.slug}` : "/home";

    return (
      <div>
        <Header
          homeHref={homeHref}
          chatHref={`/chat?barbershopPublicSlug=${encodeURIComponent(barbershop.slug)}`}
        />
        <ExclusiveBarbershopLanding barbershop={barbershop} />
        <Footer />
        <BackToTopButton />
      </div>
    );
  }

  return (
    <div>
      <Header homeHref="/home" />
      <BarbershopDetails barbershop={barbershop} showBackButton={false} />
      <Footer />
    </div>
  );
};

export default BarbershopBySlugPage;
