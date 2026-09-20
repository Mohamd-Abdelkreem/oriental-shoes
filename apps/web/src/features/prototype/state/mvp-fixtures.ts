import type { MvpOrder } from "./mvp-types";
import { intakeOrders } from "./fixture-orders-intake";
import { productionOrders } from "./fixture-orders-production";
import { qualityOrders } from "./fixture-orders-quality";
import { deliveryOrders } from "./fixture-orders-delivery";

export { makePiece, makeLine } from "./fixture-builders";
export { seedEmployees, seedCustomers } from "./fixture-people";
export { seedEvents } from "./fixture-events";

export const demoCredentials = [
  {
    role: "الإدارة العامة",
    email: "admin@oriental-factory.com",
    password: "demo",
    name: "محمد العتيبي",
  },
  {
    role: "المبيعات والمعارض",
    email: "sales@oriental-factory.com",
    password: "demo",
    name: "ريم خالد",
  },
  {
    role: "اعتماد الطلبات",
    email: "approval@oriental-factory.com",
    password: "demo",
    name: "خالد منصور",
  },
  {
    role: "قسم القص",
    email: "cutting@oriental-factory.com",
    password: "demo",
    name: "سالم الحربي",
  },
  {
    role: "الإنتاج والإصلاح",
    email: "production@oriental-factory.com",
    password: "demo",
    name: "أحمد عادل",
  },
  {
    role: "العمليات الخاصة",
    email: "special@oriental-factory.com",
    password: "demo",
    name: "فهد ياسين",
  },
  {
    role: "الجودة والتغليف",
    email: "quality@oriental-factory.com",
    password: "demo",
    name: "منى سعيد",
  },
  {
    role: "المستودع والتسليم",
    email: "warehouse@oriental-factory.com",
    password: "demo",
    name: "سارة محمد",
  },
];

export const seedOrders: MvpOrder[] = [
  ...intakeOrders,
  ...productionOrders,
  ...qualityOrders,
  ...deliveryOrders,
];
