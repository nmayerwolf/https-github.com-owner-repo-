import React from 'react';

const actionClass = (action) => {
  const value = String(action || '').toUpperCase();
  if (value === 'BUY') return 'badge buy';
  if (value === 'SELL') return 'badge sell';
  return 'badge warning';
};

const confidenceClass = (value) => {
  const n = Number(value);
  if (n >= 0.75) return 'up';
  if (n >= 0.5) return 'regime-pill-warning-text';
  return 'down';
};

const IdeaCard = ({ item, variant = 'strategic' }) => {
  const symbol = String(item?.symbol || item?.ideaId || 'IDEA').toUpperCase();
  const action = String(item?.action || 'WATCH').toUpperCase();
  const timeframe = String(item?.timeframe || 'weeks');
  const rationale = Array.isArray(item?.rationale) ? item.rationale : [];
  const risks = Array.isArray(item?.risks) ? item.risks : [];
  const tags = Array.isArray(item?.tags) ? item.tags : [];
  const opportunisticType = String(item?.opportunisticType || item?.opportunistic_type || '').trim();

  return (
    <article className={`card idea-card ${variant === 'opportunistic' ? 'idea-card-opportunistic' : 'idea-card-strategic'}`}>
      <div className="row">
        <div className="idea-symbol mono">{symbol}</div>
        <span className={actionClass(action)}>{action}</span>
      </div>

      <div className="row idea-card-meta-row">
        <div className={`mono ${confidenceClass(item?.confidence)}`}>Confidence: {Number(item?.confidence || 0).toFixed(2)}</div>
        <span className="pill-muted">{timeframe}</span>
      </div>

      {opportunisticType ? <div className="pill-muted idea-type-pill">{opportunisticType}</div> : null}

      {rationale.length ? (
        <ul className="idea-list idea-list-rationale">
          {rationale.slice(0, 3).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      {item?.invalidation ? (
        <div className="idea-invalidation-wrap">
          <div className="idea-kicker">Invalidation:</div>
          <div className="muted idea-invalidation-text">{item.invalidation}</div>
        </div>
      ) : null}

      {risks.length ? (
        <div>
          <div className="idea-kicker">Risks:</div>
          <ul className="idea-list idea-list-risks">
            {risks.slice(0, 3).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
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

export default IdeaCard;
