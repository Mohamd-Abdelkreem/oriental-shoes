import { notFound } from "next/navigation";
import { MvpStoreProvider } from "@/features/prototype/state/mvp-store";
import { OtpVerificationView } from "@/features/prototype/screens/auth-views";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <MvpStoreProvider>
      <OtpVerificationView />
    </MvpStoreProvider>
  );
}
