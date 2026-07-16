/**
 * Normalize an email address for consistent lookup and storage.
 * - Trims leading/trailing whitespace
 * - Lowercases the entire string (email local parts are case-insensitive per RFC 5321)
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
