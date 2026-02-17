import React from 'react';
import { useState } from 'react';

const toList = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean).map((item) => String(item));
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
};

const toText = (value, fallback = '-') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const AIThesis = ({ thesis, onClose, symbol }) => {
  const [expanded, setExpanded] = useState(false);
  if (!thesis) return null;
  const catalysts = toList(thesis.catalysts);
  const risks = toList(thesis.risks);

  return (
    <section className="card" style={{ borderColor: '#00E08E' }}>
      <div className="row">
        <h3>Tesis IA: {symbol}</h3>
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
        Objetivo: {toText(thesis.priceTarget)}
      </p>
      <button type="button" onClick={() => setExpanded((v) => !v)}>
        {expanded ? 'Ver menos' : 'Ver detalle completo'}
      </button>

      {expanded && (
        <div className="grid" style={{ marginTop: 8 }}>
          <div>
            <strong>Catalizadores</strong>
            <ul>
              {catalysts.map((x, i) => (
                <li key={`cat-${i}`}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <strong>Riesgos</strong>
            <ul>
              {risks.map((x, i) => (
                <li key={`risk-${i}`}>{x}</li>
              ))}
            </ul>
          </div>
          <p>
            <strong>Técnico:</strong> {toText(thesis.technicalView)}
          </p>
          <p>
            <strong>Fundamental:</strong> {toText(thesis.fundamentalView)}
          </p>
          <p>
            <strong>Adecuación:</strong> {toText(thesis.suitability)}
          </p>
        </div>
      )}
    </section>
  );
};

export default AIThesis;
