"use client";

import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

interface OwnerBookingReminderButtonProps {
  url: string;
}

const OwnerBookingReminderButton = ({ url }: OwnerBookingReminderButtonProps) => {
  const handleClick = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      className="gap-2"
      data-testid="owner-booking-reminder"
    >
      <MessageCircle className="size-4" />
      Lembrete
    </Button>
  );
};

export default OwnerBookingReminderButton;
