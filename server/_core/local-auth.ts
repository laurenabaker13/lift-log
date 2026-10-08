import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import { ONE_YEAR_MS } from "../../shared/const";
import * as db from "../db";
import { actionLink, emailDeliveryConfigured, isReservedTestEmail, safeBrowserOrigin, sendTransactionalEmail } from "./email";
import { currentSessionCookie, getSessionCookieName, getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { createOpaqueToken, hashOpaqueToken } from "./secure-tokens";
import { sdk } from "./sdk";
import { registerAppleAuthRoutes } from "./apple-auth";

const SESSION_KIND = "lift_log_email";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
const LOCAL_LOGIN_METHODS = new Set(["email_password", "guest", "apple"]);

function derivePassword(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(password, salt, 64, (error, derived) => {
      if (error) reject(error);
      else resolve(Buffer.from(derived));
    });
  });
}

function secretKey() {
  if (!ENV.cookieSecret) throw new Error("Session signing is unavailable.");
  return new TextEncoder().encode(ENV.cookieSecret);
}

function normalizedEmail(value: unknown) {
  if (typeof value !== "string") throw new Error("Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 320) throw new Error("Enter a valid email address.");
  return email;
}

function validatedPassword(value: unknown) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new Error("Password must be 8–128 characters.");
  }
  return value;
}

function displayName(value: unknown, email: string) {
  if (typeof value !== "string" || !value.trim()) return email.split("@")[0];
  return value.trim().slice(0, 80);
}

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await derivePassword(password, salt);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

