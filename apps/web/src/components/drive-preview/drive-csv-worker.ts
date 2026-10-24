import Papa from "papaparse";

export interface CsvParseRequest {
  buffer: ArrayBuffer;
  delimiter: string;
  limit: number;
}

export type CsvParseResult = { ok: true; rows: string[][]; more: boolean } | { ok: false };

function parse({ buffer, delimiter, limit }: CsvParseRequest): CsvParseResult {
  const text = new TextDecoder("utf-8").decode(buffer);
  if (text.includes("\0")) return { ok: false };
  const result = Papa.parse<string[]>(text, {
    delimiter,
    skipEmptyLines: "greedy",
    preview: limit + 1,
  });
  if (result.data.length === 0 && result.errors.length > 0) {
    return { ok: false };
  }
  return {
    ok: true,
    rows: result.data.slice(0, limit),
    more: result.data.length > limit,
  };
}

self.addEventListener("message", (event: MessageEvent<CsvParseRequest>) => {
  let result: CsvParseResult;
  try {
    result = parse(event.data);
  } catch {
    result = { ok: false };
  }
  self.postMessage(result);
});
