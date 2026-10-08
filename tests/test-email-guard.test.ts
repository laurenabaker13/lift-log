import { afterEach, describe, expect, it, vi } from "vitest";
import { isReservedTestEmail, sendTransactionalEmail } from "../server/_core/email";

afterEach(() => vi.unstubAllGlobals());
describe("fake-account email guard", () => {
  it("recognizes only reserved test domains", () => {
    expect(isReservedTestEmail("phone@liftlog.invalid")).toBe(true);
    expect(isReservedTestEmail("phone@liftlog.test")).toBe(true);
    expect(isReservedTestEmail("phone@localhost")).toBe(true);
    expect(isReservedTestEmail("phone@example.com")).toBe(false);
    expect(isReservedTestEmail("phone@invalid.com")).toBe(false);
  });
  it("never invokes an email provider for a fake account", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await sendTransactionalEmail({ to: "phone@liftlog.invalid", subject: "test", text: "test", html: "test" });
    expect(result.delivered).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
