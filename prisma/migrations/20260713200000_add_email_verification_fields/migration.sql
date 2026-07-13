ALTER TABLE "User" ADD COLUMN "emailVerified" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "emailVerifyToken" TEXT;
CREATE UNIQUE INDEX "User_emailVerifyToken_key" ON "User"("emailVerifyToken") WHERE "emailVerifyToken" IS NOT NULL;
