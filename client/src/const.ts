export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
// Returns empty string if OAuth is not configured (local mode)
export const getLoginUrl = () => {
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  
  // If OAuth is not configured, return empty string (local mode)
  if (!oauthPortalUrl || !appId) {
    return "";
  }
  
  try {
    const redirectUri = `${window.location.origin}/api/oauth/callback`;
    const state = btoa(redirectUri);

    const url = new URL(`${oauthPortalUrl}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");

    return url.toString();
  } catch {
    return "";
  }
};

import { Capacitor } from "@capacitor/core";

// Check if running in local mode (no OAuth configured, or app standalone no Android/iOS)
export const isLocalMode = () => {
  if (typeof Capacitor !== "undefined" && Capacitor.isNativePlatform?.()) return true;
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  return !oauthPortalUrl || !appId;
};
