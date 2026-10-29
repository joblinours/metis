import "server-only";
import { attachmentsRouter } from "./attachments";
import { customLabelsRouter } from "./custom-labels";
import { draftsRouter } from "./drafts";
import { foldersRouter } from "./folders";
import { labelsRouter } from "./labels";
import { messagesRouter } from "./messages";
import { muteRouter } from "./mute";
import { readLaterRouter } from "./read-later";
import { scheduledSendRouter } from "./scheduled-send";
import { subscriptionsRouter } from "./subscriptions";
import { threadRouter } from "./thread";

export const mailRouter = {
  messages: messagesRouter,
  drafts: draftsRouter,
  thread: threadRouter,
  attachments: attachmentsRouter,
  labels: labelsRouter,
  folders: foldersRouter,
  customLabels: customLabelsRouter,
  mute: muteRouter,
  readLater: readLaterRouter,
  scheduledSend: scheduledSendRouter,
  subscriptions: subscriptionsRouter,
};
