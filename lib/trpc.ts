import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import { fetchWithTimeout } from "@/lib/_core/api";
import { shouldAttachBearerSession } from "@/lib/_core/session-transport";
import { Platform } from "react-native";

/**
 * tRPC React client for type-safe API calls.
 *
 * IMPORTANT (tRPC v11): The `transformer` must be inside `httpBatchLink`,
 * NOT at the root createClient level. This ensures client and server
 * use the same serialization format (superjson).
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Creates the tRPC client with proper configuration.
 * Call this once in your app's root layout.
 */
export function createTRPCClient() {
  const apiBaseUrl = getApiBaseUrl();
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${apiBaseUrl}/api/trpc`,
        // tRPC v11: transformer MUST be inside httpBatchLink, not at root
        transformer: superjson,
        async headers() {
          const browserOrigin = Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : undefined;
          if (!shouldAttachBearerSession({ platform: Platform.OS, apiBaseUrl, browserOrigin })) return {};
          const token = await Auth.getSessionToken();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        // Custom fetch to include credentials for cookie-based auth
        fetch(url, options) {
          return fetchWithTimeout(url, {
            ...options,
            credentials: "include",
          });
        },
      }),
    ],
  });
}
