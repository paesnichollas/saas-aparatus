export const queryKeys = {
  getDateAvailableTimeSlots: (
    barbershopId: string,
    serviceId: string,
    date?: Date,
  ) => [
    "date-available-time-slots",
    barbershopId,
    serviceId,
    date?.toISOString(),
  ],
};
