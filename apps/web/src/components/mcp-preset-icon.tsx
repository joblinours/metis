import { ClaudeAiIcon } from "@metis/ui/components/svgs/claudeAiIcon";
import { CursorDark } from "@metis/ui/components/svgs/cursorDark";
import { CursorLight } from "@metis/ui/components/svgs/cursorLight";
import { Openai } from "@metis/ui/components/svgs/openai";
import { OpenaiDark } from "@metis/ui/components/svgs/openaiDark";
import { Vscode } from "@metis/ui/components/svgs/vscode";
import { cn } from "@metis/ui/lib/utils";
import { Bot } from "lucide-react";

import type { McpPresetId } from "@/mcp/presets";

export function McpPresetIcon({
  preset,
  className,
}: {
  preset: McpPresetId | null;
  className?: string;
}) {
  const size = cn("size-full", className);

  switch (preset) {
    case "claude-code":
    case "claude-desktop":
      return <ClaudeAiIcon className={size} />;
    case "codex":
      return (
        <>
          <Openai className={cn(size, "dark:hidden")} />
          <OpenaiDark className={cn(size, "hidden dark:block")} />
        </>
      );
    case "cursor-desktop":
    case "cursor-web":
      return (
        <>
          <CursorLight className={cn(size, "dark:hidden")} />
          <CursorDark className={cn(size, "hidden dark:block")} />
        </>
      );
    case "vscode":
      return <Vscode className={size} />;
    default:
      return <Bot className={cn(size, "text-faint")} />;
  }
}
