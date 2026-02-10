import { getDateAvailableTimeSlots } from "@/actions/get-date-available-time-slots";
import { queryKeys } from "@/constants/query-keys";
import { useQuery } from "@tanstack/react-query";

export const useGetDateAvailableTimeSlots = ({
  barbershopId,
  serviceId,
  date,
}: {
  barbershopId: string;
  serviceId: string;
  date?: Date;
}) => {
  return useQuery({
    queryKey: queryKeys.getDateAvailableTimeSlots(barbershopId, serviceId, date),
    queryFn: () =>
      getDateAvailableTimeSlots({
        barbershopId,
        serviceId,
        date: date!,
      }),
    enabled: Boolean(date && serviceId),
  });
};
