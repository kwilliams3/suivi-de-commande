const normalized = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

export function ownsOrder(order, user) {
  if (user?.role === 'Administrateur') return true;
  if (order.CreeParId) return order.CreeParId === user?.userId;
  const creator = normalized(order.CreePar || order.DemandePar);
  return !!creator && [user?.username, user?.userId, user?.fullName].some(value => normalized(value) === creator);
}

export function canReadOrder(order, user) {
  if (ownsOrder(order, user)) return true;
  const service = normalized(user?.service);
  return !!service && [order.ServiceDemande, order.Agence].some(value => normalized(value) === service);
}

export function canModifyOrder(order, user) {
  return user?.role === 'Administrateur' || (ownsOrder(order, user) && !order.EstArchive && !['Livré', 'Terminé'].includes(order.Statut));
}
