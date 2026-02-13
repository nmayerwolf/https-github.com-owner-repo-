import { useState } from 'react';

const AIThesis = ({ thesis, onClose, symbol }) => {
  const [expanded, setExpanded] = useState(false);
  if (!thesis) return null;

  return (
    <section className="card" style={{ borderColor: '#00E08E' }}>
      <div className="row">
        <h3>Tesis AI: {symbol}</h3>
        <button type="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <p>{thesis.summary}</p>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span className="badge" style={{ background: '#00E08E22', color: '#00E08E' }}>
          {thesis.action}
        </span>
        <span className="badge" style={{ background: '#60A5FA22', color: '#60A5FA' }}>
          {thesis.confidence}
        </span>
        <span className="badge" style={{ background: '#FBBF2422', color: '#FBBF24' }}>
          {thesis.timeframe}
        </span>
      </div>
      <p className="muted" style={{ marginTop: 8 }}>
        Target: {thesis.priceTarget}
      </p>
      <button type="button" onClick={() => setExpanded((v) => !v)}>
        {expanded ? 'Ver menos' : 'Ver detalle completo'}
      </button>

      {expanded && (
        <div className="grid" style={{ marginTop: 8 }}>
          <div>
            <strong>Catalizadores</strong>
            <ul>
              {(thesis.catalysts || []).map((x, i) => (
                <li key={`cat-${i}`}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <strong>Riesgos</strong>
            <ul>
              {(thesis.risks || []).map((x, i) => (
                <li key={`risk-${i}`}>{x}</li>
              ))}
            </ul>
          </div>
          <p>
            <strong>Técnico:</strong> {thesis.technicalView}
          </p>
          <p>
            <strong>Fundamental:</strong> {thesis.fundamentalView}
          </p>
          <p>
            <strong>Suitability:</strong> {thesis.suitability}
          </p>
        </div>
      )}
    </section>
  );
};

export default AIThesis;
