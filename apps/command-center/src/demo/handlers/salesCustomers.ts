import type { DemoRoute } from "./index";
import { DEMO_CUSTOMERS } from "../../lib/customers";

export const route: DemoRoute = {
  match: (clean) => clean === "/api/sales/customers",
  respond: () => DEMO_CUSTOMERS,
};
