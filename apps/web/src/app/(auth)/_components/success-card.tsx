import { Button } from "@metis/ui/components/button";
import { Mail } from "lucide-react";
export function SuccessCard({
  title,
  body,
  onReset,
  resetLabel = "Use a different email",
  onResend,
  resendBusy = false,
  resendInfo,
}: {
  title: string;
  body: React.ReactNode;
  onReset: () => void;
  resetLabel?: string;
  onResend?: () => void;
  resendBusy?: boolean;
  resendInfo?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-6 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft">
        <Mail aria-hidden className="h-4.5 w-4.5 text-brand-text" />
      </div>
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
      <p className="mt-1.5 text-xs text-neutral-500">{body}</p>
      {resendInfo && (
        <p className="mt-3 text-xs text-neutral-600 dark:text-neutral-300">{resendInfo}</p>
      )}
      {onResend && (
        <Button
          variant="link"
          disabled={resendBusy}
          onClick={onResend}
          className="mt-4 h-auto w-full p-0 text-xs font-medium text-neutral-900 underline-offset-4 hover:underline dark:text-neutral-100"
        >
          {resendBusy ? "Sending…" : "Resend verification email"}
        </Button>
      )}
      <Button
        variant="link"
        onClick={onReset}
        className="mt-3 h-auto p-0 text-xs text-neutral-500 underline-offset-4 hover:underline"
      >
        {resetLabel}
      </Button>
    </div>
  );
}
