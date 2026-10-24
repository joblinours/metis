import { Directory, File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";

import { log, urlPath } from "./log";

function downloadsFolder(): Directory {
  const folder = new Directory(Paths.cache, "downloads");
  if (folder.exists) folder.delete();
  folder.create();
  return folder;
}

export async function downloadAndShare(url: string): Promise<void> {
  log("download started", { url: urlPath(url) });
  const file = await File.downloadFileAsync(url, downloadsFolder());
  log("download finished", { name: file.name });
  await shareAsync(file.uri);
}
