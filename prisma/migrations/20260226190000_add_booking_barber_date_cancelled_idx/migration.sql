-- CreateIndex
CREATE INDEX "Booking_barbershopId_barberId_date_cancelledAt_idx"
ON "Booking"("barbershopId", "barberId", "date", "cancelledAt");
