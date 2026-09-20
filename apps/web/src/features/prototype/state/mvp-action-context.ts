import type { Dispatch, SetStateAction } from "react";
import type { Snapshot } from "./mvp-provider";
import type { LogEvent } from "./mvp-types";

export type ActionContext = {
  snapshot: Snapshot;
  setSnapshot: Dispatch<SetStateAction<Snapshot>>;
  addEvent: (
    orderId: string,
    event: string,
    actor: string,
    role: string,
    extra?: Partial<LogEvent>,
  ) => LogEvent;
};
