"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@metis/ui/components/alert-dialog";
import { Button } from "@metis/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@metis/ui/components/dialog";
import { Input } from "@metis/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Folder, Loader2 } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";

import { rpc } from "@/lib/orpc";
import type { DriveEntryRow, FileSearchHitDto } from "@/server/schema";

import type { SearchPrompts } from "./actions";

interface Pending<O, R> {
  opts: O;
  resolve: (value: R) => void;
}

type TextOpts = Parameters<SearchPrompts["askText"]>[0];
type ChoiceOpts = Parameters<SearchPrompts["askChoice"]>[0];
type ConfirmOpts = Parameters<SearchPrompts["confirm"]>[0];

function FolderPicker({
  workspaceSlug,
  entry,
  onDone,
}: {
  workspaceSlug: string;
  entry: FileSearchHitDto;
  onDone: (target: { parentId: string | null } | null) => void;
}) {
  const [trail, setTrail] = useState<{ id: string; name: string }[]>([]);
  const parentId = trail.at(-1)?.id ?? null;
  const query = useQuery(
    rpc.drive.list.queryOptions({
      input: { workspaceSlug, driveSlug: entry.driveSlug, parentId },
      select: (res): DriveEntryRow[] =>
        res.entries.filter((e) => e.kind === "folder" && e.id !== entry.id),
    }),
  );
  const folders = query.data ?? (query.isError ? [] : null);

  return (
    <Dialog open onOpenChange={(open) => !open && onDone(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move {entry.name}</DialogTitle>
        </DialogHeader>
        <nav className="flex flex-wrap items-center gap-1 text-[12px] text-faint">
          <Button variant="ghost" size="xs" onClick={() => setTrail([])}>
            {entry.driveSlug}
          </Button>
          {trail.map((crumb, i) => (
            <span key={crumb.id} className="flex items-center gap-1">
              <ChevronRight className="size-3" />
              <Button variant="ghost" size="xs" onClick={() => setTrail(trail.slice(0, i + 1))}>
                {crumb.name}
              </Button>
            </span>
          ))}
        </nav>
        <div className="max-h-72 overflow-y-auto">
          {folders === null ? (
            <Loader2 className="mx-auto size-4 animate-spin text-faint" />
          ) : folders.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-faint">No folders here.</p>
          ) : (
            <ul className="flex flex-col">
              {folders.map((folder) => (
                <li key={folder.id}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2 font-normal"
                    onClick={() => setTrail([...trail, { id: folder.id, name: folder.name }])}
                  >
                    <Folder className="size-4 text-faint" />
                    <span className="truncate">{folder.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onDone(null)}>
            Cancel
          </Button>
          <Button onClick={() => onDone({ parentId })} disabled={parentId === entry.parentId}>
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useSearchPrompts(workspaceSlug: string): {
  prompts: SearchPrompts;
  elements: ReactNode;
} {
  const [text, setText] = useState<Pending<TextOpts, string | null> | null>(null);
  const [value, setValue] = useState("");
  const [choice, setChoice] = useState<Pending<ChoiceOpts, string | null> | null>(null);
  const [confirm, setConfirm] = useState<Pending<ConfirmOpts, boolean> | null>(null);
  const [folder, setFolder] = useState<Pending<
    FileSearchHitDto,
    { parentId: string | null } | null
  > | null>(null);

  const askText = useCallback(
    (opts: TextOpts) =>
      new Promise<string | null>((resolve) => {
        setValue(opts.initial ?? "");
        setText({ opts, resolve });
      }),
    [],
  );
  const askChoice = useCallback(
    (opts: ChoiceOpts) => new Promise<string | null>((resolve) => setChoice({ opts, resolve })),
    [],
  );
  const askConfirm = useCallback(
    (opts: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirm({ opts, resolve })),
    [],
  );
  const pickFolder = useCallback(
    (entry: FileSearchHitDto) =>
      new Promise<{ parentId: string | null } | null>((resolve) =>
        setFolder({ opts: entry, resolve }),
      ),
    [],
  );

  const finishText = (result: string | null) => {
    text?.resolve(result?.trim() ? result.trim() : null);
    setText(null);
  };

  const elements = (
    <>
      <Dialog open={text !== null} onOpenChange={(o) => !o && finishText(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{text?.opts.title}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              finishText(value);
            }}
          >
            <Input
              autoFocus
              aria-label={text?.opts.label}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => finishText(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!value.trim()}>
                {text?.opts.confirm}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={choice !== null}
        onOpenChange={(o) => {
          if (o) return;
          choice?.resolve(null);
          setChoice(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{choice?.opts.title}</DialogTitle>
          </DialogHeader>
          <ul className="flex max-h-80 flex-col overflow-y-auto">
            {choice?.opts.options.map((option) => (
              <li key={option.value}>
                <Button
                  variant="ghost"
                  className="w-full justify-start font-normal"
                  onClick={() => {
                    choice.resolve(option.value);
                    setChoice(null);
                  }}
                >
                  {option.label}
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(o) => {
          if (o) return;
          confirm?.resolve(false);
          setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.opts.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.opts.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirm?.resolve(true);
                setConfirm(null);
              }}
            >
              {confirm?.opts.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {folder && (
        <FolderPicker
          workspaceSlug={workspaceSlug}
          entry={folder.opts}
          onDone={(target) => {
            folder.resolve(target);
            setFolder(null);
          }}
        />
      )}
    </>
  );

  return {
    prompts: { askText, askChoice, confirm: askConfirm, pickFolder },
    elements,
  };
}
