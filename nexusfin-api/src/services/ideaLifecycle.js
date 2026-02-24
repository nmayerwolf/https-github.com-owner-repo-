const ACTIVE_STATUSES = new Set(['Initiated', 'Reinforced', 'Under Review']);

const convictionFromScore = (score) => {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'LOW';
  if (n >= 85) return 'HIGH';
  if (n >= 65) return 'MEDIUM';
  return 'LOW';
};

const convictionWeight = (conviction) => {
  const key = String(conviction || '').toUpperCase();
  if (key === 'HIGH') return 3;
  if (key === 'MEDIUM') return 2;
  return 1;
};

const isActiveIdea = (idea) => {
  const status = String(idea?.status || '');
  return ACTIVE_STATUSES.has(status) && idea?.thesis_broken !== true;
};

const computePriorityScore = (idea) => {
  const conviction = convictionWeight(idea?.current_conviction || convictionFromScore(idea?.conviction_score));
  const quality = Number(idea?.quality_score || 50);
  const freshness = Number(idea?.freshness_score || 50);
  return Number((conviction * 40 + quality * 0.35 + freshness * 0.25).toFixed(2));
};

module.exports = {
  ACTIVE_STATUSES,
  convictionFromScore,
  convictionWeight,
  isActiveIdea,
  computePriorityScore
};
