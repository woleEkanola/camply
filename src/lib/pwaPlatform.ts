/**
 * Single source of truth for install-prompt platform gating — previously
 * duplicated UA-sniffing across InstallPwaBanner.tsx and InstallPwaButton.tsx.
 *
 * `isDesktop` is deliberately "not iOS, not Android" rather than its own
 * positive check: Camply's real users are camp staff on phones/tablets or
 * office desktops, not other mobile OSes worth special-casing.
 */
export interface PwaPlatform {
  isIos: boolean;
  isAndroid: boolean;
  isDesktop: boolean;
  /** Chrome-family browser on Android (excludes Samsung Internet, Firefox, Edge, Opera). */
  isChrome: boolean;
}

export function getPwaPlatform(): PwaPlatform {
  const ua = typeof window === "undefined" ? "" : window.navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const isDesktop = !isIos && !isAndroid;
  const isChrome = /chrome|crios/i.test(ua) && !/edg|opr|samsungbrowser|firefox|fxios/i.test(ua);
  return { isIos, isAndroid, isDesktop, isChrome };
}