async function verifyPassword(password: string, stored: string | null | undefined) {
  if (!stored) return false;
  const [algorithm, saltEncoded, hashEncoded] = stored.split("$");
  if (algorithm !== "scrypt" || !saltEncoded || !hashEncoded) return false;
  try {
    const expected = Buffer.from(hashEncoded, "base64url");
    const actual = await derivePassword(password, Buffer.from(saltEncoded, "base64url"));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

async function createSessionToken(user: User) {
  return new SignJWT({
    kind: SESSION_KIND,
    userId: String(user.id),
    appId: ENV.appId || "lift-log",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
    .sign(secretKey());
}

function requestToken(req: Request) {
  const header = req.headers.authorization ?? req.headers.Authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) return header.slice("Bearer ".length).trim();
  return currentSessionCookie(req);
}

export function isLocalSessionUser(user: User | null | undefined): user is User {
  if (!user || !LOCAL_LOGIN_METHODS.has(user.loginMethod ?? "")) return false;
  return (
    (user.loginMethod === "email_password" && user.openId.startsWith("email:")) ||
    (user.loginMethod === "guest" && user.openId.startsWith("guest:")) ||
    (user.loginMethod === "apple" && user.openId.startsWith("apple:"))
  );
}

async function authenticateLocalToken(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (payload.kind !== SESSION_KIND || payload.appId !== (ENV.appId || "lift-log") || typeof payload.userId !== "string") return null;
    const userId = Number(payload.userId);
    if (!Number.isInteger(userId) || userId <= 0) return null;
    const user = await db.getUserById(userId);
    return isLocalSessionUser(user) ? user : null;
  } catch {
    return null;
  }
}

export async function authenticateLocalRequest(req: Request): Promise<User | null> {
  return authenticateLocalToken(requestToken(req));
}

export async function authenticateGuestToken(token: unknown): Promise<User | null> {
  if (typeof token !== "string") return null;
  const user = await authenticateLocalToken(token);
  return user?.loginMethod === "guest" ? user : null;
}

export async function authenticateRequest(req: Request): Promise<User> {
  const localUser = await authenticateLocalRequest(req);
  if (localUser) return localUser;
  return sdk.authenticateRequest(req);
}

export function userPayload(user: User) {
  return {
    id: user.id,
    openId: user.openId,
    name: user.name,
    email: user.email,
    loginMethod: user.loginMethod,
    lastSignedIn: user.lastSignedIn.toISOString(),
  };
}

export async function sendLocalAuthenticated(res: Response, req: Request, user: User) {
  const token = await createSessionToken(user);
  res.setHeader("Cache-Control", "private, no-store");
  res.cookie(getSessionCookieName(req), token, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
  res.json({ app_session_id: token, user: userPayload(user) });
}

function failure(res: Response, status: number, error: string) {
  res.setHeader("Cache-Control", "private, no-store");
  res.status(status).json({ error });
}

function publicOrigin(req: Request) {
  const configured = safeBrowserOrigin(undefined, ENV.appUrl);
  const origin = configured || safeBrowserOrigin(req.get("origin") ?? undefined, "");
  if (!origin) throw new Error("Open Lift Log from its browser link to receive this email.");
  return origin;
}

async function issueAccountEmail(req: Request, user: User, type: "verify_email" | "reset_password") {
  if (!user.email) return { delivered: false as const, reason: "This account does not have an email address." };
  if (isReservedTestEmail(user.email)) return { delivered: false as const, reason: "Email is disabled for test accounts." };
  if (!emailDeliveryConfigured()) return { delivered: false as const, reason: "Email delivery is not configured yet." };
  const rawToken = createOpaqueToken();
  const expiresAt = new Date(Date.now() + (type === "reset_password" ? ONE_HOUR_MS : ONE_DAY_MS));
  await db.createAccountToken({ userId: user.id, email: user.email, type, tokenHash: hashOpaqueToken(rawToken), expiresAt });
  const origin = publicOrigin(req);
  const path = type === "reset_password" ? "/reset-password" : "/verify-email";
  const link = actionLink(origin, path, rawToken);
  const title = type === "reset_password" ? "Reset your Lift Log password" : "Verify your Lift Log email";
  const action = type === "reset_password" ? "Reset password" : "Verify email";
  const expires = type === "reset_password" ? "1 hour" : "24 hours";
  return sendTransactionalEmail({
    to: user.email,
    subject: title,
    text: `${title}\n\n${link}\n\nThis link expires in ${expires}. If you did not request this, you can ignore this email.`,
    html: `<p>${title}</p><p><a href="${link}">${action}</a></p><p>This link expires in ${expires}. If you did not request this, you can ignore this email.</p>`,
  });
}

export function registerLocalAuthRoutes(app: Express) {
  app.post("/api/auth/guest", async (req: Request, res: Response) => {
    try {
      // The body is deliberately ignored: a guest identity has no caller-supplied name, email, or password.
      const user = await db.createGuestUser();
      await sendLocalAuthenticated(res, req, user);
    } catch {
      failure(res, 503, "A guest session could not be created. Try again shortly.");
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const email = normalizedEmail(req.body?.email);
      const password = validatedPassword(req.body?.password);
      const existing = await db.getUserByEmail(email);
      if (existing) return failure(res, 409, "An account with that email already exists.");
      const currentUser = await authenticateLocalRequest(req);
      if (currentUser && currentUser.loginMethod !== "guest") return failure(res, 409, "You are already signed in to an account.");
      const user = currentUser
        ? await db.upgradeGuestToEmailUser({
            userId: currentUser.id,
            email,
            displayName: displayName(req.body?.displayName, email),
            passwordHash: await hashPassword(password),
          })
        : await db.createEmailUser({ email, displayName: displayName(req.body?.displayName, email), passwordHash: await hashPassword(password) });
      issueAccountEmail(req, user, "verify_email").catch((error) => console.error("[Auth] Verification email was not sent", error));
      await sendLocalAuthenticated(res, req, user);
    } catch (error) {
      failure(res, 400, error instanceof Error ? error.message : "Account could not be created.");
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const email = normalizedEmail(req.body?.email);
      const password = validatedPassword(req.body?.password);
      const user = await db.getUserByEmail(email);
      if (!user || !(await verifyPassword(password, user.passwordHash))) return failure(res, 401, "Email or password is incorrect.");
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
      const refreshedUser = await db.getUserById(user.id);
      if (!refreshedUser) return failure(res, 401, "Email or password is incorrect.");
      await sendLocalAuthenticated(res, req, refreshedUser);
    } catch (error) {
      failure(res, 400, error instanceof Error ? error.message : "Unable to sign in.");
    }
  });

  app.post("/api/auth/request-password-reset", async (req: Request, res: Response) => {
    try {
      if (!emailDeliveryConfigured()) return failure(res, 503, "Email delivery is not configured yet. Contact support to reset your password.");
      const email = normalizedEmail(req.body?.email);
      const user = await db.getUserByEmail(email);
      const delivery = user ? await issueAccountEmail(req, user, "reset_password") : null;
      if (delivery && !delivery.delivered) console.warn("[Auth] Password reset email could not be delivered");
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({ ok: true, message: "If that email has a Lift Log account, check the inbox shortly. If no link arrives, try again later." });
    } catch (error) {
      failure(res, 400, error instanceof Error ? error.message : "Unable to request a reset link.");
    }
  });

  app.post("/api/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const token = typeof req.body?.token === "string" ? req.body.token : "";
      if (token.length < 20) throw new Error("This reset link is invalid.");
      const password = validatedPassword(req.body?.password);
      const accountToken = await db.consumeAccountToken(hashOpaqueToken(token), "reset_password");
      await db.replaceUserPassword(accountToken.userId, await hashPassword(password));
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({ ok: true, message: "Password updated. You can sign in now." });
    } catch (error) {
      failure(res, 400, error instanceof Error ? error.message : "Unable to reset your password.");
    }
  });

  app.post("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const token = typeof req.body?.token === "string" ? req.body.token : "";
      if (token.length < 20) throw new Error("This verification link is invalid.");
      const accountToken = await db.consumeAccountToken(hashOpaqueToken(token), "verify_email");
      await db.markEmailVerified(accountToken.userId);
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({ ok: true, message: "Email verified. You are ready to go." });
    } catch (error) {
      failure(res, 400, error instanceof Error ? error.message : "Unable to verify this email.");
    }
  });

  app.post("/api/auth/resend-verification", async (req: Request, res: Response) => {
    try {
      const user = await authenticateRequest(req);
      const delivery = await issueAccountEmail(req, user, "verify_email");
      if (!delivery.delivered) return failure(res, 503, delivery.reason);
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({ ok: true, message: "Verification email sent." });
    } catch (error) {
      failure(res, 400, error instanceof Error ? error.message : "Unable to send verification email.");
    }
  });

  app.post("/api/auth/claim-guest", async (req: Request, res: Response) => {
    try {
      const guestToken = req.body?.guestToken;
      const [targetUser, guestUser] = await Promise.all([authenticateRequest(req), authenticateGuestToken(guestToken)]);
      if (!targetUser || !guestUser) return failure(res, 401, "Both an authenticated account and a valid guest session are required.");
      if (targetUser.id === guestUser.id || targetUser.loginMethod === "guest") {
        return failure(res, 400, "Sign in to a different account before claiming guest data.");
      }
      const claimed = await db.claimGuestData(targetUser.id, guestUser.id);
      res.setHeader("Cache-Control", "private, no-store");
      res.json(claimed);
    } catch {
      failure(res, 400, "Guest data could not be claimed.");
    }
  });

  registerAppleAuthRoutes(app, {
    authenticateLocalRequest,
    sendAuthenticated: sendLocalAuthenticated,
  });
}
