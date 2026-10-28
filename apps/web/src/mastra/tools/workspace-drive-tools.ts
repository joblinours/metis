import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import * as drive from "@/ops/drive";

import { getWorkspaceCtx } from "../runtime-context";
import { requireDrive, withToolErrors } from "../toolkit/resolve";
import {
  createFolderFields,
  driveTarget,
  fileTarget,
  listFolderFields,
  moveFileFields,
  pinFolderFields,
  pinTarget,
  renameFileFields,
  searchFilesFields,
} from "../toolkit/schema";

const listDrivesTool = createTool({
  id: "listDrives",
  description:
    "List the file storage drives connected to this workspace — Google Drive, OneDrive, S3 buckets, WebDAV, FTP or SFTP servers. Call this when you need a driveId, or to tell the user which drives their files live in.",
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => drive.listDrives(getWorkspaceCtx(requestContext).drives)),
});

const listFolderTool = createTool({
  id: "listFolder",
  description:
    "List the files and folders inside a folder of ONE specific drive. Omit folderId for the drive's top level, then pass the fileId of a folder to go deeper. This is how you browse documents, spreadsheets, images and attachments stored in a drive.",
  inputSchema: z.object({ ...driveTarget, ...listFolderFields }),
  execute: async ({ driveId, folderId, cursor }, { requestContext }) =>
    withToolErrors(async () => {
      const r = requireDrive(getWorkspaceCtx(requestContext), driveId);
      if ("error" in r) return r;
      return drive.listFolder(r.drive, { folderId, cursor });
    }),
});

const searchFilesTool = createTool({
  id: "searchFiles",
  description:
    "Search connected drives for files and folders by name or content. Searches EVERY drive by default; pass driveId to search just one, which is also the only way to page with cursor. Use this to find a document, spreadsheet, PDF or image when you do not know which folder it is in.",
  inputSchema: z.object({
    ...searchFilesFields,
    driveId: z.string().optional().describe("Restrict the search to this one drive"),
  }),
  execute: async ({ query, cursor, driveId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      if (!driveId) return drive.searchAcross(ctx.drives, query);
      const r = requireDrive(ctx, driveId);
      if ("error" in r) return r;
      return drive.searchFiles(r.drive, { query, cursor });
    }),
});

const getFileTool = createTool({
  id: "getFile",
  description:
    "Fetch one file or folder's details — name, size, type, when it changed, which folder holds it, and a link to open it at the provider. Provide the driveId it belongs to.",
  inputSchema: z.object({ ...driveTarget, ...fileTarget }),
  execute: async ({ driveId, fileId }, { requestContext }) =>
    withToolErrors(async () => {
      const r = requireDrive(getWorkspaceCtx(requestContext), driveId);
      if ("error" in r) return r;
      return drive.getFile(r.drive, fileId);
    }),
});

const getFileTextTool = createTool({
  id: "getFileText",
  description:
    "Read the contents of a plain-text file in a drive — notes, markdown, CSV, JSON, source code or config. Only works on text files; use getFile for anything else. Provide the driveId it belongs to.",
  inputSchema: z.object({ ...driveTarget, ...fileTarget }),
  execute: async ({ driveId, fileId }, { requestContext }) =>
    withToolErrors(async () => {
      const r = requireDrive(getWorkspaceCtx(requestContext), driveId);
      if ("error" in r) return r;
      return drive.getFileText(r.drive, fileId);
    }),
});

const createFolderTool = createTool({
  id: "createFolder",
  description:
    "Create a new folder in a drive, inside an existing folder or at the drive's top level when parentFolderId is omitted.",
  inputSchema: z.object({ ...driveTarget, ...createFolderFields }),
  requireApproval: true,
  execute: async ({ driveId, parentFolderId, name }, { requestContext }) =>
    withToolErrors(async () => {
      const r = requireDrive(getWorkspaceCtx(requestContext), driveId);
      if ("error" in r) return r;
      return drive.createFolder(r.drive, { parentFolderId, name });
    }),
});

