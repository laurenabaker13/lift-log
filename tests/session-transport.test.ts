import { describe, expect, it } from "vitest";
import { shouldAttachBearerSession } from "../lib/_core/session-transport";

describe("browser session transport", () => {
  it("uses the secure cookie for a same-origin browser API", () => {
    expect(shouldAttachBearerSession({
      platform: "web",
      apiBaseUrl: "",
      browserOrigin: "https://liftlog-uwz9xcwl.manus.space",
    })).toBe(false);

    expect(shouldAttachBearerSession({
      platform: "web",
      apiBaseUrl: "https://liftlog-uwz9xcwl.manus.space",
      browserOrigin: "https://liftlog-uwz9xcwl.manus.space",
    })).toBe(false);
  });

  it("keeps bearer sessions for native and explicitly cross-origin API requests", () => {
    expect(shouldAttachBearerSession({
      platform: "ios",
      apiBaseUrl: "https://api.example.test",
    })).toBe(true);

    expect(shouldAttachBearerSession({
      platform: "web",
      apiBaseUrl: "https://3000-i11f0f4bgy6btx89r4oll-87cf241c.us1.manus.computer",
      browserOrigin: "https://8328-i11f0f4bgy6btx89r4oll-87cf241c.us1.manus.computer",
    })).toBe(true);
  });
});
