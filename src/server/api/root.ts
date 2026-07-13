import { createTRPCRouter } from "./trpc/trpc";
import { authRouter } from "./routers/auth";
import { organizationRouter } from "./routers/organization";
import { ownerRouter } from "./routers/owner";
import { campusRouter } from "./routers/campus";
import { venueRouter } from "./routers/venue";
import { adminRouter } from "./routers/admin";
import { userRouter } from "./routers/user";
import { permissionRouter } from "./routers/permission";
import { camperRouter } from "./routers/camper";
import { formFieldRouter } from "./routers/formField";
import { campRouter } from "./routers/camp";
import { registrationRouter } from "./routers/registration";
import { signupLinkRouter } from "./routers/signupLink";
import { documentRequirementRouter } from "./routers/documentRequirement";
import { documentRouter } from "./routers/document";
import { notificationRouter } from "./routers/notification";
import { tribeRouter } from "./routers/tribe";
import { staffSignupLinkRouter } from "./routers/staffSignupLink";
import { staffRouter } from "./routers/staff";
import { attendanceRouter } from "./routers/attendance";
import { incidentRouter } from "./routers/incident";
import { medicalVisitRouter } from "./routers/medicalVisit";
import { mealRouter } from "./routers/meal";
import { departmentRouter } from "./routers/department";
import { accommodationRouter } from "./routers/accommodation";
import { orgStructureRouter } from "./routers/orgStructure";
import { trashRouter } from "./routers/trash";
import { importExportRouter } from "./routers/importExport";
import { registrationConfigRouter } from "./routers/registrationConfig";
import { positionRouter } from "./routers/position";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  auth: authRouter,
  organization: organizationRouter,
  owner: ownerRouter,
  campus: campusRouter,
  venue: venueRouter,
  admin: adminRouter,
  user: userRouter,
  permission: permissionRouter,
  camper: camperRouter,
  formField: formFieldRouter,
  camp: campRouter,
  registration: registrationRouter,
  signupLink: signupLinkRouter,
  documentRequirement: documentRequirementRouter,
  document: documentRouter,
  notification: notificationRouter,
  tribe: tribeRouter,
  staffSignupLink: staffSignupLinkRouter,
  staff: staffRouter,
  attendance: attendanceRouter,
  incident: incidentRouter,
  medicalVisit: medicalVisitRouter,
  meal: mealRouter,
  department: departmentRouter,
  accommodation: accommodationRouter,
  orgStructure: orgStructureRouter,
  trash: trashRouter,
  importExport: importExportRouter,
  registrationConfig: registrationConfigRouter,
  position: positionRouter,
  // booking: bookingRouter, // removed because booking router file was deleted
  // eventType: eventTypeRouter, // removed because eventType router file was deleted
  // schedule: scheduleRouter, // removed because schedule router file was deleted
});

// export type definition of API
export type AppRouter = typeof appRouter;
