export type LeaderboardArea = "admin" | "dashboard" | "campus-rep" | "super-admin" | "teacher" | "volunteer";

/**
 * Maps a session role onto the `AppShell` area for the leaderboard's routes.
 * One route serves all seven roles (the `/profile` precedent) — this mapping
 * was copy-pasted into the leaderboard page and the tribe detail page, and
 * the camper/staff detail pages would have made four copies, so it lives
 * here now. PARENT (and anything unrecognized) falls through to "dashboard",
 * which is the parent-facing shell.
 */
export function leaderboardArea(role: string | undefined): LeaderboardArea {
  switch (role) {
    case "SUPER_ADMIN":
      return "super-admin";
    case "OWNER":
    case "ADMIN":
      return "admin";
    case "CAMPUS_REPRESENTATIVE":
      return "campus-rep";
    case "TEACHER":
      return "teacher";
    case "VOLUNTEER":
      return "volunteer";
    default:
      return "dashboard";
  }
}
