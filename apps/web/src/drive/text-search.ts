import { tagKey } from "@/search/ast";
import { pickText } from "@/search/pushdown";
import type { AstSearch } from "@/search/types";
import type { DriveEntry, DriveListing } from "@/types/drive";

export async function textDriveSearch(
  search: AstSearch<DriveEntry>,
  run: (text: string, cursor?: string) => Promise<DriveListing>,
  opts: { nameIsExact: boolean },
): Promise<DriveListing> {
  const picked = pickText(search.query, (tag) => {
    const key = tagKey(tag);
    if (key === null) return { exact: true };
    if (key === "name") return { exact: opts.nameIsExact };
    return null;
  });
  if (!picked.text) return { entries: [], cursor: null };
  const listing = await run(picked.text, search.cursor);
  return {
    entries: await search.accept(picked.residual, listing.entries),
    cursor: listing.cursor,
  };
}
