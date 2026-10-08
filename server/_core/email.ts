import { ENV } from "./env";

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export function emailDeliveryConfigured() {
  return Boolean(ENV.resendApiKey && ENV.resendFromEmail);
}

export function isReservedTestEmail(address: string) {
  return /@(?:[^@]+\.)?(?:invalid|test|localhost)$/i.test(address.trim());
}

export async function sendTransactionalEmail(message: TransactionalEmail) {
  if (isReservedTestEmail(message.to)) {
    return { delivered: false as const, reason: "Email is disabled for test accounts." };
  }
  if (!emailDeliveryConfigured()) {
    return { delivered: false as const, reason: "Email delivery is not configured yet." };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ENV.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ENV.resendFromEmail,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[Email] Transactional delivery failed", response.status, detail.slice(0, 200));
    return { delivered: false as const, reason: "Email could not be delivered." };
  }

  return { delivered: true as const };
}

export function safeBrowserOrigin(requestOrigin: string | undefined, fallbackOrigin: string) {
  const candidate = requestOrigin?.trim() || fallbackOrigin;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.origin : fallbackOrigin;
  } catch {
    return fallbackOrigin;
  }
}

export function actionLink(origin: string, path: string, token: string) {
  return `${origin}${path}?token=${encodeURIComponent(token)}`;
}
