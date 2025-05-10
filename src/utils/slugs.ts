/**
 * Utility functions for working with slugs
 */

/**
 * Generate a URL-friendly slug from a string
 * @param text The text to convert to a slug
 * @returns A URL-friendly slug
 */
export function generateSlug(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+/, '') // Trim hyphens from start
    .replace(/-+$/, ''); // Trim hyphens from end
}

/**
 * Get a year by its slug
 * @param slug The year slug to look for
 * @param years Array of year objects
 * @returns The year object with the matching slug, or undefined if not found
 */
export function getYearBySlug(slug: string, years: Array<{ slug: string; [key: string]: any }>) {
  return years.find(year => year.slug === slug);
}

/**
 * Build a URL path with a year slug
 * @param baseUrl The base URL path
 * @param yearSlug The year slug
 * @returns The complete URL path
 */
export function buildYearPath(baseUrl: string, yearSlug: string): string {
  return `${baseUrl}/${yearSlug}`;
}
