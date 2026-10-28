import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import * as drive from "@/ops/drive";

import { getDriveCtx } from "../runtime-context";
import { withToolErrors } from "../toolkit/resolve";
import {
  createFolderFields,
  fileTarget,
  listFolderFields,
  moveFileFields,
  renameFileFields,
  searchFilesFields,
} from "../toolkit/schema";

const listPanelDrivesTool = createTool({
  id: "listDrives",
  description:
    "List the drives this view can see. Call this when you need a driveId or to tell the user which drive a file lives in.",
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) =>
    withToolErrors(async () => {
      const ctx = getDriveCtx(requestContext);
      return {
        scope: ctx.isAggregate ? "every drive in this workspace" : ctx.drives[0]?.email,
        ...drive.listDrives(ctx.drives),
      };
    }),
});

const listPanelFolderTool = createTool({
  id: "listFolder",
  description:
    "List the files and folders inside a folder in this view. Call it with no folderId for the top level, then pass a folder's fileId to go deeper.",
  inputSchema: z.object(listFolderFields),
  execute: async ({ folderId, cursor }, { requestContext }) =>
    withToolErrors(async () =>
      drive.listFolder(getDriveCtx(requestContext).surface, {
        folderId,
        cursor,
      }),
    ),
});

const searchPanelFilesTool = createTool({
  id: "searchFiles",
  description: "Search this view's drives for files and folders by name or content.",
  inputSchema: z.object(searchFilesFields),
  execute: async ({ query, cursor }, { requestContext }) =>
    withToolErrors(async () =>
      drive.searchFiles(getDriveCtx(requestContext).surface, {
        query,
        cursor,
      }),
    ),
});

const getPanelFileTool = createTool({
  id: "getFile",
  description:
    "Fetch one file or folder's details — name, size, type, when it changed, which folder holds it, and a link to open it at the provider.",
  inputSchema: z.object(fileTarget),
  execute: async ({ fileId }, { requestContext }) =>
    withToolErrors(async () => drive.getFile(getDriveCtx(requestContext).surface, fileId)),
});

const getPanelFileTextTool = createTool({
  id: "getFileText",
  description:
    "Read the contents of a plain-text file — notes, markdown, CSV, JSON, source code or config. Only works on text files.",
  inputSchema: z.object(fileTarget),
  execute: async ({ fileId }, { requestContext }) =>
    withToolErrors(async () => drive.getFileText(getDriveCtx(requestContext).surface, fileId)),
});

const createPanelFolderTool = createTool({
  id: "createFolder",
  description:
    "Create a new folder inside an existing folder, or at the top level when parentFolderId is omitted.",
  inputSchema: z.object({
    ...createFolderFields,
    summary: z.string().describe("Short description of what will be created"),
  }),
  requireApproval: true,
  execute: async ({ parentFolderId, name }, { requestContext }) =>
    withToolErrors(async () =>
      drive.createFolder(getDriveCtx(requestContext).surface, {
        parentFolderId,
        name,
      }),
    ),
});

const renamePanelFileTool = createTool({
  id: "renameFile",
  description: "Rename a file or folder.",
  inputSchema: z.object({
    ...renameFileFields,
    summary: z.string().describe("Short description of what will be renamed"),
  }),
  requireApproval: true,
  execute: async ({ fileId, name }, { requestContext }) =>
    withToolErrors(async () =>
      drive.renameFile(getDriveCtx(requestContext).surface, { fileId, name }),
    ),
});

const movePanelFileTool = createTool({
  id: "moveFile",
  description:
    "Move a file or folder into another folder in the same drive. Files cannot move between drives.",
  inputSchema: z.object({
    ...moveFileFields,
    summary: z.string().describe("Short description of what will be moved"),
  }),
  requireApproval: true,
  execute: async ({ fileId, parentFolderId }, { requestContext }) =>
    withToolErrors(async () =>
      drive.moveFile(getDriveCtx(requestContext).surface, {
        fileId,
        parentFolderId,
      }),
    ),
});

const deletePanelFileTool = createTool({
  id: "deleteFile",
  description:
    "Delete a file or folder. Google Drive and OneDrive move it to their trash; S3, WebDAV, FTP and SFTP delete it outright.",
  inputSchema: z.object({
    ...fileTarget,
    summary: z.string().describe("Short description of what will be deleted"),
  }),
  requireApproval: true,
  execute: async ({ fileId }, { requestContext }) =>
    withToolErrors(async () => drive.deleteFile(getDriveCtx(requestContext).surface, fileId)),
});

export const driveTools = {
  listDrives: listPanelDrivesTool,
  listFolder: listPanelFolderTool,
  searchFiles: searchPanelFilesTool,
  getFile: getPanelFileTool,
  getFileText: getPanelFileTextTool,
  createFolder: createPanelFolderTool,
  renameFile: renamePanelFileTool,
  moveFile: movePanelFileTool,
  deleteFile: deletePanelFileTool,
};
