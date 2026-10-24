"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@metis/ui/components/alert-dialog";
import { Button } from "@metis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@metis/ui/components/dialog";
import { Input } from "@metis/ui/components/input";
import { KeyRound, QrCode, ShieldCheck, ShieldOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { authClient, useSession } from "@/auth/client";
import { extractTotpSecret } from "@/auth/two-factor-code";
import { BackupCodesCard } from "@/components/backup-codes-card";
import { TwoFactorInput } from "@/components/two-factor-input";
import { useTwoFactorCode } from "@/hooks/use-two-factor-code";

import { DeleteAccountSection } from "./_components/delete-account-section";
import { SecurityActivitySection } from "./_components/security-activity-section";
import { SignInAlertsSection } from "./_components/sign-in-alerts-section";

export default function SecuritySettingsPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const twoFactorEnabled = session?.user?.twoFactorEnabled === true;

  const [regenSecret, setRegenSecret] = useState("");
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[]>([]);

  const [qrSecret, setQrSecret] = useState("");
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [qr, setQr] = useState<{ uri: string; url: string } | null>(null);
  const qrDataUrl = totpUri && qr?.uri === totpUri ? qr.url : null;

  const [disableSecret, setDisableSecret] = useState("");
  const [disableBusy, setDisableBusy] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const pwCode = useTwoFactorCode();
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState<"changed" | null>(null);

  useEffect(() => {
    if (!totpUri) return;
    QRCode.toDataURL(totpUri, { width: 200, margin: 1 }).then(
      (url) => setQr({ uri: totpUri, url }),
      () => setQr(null),
    );
  }, [totpUri]);

  const manualSecret = totpUri ? extractTotpSecret(totpUri) : null;

  async function regenerateCodes(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setRegenBusy(true);
    setRegenError(null);
    try {
      const res = await authClient.twoFactor.generateBackupCodes({
        password: regenSecret,
      });
      if (res.error) {
        setRegenError(res.error.message ?? "Could not regenerate codes");
        return;
      }
      setNewCodes(res.data?.backupCodes ?? []);
      setRegenSecret("");
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Could not regenerate codes");
    } finally {
      setRegenBusy(false);
    }
  }

  async function revealQr(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setQrBusy(true);
    setQrError(null);
    try {
      const res = await authClient.twoFactor.getTotpUri({ password: qrSecret });
      if (res.error) {
        setQrError(res.error.message ?? "Couldn't start authenticator setup. Try again.");
        return;
      }
      setTotpUri(res.data?.totpURI ?? null);
      setQrSecret("");
    } catch (err) {
      setQrError(
        err instanceof Error ? err.message : "Couldn't start authenticator setup. Try again.",
      );
    } finally {
      setQrBusy(false);
    }
  }

  function openPwDialog(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pwNew.length < 8) {
      setPwError("New password must be at least 8 characters");
      return;
    }
    setPwError(null);
    setPwDone(null);
    pwCode.reset();
    setPwDialogOpen(true);
  }

  async function changePassword(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setPwBusy(true);
    setPwError(null);
    try {
      const res = await authClient.changePassword(
        {
          currentPassword: pwCurrent,
          newPassword: pwNew,
          revokeOtherSessions: true,
        },
        { headers: { "x-totp-code": pwCode.value } },
      );
      if (res.error) {
        setPwError(res.error.message ?? "Could not change password");
        return;
      }
      setPwCurrent("");
      setPwNew("");
      pwCode.reset();
      setPwDialogOpen(false);
      setPwDone("changed");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Could not change password");
    } finally {
      setPwBusy(false);
    }
  }

  async function disableTwoFactor() {
    setDisableBusy(true);
    setDisableError(null);
    try {
      const res = await authClient.twoFactor.disable({
        password: disableSecret,
      });
      if (res.error) {
        setDisableError(res.error.message ?? "Could not disable 2FA");
        return;
      }
      router.push("/2fa/setup");
    } catch (err) {
      setDisableError(err instanceof Error ? err.message : "Could not disable 2FA");
    } finally {
      setDisableBusy(false);
      setConfirmDisableOpen(false);
    }
  }

  if (isPending) {
    return <div className="text-[13px] text-faint">Loading security settings…</div>;
  }

  return (
    <div>
      <h1 className="font-serif text-[28px] font-medium tracking-tight text-foreground">
        Security
      </h1>
      <p className="mt-1 text-[13px] text-faint">
        Manage two-factor authentication, your password and sign-in alerts.
      </p>

      {!twoFactorEnabled ? (
        <div className="mt-8 rounded-xl border border-border bg-surface p-4">
          <p className="text-[13px] text-foreground">Two-factor authentication is not enabled.</p>
          <Button className="mt-3" nativeButton={false} render={<Link href="/2fa/setup" />}>
            <ShieldCheck data-icon="inline-start" />
            Set up 2FA
          </Button>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-brand-text" />
              <h2 className="text-[13px] font-medium text-foreground">Regenerate backup codes</h2>
            </div>
            <p className="mt-1 text-[12px] text-faint">
              Generates a fresh set of one-time codes. Your previous backup codes stop working
              immediately; your authenticator app is not affected.
            </p>
            <form className="mt-3 flex gap-2" onSubmit={regenerateCodes}>
              <Input
                type="password"
                placeholder="Account password"
                autoComplete="current-password"
                value={regenSecret}
                onChange={(e) => setRegenSecret(e.target.value)}
                disabled={regenBusy}
                className="max-w-60"
              />
              <Button
                type="submit"
                variant="outline"
                disabled={regenBusy || regenSecret.length === 0}
              >
                Regenerate
              </Button>
            </form>
            {regenError && <p className="mt-2 text-[12px] text-destructive-text">{regenError}</p>}
            {newCodes.length > 0 && session && (
              <div className="mt-4">
                <BackupCodesCard codes={newCodes} accountEmail={session.user.email} />
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <QrCode className="size-4 text-brand-text" />
              <h2 className="text-[13px] font-medium text-foreground">Add another device</h2>
            </div>
            <p className="mt-1 text-[12px] text-faint">
              Shows the QR code for your existing secret so you can scan it with a second
              authenticator. Devices already set up keep working.
            </p>
            <form className="mt-3 flex gap-2" onSubmit={revealQr}>
              <Input
                type="password"
                placeholder="Account password"
                autoComplete="current-password"
                value={qrSecret}
                onChange={(e) => setQrSecret(e.target.value)}
                disabled={qrBusy}
                className="max-w-60"
              />
              <Button type="submit" variant="outline" disabled={qrBusy || qrSecret.length === 0}>
                Show QR code
              </Button>
            </form>
            {qrError && <p className="mt-2 text-[12px] text-destructive-text">{qrError}</p>}
            {qrDataUrl && (
              <div className="mt-4 flex flex-col items-start gap-2">
                <div className="rounded-lg border border-border bg-background p-3">
                  {/* oxlint-disable-next-line nextjs/no-img-element --data URL QR code */}
                  <img
                    src={qrDataUrl}
                    alt="QR code for your authenticator app"
                    width={200}
                    height={200}
                  />
                </div>
                {manualSecret && (
                  <details className="text-xs text-faint">
                    <summary className="cursor-pointer">Can't scan? Show manual key</summary>
                    <code className="mt-2 block break-all rounded bg-panel p-2 text-muted-foreground">
                      {manualSecret}
                    </code>
                  </details>
                )}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-muted-foreground" />
              <h2 className="text-[13px] font-medium text-foreground">Change password</h2>
            </div>
            <p className="mt-1 text-[12px] text-faint">
              Requires your current password. Other sessions are signed out.
            </p>
            <form onSubmit={openPwDialog} className="mt-3 flex gap-2">
              <Input
                type="password"
                value={pwCurrent}
                onChange={(e) => setPwCurrent(e.target.value)}
                placeholder="Current password"
                autoComplete="current-password"
                className="max-w-60"
                disabled={pwBusy}
              />
              <Input
                type="password"
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                className="max-w-60"
                disabled={pwBusy}
              />
              <Button
                type="submit"
                variant="outline"
                disabled={pwBusy || pwNew.length === 0 || pwCurrent.length === 0}
              >
                Change password
              </Button>
            </form>
            {pwError && !pwDialogOpen && (
              <p className="mt-2 text-[12px] text-destructive-text">{pwError}</p>
            )}
            {pwDone && (
              <p className="mt-2 text-[12px] text-primary">
                Password changed. Other sessions were signed out.
              </p>
            )}
          </section>

          {session && <SignInAlertsSection email={session.user.email} />}

          <section className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex items-center gap-2">
              <ShieldOff className="size-4 text-destructive-text" />
              <h2 className="text-[13px] font-medium text-foreground">
                Disable two-factor authentication
              </h2>
            </div>
            <p className="mt-1 text-[12px] text-destructive-muted">
              Turns off two-factor sign-in and deletes your backup codes. Mail access requires 2FA,
              so you'll be taken back to setup.
            </p>
            <div className="mt-3 flex gap-2">
              <Input
                type="password"
                placeholder="Account password"
                autoComplete="current-password"
                value={disableSecret}
                onChange={(e) => setDisableSecret(e.target.value)}
                disabled={disableBusy}
                className="max-w-60"
              />
              <Button
                variant="destructive"
                disabled={disableBusy || disableSecret.length === 0}
                onClick={() => setConfirmDisableOpen(true)}
              >
                Disable 2FA
              </Button>
            </div>
            {disableError && (
              <p className="mt-2 text-[12px] text-destructive-text">{disableError}</p>
            )}
          </section>

          <SecurityActivitySection />

          <DeleteAccountSection />
        </div>
      )}

      <Dialog open={pwDialogOpen} onOpenChange={setPwDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm password change</DialogTitle>
            <DialogDescription>
              Enter the code from your authenticator app, or a backup code, to confirm.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={changePassword} className="flex flex-col gap-3">
            <TwoFactorInput autoFocus field={pwCode.field} />
            {pwError && <p className="text-center text-[12px] text-destructive-text">{pwError}</p>}
            <Button
              type="submit"
              disabled={pwBusy || !pwCode.complete}
              className="mt-1 h-auto w-full rounded-xl py-3"
            >
              {pwBusy ? "Verifying…" : "Verify"}
            </Button>
            <Button
              variant="link"
              disabled={pwBusy}
              onClick={() => setPwDialogOpen(false)}
              className="h-auto p-0 text-center text-xs text-faint underline-offset-4"
            >
              Cancel
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDisableOpen} onOpenChange={setConfirmDisableOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable two-factor auth?</AlertDialogTitle>
            <AlertDialogDescription>
              Your authenticator entries and backup codes will stop working. You will need to set up
              2FA again to access your mail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disableBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={disableTwoFactor} disabled={disableBusy}>
              {disableBusy ? "Disabling…" : "Disable 2FA"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
