import { DriveNavigationProvider } from "@/drive/navigation";

export default function DriveTreeLayout({ children }: LayoutProps<"/w/[slug]/d">) {
  return <DriveNavigationProvider>{children}</DriveNavigationProvider>;
}
