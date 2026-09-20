import type { Store } from "./mvp-provider";
import type { ActionContext } from "./mvp-action-context";
import { storageKey, initialSnapshot } from "./mvp-selectors";
import { formatPieceSequence } from "@/features/orders/paper/paper-options";
import type { ProductLine } from "./mvp-types";

export function createIdentityAndOrderActions({
  snapshot,
  setSnapshot,
  addEvent,
}: ActionContext): Pick<
  Store,
  | "setRole"
  | "reset"
  | "resetToDefault"
  | "addEmployee"
  | "patchEmployee"
  | "addCustomer"
  | "patchCustomer"
  | "saveOrder"
  | "patchOrder"
  | "updateUserProfile"
  | "duplicatePiece"
  | "addBlankPiece"
  | "deletePieceDraft"
> {
  return {
    setRole: (sessionRole) => {
      setSnapshot((cur) => ({ ...cur, sessionRole }));
    },
    reset: () => {
      localStorage.removeItem(storageKey);
      setSnapshot(initialSnapshot());
    },
    resetToDefault: () => {
      localStorage.removeItem(storageKey);
      setSnapshot(initialSnapshot());
    },
    addEmployee: (employee) => {
      if (
        snapshot.employees.some(
          (c) => c.email === employee.email || c.phone === employee.phone,
        )
      )
        return false;
      setSnapshot((cur) => ({
        ...cur,
        employees: [...cur.employees, employee],
      }));
      return true;
    },
    patchEmployee: (email, patch) => {
      setSnapshot((cur) => ({
        ...cur,
        employees: cur.employees.map((e) =>
          e.email === email ? { ...e, ...patch } : e,
        ),
      }));
    },
    addCustomer: (customer) => {
      const duplicate = snapshot.customers.find(
        (c) =>
          c.phone === customer.phone ||
          Boolean(customer.email && c.email === customer.email),
      );
      if (duplicate) return duplicate;
      setSnapshot((cur) => ({
        ...cur,
        customers: [customer, ...cur.customers],
      }));
      return undefined;
    },
    patchCustomer: (phone, patch) => {
      setSnapshot((cur) => {
        const updatedCustomers = cur.customers.map((c) =>
          c.phone === phone ? { ...c, ...patch } : c,
        );
        const newPhone = patch.phone;
        const updatedOrders =
          newPhone && newPhone !== phone
            ? cur.orders.map((o) =>
                o.phone === phone
                  ? {
                      ...o,
                      phone: newPhone,
                      customerPhone: newPhone,
                      customer: patch.name || o.customer,
                      customerName: patch.name || o.customerName,
                    }
                  : o,
              )
            : cur.orders;
        return {
          ...cur,
          customers: updatedCustomers,
          orders: updatedOrders,
        };
      });
    },
    saveOrder: (order, eventName, notes) => {
      setSnapshot((cur) => {
        const exists = cur.orders.some((o) => o.id === order.id);
        const newOrders = exists
          ? cur.orders.map((o) => (o.id === order.id ? order : o))
          : [order, ...cur.orders];
        const ev = addEvent(
          order.id,
          eventName,
          order.salesperson || "ريم خالد",
          "المبيعات",
          { note: notes },
        );
        return { ...cur, orders: newOrders, events: [ev, ...cur.events] };
      });
    },
    patchOrder: (id, patch, event) => {
      setSnapshot((cur) => {
        const ev = addEvent(id, event.event, event.actor, event.role, event);
        return {
          ...cur,
          orders: cur.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)),
          events: [ev, ...cur.events],
        };
      });
    },
    updateUserProfile: (role, updates) => {
      setSnapshot((cur) => {
        return {
          ...cur,
          employees: cur.employees.map((e) => {
            if (e.role === role || e.requested === role) {
              return {
                ...e,
                name: updates.name || e.name,
                phone: updates.phone || e.phone,
                password: updates.password || e.password,
              };
            }
            return e;
          }),
        };
      });
    },
    duplicatePiece: (orderId, pieceId) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;
        const idx = order.items.findIndex((p) => p.id === pieceId);
        if (idx === -1) return cur;
        const source = order.items[idx];
        if (!source) return cur;
        const newPiece: ProductLine = {
          ...source,
          id: crypto.randomUUID(),
          quantity: 1,
          currentLocation:
            order.status === "مسودة" ? undefined : source.currentLocation,
          deptStatus: order.status === "مسودة" ? undefined : source.deptStatus,
        };
        const newItems = [...order.items];
        newItems.splice(idx + 1, 0, newPiece);
        const sequencedItems = newItems.map((p, i) => ({
          ...p,
          pieceNumber: formatPieceSequence(i),
        }));
        const totalVal = sequencedItems
          .filter((p) => !p.isDeleted)
          .reduce((sum, p) => sum + (Number(p.unitPrice) || 450), 0);
        const paidVal = Number(order.paid) || 0;
        const balanceVal = Math.max(0, totalVal - paidVal);

        const ev = addEvent(
          orderId,
          `تكرار القطعة ${source.pieceNumber || formatPieceSequence(idx)}`,
          "المبيعات",
          "المبيعات",
          { note: "تم إنشاء نسخة جديدة من القطعة" },
        );

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  items: sequencedItems,
                  total: String(totalVal),
                  balance: String(balanceVal),
                }
              : o,
          ),
          events: [ev, ...cur.events],
        };
      });
    },
    addBlankPiece: (orderId) => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order) return cur;
        const nextIdx = order.items.length;
        const newPiece: ProductLine = {
          id: crypto.randomUUID(),
          pieceNumber: formatPieceSequence(nextIdx),
          model: "",
          quantity: 1,
          size: "٤٢",
          leatherBase: "",
          decoration: "",
          decorationColor: "",
          face: "",
          sole: "",
          soleColor: "",
          additions: "",
          unitPrice: "450",
          rowTotal: "450",
        };
        const newItems = [...order.items, newPiece];
        const totalVal = newItems
          .filter((p) => !p.isDeleted)
          .reduce((sum, p) => sum + (Number(p.unitPrice) || 450), 0);
        const paidVal = Number(order.paid) || 0;
        const balanceVal = Math.max(0, totalVal - paidVal);

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  items: newItems,
                  total: String(totalVal),
                  balance: String(balanceVal),
                }
              : o,
          ),
        };
      });
    },
    deletePieceDraft: (orderId, pieceId, _reason = "حذف القطعة") => {
      setSnapshot((cur) => {
        const order = cur.orders.find((o) => o.id === orderId);
        if (!order || order.items.length <= 1) return cur;
        const newItems = order.items
          .filter((p) => p.id !== pieceId)
          .map((p, i) => ({
            ...p,
            pieceNumber: formatPieceSequence(i),
          }));
        const totalVal = newItems
          .filter((p) => !p.isDeleted)
          .reduce((sum, p) => sum + (Number(p.unitPrice) || 450), 0);
        const paidVal = Number(order.paid) || 0;
        const balanceVal = Math.max(0, totalVal - paidVal);

        return {
          ...cur,
          orders: cur.orders.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  items: newItems,
                  total: String(totalVal),
                  balance: String(balanceVal),
                }
              : o,
          ),
        };
      });
    },
  };
}
