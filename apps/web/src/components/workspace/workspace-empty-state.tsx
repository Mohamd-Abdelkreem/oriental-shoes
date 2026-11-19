import { Inbox, Search } from "lucide-react";
import styles from "./workspace-empty-state.module.css";

export function WorkspaceEmptyState({
  title,
  description,
  filtered = false,
  panel = false,
}: {
  title: string;
  description?: string;
  filtered?: boolean;
  panel?: boolean;
}) {
  const Icon = filtered ? Search : Inbox;
  return (
    <div className={styles["empty"]} data-panel={panel ? "" : undefined}>
      <span className={styles["badge"]} aria-hidden="true">
        <Icon size={24} strokeWidth={1.7} />
      </span>
      <div className={styles["copy"]}>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
    </div>
  );
}
