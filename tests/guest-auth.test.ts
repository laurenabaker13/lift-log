import { createHash } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  APPLE_ISSUER,
  APPLE_NATIVE_AUDIENCE,
  appleNonceMatches,
  verifyAppleIdentityToken,
} from "../server/_core/apple-auth";
import { isLocalSessionUser } from "../server/_core/local-auth";
import type { User } from "../drizzle/schema";

function user(overrides: Partial<User>): User {
  return {
    id: 1,
    openId: "guest:session",
    name: null,
    email: null,
    passwordHash: null,
    inviteCode: null,
    loginMethod: "guest",
    emailVerifiedAt: null,
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

async function signedAppleToken(input: {
  issuer?: string;
  audience?: string;
  nonce: string;
  email?: string;
}) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  const jwks = createLocalJWKSet({ keys: [{ ...publicJwk, kid: "test-apple-key", alg: "RS256", use: "sig" }] });
  const token = await new SignJWT({ nonce: input.nonce, ...(input.email ? { email: input.email } : {}) })
    .setProtectedHeader({ alg: "RS256", kid: "test-apple-key" })
    .setIssuer(input.issuer ?? APPLE_ISSUER)
    .setAudience(input.audience ?? APPLE_NATIVE_AUDIENCE)
    .setSubject("001234.abcdef")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  return { token, jwks };
}

describe("guest local authentication", () => {
  it("recognizes only signed-session account types with matching durable openId prefixes", () => {
    expect(isLocalSessionUser(user({ loginMethod: "guest", openId: "guest:random" }))).toBe(true);
    expect(isLocalSessionUser(user({ loginMethod: "email_password", openId: "email:athlete@example.com" }))).toBe(true);
    expect(isLocalSessionUser(user({ loginMethod: "apple", openId: "apple:001234.abcdef" }))).toBe(true);
    expect(isLocalSessionUser(user({ loginMethod: "guest", openId: "email:athlete@example.com" }))).toBe(false);
    expect(isLocalSessionUser(user({ loginMethod: "manus", openId: "guest:random" }))).toBe(false);
  });
});

describe("native Apple identity token validation", () => {
  it("accepts a valid signed token with the raw Expo nonce", async () => {
    const rawNonce = "raw-nonce-from-challenge";
    const { token, jwks } = await signedAppleToken({ nonce: rawNonce, email: "Athlete@Example.com" });

    await expect(verifyAppleIdentityToken(token, rawNonce, jwks)).resolves.toEqual({
      sub: "001234.abcdef",
      email: "athlete@example.com",
    });
  });

  it("accepts Apple's SHA-256 nonce claim and rejects a mismatched nonce", async () => {
    const rawNonce = "another-raw-nonce";
    const hashedNonce = createHash("sha256").update(rawNonce).digest("hex");
    const { token, jwks } = await signedAppleToken({ nonce: hashedNonce });

    await expect(verifyAppleIdentityToken(token, rawNonce, jwks)).resolves.toEqual({
      sub: "001234.abcdef",
      email: null,
    });
    await expect(verifyAppleIdentityToken(token, "wrong-nonce", jwks)).rejects.toThrow("nonce");
    expect(appleNonceMatches(hashedNonce, rawNonce)).toBe(true);
    expect(appleNonceMatches(rawNonce, rawNonce)).toBe(true);
  });

  it("rejects a correctly signed token for the wrong issuer or native audience", async () => {
    const rawNonce = "nonce";
    const wrongIssuer = await signedAppleToken({ nonce: rawNonce, issuer: "https://example.invalid" });
    const wrongAudience = await signedAppleToken({ nonce: rawNonce, audience: "com.example.other" });

    await expect(verifyAppleIdentityToken(wrongIssuer.token, rawNonce, wrongIssuer.jwks)).rejects.toThrow();
    await expect(verifyAppleIdentityToken(wrongAudience.token, rawNonce, wrongAudience.jwks)).rejects.toThrow();
  });
});
