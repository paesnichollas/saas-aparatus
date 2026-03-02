export const ADMIN_CREATE_BARBERSHOP_DEFAULTS = {
  address: "Endereço da barbearia",
  description: "Descrição da barbearia",
  phones: [] as string[],
  imageUrl: null as string | null,
  logoUrl: null as string | null,
  exclusiveBarber: false,
  stripeEnabled: false,
  plan: "BASIC" as const,
  whatsappProvider: "NONE" as const,
  whatsappFrom: null as string | null,
  whatsappEnabled: false,
};
