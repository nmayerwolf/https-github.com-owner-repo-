import React from 'react';

const Sparkline = ({ values = [], color = '#60A5FA', height = 32 }) => {
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1 || 1)) * 100},${height - ((v - min) / range) * height}`)
    .join(' ');

  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
    </svg>
  );
};

export default Sparkline;
