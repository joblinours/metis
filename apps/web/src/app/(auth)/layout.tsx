import { SourceLink } from "@/components/source-link";
import { sourceInfo } from "@/source-info";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="relative min-h-dvh [&>*:first-child]:pb-16">
      {children}
      <footer className="absolute inset-x-0 bottom-0 flex justify-center px-4 pb-4">
        <SourceLink source={sourceInfo()} />
      </footer>
    </div>
  );
}
