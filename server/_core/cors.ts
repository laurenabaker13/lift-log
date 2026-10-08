import type { RequestHandler } from "express";
import { BlockList, isIP } from "node:net";

const LOOPBACK_IPS = new BlockList();
LOOPBACK_IPS.addSubnet("127.0.0.0", 8, "ipv4");
LOOPBACK_IPS.addAddress("::1", "ipv6");
LOOPBACK_IPS.addSubnet("::ffff:127.0.0.0", 104, "ipv6");

function configuredOrigin(name: "EXPO_PACKAGER_PROXY_URL" | "EXPO_WEB_PREVIEW_URL"): string | null {
  const value = process.env[name];
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value
      ? value
      : null;
  } catch {
    return null;
  }
}

function pairedPreviewOrigin(packagerOrigin: string): string | null {
  const url = new URL(packagerOrigin);
  const previewHostname = url.hostname.replace(/^8081-/, "8328-");
  if (previewHostname === url.hostname) return null;
  url.hostname = previewHostname;
  return url.origin;
}

function configuredPublicAppOrigin(): string | null {
  const value = process.env.LIFT_LOG_APP_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    const isRootUrl = url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
    if (url.protocol !== "https:" || !isRootUrl || originHasLoopbackHostname(url.origin)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function trustedExpoWebOrigins(): Set<string> {
  const origins = new Set<string>();
  const packager = configuredOrigin("EXPO_PACKAGER_PROXY_URL");
  const preview = configuredOrigin("EXPO_WEB_PREVIEW_URL");
  const publicApp = configuredPublicAppOrigin();
  // Loopback origins are request-local below. Never put one in this process-wide set: the
  // same starter can also be reached through a remote API host.
  for (const configured of [packager, preview]) {
    if (configured && !originHasLoopbackHostname(configured)) origins.add(configured);
  }
  // Production traffic reaches the container behind a managed reverse proxy, so the request
  // Host can be an internal address rather than the browser's public Lift Log origin. Trust
  // only the exact HTTPS origin set by the project owner for public app and email links.
  if (publicApp) origins.add(publicApp);
  // Backward-compatible production fallback while every runtime starts injecting the explicit
  // 8328 origin. Localhost cannot use hostname prefix derivation and is handled only by exact env.
  if (packager && !originHasLoopbackHostname(packager)) {
    const paired = pairedPreviewOrigin(packager);
    if (paired) origins.add(paired);
  }
  return origins;
}

export function isLoopbackApiHost(hostname: string): boolean {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/, "");
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }
  const family = isIP(normalized);
  if (family === 0) return false;
  return LOOPBACK_IPS.check(normalized, family === 4 ? "ipv4" : "ipv6");
}

function originHasLoopbackHostname(origin: string): boolean {
  try {
    return isLoopbackApiHost(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function configuredLocalExpoWebOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const name of ["EXPO_PACKAGER_PROXY_URL", "EXPO_WEB_PREVIEW_URL"] as const) {
    const origin = configuredOrigin(name);
    if (!origin) continue;
    const url = new URL(origin);
    if (url.protocol === "http:" && isLoopbackApiHost(url.hostname)) origins.add(origin);
  }
  return origins;
}

function requestProtocol(req: import("express").Request): "http:" | "https:" {
  const forwarded = req.headers["x-forwarded-proto"];
  const firstForwarded = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(",")[0];
  return firstForwarded?.trim().toLowerCase() === "https" || req.protocol === "https"
    ? "https:"
    : "http:";
}

function requestHost(req: import("express").Request) {
  const forwarded = req.headers["x-forwarded-host"];
  const firstForwarded = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded?.split(",")[0];
  return firstForwarded?.trim().toLowerCase() || req.get("host")?.trim().toLowerCase();
}

function isSameOriginRequest(req: import("express").Request, origin: string): boolean {
  try {
    const url = new URL(origin);
    // Published traffic passes through a reverse proxy, where Express can see an internal Host
    // even though the browser and public URL share an origin. Honor the proxy's canonical
    // forwarded host, then fall back to Host for local/Preview requests.
    const host = requestHost(req);
    return Boolean(host) && url.protocol === requestProtocol(req) && url.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

export function createCorsMiddleware(
  allowedOrigins = trustedExpoWebOrigins(),
  localApiRequest = (hostname: string) => isLoopbackApiHost(hostname),
): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    res.vary("Origin");

    // Native Expo requests do not carry Origin and authenticate with a Bearer token.
    if (!origin) {
      next();
      return;
    }
    const loopbackOrigin = originHasLoopbackHostname(origin);
    const allowedLocalOrigin =
      localApiRequest(req.hostname) && configuredLocalExpoWebOrigins().has(origin);
    const allowedConfiguredOrigin =
      !loopbackOrigin && allowedOrigins.has(origin);
    // Published Lift Log routes static Web traffic and /api through one public
    // origin. Keep that same-origin case working without broadening the
    // cross-origin allowlist used by Preview and Expo Go.
    const allowedSameOrigin = isSameOriginRequest(req, origin);
    if (!allowedConfiguredOrigin && !allowedLocalOrigin && !allowedSameOrigin) {
      res.status(403).json({ error: "origin_not_allowed" });
      return;
    }

    res.header("Access-Control-Allow-Origin", origin);
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, Authorization, X-Requested-With",
    );
    res.header("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  };
}
