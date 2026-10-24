import { type BrandMark, ResendMail } from "@metis/ui/components/brand-marks";
import { AnthropicBlack } from "@metis/ui/components/svgs/anthropicBlack";
import { AnthropicWhite } from "@metis/ui/components/svgs/anthropicWhite";
import { AwsDark } from "@metis/ui/components/svgs/awsDark";
import { AwsLight } from "@metis/ui/components/svgs/awsLight";
import { Cloudflare } from "@metis/ui/components/svgs/cloudflare";
import { OllamaDark } from "@metis/ui/components/svgs/ollamaDark";
import { OllamaLight } from "@metis/ui/components/svgs/ollamaLight";
import { Openai } from "@metis/ui/components/svgs/openai";
import { OpenaiDark } from "@metis/ui/components/svgs/openaiDark";
import { OpenrouterDark } from "@metis/ui/components/svgs/openrouterDark";
import { OpenrouterLight } from "@metis/ui/components/svgs/openrouterLight";
import { Redis } from "@metis/ui/components/svgs/redis";
import { Sqlite } from "@metis/ui/components/svgs/sqlite";
import { TursoDark } from "@metis/ui/components/svgs/tursoDark";
import { TursoLight } from "@metis/ui/components/svgs/tursoLight";
import { Upstash } from "@metis/ui/components/svgs/upstash";
import { cn } from "@metis/ui/lib/utils";

import type { SystemVendor } from "@/server/schema";

function themed(Light: BrandMark, Dark: BrandMark): BrandMark {
  return ({ className }) => (
    <>
      <Light className={cn(className, "dark:hidden")} />
      <Dark className={cn(className, "hidden dark:block")} />
    </>
  );
}

const VENDORS: Record<SystemVendor, { label: string; Mark: BrandMark }> = {
  openai: { label: "OpenAI", Mark: themed(Openai, OpenaiDark) },
  anthropic: {
    label: "Anthropic",
    Mark: themed(AnthropicBlack, AnthropicWhite),
  },
  openrouter: {
    label: "OpenRouter",
    Mark: themed(OpenrouterLight, OpenrouterDark),
  },
  ollama: { label: "Ollama", Mark: themed(OllamaLight, OllamaDark) },
  redis: { label: "Redis", Mark: Redis },
  upstash: { label: "Upstash", Mark: Upstash },
  turso: { label: "libSQL / Turso", Mark: themed(TursoLight, TursoDark) },
  sqlite: { label: "SQLite", Mark: Sqlite },
  resend: { label: "Resend", Mark: ResendMail },
  aws: { label: "Amazon S3", Mark: themed(AwsLight, AwsDark) },
  cloudflare: { label: "Cloudflare R2", Mark: Cloudflare },
};

export function vendorLabel(vendor: SystemVendor): string {
  return VENDORS[vendor].label;
}

export function VendorMark({ vendor, className }: { vendor: SystemVendor; className?: string }) {
  const { Mark } = VENDORS[vendor];
  return <Mark className={cn("h-3.5 w-3.5 shrink-0", className)} />;
}

export function WithVendor({
  vendor,
  children,
}: {
  vendor: SystemVendor | null;
  children: React.ReactNode;
}) {
  if (!vendor) return children;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <VendorMark vendor={vendor} />
      {children}
    </span>
  );
}
