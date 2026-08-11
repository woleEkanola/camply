// Central Branding Resolver enforcing Camply multi-tenant branding hierarchy.

export interface PlatformBrandingData {
  platformLogoUrl?: string | null;
  faviconUrl?: string | null;
  pwaIcon192Url?: string | null;
  pwaIcon512Url?: string | null;
  appleIconUrl?: string | null;
  emailLogoUrl?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  headerImageUrl?: string | null;
}

export interface OrganizationBrandingData {
  logoUrl?: string | null; // legacy field fallback
  masterLogoUrl?: string | null; // Brand Logo
  emailLogoUrl?: string | null; // Email Logo Override
  idCardLogoUrl?: string | null; // ID Card Logo Override
  primaryColor?: string | null;
  accentColor?: string | null;
  headerImageUrl?: string | null;
  tagline?: string | null;
}

const DEFAULT_PLATFORM_LOGO = "/logo.png";
const DEFAULT_FAVICON = "/favicon.ico";

/**
 * Resolves General UI logo (Dashboard, Sidebar, Login, Registration, Reports, Mobile Nav).
 * Hierarchy: Organization Brand Logo -> Legacy logoUrl -> Platform Logo -> Default /logo.png
 */
export function resolveGeneralLogo(
  orgBranding?: OrganizationBrandingData | null,
  platformBranding?: PlatformBrandingData | null
): string {
  return (
    orgBranding?.masterLogoUrl ||
    orgBranding?.logoUrl ||
    platformBranding?.platformLogoUrl ||
    DEFAULT_PLATFORM_LOGO
  );
}

/**
 * Resolves Email Logo.
 * Hierarchy: Org Email Logo -> Org Brand Logo -> Legacy logoUrl -> Platform Email Logo -> Platform Logo -> Default /logo.png
 */
export function resolveEmailLogo(
  orgBranding?: OrganizationBrandingData | null,
  platformBranding?: PlatformBrandingData | null
): string {
  return (
    orgBranding?.emailLogoUrl ||
    orgBranding?.masterLogoUrl ||
    orgBranding?.logoUrl ||
    platformBranding?.emailLogoUrl ||
    platformBranding?.platformLogoUrl ||
    DEFAULT_PLATFORM_LOGO
  );
}

/**
 * Resolves ID Card Logo.
 * Hierarchy: Org ID Card Logo -> Org Brand Logo -> Legacy logoUrl -> Platform Logo -> Default /logo.png
 */
export function resolveIdCardLogo(
  orgBranding?: OrganizationBrandingData | null,
  platformBranding?: PlatformBrandingData | null
): string {
  return (
    orgBranding?.idCardLogoUrl ||
    orgBranding?.masterLogoUrl ||
    orgBranding?.logoUrl ||
    platformBranding?.platformLogoUrl ||
    DEFAULT_PLATFORM_LOGO
  );
}

/**
 * Resolves Browser Favicon & PWA Icons.
 * Platform ONLY — controlled exclusively by Super Admin via Platform Branding.
 */
export function resolveFavicon(platformBranding?: PlatformBrandingData | null): string {
  return platformBranding?.faviconUrl || DEFAULT_FAVICON;
}
