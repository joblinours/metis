"use client";

import { areaY, barY, defineChart } from "@tanstack/charts";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";
import { useMemo } from "react";

import { AI_USAGE_FEATURE_LABELS } from "@/ai/usage-features";
import type { DashboardUsageByFeature, DashboardUsageDay } from "@/server/schema";

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const dayLabel = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const SERIES_INPUT = "Input";
const SERIES_OUTPUT = "Output";

interface DayPoint {
  day: string;
  series: string;
  tokens: number;
}

interface FeaturePoint {
  feature: string;
  tokens: number;
}

function chartTheme() {
  return {
    foreground: "var(--text-secondary)",
    muted: "var(--text-faint)",
    grid: "var(--border)",
    background: "transparent",
  };
}

export function DailyTokensChart({ daily }: { daily: DashboardUsageDay[] }) {
  const definition = useMemo(() => {
    const rows: DayPoint[] = daily.flatMap((d) => [
      {
        day: dayLabel.format(new Date(`${d.date}T00:00:00Z`)),
        series: SERIES_INPUT,
        tokens: d.inputTokens,
      },
      {
        day: dayLabel.format(new Date(`${d.date}T00:00:00Z`)),
        series: SERIES_OUTPUT,
        tokens: d.outputTokens,
      },
    ]);

    return defineChart({
      marks: [
        areaY(rows, {
          id: "tokens-area",
          x: "day",
          y: "tokens",
          z: "series",
          fillOpacity: 0.28,
          strokeWidth: 1.5,
        }),
      ],
      scales: {
        x: {
          scale: scalePoint,
          axis: { line: false, ticks: { size: 0, padding: 10 } },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: {
            line: false,
            ticks: { size: 0, padding: 8, format: (v) => compact.format(v) },
          },
        },
      },
      color: {
        domain: [SERIES_INPUT, SERIES_OUTPUT],
        range: ["var(--chart-1)", "var(--chart-2)"],
      },
      theme: chartTheme(),
      focus: "group-x",
      tooltip,
    });
  }, [daily]);

  return (
    <Chart
      definition={definition}
      height={220}
      initialWidth={720}
      ariaLabel="Input and output tokens per day"
    />
  );
}

export function FeatureTokensChart({ byFeature }: { byFeature: DashboardUsageByFeature[] }) {
  const definition = useMemo(() => {
    const rows: FeaturePoint[] = byFeature.map((f) => ({
      feature: AI_USAGE_FEATURE_LABELS[f.feature],
      tokens: f.totalTokens,
    }));

    return defineChart({
      marks: [
        barY(rows, {
          id: "feature-bars",
          x: "feature",
          y: "tokens",
          fill: "var(--chart-1)",
          radius: 6,
          maxThickness: 56,
        }),
      ],
      scales: {
        x: {
          scale: () => scaleBand().padding(0.28),
          axis: { line: false, ticks: { size: 0, padding: 10 } },
        },
        y: {
          scale: scaleLinear,
          nice: true,
          grid: true,
          axis: {
            line: false,
            ticks: { size: 0, padding: 8, format: (v) => compact.format(v) },
          },
        },
      },
      theme: chartTheme(),
      focus: "group-x",
      tooltip,
    });
  }, [byFeature]);

  return (
    <Chart
      definition={definition}
      height={220}
      initialWidth={720}
      ariaLabel="Total tokens by feature"
    />
  );
}
