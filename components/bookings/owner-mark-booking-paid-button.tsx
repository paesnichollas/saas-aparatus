"use client";

import { ownerMarkBookingAsPaid } from "@/actions/owner-mark-booking-as-paid";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

interface OwnerMarkBookingPaidButtonProps {
  bookingId: string;
}

const OwnerMarkBookingPaidButton = ({
  bookingId,
}: OwnerMarkBookingPaidButtonProps) => {
  const router = useRouter();
  const { executeAsync, isPending } = useAction(ownerMarkBookingAsPaid);

  const handleClick = async () => {
    const result = await executeAsync({
      bookingId,
    });

    if (result.validationErrors) {
      toast.error(
        result.validationErrors._errors?.[0] ??
          "Não foi possível atualizar o pagamento.",
      );
      return;
    }

    if (result.serverError) {
      toast.error("Não foi possível atualizar o pagamento.");
      return;
    }

    toast.success("Pagamento marcado como pago.");
    router.refresh();
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      data-testid={`owner-booking-mark-paid-${bookingId}`}
    >
      {isPending ? <Loader2 className="size-4 animate-spin" /> : "Marcar como pago"}
    </Button>
  );
};

export default OwnerMarkBookingPaidButton;
