"use client";

import { Input } from "@metis/ui/components/input";
import { Switch } from "@metis/ui/components/switch";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@metis/ui/components/table";
import {
  type Column,
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_includesString,
  rowSortingFeature,
  type SortFn,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { fileExtension, TABLE_ROW_LIMIT } from "@/drive/preview";

import type { CsvParseRequest, CsvParseResult } from "./drive-csv-worker";
import { DrivePreviewLoading } from "./drive-preview-loading";

type CsvRow = string[];

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
});

type Features = typeof features;

const helper = createColumnHelper<Features, CsvRow>();
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});
const compareCells: SortFn<Features, CsvRow> = (a, b, columnId) =>
  collator.compare(a.getValue<string>(columnId), b.getValue<string>(columnId));

const ROW_HEIGHT = 30;
const FILTER_DELAY_MS = 150;

function parseCsv(blob: Blob, name: string): Promise<CsvParseResult> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./drive-csv-worker.ts", import.meta.url), {
      type: "module",
    });
    const finish = (result: CsvParseResult) => {
      worker.terminate();
      resolve(result);
    };
    worker.addEventListener("message", (event: MessageEvent<CsvParseResult>) => finish(event.data));
    worker.addEventListener("error", () => finish({ ok: false }));
    blob
      .arrayBuffer()
      .then((buffer) => {
        const request: CsvParseRequest = {
          buffer,
          delimiter: fileExtension(name) === "tsv" ? "\t" : "",
          limit: TABLE_ROW_LIMIT + 1,
        };
        worker.postMessage(request, [buffer]);
      })
      .catch(() => finish({ ok: false }));
  });
}

function ColumnFilter({ column }: { column: Column<Features, CsvRow> }) {
  const [value, setValue] = useState(() => {
    const current = column.getFilterValue();
    return typeof current === "string" ? current : "";
  });

  useEffect(() => {
    const timer = setTimeout(() => column.setFilterValue(value || undefined), FILTER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [column, value]);

  return (
    <Input
      value={value}
      onChange={(event) => setValue(event.target.value)}
      placeholder="Filter"
      aria-label={`Filter ${String(column.columnDef.header ?? "")}`}
      className="h-6 px-1.5 text-[11px]"
    />
  );
}

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ArrowUp className="size-3 shrink-0" />;
  if (sorted === "desc") return <ArrowDown className="size-3 shrink-0" />;
  return <ArrowUpDown className="size-3 shrink-0 opacity-40" />;
}

function CsvTable({ rows, firstRowIsHeader }: { rows: CsvRow[]; firstRowIsHeader: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);

  const { columns, data } = useMemo(() => {
    const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const names = firstRowIsHeader ? (rows[0] ?? []) : [];
    const definitions = helper.columns(
      Array.from({ length: width }, (_, index) =>
        helper.accessor((row: CsvRow) => row[index] ?? "", {
          id: String(index),
          header: names[index]?.trim() || `Column ${index + 1}`,
          sortFn: compareCells,
          filterFn: "includesString",
        }),
      ),
    );
    const body = firstRowIsHeader ? rows.slice(1) : rows;
    return { columns: definitions, data: body.slice(0, TABLE_ROW_LIMIT) };
  }, [rows, firstRowIsHeader]);

  const table = useTable({ features, columns, data });
  const tableRows = table.getRowModel().rows;

  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual is used as documented; the React Compiler is not enabled
  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => tableRows[index]?.id ?? index,
    overscan: 12,
  });

  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
      <table data-slot="table" className="grid w-max min-w-full text-[12px]">
        <TableHeader className="sticky top-0 z-10 grid bg-background">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="flex hover:bg-transparent">
              <TableHead className="flex h-auto w-14 shrink-0 items-end justify-end py-1.5 text-[11px] text-faint">
                #
              </TableHead>
              {group.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className="flex h-auto w-32 shrink-0 grow flex-col items-stretch gap-1 py-1.5"
                >
                  <button
                    type="button"
                    onClick={header.column.getToggleSortingHandler()}
                    className="flex min-w-0 items-center gap-1 text-left text-[11px] font-medium"
                  >
                    <span className="truncate">{String(header.column.columnDef.header ?? "")}</span>
                    <SortIcon sorted={header.column.getIsSorted()} />
                  </button>
                  <ColumnFilter column={header.column} />
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className="relative grid" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = tableRows[item.index];
            if (!row) return null;
            return (
              <TableRow
                key={row.id}
                className="absolute flex w-full"
                style={{
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <TableCell className="w-14 shrink-0 py-1 text-right text-faint">
                  {row.index + 1}
                </TableCell>
                {row.getAllCells().map((cell) => {
                  const value = cell.getValue<string>();
                  return (
                    <TableCell
                      key={cell.id}
                      title={value}
                      className="w-32 shrink-0 grow truncate py-1"
                    >
                      {value}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </table>
      {tableRows.length === 0 && (
        <p className="p-6 text-center text-[12px] text-faint">No rows match these filters</p>
      )}
    </div>
  );
}

export function DrivePreviewTable({
  blob,
  name,
  onFail,
}: {
  blob: Blob;
  name: string;
  onFail: () => void;
}) {
  const [loaded, setLoaded] = useState<{
    blob: Blob;
    name: string;
    rows: CsvRow[];
    more: boolean;
  } | null>(null);
  const parsed = loaded?.blob === blob && loaded.name === name ? loaded : null;
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);

  useEffect(() => {
    let active = true;
    void parseCsv(blob, name).then((result) => {
      if (!active) return;
      if (result.ok) setLoaded({ blob, name, rows: result.rows, more: result.more });
      else onFail();
    });
    return () => {
      active = false;
    };
  }, [blob, name, onFail]);

  if (parsed === null) return <DrivePreviewLoading />;

  const dataRows = parsed.rows.length - (firstRowIsHeader ? 1 : 0);
  const truncated = parsed.more || dataRows > TABLE_ROW_LIMIT;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <span className="text-[11px] text-faint">
          {truncated
            ? `Showing the first ${TABLE_ROW_LIMIT.toLocaleString()} rows`
            : `${Math.max(0, dataRows).toLocaleString()} rows`}
        </span>
        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
          First row is the header
          <Switch
            checked={firstRowIsHeader}
            onCheckedChange={(checked) => setFirstRowIsHeader(checked)}
          />
        </label>
      </div>
      <CsvTable rows={parsed.rows} firstRowIsHeader={firstRowIsHeader} />
    </div>
  );
}
