"use client";

import { Table } from "@metis/ui/components/table";
import { type ComponentProps, useEffect, useRef, useState } from "react";

export function ScrollTable(props: ComponentProps<typeof Table>) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const scroller = ref.current?.querySelector<HTMLElement>('[data-slot="table-container"]');
    if (!scroller) return;
    const update = () =>
      setMore(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1);
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      className="relative max-md:[&_tr>*:first-child]:sticky max-md:[&_tr>*:first-child]:left-0 max-md:[&_tr>*:first-child]:z-10 max-md:[&_tr>*:first-child]:bg-surface"
    >
      <Table {...props} />
      {more && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-surface to-transparent md:hidden"
        />
      )}
    </div>
  );
}
