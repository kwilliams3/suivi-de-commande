import type { Order } from "../types";
import { sortOrdersNewestFirst } from './orderCalculations.ts';

export function uniqueOrders(orders: Order[]): Order[] {
  const groups = new Map<string, Order>();
  for (const order of orders) {
    const key = order.NoBonCommande || order.Id;
    if (!groups.has(key)) groups.set(key, order);
  }
  return [...groups.values()];
}

export function getRecentOrders(orders: Order[], limit = 5): Order[] {
  return uniqueOrders(sortOrdersNewestFirst(orders)).slice(0, limit);
}

export function countOrdersBy(orders: Order[], getCategory: (order: Order) => string): Record<string, number> {
  const groups = new Map<string, Set<string>>();
  for (const order of orders) {
    const category = getCategory(order);
    if (!groups.has(category)) groups.set(category, new Set());
    groups.get(category)!.add(order.NoBonCommande || order.Id);
  }
  return Object.fromEntries([...groups].map(([category, ids]) => [category, ids.size]));
}
