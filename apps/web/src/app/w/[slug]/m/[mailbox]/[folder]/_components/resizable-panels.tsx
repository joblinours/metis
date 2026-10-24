"use client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@metis/ui/components/resizable";

import { useSavedLayout } from "@/hooks/use-saved-layout";

interface ResizablePanelsProps {
  children: [React.ReactNode, React.ReactNode];
  defaultLeftWidth?: number;
  minLeftWidth?: number;
  maxLeftWidth?: number;
  storageKey?: string;
}

export function ResizablePanels({
  children,
  defaultLeftWidth = 360,
  minLeftWidth = 260,
  maxLeftWidth = 720,
  storageKey = "metis-suite-split",
}: ResizablePanelsProps) {
  const { groupRef, onLayoutChanged } = useSavedLayout(storageKey);

  return (
    <ResizablePanelGroup id={storageKey} groupRef={groupRef} onLayoutChanged={onLayoutChanged}>
      <ResizablePanel
        id="list"
        defaultSize={defaultLeftWidth}
        minSize={minLeftWidth}
        maxSize={maxLeftWidth}
        groupResizeBehavior="preserve-pixel-size"
        className="flex flex-col overflow-hidden"
      >
        {children[0]}
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="detail" className="flex flex-col overflow-hidden">
        {children[1]}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
