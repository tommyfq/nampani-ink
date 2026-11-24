-- CreateEnum
CREATE TYPE "BookingKind" AS ENUM ('CONSULTATION', 'TATTOO');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('REQUESTED', 'BOOKED', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('WEBSITE', 'POS', 'WALK_IN');

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "instagram" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "outletId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "artistId" UUID,
    "styleId" UUID,
    "kind" "BookingKind" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
    "source" "BookingSource" NOT NULL DEFAULT 'POS',
    "startsAt" TIMESTAMPTZ,
    "endsAt" TIMESTAMPTZ,
    "placement" TEXT NOT NULL DEFAULT '',
    "size" TEXT NOT NULL DEFAULT '',
    "idea" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "quotedPrice" BIGINT,
    "parentId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingEvent" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus",
    "note" TEXT NOT NULL DEFAULT '',
    "userId" UUID,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NumberSequence" (
    "outletId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NumberSequence_pkey" PRIMARY KEY ("outletId","kind","year")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_code_key" ON "Booking"("code");

-- CreateIndex
CREATE INDEX "Booking_outletId_startsAt_idx" ON "Booking"("outletId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_artistId_startsAt_idx" ON "Booking"("artistId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_status_endsAt_idx" ON "Booking"("status", "endsAt");

-- CreateIndex
CREATE INDEX "BookingEvent_bookingId_at_idx" ON "BookingEvent"("bookingId", "at");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "Artist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_styleId_fkey" FOREIGN KEY ("styleId") REFERENCES "Style"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One artist cannot have two active bookings at overlapping times (checked by PostgreSQL itself,
-- so two staff booking the same slot at the same moment cannot both succeed).
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_no_double_booking"
  EXCLUDE USING gist ("artistId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE ("artistId" IS NOT NULL AND "startsAt" IS NOT NULL AND "endsAt" IS NOT NULL
         AND "status" NOT IN ('CANCELLED', 'NO_SHOW', 'REQUESTED'));
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_time_order" CHECK ("endsAt" IS NULL OR "startsAt" < "endsAt");
