// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://8323c809bf23821503f597fd5dc1cdc6@o4511098768064512.ingest.de.sentry.io/4511755619205200",

  // Was 1 (100%) with the scaffold's "adjust this value in production" note
  // never actioned — this app handles minors' medical/contact data, so a
  // realistic sample rate rather than tracing every single request.
  tracesSampleRate: 0.1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Was left at the scaffold's commented-out default, which transmits user
  // identifiers and full HTTP request/response bodies to Sentry — including
  // camper DOB, allergies, medical conditions, and parent emails, for an app
  // handling minors' medical data.
  dataCollection: {
    userInfo: false,
    httpBodies: [],
  },
});
