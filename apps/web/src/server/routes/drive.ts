import "server-only";
import { ORPCError } from "@orpc/server";

import { resolveDriveAccount } from "@/drive/aggregate";
import { listDrivePins, pinDriveFolder, unpinDriveFolder } from "@/drive/pins";
import { driveQuotas } from "@/drive/quota";

import { driveSession } from "../middlewares/drive-session";
import {
  beginDriveUploadInputSchema,
  beginDriveUploadOutputSchema,
  createDriveFolderInputSchema,
  createDrivePinInputSchema,
  deleteDrivePinInputSchema,
  driveEntryInputSchema,
  driveEntrySchema,
  driveListingOutputSchema,
  driveQuotasOutputSchema,
  driveScopeSchema,
  listDriveFolderInputSchema,
  listDrivePinsOutputSchema,
  moveDriveEntryInputSchema,
  renameDriveEntryInputSchema,
  searchDriveInputSchema,
  successSchema,
} from "../schema";

function fail(err: unknown): ORPCError<"BAD_GATEWAY", unknown> {
  return new ORPCError("BAD_GATEWAY", { cause: err });
}

export const driveRouter = {
  quotas: driveSession(driveScopeSchema)
    .output(driveQuotasOutputSchema)
    .handler(async ({ context }) => driveQuotas(context.drive.drives)),

  list: driveSession(listDriveFolderInputSchema)
    .output(driveListingOutputSchema)
    .handler(async ({ input, context }) => {
      try {
        return await context.drive.surface.listFolder(input.parentId ?? null, input.cursor);
      } catch (err) {
        throw fail(err);
      }
    }),

  search: driveSession(searchDriveInputSchema)
    .output(driveListingOutputSchema)
    .handler(async ({ input, context }) => {
      try {
        return await context.drive.surface.search(input.query, input.cursor);
      } catch (err) {
        throw fail(err);
      }
    }),

  get: driveSession(driveEntryInputSchema)
    .output(driveEntrySchema)
    .handler(async ({ input, context }) => {
      try {
        return await context.drive.surface.getEntry(input.fileId);
      } catch (err) {
        throw fail(err);
      }
    }),

  createFolder: driveSession(createDriveFolderInputSchema)
    .output(driveEntrySchema)
    .handler(async ({ input, context }) => {
      try {
        return await context.drive.surface.createFolder(input.parentId ?? null, input.name);
      } catch (err) {
        throw fail(err);
      }
    }),

  rename: driveSession(renameDriveEntryInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      try {
        await context.drive.surface.rename(input.fileId, input.name);
        return { success: true as const };
      } catch (err) {
        throw fail(err);
      }
    }),

  move: driveSession(moveDriveEntryInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      try {
        await context.drive.surface.move(input.fileId, input.parentId);
        return { success: true as const };
      } catch (err) {
        throw fail(err);
      }
    }),

  delete: driveSession(driveEntryInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      try {
        await context.drive.surface.delete(input.fileId);
        return { success: true as const };
      } catch (err) {
        throw fail(err);
      }
    }),

  pins: driveSession(driveScopeSchema)
    .output(listDrivePinsOutputSchema)
    .handler(async ({ context }) => ({
      pins: await listDrivePins(context.appUser.userId, context.drive.drives),
    })),

  pin: driveSession(createDrivePinInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      const account = resolveDriveAccount(context.drive.drives, input.driveId);
      await pinDriveFolder({
        userId: context.appUser.userId,
        driveId: account.driveId,
        folderId: input.folderId,
        label: input.label,
      });
      return { success: true as const };
    }),

  unpin: driveSession(deleteDrivePinInputSchema)
    .output(successSchema)
    .handler(async ({ input, context }) => {
      await unpinDriveFolder({
        userId: context.appUser.userId,
        pinId: input.pinId,
      });
      return { success: true as const };
    }),

  beginUpload: driveSession(beginDriveUploadInputSchema)
    .output(beginDriveUploadOutputSchema)
    .handler(async ({ input, context }) => {
      try {
        return await context.drive.surface.createUploadSession(input.parentId ?? null, {
          name: input.name,
          size: input.size,
          mime: input.mime,
        });
      } catch (err) {
        throw fail(err);
      }
    }),
};
