import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { generateInvestmentThesis } from '../api/claude';
import { calculateConfluence } from '../engine/confluence';
import ConfluenceBar from './common/ConfluenceBar';
import { formatUSD } from '../utils/format';
import AIThesis from './AIThesis';

const TABS = ['all', 'compra', 'venta', 'stoploss'];

const Alerts = () => {
  const { state, actions } = useApp();
  const [tab, setTab] = useState('all');
  const [loadingId, setLoadingId] = useState('');
  const [thesis, setThesis] = useState(null);
  const [thesisSymbol, setThesisSymbol] = useState('');

  const list = useMemo(() => state.alerts.filter((a) => tab === 'all' || a.type === tab), [tab, state.alerts]);

  const openThesis = async (alert) => {
    const asset = actions.getAssetBySymbol(alert.symbol);
    if (!asset) return;

    setLoadingId(alert.id);
    try {
      const signal = calculateConfluence(asset, state.config);
      const out = await generateInvestmentThesis({ asset: { ...asset, signal }, config: state.config });
      setThesis(out.data);
      setThesisSymbol(alert.symbol);
    } finally {
      setLoadingId('');
    }
  };

  return (
    <div className="grid">
      {thesis && <AIThesis thesis={thesis} symbol={thesisSymbol} onClose={() => setThesis(null)} />}

      <section className="card row" style={{ flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{ borderColor: tab === t ? '#00E08E' : undefined }}>
            {t}
          </button>
        ))}
      </section>

      {list.map((a) => (
        <article key={a.id} className="card">
          <div className="row">
            <strong>{a.title}</strong>
            <span className="muted">{a.confidence || 'high'}</span>
          </div>
          {typeof a.net === 'number' && <ConfluenceBar net={a.net} />}
          {a.stopLoss && (
            <div className="row" style={{ marginTop: 8 }}>
              <span className="muted">SL: {formatUSD(a.stopLoss)}</span>
              <span className="muted">TP: {formatUSD(a.takeProfit)}</span>
            </div>
          )}
          {(a.type === 'compra' || a.type === 'venta') && (
            <button type="button" style={{ marginTop: 8 }} onClick={() => openThesis(a)} disabled={loadingId === a.id}>
              {loadingId === a.id ? 'Generando...' : 'Ver tesis de inversión AI'}
            </button>
          )}
        </article>
      ))}
      {!list.length && <div className="card muted">No hay alertas para este filtro.</div>}
    </div>
  );
};

export default Alerts;
