import type { ReactNode } from "react";

import { OrientalLogo } from "./oriental-logo";
import styles from "./oriental-status-page.module.css";

export function OrientalStatusPage({
  code,
  title,
  description,
  children,
}: Readonly<{
  code?: string;
  title: string;
  description: ReactNode;
  children: ReactNode;
}>) {
  return (
    <main className={styles["page"]} dir="rtl">
      <div className={styles["container"]}>
        <header className={styles["brand"]}>
          <OrientalLogo className={styles["logo"]} />
          <strong>مصنع الحذاء الشرقي</strong>
        </header>
        <section className={styles["panel"]}>
          {code === undefined ? null : <p className={styles["code"]}>{code}</p>}
          <h1>{title}</h1>
          <p className={styles["description"]}>{description}</p>
          <div className={styles["actions"]}>{children}</div>
        </section>
      </div>
    </main>
  );
}
