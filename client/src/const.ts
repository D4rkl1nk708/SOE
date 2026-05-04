export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Generate login URL at runtime so redirect URI reflects the current origin.
// Returns empty string if OAuth is not configured (local mode)
export const getLoginUrl = () => {
  return "/login";
};

import { Capacitor } from "@capacitor/core";

// Check if running in local mode (no OAuth configured, or app standalone no Android/iOS)
export const isLocalMode = () => {
  return false;
};
