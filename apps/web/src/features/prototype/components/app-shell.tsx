"use client";

import React, { useState, useMemo } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronLeft, ChevronRight, LogOut, Menu, X } from "lucide-react";
import {
  roleBase,
  roleNav,
  roleNames,
  roleUsers,
  type Role,
} from "@/features/prototype/fixtures/prototype-data";
import {
  useMvpStore,
  formatOrderCount,
} from "@/features/prototype/state/mvp-store";
import { computeNavBadges } from "@/features/prototype/state/workflow";

export type ShellProps = {
  role: Role;
  accountName: string;
  canAccessAllSections: boolean;
  onSignOut: () => void;
  signingOut: boolean;
  signOutError: string | null;
  breadcrumbs?: { label: string | undefined; href?: string }[];
  children: React.ReactNode;
};

function computeDefaultBreadcrumbs(
  pathname: string,
  role: Role,
  navItems: { label: string; href: string }[],
): { label: string; href?: string }[] {
  const rootHref = `/${role === "special" ? "special-operations" : role}/dashboard`;
  const crumbs: { label: string; href?: string }[] = [
    { label: roleNames[role], href: rootHref },
  ];

  // 1. Orders routes: /admin/orders/[id] or /sales/orders/[id]
  const orderDetailMatch = pathname.match(/^\/(admin|sales)\/orders\/(.+)$/);
  if (orderDetailMatch) {
    const sub = orderDetailMatch[2];
    const baseOrdersNav = navItems.find((item) =>
      item.href.endsWith("/orders"),
    );
    crumbs.push({
      label: baseOrdersNav?.label || "جميع الطلبات",
      href: `/${role}/orders`,
    });

    if (sub === "new") {
      crumbs.push({ label: "إنشاء أمر تفصيل جديد" });
    } else if (sub === "drafts") {
      crumbs.push({ label: "المسودات المحفوظة" });
    } else if (sub === "returned") {
      crumbs.push({ label: "طلبات معادة للتعديل" });
    } else {
      crumbs.push({ label: `تفاصيل الطلب (${decodeURIComponent(sub ?? "")})` });
    }
    return crumbs;
  }

  // 2. Customer detail routes: /[role]/customers/[phone]
  const custDetailMatch = pathname.match(/^\/(admin|sales)\/customers\/(.+)$/);
  if (custDetailMatch) {
    const custId = decodeURIComponent(custDetailMatch[2] ?? "");
    crumbs.push({
      label: "إدارة العملاء",
      href: `/${role}/customers`,
    });
    if (custId.endsWith("/edit")) {
      const actualPhone = custId.replace(/\/edit$/, "");
      crumbs.push({
        label: `ملف العميل (${actualPhone})`,
        href: `/${role}/customers/${encodeURIComponent(actualPhone)}`,
      });
      crumbs.push({ label: "تعديل البيانات" });
    } else {
      crumbs.push({ label: `ملف العميل (${custId})` });
    }
    return crumbs;
  }

  // 3. Approval detail: /approval/orders/[id] or /approval/review/[id]
  const approvalReviewMatch = pathname.match(
    /^\/approval\/(?:orders|review)\/(.+)$/,
  );
  if (approvalReviewMatch) {
    crumbs.push({
      label: "بانتظار الاعتماد",
      href: "/approval/pending",
    });
    crumbs.push({
      label: `مراجعة أمر التفصيل (${decodeURIComponent(approvalReviewMatch[1] ?? "")})`,
    });
    return crumbs;
  }

  // 4. Tasks detail: /[dept]/tasks/[id]
  const taskDetailMatch = pathname.match(/^\/([^/]+)\/tasks\/(.+)$/);
  if (taskDetailMatch) {
    const taskId = decodeURIComponent(taskDetailMatch[2] ?? "");
    crumbs.push({
      label: "مهام القسم",
      href: `/${role === "special" ? "special-operations" : role}/dashboard`,
    });
    crumbs.push({ label: `تفاصيل المهمة (${taskId})` });
    return crumbs;
  }

  // 5. Account route
  if (pathname.endsWith("/account")) {
    crumbs.push({ label: "الملف الشخصي والحساب" });
    return crumbs;
  }

  // 6. Users management subpages: /admin/users/pending
  if (
    pathname === "/admin/users/pending" ||
    pathname === "/admin/registration-requests"
  ) {
    crumbs.push({ label: "إدارة المستخدمين", href: "/admin/users" });
    crumbs.push({ label: "طلبات التسجيل المعلقة" });
    return crumbs;
  }

  // 7. Exact match in nav
  const exactNav = navItems.find((item) => item.href === pathname);
  if (exactNav) {
    if (exactNav.href !== rootHref) {
      crumbs.push({ label: exactNav.label });
    }
    return crumbs;
  }

  // 8. General prefix match in nav
  const prefixNav = navItems
    .filter(
      (item) => item.href !== rootHref && pathname.startsWith(item.href + "/"),
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (prefixNav) {
    crumbs.push({ label: prefixNav.label });
    return crumbs;
  }

  crumbs.push({ label: "لوحة التحكم" });
  return crumbs;
}

export function AppShell({
  role,
  accountName,
  canAccessAllSections,
  onSignOut,
  signingOut,
  signOutError,
  breadcrumbs,
  children,
}: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const store = useMvpStore();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("factory_sidebar_collapsed");
        if (saved !== null) return saved === "true";
      } catch {
        // Ignore in restricted environments
      }
    }
    return false;
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("factory_sidebar_collapsed", String(next));
      } catch {
        // Ignore
      }
      return next;
    });
  };

  // Keyboard shortcut: Ctrl + B or Cmd + B
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const navItems = useMemo(() => roleNav[role], [role]);
  const user = {
    ...roleUsers[role],
    name: accountName,
    title: canAccessAllSections
      ? "\u0645\u062f\u064a\u0631 \u0627\u0644\u0646\u0638\u0627\u0645"
      : roleUsers[role].title,
  };
  const badges = computeNavBadges(store);

  // Compute default breadcrumbs if not provided
  const finalBreadcrumbs =
    breadcrumbs || computeDefaultBreadcrumbs(pathname, role, navItems);

  // Normalize pathname for alias routes and role base shortcuts
  const effectivePathname = useMemo(() => {
    if (pathname === "/admin/registration-requests") {
      return "/admin/users/pending";
    }
    const rootHref = `/${role === "special" ? "special-operations" : role}/dashboard`;
    const baseHref = `/${role === "special" ? "special-operations" : role}`;
    if (pathname === baseHref || pathname === `${baseHref}/`) {
      return rootHref;
    }
    return pathname;
  }, [pathname, role]);

  // Determine which single nav item is active
  const activeNavItemHref = useMemo(() => {
    // 1. Exact match has highest priority
    const exact = navItems.find((item) => item.href === effectivePathname);
    if (exact) {
      return exact.href;
    }

    // 2. Sub-route prefix match (e.g. /admin/orders/[id] -> /admin/orders)
    // Must be separated by slash so that /admin/users doesn't falsely match other routes
    const prefixMatches = navItems.filter((item) => {
      if (item.href.endsWith("/dashboard")) {
        return false;
      }
      return effectivePathname.startsWith(item.href + "/");
    });

    if (prefixMatches.length > 0) {
      // Pick the longest matching prefix (most specific route)
      prefixMatches.sort((a, b) => b.href.length - a.href.length);
      return prefixMatches[0]?.href ?? null;
    }

    // 3. Fallback for dashboard root
    const rootHref = `/${role === "special" ? "special-operations" : role}/dashboard`;
    if (effectivePathname === rootHref) {
      return rootHref;
    }

    return null;
  }, [navItems, effectivePathname, role]);

  return (
    <div
      className={`oriental-layout ${collapsed ? "sidebar-is-collapsed" : ""}`}
      dir="rtl"
    >
      {/* 1. Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="oriental-mobile-backdrop"
          onClick={() => {
            setMobileOpen(false);
          }}
          aria-hidden="true"
        />
      )}

      {/* 2. Fixed Right Sidebar */}
      <aside className={`oriental-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        {/* Brand Header */}
        <div className="oriental-sidebar-header">
          {collapsed ? (
            <button
              type="button"
              className="oriental-collapsed-logo-btn"
              onClick={toggleCollapsed}
              aria-label="توسيع القائمة"
              title="توسيع القائمة (Ctrl+B)"
            >
              <div className="oriental-logo-icon">OS</div>
              <span className="oriental-expand-icon-badge">
                <ChevronLeft size={11} />
              </span>
            </button>
          ) : (
            <>
              <div className="oriental-brand-logo">
                <div className="oriental-logo-icon">OS</div>
                <div className="oriental-brand-text">
                  <span className="oriental-brand-title">الحذاء الشرقي</span>
                  <span className="oriental-brand-sub">
                    إدارة التصنيع والتفصيل
                  </span>
                </div>
              </div>

              {/* Desktop Collapse Toggle */}
              <button
                type="button"
                className="oriental-collapse-btn"
                onClick={toggleCollapsed}
                aria-label="طي القائمة"
                title="طي القائمة (Ctrl+B)"
              >
                <ChevronRight size={16} />
              </button>
            </>
          )}

          {/* Mobile Close Button */}
          <button
            type="button"
            className="oriental-mobile-close"
            onClick={() => {
              setMobileOpen(false);
            }}
            aria-label="إغلاق القائمة"
          >
            <X size={18} />
          </button>
        </div>

        {/* Current Workspace Pill / Plan Badge */}
        {!collapsed ? (
          <div className="oriental-role-pill">
            <span className="oriental-role-dot" />
            <span className="oriental-role-label">{roleNames[role]}</span>
          </div>
        ) : (
          <div
            className="oriental-role-pill-mini"
            title={`النطاق الحالي: ${roleNames[role]}`}
            onClick={toggleCollapsed}
            style={{ cursor: "pointer" }}
          >
            <span className="oriental-role-dot" />
          </div>
        )}

        {/* Role Navigation Menu */}
        <nav className="oriental-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === activeNavItemHref;
            const badgeCount = item.badgeKey ? badges[item.badgeKey] || 0 : 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`oriental-nav-link ${isActive ? "active" : ""}`}
                onClick={() => {
                  setMobileOpen(false);
                }}
              >
                <div className="oriental-nav-icon-wrap">
                  <Icon size={18} />
                  {isActive && <span className="oriental-active-dot" />}
                  {collapsed && badgeCount > 0 && (
                    <span className="oriental-nav-badge-mini">
                      {badgeCount}
                    </span>
                  )}
                </div>

                {!collapsed && (
                  <>
                    <span className="oriental-nav-label">{item.label}</span>
                    {badgeCount > 0 && (
                      <span className="oriental-nav-badge">
                        {formatOrderCount(badgeCount)}
                      </span>
                    )}
                  </>
                )}

                {/* Floating Tooltip when Collapsed */}
                {collapsed && (
                  <div className="oriental-nav-tooltip" role="tooltip">
                    <span>{item.label}</span>
                    {badgeCount > 0 && (
                      <span
                        className="oriental-nav-badge"
                        style={{ fontSize: "10px", padding: "0 5px" }}
                      >
                        {formatOrderCount(badgeCount)}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer: User Card */}
        <div className="oriental-sidebar-footer">
          <Link
            href={`/${roleBase(role)}/account` as Route}
            className="oriental-user-card block transition hover:bg-slate-800/60"
            title={
              collapsed
                ? `${user.name} - ${user.title}`
                : "إعدادات الحساب الشخصي"
            }
          >
            <div
              className="oriental-user-avatar"
              style={{ backgroundColor: user.avatarBg }}
            >
              {user.name.slice(0, 1)}
            </div>
            {!collapsed && (
              <div className="oriental-user-info">
                <span className="oriental-user-name">{user.name}</span>
                <span className="oriental-user-title">{user.title}</span>
              </div>
            )}
          </Link>

          <button
            type="button"
            className="oriental-logout-btn"
            onClick={onSignOut}
            disabled={signingOut}
          >
            <LogOut size={16} />
            {!collapsed && <span>تسجيل الخروج</span>}
          </button>
          {signOutError && (
            <p role="alert" className="form-error">
              {signOutError}
            </p>
          )}

          {/* Collapsed Footer Expand Button */}
          {collapsed && (
            <button
              type="button"
              className="oriental-footer-expand-btn"
              onClick={toggleCollapsed}
              title="توسيع القائمة"
              aria-label="توسيع القائمة"
            >
              <ChevronLeft size={14} />
            </button>
          )}
        </div>
      </aside>

      {/* 3. Top White Header */}
      <header className="oriental-top-header">
        <div className="oriental-header-right">
          <button
            type="button"
            className="oriental-mobile-menu-btn"
            aria-label="فتح القائمة الجانبية"
            onClick={() => {
              setMobileOpen(true);
            }}
          >
            <Menu size={20} />
          </button>
          {/* Header Menu Toggle (Desktop & Mobile) */}
          <button
            type="button"
            className="oriental-header-menu-btn"
            onClick={() => {
              if (typeof window !== "undefined" && window.innerWidth <= 1024) {
                setMobileOpen(!mobileOpen);
              } else {
                toggleCollapsed();
              }
            }}
            aria-label={
              collapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية"
            }
            title={
              collapsed
                ? "توسيع القائمة الجانبية (Ctrl+B)"
                : "طي القائمة الجانبية (Ctrl+B)"
            }
          >
            <Menu size={18} />
          </button>

          {/* Breadcrumbs */}
          <nav className="oriental-breadcrumbs" aria-label="مسار التنقل">
            {finalBreadcrumbs.map((crumb, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="oriental-bread-sep">/</span>}
                {crumb.href && idx < finalBreadcrumbs.length - 1 ? (
                  <Link
                    href={crumb.href as Route}
                    className="oriental-bread-link"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="oriental-bread-current">{crumb.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        </div>

        <div className="oriental-header-left">
          {canAccessAllSections ? (
            <label className="oriental-department-switcher">
              <span>{"\u0627\u0644\u0623\u0642\u0633\u0627\u0645"}</span>
              <select
                aria-label={
                  "\u0627\u0644\u0627\u0646\u062a\u0642\u0627\u0644 \u0625\u0644\u0649 \u0642\u0633\u0645"
                }
                value={role}
                onChange={(event) => {
                  const targetRole = event.target.value as Role;
                  router.push(`/${roleBase(targetRole)}/dashboard` as Route);
                }}
              >
                {(Object.keys(roleNames) as Role[]).map((section) => (
                  <option key={section} value={section}>
                    {roleNames[section]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {/* Notification Bell (Disabled per MVP specifications) */}
          <button
            type="button"
            className="oriental-notification-btn cursor-not-allowed opacity-60"
            aria-label="التنبيهات غير مفعلة"
            title="التنبيهات التشغيلية غير مفعلة في النسخة التجريبية الحالية (MVP)"
            disabled
          >
            <Bell size={18} />
          </button>

          {/* Top User Pill */}
          <Link
            href={`/${roleBase(role)}/account` as Route}
            className="oriental-top-user-chip transition hover:bg-slate-100"
            title="إعدادات الحساب الشخصي"
          >
            <div
              className="oriental-chip-avatar"
              style={{ backgroundColor: user.avatarBg }}
            >
              {user.name.slice(0, 1)}
            </div>
            <div className="oriental-chip-details">
              <span className="oriental-chip-name">{user.name}</span>
              <span className="oriental-chip-role">{roleNames[role]}</span>
            </div>
          </Link>
        </div>
      </header>

      {/* 4. Main Content Container */}
      <main className="oriental-content-container">
        <div className="oriental-content-inner">{children}</div>
      </main>
    </div>
  );
}
