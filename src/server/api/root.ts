import { createTRPCRouter } from "./trpc/trpc";
import { authRouter } from "./routers/auth";
import { organizationRouter } from "./routers/organization";
import { ownerRouter } from "./routers/owner";
import { locationRouter } from "./routers/location";
import { adminRouter } from "./routers/admin";
import { userRouter } from "./routers/user";
import { permissionRouter } from "./routers/permission";
import { camperProfileRouter } from "./routers/camperProfile";
import { profileFieldRouter } from "./routers/profileField";
import { yearRouter } from "./routers/year";
import { registrationRouter } from "./routers/registration";
import { signupLinkRouter } from "./routers/signupLink";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  auth: authRouter,
  organization: organizationRouter,
  owner: ownerRouter,
  location: locationRouter,
  admin: adminRouter,
  user: userRouter,
  permission: permissionRouter,
  camperProfile: camperProfileRouter,
  profileField: profileFieldRouter,
  year: yearRouter,
  registration: registrationRouter,
  signupLink: signupLinkRouter,
  // booking: bookingRouter, // removed because booking router file was deleted
  // eventType: eventTypeRouter, // removed because eventType router file was deleted
  // schedule: scheduleRouter, // removed because schedule router file was deleted
});

// export type definition of API
export type AppRouter = typeof appRouter;
