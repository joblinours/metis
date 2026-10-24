import crypto from "node:crypto";

const TOLERANCE_SEC = 5 * 60;

export function verifyWebhook(args: { secret: string; body: string; headers: Headers }): boolean {
  const id = args.headers.get("svix-id") ?? args.headers.get("webhook-id");
  const timestamp = args.headers.get("svix-timestamp") ?? args.headers.get("webhook-timestamp");
  const signature = args.headers.get("svix-signature") ?? args.headers.get("webhook-signature");
  if (!id || !timestamp || !signature) return false;

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return false;
  if (Math.abs(Date.now() / 1000 - sent) > TOLERANCE_SEC) return false;

  const key = Buffer.from(args.secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${args.body}`)
    .digest();

  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    const presented = Buffer.from(value, "base64");
    if (presented.length === expected.length && crypto.timingSafeEqual(presented, expected)) {
      return true;
    }
  }

  return false;
}
