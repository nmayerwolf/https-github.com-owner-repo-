export const formatUSD = (n) => {
  if (!Number.isFinite(n)) return '-';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
};

export const formatPct = (n) => {
  if (!Number.isFinite(n)) return '-';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
};

export const shortDate = (iso) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('es-AR');
};
