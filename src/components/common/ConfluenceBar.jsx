import React from 'react';

const ConfluenceBar = ({ net = 0 }) => {
  const value = Math.max(-6, Math.min(6, net));
  const pct = ((value + 6) / 12) * 100;

  return (
    <div>
      <div className="muted">Confluencia: {net}</div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

export default ConfluenceBar;
