"use client";

import type { RefObject } from "react";

export const overlay: RefObject<HTMLElement> = {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- drei's Html `portal` prop takes a non-null RefObject<HTMLElement>; the stage assigns the element on mount, before any Html portals into it
  current: null as unknown as HTMLElement,
};
