import { auth, drive, type drive_v3 } from "@googleapis/drive";

import { config } from "@/config";
import { relayUnsupported } from "@/drive/relay";
import { bind } from "@/lib/bind";
import { ProviderError } from "@/lib/errors/provider-error";
import { errorStatus } from "@/lib/token-map";
import { isPlainTerm, type TagToken, tagKey, tagText } from "@/search/ast";
import { parseSearchDate } from "@/search/dates";
import { compileWith, type Dialect, planPushdown } from "@/search/pushdown";
import { type AstSearch, SEARCH_PAGE_SIZE } from "@/search/types";
import type {
  DriveDownloadTarget,
  DriveEntry,
  DriveListing,
  DriveQuota,
  DriveUploadSession,
  NewUpload,
} from "@/types/drive";

import type { DriveAdapter, DriveChangeSignal } from "../adapter";

export function googleDrive(accessToken: string, selfEmail: string): DriveAdapter {
  return bind<DriveAdapter, string>(
    {
      listFolder,
      search,
      searchAst,
      getEntry,
      getDownloadTarget: (token, f) => getDownloadTarget(token, f, selfEmail),
      createUploadSession,
      readStream: relayUnsupported,
      writeStream: relayUnsupported,
      createFolder,
      rename,
      move,
      delete: deleteEntry,
      quota,
      changes,
    },
    accessToken,
  );
}

const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const NATIVE_PREFIX = "application/vnd.google-apps.";
const ROOT = "root";

const FIELDS = "id,name,mimeType,size,modifiedTime,parents,webViewLink";
const LIST_FIELDS = `nextPageToken,files(${FIELDS})`;
const DOWNLOAD_FIELDS = `${FIELDS},webContentLink,exportLinks`;

const PAGE_SIZE = 200;
const CHUNK_SIZE = 256 * 1024 * 32;

const EXPORT_FORMATS: Record<string, { mime: string; extension: string }> = {
  "application/vnd.google-apps.document": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
  },
  "application/vnd.google-apps.spreadsheet": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
  },
  "application/vnd.google-apps.presentation": {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extension: "pptx",
  },
  "application/vnd.google-apps.drawing": {
    mime: "image/png",
    extension: "png",
  },
  "application/vnd.google-apps.script": {
    mime: "application/vnd.google-apps.script+json",
    extension: "json",
  },
};

const CHANGE_PAGES = 20;

async function changes(
  accessToken: string,
  folderId: string | null,
  cursor: string | null,
): Promise<DriveChangeSignal | null> {
  const client = getDriveClient(accessToken);
  if (!cursor) {
    const start = await client.changes.getStartPageToken({});
    return start.data.startPageToken ? { cursor: start.data.startPageToken, changed: false } : null;
  }
  let pageToken = cursor;
  let changed = false;
  try {
    for (let page = 0; page < CHANGE_PAGES; page += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each page needs the previous page's token
      const res = await client.changes.list({
        pageToken,
        pageSize: 1000,
        includeRemoved: true,
        fields: "nextPageToken,newStartPageToken,changes(removed,file(parents))",
      });
      for (const change of res.data.changes ?? []) {
        if (change.removed || !folderId || (change.file?.parents ?? []).includes(folderId)) {
          changed = true;
        }
      }
      if (res.data.newStartPageToken) return { cursor: res.data.newStartPageToken, changed };
      if (!res.data.nextPageToken) break;
      pageToken = res.data.nextPageToken;
    }
  } catch (err) {
    const status = errorStatus(err);
    if (status === 404 || status === 410) return { cursor: "", changed: true, expired: true };
    throw err;
  }
  return { cursor: pageToken, changed };
}

function getDriveClient(accessToken: string): drive_v3.Drive {
  const client = new auth.OAuth2();
  client.setCredentials({ access_token: accessToken });
  return drive({ version: "v3", auth: client });
}

