"use client";

import type { ComponentType } from "react";

import type { WorkflowNode, WorkflowNodeKind } from "@/workflow/schema";

import { AskForm } from "./ask-form";
import { AutoBccForm } from "./auto-bcc-form";
import { BeforeSendForm } from "./before-send-form";
import { BranchForm } from "./branch-form";
import { ConditionForm } from "./condition-form";
import { LabelForm } from "./label-form";
import { MailboxSourceForm } from "./mailbox-source-form";
import { MergeForm } from "./merge-form";
import { NewMailForm } from "./new-mail-form";
import { OnceForm } from "./once-form";
import { ScheduleForm } from "./schedule-form";
import type { StepFormProps } from "./types";

const STEP_FORMS: { [K in WorkflowNodeKind]: ComponentType<StepFormProps<K>> | null } = {
  "trigger.newMail": NewMailForm,
  "trigger.schedule": ScheduleForm,
  "trigger.manual": null,
  "trigger.once": OnceForm,
  "trigger.beforeSend": BeforeSendForm,
  "mailbox.source": MailboxSourceForm,
  condition: ConditionForm,
  "decision.ask": AskForm,
  "decision.branch": BranchForm,
  "merge.append": MergeForm,
  "merge.join": MergeForm,
  "action.markRead": null,
  "action.star": null,
  "action.label": LabelForm,
  "action.mute": null,
  "action.archive": null,
  "action.trash": null,
  "action.restore": null,
  "action.send": null,
  "action.autoBcc": AutoBccForm,
  "action.system": null,
};

export function StepForm({
  node,
  patch,
  replace,
}: {
  node: WorkflowNode;
  patch: (next: Partial<WorkflowNode>) => void;
  replace: (node: WorkflowNode) => void;
}) {
  const Form =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- STEP_FORMS maps each kind to the form for that kind; TypeScript cannot correlate node.kind with that entry (microsoft/TypeScript#30581)
    STEP_FORMS[node.kind] as ComponentType<StepFormProps<WorkflowNodeKind>> | null;
  if (!Form) return null;
  return <Form node={node} patch={patch} replace={replace} />;
}

export function hasForm(kind: WorkflowNodeKind): boolean {
  return STEP_FORMS[kind] !== null;
}
