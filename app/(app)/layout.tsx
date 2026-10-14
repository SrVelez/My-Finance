import { Suspense, type ReactNode } from "react";
import { BottomNav } from "@/components/BottomNav";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="flex flex-1 flex-col">{children}</div>
      {/* usePathname() em rotas dinâmicas só resolve em tempo de requisição. */}
      <Suspense fallback={<div className="sticky bottom-0 h-14 border-t border-line bg-surface" />}>
        <BottomNav />
      </Suspense>
    </>
  );
}
