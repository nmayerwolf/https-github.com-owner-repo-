import React from 'react';

const severityClass = (severity) => {
  const value = String(severity || '').toLowerCase();
  if (value === 'high') return { badge: 'badge sell', card: 'risk-card-high' };
  if (value === 'medium') return { badge: 'badge warning', card: 'risk-card-medium' };
  return { badge: 'badge hold', card: 'risk-card-low' };
};

const RiskCard = ({ alert }) => {
  const severity = String(alert?.severity || 'low').toLowerCase();
  const bullets = Array.isArray(alert?.bullets) ? alert.bullets : [];
  const tags = Array.isArray(alert?.tags) ? alert.tags : [];
  const tone = severityClass(severity);

  return (
    <article className={`card risk-card ${tone.card}`}>
      <div className="row">
        <div className="idea-symbol">⚠️ {alert?.title || 'Risk Alert'}</div>
        <span className={tone.badge}>{severity}</span>
      </div>

      {bullets.length ? (
        <ul className="idea-list idea-list-risks" style={{ marginTop: 8 }}>
          {bullets.slice(0, 3).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {tags.length ? (
        <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          {tags.slice(0, 5).map((tag) => (
            <span className="pill-muted" key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
};

export default RiskCard;
