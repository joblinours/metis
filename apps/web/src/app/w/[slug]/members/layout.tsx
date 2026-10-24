import type { Metadata } from "next";

export const metadata: Metadata = { title: "Members" };

export default function MembersLayout({ children }: LayoutProps<"/w/[slug]/members">) {
  return children;
}
