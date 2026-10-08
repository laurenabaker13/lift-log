import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { currentSessionCookie } from "./cookies";

export const APPLE_ISSUER = "https://appleid.apple.com";
// This must exactly match the native iOS bundle ID in app.config.ts; it is not a web OAuth client ID.
export const APPLE_NATIVE_AUDIENCE = "space.manus.liftlog.t159962562021833";

const APPLE_JWKS_URL = new URL("https://appleid.apple.com/auth/keys");
const appleJwks = createRemoteJWKSet(APPLE_JWKS_URL);
const APPLE_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AppleIdentity = {
  sub: string;
  email: string | null;
};

export type AppleAuthDependencies = {
  authenticateLocalRequest: (req: Request) => Promise<User | null>;
  sendAuthenticated: (res: Response, req: Request, user: User) => Promise<void>;
};

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

function requestCredential(req: Request) {
  const authorization = req.headers.authorization ?? req.headers.Authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  return currentSessionCookie(req) ?? "";
}

function equalBuffers(left: Buffer, right: Buffer) {
  return left.length === right.length && timingSafeEqual(left, right);
}

function equalStrings(left: string, right: string) {
  return equalBuffers(Buffer.from(left), Buffer.from(right));
}

async function issueChallenge(req: Request) {
  const challengeId = randomBytes(24).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  await db.createAppleAuthChallenge({
    id: challengeId,
    nonce,
    credentialHash: sha256(requestCredential(req)).toString("hex"),
    expiresAt: new Date(Date.now() + APPLE_CHALLENGE_TTL_MS),
  });
  return { challengeId, nonce, expiresIn: Math.floor(APPLE_CHALLENGE_TTL_MS / 1000) };
}

async function consumeChallenge(req: Request, challengeId: unknown) {
  if (typeof challengeId !== "string" || challengeId.length < 20 || challengeId.length > 128) {
    throw new Error("Apple sign-in challenge is invalid.");
  }
  return db.consumeAppleAuthChallenge({
    id: challengeId,
    credentialHash: sha256(requestCredential(req)).toString("hex"),
  });
}

export function appleNonceMatches(tokenNonce: unknown, rawNonce: string) {
  if (typeof tokenNonce !== "string" || !tokenNonce) return false;
  const sha256Hex = createHash("sha256").update(rawNonce).digest("hex");
  return equalStrings(tokenNonce, rawNonce) || equalStrings(tokenNonce, sha256Hex);
}

/**
 * Verifies a native Sign in with Apple identity token. `key` is injectable for deterministic tests;
 * production always uses Apple's remote JWK set and never accepts a caller-supplied key or audience.
 */
export async function verifyAppleIdentityToken(
  identityToken: unknown,
  rawNonce: string,
  key: JWTVerifyGetKey = appleJwks,
): Promise<AppleIdentity> {
  if (typeof identityToken !== "string" || identityToken.length < 20 || identityToken.length > 20_000) {
    throw new Error("Apple identity token is invalid.");
  }

  const { payload } = await jwtVerify(identityToken, key, {
    issuer: APPLE_ISSUER,
    audience: APPLE_NATIVE_AUDIENCE,
    algorithms: ["RS256"],
  });

  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 150) {
    throw new Error("Apple identity is invalid.");
  }
  if (!appleNonceMatches(payload.nonce, rawNonce)) throw new Error("Apple identity nonce did not match.");

  let email: string | null = null;
  if (payload.email !== undefined && payload.email !== null) {
    if (typeof payload.email !== "string") throw new Error("Apple identity email is invalid.");
    const normalized = payload.email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized) || normalized.length > 320) throw new Error("Apple identity email is invalid.");
    email = normalized;
  }

  return { sub: payload.sub, email };
}

function failure(res: Response, status: number, error: string) {
  res.setHeader("Cache-Control", "private, no-store");
  res.status(status).json({ error });
}

export function registerAppleAuthRoutes(app: Express, dependencies: AppleAuthDependencies) {
  app.post("/api/auth/apple/challenge", async (req: Request, res: Response) => {
    try {
      res.setHeader("Cache-Control", "private, no-store");
      res.json(await issueChallenge(req));
    } catch {
      failure(res, 503, "Apple sign-in is temporarily unavailable.");
    }
  });

  app.post("/api/auth/apple", async (req: Request, res: Response) => {
    try {
      const challenge = await consumeChallenge(req, req.body?.challengeId);
      const identity = await verifyAppleIdentityToken(req.body?.identityToken, challenge.nonce);
      const currentUser = await dependencies.authenticateLocalRequest(req);
      const openId = db.appleOpenId(identity.sub);
      const appleUser = await db.getUserByOpenId(openId);

      let user: User;
      if (appleUser) {
        // A verified Apple identity may sign in to its own existing account. Guest data
        // moves only through the separately authenticated claim endpoint.
        await db.touchUserLastSignedIn(appleUser.id);
        user = (await db.getUserById(appleUser.id)) ?? appleUser;
      } else if (currentUser?.loginMethod === "guest") {
        user = await db.upgradeGuestToAppleUser(currentUser.id, identity);
      } else {
        // Email is taken only from the verified JWT above. It is never accepted from this request.
        user = await db.createAppleUser(identity);
      }

      await dependencies.sendAuthenticated(res, req, user);
    } catch {
      // Tokens and identities are deliberately not logged.
      failure(res, 401, "Apple sign-in could not be verified.");
    }
  });
}