const renameFileTool = createTool({
  id: "renameFile",
  description: "Rename a file or folder in a drive.",
  inputSchema: z.object({ ...driveTarget, ...renameFileFields }),
  requireApproval: true,
  execute: async ({ driveId, fileId, name }, { requestContext }) =>
    withToolErrors(async () => {
      const r = requireDrive(getWorkspaceCtx(requestContext), driveId);
      if ("error" in r) return r;
      return drive.renameFile(r.drive, { fileId, name });
    }),
});

const moveFileTool = createTool({
  id: "moveFile",
  description:
    "Move a file or folder into another folder of the same drive, or to its top level when parentFolderId is omitted. Files cannot be moved between drives.",
  inputSchema: z.object({ ...driveTarget, ...moveFileFields }),
  requireApproval: true,
  execute: async ({ driveId, fileId, parentFolderId }, { requestContext }) =>
    withToolErrors(async () => {
      const r = requireDrive(getWorkspaceCtx(requestContext), driveId);
      if ("error" in r) return r;
      return drive.moveFile(r.drive, { fileId, parentFolderId });
    }),
});

const deleteFileTool = createTool({
  id: "deleteFile",
  description:
    "Delete a file or folder from a drive. Google Drive and OneDrive move it to their own trash; S3, WebDAV, FTP and SFTP delete it outright.",
  inputSchema: z.object({ ...driveTarget, ...fileTarget }),
  requireApproval: true,
  execute: async ({ driveId, fileId }, { requestContext }) =>
    withToolErrors(async () => {
      const r = requireDrive(getWorkspaceCtx(requestContext), driveId);
      if ("error" in r) return r;
      return drive.deleteFile(r.drive, fileId);
    }),
});

const listPinsTool = createTool({
  id: "listPins",
  description: "List the drive folders you pinned for quick access in this workspace.",
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      return drive.listPins(ctx.userId, ctx.drives);
    }),
});

const pinFolderTool = createTool({
  id: "pinFolder",
  description: "Pin a drive folder for quick access. The pin is yours alone; nobody else sees it.",
  inputSchema: z.object({
    ...pinFolderFields,
    summary: z.string().describe("Short description of the folder being pinned"),
  }),
  requireApproval: true,
  execute: async ({ driveId, folderId, label }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      const r = requireDrive(ctx, driveId);
      if ("error" in r) return r;
      return drive.pinFolder(ctx.userId, r.drive, { driveId, folderId, label });
    }),
});

const unpinFolderTool = createTool({
  id: "unpinFolder",
  description: "Remove one of your drive folder pins. The folder is untouched.",
  inputSchema: z.object({
    ...pinTarget,
    summary: z.string().describe("Short description of the pinned folder being removed"),
  }),
  requireApproval: true,
  execute: async ({ pinId }, { requestContext }) =>
    withToolErrors(async () => drive.unpinFolder(getWorkspaceCtx(requestContext).userId, pinId)),
});

const getDriveQuotaTool = createTool({
  id: "getDriveQuota",
  description:
    "Read how much storage each connected drive uses and has in total. Pass driveId for one drive; omit it for every drive.",
  inputSchema: z.object({ driveId: z.string().optional() }),
  execute: async ({ driveId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getWorkspaceCtx(requestContext);
      if (!driveId) return drive.getDriveQuota(ctx.drives);
      const r = requireDrive(ctx, driveId);
      if ("error" in r) return r;
      return drive.getDriveQuota(ctx.drives.filter((d) => d.driveId === driveId));
    }),
});

export const workspaceDriveTools = {
  listDrives: listDrivesTool,
  listFolder: listFolderTool,
  searchFiles: searchFilesTool,
  getFile: getFileTool,
  getFileText: getFileTextTool,
  createFolder: createFolderTool,
  renameFile: renameFileTool,
  moveFile: moveFileTool,
  deleteFile: deleteFileTool,
  listPins: listPinsTool,
  pinFolder: pinFolderTool,
  unpinFolder: unpinFolderTool,
  getDriveQuota: getDriveQuotaTool,
};
