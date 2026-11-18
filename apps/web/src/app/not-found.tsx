import Link from "next/link";

export default function NotFound() {
  return (
    <main className="state-page">
      <p className="eyebrow">404</p>
      <h1>الصفحة غير موجودة</h1>
      <Link href="/">العودة إلى الصفحة الرئيسية</Link>
    </main>
  );
}
