-- CreateIndex
CREATE INDEX "Booking_barbershopId_date_cancelledAt_idx"
ON "Booking"("barbershopId", "date", "cancelledAt");

-- CreateIndex
CREATE INDEX "Booking_barbershopId_paymentStatus_createdAt_idx"
ON "Booking"("barbershopId", "paymentStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Booking_userId_date_idx"
ON "Booking"("userId", "date");
