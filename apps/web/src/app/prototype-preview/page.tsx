import { notFound } from "next/navigation";
import { MvpStoreProvider } from "@/features/prototype/state/mvp-store";
import { PrototypePreviewWorkspace } from "@/features/prototype/screens/prototype-preview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <MvpStoreProvider>
      <PrototypePreviewWorkspace />
    </MvpStoreProvider>
  );
}
