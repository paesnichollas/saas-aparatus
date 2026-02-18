import Image from "next/image";
import { cookies } from "next/headers";

import BarbershopItem from "@/components/barbershop-item";
import BackToTopButton from "@/components/back-to-top-button";
import BookingItem from "@/components/booking-item";
import ExclusiveBarbershopLanding from "@/components/exclusive-barbershop-landing";
import Footer from "@/components/footer";
import Header from "@/components/header";
import QuickSearch from "@/components/quick-search";
import {
  getBarbershops,
  getExclusiveBarbershopByContextId,
  getPopularBarbershops,
} from "@/data/barbershops";
import { getUserConfirmedBookings } from "@/data/bookings";
import { getPreferredBarbershopIdForUser } from "@/data/customer-barbershops";
import {
  PageContainer,
  PageSectionContent,
  PageSectionScroller,
  PageSectionTitle,
} from "@/components/ui/page";
import {
  BARBERSHOP_CONTEXT_COOKIE_NAME,
  BARBERSHOP_FORCE_GENERAL_HOME_COOKIE_NAME,
} from "@/lib/barbershop-context";
import { requireAuthenticatedUser } from "@/lib/rbac";
import banner from "@/public/banner.png";

export default async function Home() {
  const user = await requireAuthenticatedUser();
  const cookieStore = await cookies();
  const forceGeneralHomeCookieValue =
    cookieStore.get(BARBERSHOP_FORCE_GENERAL_HOME_COOKIE_NAME)?.value ?? "";
  const shouldForceGeneralHome = forceGeneralHomeCookieValue === "1";
  const barbershopContextIdFromCookie =
    shouldForceGeneralHome
      ? null
      : cookieStore.get(BARBERSHOP_CONTEXT_COOKIE_NAME)?.value ?? null;
  const fallbackBarbershopContextId = shouldForceGeneralHome
    ? null
    : await getPreferredBarbershopIdForUser(user.id);
  const barbershopContextId =
    barbershopContextIdFromCookie ?? fallbackBarbershopContextId;

  const exclusiveBarbershop = await getExclusiveBarbershopByContextId(
    barbershopContextId,
  );

  if (exclusiveBarbershop) {
    return (
      <div>
        <Header
          homeHref="/home"
          chatHref={`/chat?barbershopPublicSlug=${encodeURIComponent(exclusiveBarbershop.slug)}`}
        />
        <ExclusiveBarbershopLanding barbershop={exclusiveBarbershop} />
        <Footer />
        <BackToTopButton />
      </div>
    );
  }

  const [barbershops, popularBarbershops, confirmedBookings] = await Promise.all([
    getBarbershops(),
    getPopularBarbershops(),
    getUserConfirmedBookings(),
  ]);

  return (
    <div>
      <Header />
      <PageContainer>
        <QuickSearch />
        <Image
          src={banner}
          alt="Agende nos melhores com a Aparatus"
          sizes="100vw"
          className="h-auto w-full"
        />
        {confirmedBookings.length > 0 && (
          <PageSectionContent>
            <PageSectionTitle>Agendamentos</PageSectionTitle>
            <PageSectionScroller>
              {confirmedBookings.map((booking) => (
                <BookingItem key={booking.id} booking={booking} />
              ))}
            </PageSectionScroller>
          </PageSectionContent>
        )}
        <PageSectionContent>
          <PageSectionTitle>Barbearias</PageSectionTitle>
          <PageSectionScroller>
            {barbershops.map((barbershop) => (
              <BarbershopItem key={barbershop.id} barbershop={barbershop} />
            ))}
          </PageSectionScroller>
        </PageSectionContent>
        <PageSectionContent>
          <PageSectionTitle>Barbearias populares</PageSectionTitle>
          <PageSectionScroller>
            {popularBarbershops.map((barbershop) => (
              <BarbershopItem key={barbershop.id} barbershop={barbershop} />
            ))}
          </PageSectionScroller>
        </PageSectionContent>
      </PageContainer>
      <Footer />
      <BackToTopButton />
    </div>
  );
}
