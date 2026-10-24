import * as OTPAuth from "otpauth";

import { type Enrollment, enrollmentSchema } from "../lib/enrollment";

const MIN_REMAINING_SEC = 5;

export async function loadEnrollment(): Promise<Enrollment> {
  return enrollmentSchema.parse(
    await Bun.file(new URL("./enrollment.json", import.meta.url)).json(),
  );
}

function remainingSeconds(totp: OTPAuth.TOTP): number {
  return totp.period - (Math.floor(Date.now() / 1000) % totp.period);
}

function totpFor(enrollment: Enrollment): OTPAuth.TOTP {
  const totp = OTPAuth.URI.parse(enrollment.totpURI);
  if (!(totp instanceof OTPAuth.TOTP)) {
    throw new Error("enrollment.json totpURI is not a TOTP URI");
  }
  return totp;
}

function unknownUser(req: Request, enrollment: Enrollment): Response | null {
  const email = new URL(req.url).searchParams.get("email");
  if (!email || email.toLowerCase() === enrollment.email.toLowerCase()) {
    return null;
  }
  return new Response(`no enrolled user ${email}\n`, { status: 404 });
}

async function currentCode(req: Request, enrollment: Enrollment) {
  const totp = totpFor(enrollment);
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  if (fresh && remainingSeconds(totp) < MIN_REMAINING_SEC) {
    await Bun.sleep(remainingSeconds(totp) * 1000 + 250);
  }
  return { code: totp.generate(), expiresInSeconds: remainingSeconds(totp) };
}

export function totpRoutes(enrollment: Enrollment) {
  return {
    "/totp": async (req: Request) =>
      unknownUser(req, enrollment) ??
      new Response(`${(await currentCode(req, enrollment)).code}\n`),
    "/totp.json": async (req: Request) =>
      unknownUser(req, enrollment) ??
      Response.json({
        email: enrollment.email,
        ...(await currentCode(req, enrollment)),
      }),
    "/backup-codes": (req: Request) =>
      unknownUser(req, enrollment) ??
      Response.json({
        email: enrollment.email,
        backupCodes: enrollment.backupCodes,
      }),
    "/account": (req: Request) => unknownUser(req, enrollment) ?? Response.json(enrollment),
  };
}
