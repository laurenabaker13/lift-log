export function shouldAttachBearerSession(input: {
  platform: string;
  apiBaseUrl: string;
  browserOrigin?: string;
}) {
  if (input.platform !== "web") return true;

  // A published Lift Log page and its /api routes share one origin. Sending an
  // app-issued Bearer token there lets the hosting proxy treat it as platform
  // credentials before our API receives the request. The secure HTTP-only
  // cookie is the correct browser session transport in that case.
  if (!input.browserOrigin) return false;

  try {
    const apiOrigin = new URL(input.apiBaseUrl || input.browserOrigin, input.browserOrigin).origin;
    return apiOrigin !== input.browserOrigin;
  } catch {
    // A malformed explicit API origin should not cause an app token to be sent
    // to an unknown destination from the browser.
    return false;
  }
}
