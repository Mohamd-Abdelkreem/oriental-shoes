import { MvpStoreProvider } from "@/features/prototype/state/mvp-store";
import { UnauthorizedView } from "@/features/prototype/screens/auth-views";

export default function Page() {
  return (
    <MvpStoreProvider>
      <UnauthorizedView />
    </MvpStoreProvider>
  );
}
