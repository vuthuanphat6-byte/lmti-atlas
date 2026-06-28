import type { PackingOrder } from "../orders/packing";

export function printPackingLabel(order: PackingOrder): string {
  return `ORDER=${order.id};DEST=${order.destination};WEIGHT=${order.weightKg}`;
}
