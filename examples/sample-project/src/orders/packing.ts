import { printPackingLabel } from "../labels/printer";

export interface PackingOrder {
  id: string;
  destination: string;
  weightKg: number;
}

export function packOrder(order: PackingOrder): string {
  if (order.weightKg <= 0) {
    throw new Error("Package weight must be positive");
  }

  return printPackingLabel(order);
}
