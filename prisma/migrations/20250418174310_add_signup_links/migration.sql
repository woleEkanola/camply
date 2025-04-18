-- CreateTable
CREATE TABLE "SignupLink" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "yearId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignupLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignupLink_token_key" ON "SignupLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "SignupLink_locationId_yearId_key" ON "SignupLink"("locationId", "yearId");

-- AddForeignKey
ALTER TABLE "SignupLink" ADD CONSTRAINT "SignupLink_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignupLink" ADD CONSTRAINT "SignupLink_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "Year"("id") ON DELETE CASCADE ON UPDATE CASCADE;
