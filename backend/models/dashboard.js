// Count purchase orders rather than their individual article rows.
export function countOrders(orders) {
  return new Set(orders.map(order => order.NoBonCommande || order.Id)).size;
}

export function countOrdersBy(orders, getCategory) {
  const groups = new Map();
  for (const order of orders) {
    const category = getCategory(order);
    if (!category) continue;
    if (!groups.has(category)) groups.set(category, new Set());
    groups.get(category).add(order.NoBonCommande || order.Id);
  }
  return Object.fromEntries([...groups].map(([category, ids]) => [category, ids.size]));
}

export function monthlyActivity(orders, history, now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  const ids = new Set(orders.map(order => order.Id));
  const latest = new Map();
  for (const event of history) {
    if (!ids.has(event.CommandeId) || !event.DateModification?.startsWith(month)) continue;
    const previous = latest.get(event.CommandeId);
    if (!previous || event.DateModification > previous.DateModification) latest.set(event.CommandeId, event);
  }
  const activity = orders.filter(order => latest.has(order.Id) || order.DateEmission?.startsWith(month));
  return {
    total: countOrders(activity),
    byStatus: countOrdersBy(activity, order => order.Statut),
    byUser: countOrdersBy(activity, order => latest.get(order.Id)?.ModifiePar || order.CreePar || order.DemandePar || 'Non spécifié'),
  };
}
