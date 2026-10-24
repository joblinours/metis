import { Client } from "@microsoft/microsoft-graph-client";
import type { Drive, DriveItem } from "@microsoft/microsoft-graph-types";

import { relayUnsupported } from "@/drive/relay";
import { bind } from "@/lib/bind";
import { ProviderError } from "@/lib/errors/provider-error";
import type {
  DriveDownloadTarget,
  DriveEntry,
  DriveListing,
  DriveQuota,
  DriveUploadSession,
  NewUpload,
} from "@/types/drive";

import type { DriveAdapter } from "../adapter";
import { textDriveSearch } from "../text-search";

export function microsoftDrive(accessToken: string): DriveAdapter {
  return bind<DriveAdapter, string>(
    {
      listFolder,
      search,
      searchAst: (token, query) =>
        textDriveSearch(query, (text, cursor) => search(token, text, cursor), {
          nameIsExact: false,
        }),
      getEntry,
      getDownloadTarget,
      createUploadSession,
      readStream: relayUnsupported,
      writeStream: relayUnsupported,
      createFolder,
      rename,
      move,
      delete: deleteEntry,
      quota,
    },
    accessToken,
  );
}

const SELECT = "id,name,size,lastModifiedDateTime,file,folder,parentReference,webUrl";
const DOWNLOAD_URL = "@microsoft.graph.downloadUrl";

const PAGE_SIZE = 200;
const CHUNK_SIZE = 320 * 1024 * 16;

interface GraphPage {
  value?: DriveItem[];
  "@odata.nextLink"?: string;
}

type DownloadableItem = DriveItem & { [DOWNLOAD_URL]?: string };

function getGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => done(null, accessToken),
  });
}

function itemPath(id: string | null): string {
  return id ? `/me/drive/items/${id}` : "/me/drive/root";
}

function toEntry(item: DriveItem): DriveEntry {
  const folder = item.folder !== undefined && item.folder !== null;
  return {
    id: item.id ?? "",
    name: item.name ?? "Untitled",
    kind: folder ? "folder" : "file",
    mimeType: item.file?.mimeType ?? null,
    size: typeof item.size === "number" ? item.size : null,
    modifiedAt: item.lastModifiedDateTime ?? null,
    parentId: item.parentReference?.id ?? null,
    webUrl: item.webUrl ?? null,
    native: false,
  };
}

function toListing(page: GraphPage): DriveListing {
  return {
    entries: (page.value ?? []).map(toEntry),
    cursor: page["@odata.nextLink"] ?? null,
  };
}

function foldersFirst(listing: DriveListing): DriveListing {
  const folders = listing.entries.filter((entry) => entry.kind === "folder");
  const files = listing.entries.filter((entry) => entry.kind !== "folder");
  return { ...listing, entries: [...folders, ...files] };
}

async function listFolder(
  accessToken: string,
  parentId: string | null,
  cursor?: string,
): Promise<DriveListing> {
  const client = getGraphClient(accessToken);
  const page: GraphPage = cursor
    ? await client.api(cursor).get()
    : await client
        .api(`${itemPath(parentId)}/children`)
        .select(SELECT)
        .top(PAGE_SIZE)
        .orderby("name")
        .get();
  return foldersFirst(toListing(page));
}

async function search(accessToken: string, query: string, cursor?: string): Promise<DriveListing> {
  const client = getGraphClient(accessToken);
  const page: GraphPage = cursor
    ? await client.api(cursor).get()
    : await client
        .api(`/me/drive/root/search(q='${query.replace(/'/g, "''")}')`)
        .select(SELECT)
        .top(PAGE_SIZE)
        .get();
  return toListing(page);
}

async function getEntry(accessToken: string, fileId: string): Promise<DriveEntry> {
  const item: DriveItem = await getGraphClient(accessToken)
    .api(itemPath(fileId))
    .select(SELECT)
    .get();
  return toEntry(item);
}

async function getDownloadTarget(
  accessToken: string,
  fileId: string,
): Promise<DriveDownloadTarget> {
  const item: DownloadableItem = await getGraphClient(accessToken)
    .api(itemPath(fileId))
    .select(`${SELECT},${DOWNLOAD_URL}`)
    .get();

  if (item.folder !== undefined && item.folder !== null) {
    return {
      kind: "unavailable",
      reason: "Folders cannot be downloaded",
      webUrl: item.webUrl ?? null,
    };
  }

  const url = item[DOWNLOAD_URL];
  if (!url) {
    return {
      kind: "unavailable",
      reason: "OneDrive did not offer a download link for this file",
      webUrl: item.webUrl ?? null,
    };
  }

  return {
    kind: "redirect",
    url,
    expiresAt: null,
    name: item.name ?? "download",
  };
}

async function createUploadSession(
  accessToken: string,
  upload: NewUpload,
): Promise<DriveUploadSession> {
  const parent = upload.parentId ? `/me/drive/items/${upload.parentId}` : "/me/drive/root";

  const session: { uploadUrl?: string } = await getGraphClient(accessToken)
    .api(`${parent}:/${encodeURIComponent(upload.name)}:/createUploadSession`)
    .post({ item: { "@microsoft.graph.conflictBehavior": "rename" } });

  if (!session.uploadUrl) {
    throw new ProviderError(
      "microsoft",
      502,
      "createUploadSession returned no uploadUrl",
      "OneDrive",
    );
  }

  return {
    strategy: "resumable",
    url: session.uploadUrl,
    headers: {},
    chunkSize: CHUNK_SIZE,
    authRequired: false,
  };
}

async function createFolder(
  accessToken: string,
  parentId: string | null,
  name: string,
): Promise<DriveEntry> {
  const created: DriveItem = await getGraphClient(accessToken)
    .api(`${itemPath(parentId)}/children`)
    .post({
      name,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    });
  return toEntry(created);
}

async function rename(accessToken: string, fileId: string, name: string): Promise<void> {
  await getGraphClient(accessToken).api(itemPath(fileId)).patch({ name });
}

async function move(
  accessToken: string,
  fileId: string,
  newParentId: string | null,
): Promise<void> {
  const parentReference = newParentId ? { id: newParentId } : { path: "/drive/root" };

  await getGraphClient(accessToken).api(itemPath(fileId)).patch({ parentReference });
}

async function deleteEntry(accessToken: string, fileId: string): Promise<void> {
  await getGraphClient(accessToken).api(itemPath(fileId)).delete();
}

async function quota(accessToken: string): Promise<DriveQuota | null> {
  const drive: Drive = await getGraphClient(accessToken).api("/me/drive").select("quota").get();

  const storage = drive.quota;
  if (!storage) return null;
  return {
    usedBytes: typeof storage.used === "number" ? storage.used : null,
    totalBytes: typeof storage.total === "number" ? storage.total : null,
  };
}
