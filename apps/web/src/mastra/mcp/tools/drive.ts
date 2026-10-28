import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import { requireDrive, withToolErrors } from "@/mastra/toolkit/resolve";
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
} from "@/mastra/toolkit/schema";
import * as drive from "@/ops/drive";

import { mcpScopeFromCall } from "../context";
import { inWorkspace, workspaceTarget } from "../schema";

export const listDrives = createTool({
  id: "listDrives",
  description:
    "List the file storage drives connected to one Metis Suite workspace — Google Drive, OneDrive, S3 buckets, WebDAV, FTP or SFTP servers. Call this first to learn which driveId values exist in that workspace.",
  inputSchema: z.object(workspaceTarget),
  execute: async ({ workspaceId }, { requestContext }) =>
    withToolErrors(async () =>
      drive.listDrives((await mcpScopeFromCall(requestContext, workspaceId)).drives),
    ),
});

export const listFolder = createTool({
  id: "listFolder",
  description:
    "List the files and folders inside a folder of ONE specific drive. Omit folderId for the drive's top level, then pass the fileId of a folder to go deeper.",
  inputSchema: inWorkspace({ ...driveTarget, ...listFolderFields }),
  execute: async ({ workspaceId, driveId, folderId, cursor }, { requestContext }) =>
    withToolErrors(async () => {
      const r = requireDrive(await mcpScopeFromCall(requestContext, workspaceId), driveId);
      if ("error" in r) return r;
      return drive.listFolder(r.drive, { folderId, cursor });
    }),
});

export const searchFiles = createTool({
  id: "searchFiles",
  description:
    "Search a workspace's connected drives for files and folders by name or content. Searches EVERY drive in that workspace by default; pass driveId to search just one, which is also the only way to page with cursor. Use this to find a document, spreadsheet, PDF or image when you do not know which folder holds it.",
  inputSchema: inWorkspace({
    ...searchFilesFields,
    driveId: z.string().optional().describe("Restrict the search to this one drive"),
  }),
  execute: async ({ workspaceId, query, cursor, driveId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      if (!driveId) return drive.searchAcross(ctx.drives, query);
      const r = requireDrive(ctx, driveId);
      if ("error" in r) return r;
      return drive.searchFiles(r.drive, { query, cursor });
    }),
});

export const getFile = createTool({
  id: "getFile",
  description:
    "Fetch one file or folder's details — name, size, type, when it changed, which folder holds it, and a link to open it at the provider. Provide the driveId it belongs to.",
  inputSchema: inWorkspace({ ...driveTarget, ...fileTarget }),
  execute: async ({ workspaceId, driveId, fileId }, { requestContext }) =>
    withToolErrors(async () => {
      const r = requireDrive(await mcpScopeFromCall(requestContext, workspaceId), driveId);
      if ("error" in r) return r;
      return drive.getFile(r.drive, fileId);
    }),
});

export const getFileText = createTool({
  id: "getFileText",
  description:
    "Read the contents of a plain-text file in a drive — notes, markdown, CSV, JSON, source code or config. Only works on text files. Provide the driveId it belongs to.",
  inputSchema: inWorkspace({ ...driveTarget, ...fileTarget }),
  execute: async ({ workspaceId, driveId, fileId }, { requestContext }) =>
    withToolErrors(async () => {
      const r = requireDrive(await mcpScopeFromCall(requestContext, workspaceId), driveId);
      if ("error" in r) return r;
      return drive.getFileText(r.drive, fileId);
    }),
});

export const createFolder = createTool({
  id: "createFolder",
  description:
    "Create a new folder in a drive, inside an existing folder or at the drive's top level when parentFolderId is omitted.",
  inputSchema: inWorkspace({ ...driveTarget, ...createFolderFields }),
  execute: async ({ workspaceId, driveId, parentFolderId, name }, { requestContext }) =>
    withToolErrors(async () => {
      const r = requireDrive(await mcpScopeFromCall(requestContext, workspaceId), driveId);
      if ("error" in r) return r;
      return drive.createFolder(r.drive, { parentFolderId, name });
    }),
});

export const renameFile = createTool({
  id: "renameFile",
  description: "Rename a file or folder in a drive.",
  inputSchema: inWorkspace({ ...driveTarget, ...renameFileFields }),
  execute: async ({ workspaceId, driveId, fileId, name }, { requestContext }) =>
    withToolErrors(async () => {
      const r = requireDrive(await mcpScopeFromCall(requestContext, workspaceId), driveId);
      if ("error" in r) return r;
      return drive.renameFile(r.drive, { fileId, name });
    }),
});

export const moveFile = createTool({
  id: "moveFile",
  description:
    "Move a file or folder into another folder of the same drive, or to its top level when parentFolderId is omitted. Files cannot be moved between drives.",
  inputSchema: inWorkspace({ ...driveTarget, ...moveFileFields }),
  execute: async ({ workspaceId, driveId, fileId, parentFolderId }, { requestContext }) =>
    withToolErrors(async () => {
      const r = requireDrive(await mcpScopeFromCall(requestContext, workspaceId), driveId);
      if ("error" in r) return r;
      return drive.moveFile(r.drive, { fileId, parentFolderId });
    }),
});

export const deleteFile = createTool({
  id: "deleteFile",
  description:
    "Delete a file or folder from a drive. Google Drive and OneDrive move it to their own trash; S3, WebDAV, FTP and SFTP delete it outright.",
  inputSchema: inWorkspace({ ...driveTarget, ...fileTarget }),
  execute: async ({ workspaceId, driveId, fileId }, { requestContext }) =>
    withToolErrors(async () => {
      const r = requireDrive(await mcpScopeFromCall(requestContext, workspaceId), driveId);
      if ("error" in r) return r;
      return drive.deleteFile(r.drive, fileId);
    }),
});

export const listPins = createTool({
  id: "listPins",
  description: "List the drive folders you pinned for quick access in one workspace.",
  inputSchema: z.object(workspaceTarget),
  execute: async ({ workspaceId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      return drive.listPins(ctx.userId, ctx.drives);
    }),
});

export const pinFolder = createTool({
  id: "pinFolder",
  description: "Pin a drive folder for quick access. The pin is yours alone; nobody else sees it.",
  inputSchema: inWorkspace(pinFolderFields),
  execute: async ({ workspaceId, driveId, folderId, label }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      const r = requireDrive(ctx, driveId);
      if ("error" in r) return r;
      return drive.pinFolder(ctx.userId, r.drive, { driveId, folderId, label });
    }),
});

export const unpinFolder = createTool({
  id: "unpinFolder",
  description: "Remove one of your drive folder pins. The folder is untouched.",
  inputSchema: inWorkspace(pinTarget),
  execute: async ({ workspaceId, pinId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      return drive.unpinFolder(ctx.userId, pinId);
    }),
});

export const getDriveQuota = createTool({
  id: "getDriveQuota",
  description:
    "Read how much storage each drive in one workspace uses and has in total. Pass driveId for one drive; omit it for every drive.",
  inputSchema: inWorkspace({ driveId: z.string().optional() }),
  execute: async ({ workspaceId, driveId }, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = await mcpScopeFromCall(requestContext, workspaceId);
      if (!driveId) return drive.getDriveQuota(ctx.drives);
      const r = requireDrive(ctx, driveId);
      if ("error" in r) return r;
      return drive.getDriveQuota(ctx.drives.filter((d) => d.driveId === driveId));
    }),
});
