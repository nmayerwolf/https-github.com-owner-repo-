const colors = {
  equity: '#60A5FA',
  crypto: '#FBBF24',
  metal: '#FDE047',
  commodity: '#F87171',
  bond: '#4ADE80',
  fx: '#C084FC'
};

const CategoryBadge = ({ category }) => (
  <span className="badge" style={{ background: `${colors[category] || '#64748B'}22`, color: colors[category] || '#94A3B8' }}>
    {category}
  </span>
);

export default CategoryBadge;
