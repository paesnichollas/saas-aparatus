import { type PaymentMethod, type PaymentStatus } from "@/generated/prisma/client";
import { isFuture } from "date-fns";

export type BookingStatus = "confirmed" | "finished" | "cancelled";

export type BookingDisplayStatus =
  | "confirmed"
  | "finished"
  | "cancelled"
  | "failed"
  | "pending";

export function getBookingStatus(
  date: Date,
  cancelledAt: Date | null,
): BookingStatus {
  if (cancelledAt) {
    return "cancelled";
  }
  if (isFuture(date)) {
    return "confirmed";
  }
  return "finished";
}

interface BookingDisplayStatusInput {
  date: Date;
  cancelledAt: Date | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  stripeChargeId: string | null;
}

export const getBookingDisplayStatus = ({
  date,
  cancelledAt,
  paymentMethod,
  paymentStatus,
  stripeChargeId,
}: BookingDisplayStatusInput): BookingDisplayStatus => {
  if (cancelledAt) {
    return "cancelled";
  }

  if (paymentStatus === "FAILED") {
    return "failed";
  }

  const isStripePending =
    paymentMethod === "STRIPE" &&
    paymentStatus === "PENDING" &&
    stripeChargeId === null;

  if (isStripePending) {
    return "pending";
  }

  if (isFuture(date)) {
    return "confirmed";
  }

  return "finished";
};

export const getBookingDisplayStatusLabel = (status: BookingDisplayStatus) => {
  if (status === "cancelled") {
    return "Cancelado";
  }

  if (status === "failed") {
    return "Falha";
  }

  if (status === "pending") {
    return "Pendente";
  }

  if (status === "confirmed") {
    return "Confirmado";
  }

  return "Finalizado";
};

export const getBookingDisplayStatusVariant = (
  status: BookingDisplayStatus,
): "default" | "secondary" | "destructive" => {
  if (status === "cancelled" || status === "failed") {
    return "destructive";
  }

  if (status === "pending" || status === "finished") {
    return "secondary";
  }

  return "default";
};
