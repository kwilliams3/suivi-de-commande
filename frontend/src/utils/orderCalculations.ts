import type { Order } from '../types';

export const totalPrice = (orders: Pick<Order, 'Quantite' | 'Prix'>[]) => orders.reduce((sum, order) => sum + order.Quantite * (order.Prix || 0), 0);

export function sortOrdersNewestFirst<T extends { DateEmission: string }>(orders: T[]): T[] {
  return [...orders].sort((a, b) => (Date.parse(b.DateEmission) || 0) - (Date.parse(a.DateEmission) || 0));
}

export function filterOrders(orders: Order[], search: string, user: string, start: string, end: string) {
  return orders.filter(order => {
    const term = search.trim().toLowerCase();
    if (term && ![order.NoBonCommande, order.NoDS, order.Designation, order.Fournisseur].some(value => (value || '').toLowerCase().includes(term))) return false;
    if (user && (order.CreePar || order.DemandePar) !== user) return false;
    const day = order.DateEmission?.slice(0, 10) || '';
    return (!start || day >= start) && (!end || day <= end);
  });
}

export function csvCell(value: unknown) {
  let text = String(value ?? '');
  if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).replace(/""/g, '"');
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
