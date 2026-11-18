import type { ReactNode } from "react";

import { OrientalLogo } from "@/components/brand/oriental-logo";

export function AuthShell({
  eyebrow,
  title,
  summary,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-shell oriental-auth">
      <div className="oriental-auth__stack">
        <header className="oriental-auth__brand">
          <OrientalLogo className="oriental-auth__mark" />
          <strong>مصنع الحذاء الشرقي</strong>
          <p>{eyebrow}</p>
        </header>
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="oriental-auth__card-head">
            <h1 id="auth-title">{title}</h1>
            <p className="auth-card__summary">{summary}</p>
          </div>
          <div className="oriental-auth__card-body">{children}</div>
        </section>
      </div>
    </main>
  );
}
