import {
  ArrowDown,
  ArrowLeft,
  ClipboardCheck,
  PackageCheck,
  ScanLine,
  Scissors,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { OrientalLogo } from "@/components/brand/oriental-logo";

import styles from "./factory-landing-page.module.css";

const productionStages = [
  {
    title: "المبيعات والاعتماد",
    description:
      "تسجيل العميل والموديل والمقاسات وإعداد أمر التفصيل. يراجع فريق الاعتماد الطلب لاعتماده وطباعته أو إعادته للتعديل.",
    icon: ClipboardCheck,
  },
  {
    title: "القص والإنتاج",
    description:
      "تجهيز القطع حسب مواصفات الأمر، ثم متابعة تقدم التصنيع والكميات وتسجيل مشكلات الإنتاج.",
    icon: Scissors,
  },
  {
    title: "الجودة والتغليف",
    description:
      "فحص القطع وتغليف المقبول منها، وإعادة القطع التي تحتاج إلى تصحيح ثم فحصها مرة أخرى.",
    icon: ScanLine,
  },
  {
    title: "المخزن والتسليم",
    description:
      "استلام القطع ومطابقة الكميات مع أمر التفصيل، ثم تجهيز الطلب المكتمل ومتابعته حتى التسليم.",
    icon: PackageCheck,
  },
] as const;

function StaffLoginLink({ className }: { className: string | undefined }) {
  return (
    <Link href="/auth/login" className={className}>
      تسجيل الدخول
      <ArrowLeft size={18} aria-hidden="true" />
    </Link>
  );
}

function FactoryHero() {
  return (
    <section className={styles["hero"]} aria-labelledby="factory-heading">
      <div className={styles["heroCopy"]}>
        <p className={styles["kicker"]}>مصنع الأحذية والمنتجات الجلدية</p>
        <h1 id="factory-heading">
          من أول تفصيل <br />
          إلى تسليم الحذاء
        </h1>
        <p className={styles["heroDescription"]}>
          نظام لإدارة طلبات تصنيع الأحذية في مصنع الحذاء الشرقي. يجمع فرق المصنع
          حول أمر تفصيل واحد يتابعونه من تسجيل الطلب حتى التسليم.
        </p>
        <div className={styles["heroActions"]}>
          <StaffLoginLink className={styles["lightButton"]} />
          <a href="#workflow" className={styles["workflowLink"]}>
            استكشف مراحل العمل
            <ArrowDown size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
      <div className={styles["heroMedia"]}>
        <Image
          src="/brand/shoemaking-workbench.webp"
          alt="صورة توضيحية لصانع أحذية يعمل على حذاء جلدي فوق طاولة العمل"
          fill
          sizes="(max-width: 860px) calc(100vw - 32px), (max-width: 1360px) 54vw, 698px"
          loading="eager"
          fetchPriority="high"
          className={styles["heroImage"]}
        />
      </div>
    </section>
  );
}

function ProductionWorkflow() {
  return (
    <section
      id="workflow"
      className={styles["workflow"]}
      aria-labelledby="workflow-heading"
    >
      <div className={styles["workflowIntro"]}>
        <h2 id="workflow-heading">رحلة أمر التفصيل</h2>
        <p>يتابع كل قسم الطلب من حيث انتهى القسم السابق.</p>
      </div>
      <ol className={styles["stages"]} role="list">
        {productionStages.map(
          ({ title, description, icon: StageIcon }, index) => (
            <li key={title} className={styles["stage"]}>
              <div className={styles["stageTop"]} aria-hidden="true">
                <span>{(index + 1).toLocaleString("ar-EG")}</span>
                <StageIcon size={26} strokeWidth={1.6} />
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}

function StaffPortal() {
  return (
    <section
      id="staff"
      className={styles["staff"]}
      aria-labelledby="staff-heading"
    >
      <div>
        <h2 id="staff-heading">مساحة عمل لكل فريق</h2>
        <p>
          سجّل الدخول ببريدك الإلكتروني وكلمة المرور للوصول إلى لوحة العمل
          الخاصة بدورك وقسمك. تتابع الإدارة الطلبات عبر الأقسام، وتراجع
          التقارير، وتدير حسابات الموظفين وصلاحياتهم.
        </p>
      </div>
      <StaffLoginLink className={styles["darkButton"]} />
    </section>
  );
}

export function FactoryLandingPage() {
  return (
    <div className={styles["page"]}>
      <header className={[styles["frame"], styles["header"]].join(" ")}>
        <Link href="/" className={styles["brand"]}>
          <OrientalLogo className={styles["brandMark"]} />
          <span>
            <strong>الحذاء الشرقي</strong>
            <span className={styles["brandEnglish"]} lang="en" dir="ltr">
              Oriental Shoes
            </span>
          </span>
        </Link>
        <nav className={styles["nav"]} aria-label="التنقل في الصفحة">
          <a href="#workflow">مراحل العمل</a>
          <a href="#staff">بوابة الموظفين</a>
        </nav>
        <StaffLoginLink className={styles["darkButton"]} />
      </header>

      <main className={styles["frame"]}>
        <FactoryHero />
        <ProductionWorkflow />
        <StaffPortal />
      </main>

      <footer className={[styles["frame"], styles["footer"]].join(" ")}>
        مصنع الحذاء الشرقي للمنتجات الجلدية
        <span lang="en" dir="ltr">
          Oriental Shoes
        </span>
      </footer>
    </div>
  );
}