function quote(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function toEntry(file: drive_v3.Schema$File): DriveEntry {
  const mimeType = file.mimeType ?? null;
  const folder = mimeType === FOLDER_MIME;
  return {
    id: file.id ?? "",
    name: file.name ?? "Untitled",
    kind: folder ? "folder" : "file",
    mimeType,
    size: file.size ? Number(file.size) : null,
    modifiedAt: file.modifiedTime ?? null,
    parentId: file.parents?.[0] ?? null,
    webUrl: file.webViewLink ?? null,
    native: !folder && (mimeType?.startsWith(NATIVE_PREFIX) ?? false),
  };
}

function toListing(page: drive_v3.Schema$FileList): DriveListing {
  return {
    entries: (page.files ?? []).map(toEntry),
    cursor: page.nextPageToken ?? null,
  };
}

async function listFiles(
  accessToken: string,
  q: string,
  cursor?: string,
  orderBy?: string,
): Promise<DriveListing> {
  const res = await getDriveClient(accessToken).files.list({
    q,
    fields: LIST_FIELDS,
    pageSize: PAGE_SIZE,
    orderBy,
    spaces: "drive",
    pageToken: cursor,
  });
  return toListing(res.data);
}

function hasFullText(q: string): boolean {
  return /\bfullText contains\b/.test(q);
}

async function listFolder(
  accessToken: string,
  parentId: string | null,
  cursor?: string,
): Promise<DriveListing> {
  return listFiles(
    accessToken,
    `'${quote(parentId ?? ROOT)}' in parents and trashed = false`,
    cursor,
    "folder,name",
  );
}

async function search(accessToken: string, query: string, cursor?: string): Promise<DriveListing> {
  const term = quote(query);
  return listFiles(
    accessToken,
    `(name contains '${term}' or fullText contains '${term}') and trashed = false`,
    cursor,
  );
}

const KIND_QUERY: Record<string, { q: string; exact: boolean }> = {
  folder: { q: `mimeType = '${FOLDER_MIME}'`, exact: true },
  file: { q: `mimeType != '${FOLDER_MIME}'`, exact: true },
  pdf: { q: "mimeType = 'application/pdf'", exact: true },
  image: { q: "mimeType contains 'image/'", exact: true },
  video: { q: "mimeType contains 'video/'", exact: true },
  audio: { q: "mimeType contains 'audio/'", exact: true },
  document: {
    q: "(mimeType = 'application/vnd.google-apps.document' or mimeType contains 'wordprocessingml' or mimeType = 'application/msword')",
    exact: false,
  },
  spreadsheet: {
    q: "(mimeType = 'application/vnd.google-apps.spreadsheet' or mimeType contains 'spreadsheetml' or mimeType = 'application/vnd.ms-excel')",
    exact: false,
  },
  presentation: {
    q: "(mimeType = 'application/vnd.google-apps.presentation' or mimeType contains 'presentationml' or mimeType = 'application/vnd.ms-powerpoint')",
    exact: false,
  },
};

function googleDialect(timeZone: string): Dialect<string> {
  return {
    leaf(tag: TagToken) {
      const key = tagKey(tag);
      const text = tagText(tag) ?? "";
      if (key === "after" || key === "before" || key === "on" || key === "modified") {
        const span = parseSearchDate(text, timeZone);
        if (!span) return null;
        const start = new Date(span.start).toISOString();
        const end = new Date(Math.max(span.end, span.start + 86_400_000)).toISOString();
        const native =
          key === "after"
            ? `modifiedTime >= '${start}'`
            : key === "before"
              ? `modifiedTime < '${start}'`
              : `(modifiedTime >= '${start}' and modifiedTime < '${end}')`;
        return { native, exact: false };
      }
      if (!isPlainTerm(tag)) return null;
      const term = quote(text);
      if (key === null) {
        return {
          native: `(name contains '${term}' or fullText contains '${term}')`,
          exact: true,
        };
      }
      if (key === "name") return { native: `name contains '${term}'`, exact: true };
      if (key === "kind") {
        const kind = KIND_QUERY[text.toLowerCase()];
        return kind ? { native: kind.q, exact: kind.exact } : null;
      }
      return null;
    },
    and: (parts) => `(${parts.join(" and ")})`,
    or: (parts) => `(${parts.join(" or ")})`,
    not: (part) => `not ${part}`,
  };
}

async function searchAst(
  accessToken: string,
  astSearch: AstSearch<DriveEntry>,
): Promise<DriveListing> {
  const plan = planPushdown(astSearch.query, compileWith(googleDialect(astSearch.timeZone)));
  const q = [...plan.native, "trashed = false"].join(" and ");
  const res = await getDriveClient(accessToken).files.list({
    q,
    fields: LIST_FIELDS,
    pageSize: SEARCH_PAGE_SIZE,
    orderBy: hasFullText(q) ? undefined : "modifiedTime desc",
    spaces: "drive",
    pageToken: astSearch.cursor,
  });
  const listing = toListing(res.data);
  return {
    entries: await astSearch.accept(plan.residual, listing.entries),
    cursor: listing.cursor,
  };
}

async function getEntry(accessToken: string, fileId: string): Promise<DriveEntry> {
  const res = await getDriveClient(accessToken).files.get({
    fileId,
    fields: FIELDS,
  });
  return toEntry(res.data);
}

function withAuthUser(url: string, email: string): string {
  if (!email) return url;
  const target = new URL(url);
  target.searchParams.set("authuser", email);
  return target.toString();
}

function exportUrl(file: drive_v3.Schema$File): { url: string; extension: string } | null {
  const links = file.exportLinks ?? {};
  const preferred = EXPORT_FORMATS[file.mimeType ?? ""];
  const exact = preferred ? links[preferred.mime] : undefined;
  if (preferred && exact) {
    return { url: exact, extension: preferred.extension };
  }

  const [mime, url] = Object.entries(links)[0] ?? [];
  if (!mime || !url) return null;
  return { url, extension: mime.split("/").pop() ?? "bin" };
}

async function getDownloadTarget(
  accessToken: string,
  fileId: string,
  email: string,
): Promise<DriveDownloadTarget> {
  const res = await getDriveClient(accessToken).files.get({
    fileId,
    fields: DOWNLOAD_FIELDS,
  });
  const file = res.data;
  const entry = toEntry(file);

  if (entry.kind === "folder") {
    return {
      kind: "unavailable",
      reason: "Folders cannot be downloaded",
      webUrl: entry.webUrl,
    };
  }

  if (entry.native) {
    const target = exportUrl(file);
    if (!target) {
      return {
        kind: "unavailable",
        reason: "Google does not offer this document in a downloadable format",
        webUrl: entry.webUrl,
      };
    }
    return {
      kind: "redirect",
      url: withAuthUser(target.url, email),
      expiresAt: null,
      name: `${entry.name}.${target.extension}`,
    };
  }

  if (!file.webContentLink) {
    return {
      kind: "unavailable",
      reason: "Google did not offer a download link for this file",
      webUrl: entry.webUrl,
    };
  }

  return {
    kind: "redirect",
    url: withAuthUser(file.webContentLink, email),
    expiresAt: null,
    name: entry.name,
  };
}

async function createUploadSession(
  accessToken: string,
  upload: NewUpload,
): Promise<DriveUploadSession> {
  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": upload.mime,
      "X-Upload-Content-Length": String(upload.size),
      Origin: new URL(config.auth.url).origin,
    },
    body: JSON.stringify({
      name: upload.name,
      mimeType: upload.mime,
      parents: [upload.parentId ?? ROOT],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ProviderError("google", res.status, body, "Google Drive");
  }

  const url = res.headers.get("location");
  if (!url) {
    throw new ProviderError(
      "google",
      res.status,
      "resumable session carried no Location header",
      "Google Drive",
    );
  }

  return {
    strategy: "resumable",
    url,
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
  const res = await getDriveClient(accessToken).files.create({
    fields: FIELDS,
    requestBody: {
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId ?? ROOT],
    },
  });
  return toEntry(res.data);
}

async function rename(accessToken: string, fileId: string, name: string): Promise<void> {
  await getDriveClient(accessToken).files.update({
    fileId,
    requestBody: { name },
  });
}

async function move(
  accessToken: string,
  fileId: string,
  newParentId: string | null,
): Promise<void> {
  const client = getDriveClient(accessToken);
  const current = await client.files.get({ fileId, fields: "parents" });

  await client.files.update({
    fileId,
    addParents: newParentId ?? ROOT,
    removeParents: current.data.parents?.join(",") || undefined,
    fields: "id",
  });
}

async function deleteEntry(accessToken: string, fileId: string): Promise<void> {
  await getDriveClient(accessToken).files.update({
    fileId,
    requestBody: { trashed: true },
  });
}

async function quota(accessToken: string): Promise<DriveQuota | null> {
  const res = await getDriveClient(accessToken).about.get({
    fields: "storageQuota",
  });

  const storage = res.data.storageQuota;
  if (!storage) return null;
  return {
    usedBytes: storage.usage ? Number(storage.usage) : null,
    totalBytes: storage.limit ? Number(storage.limit) : null,
  };
}
