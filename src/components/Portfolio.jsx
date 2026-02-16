import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import { useApp } from '../store/AppContext';
import { formatPct, formatUSD, shortDate } from '../utils/format';

const emptyForm = { symbol: '', name: '', category: 'equity', buyDate: '', buyPrice: '', quantity: 1 };
const emptySell = { id: '', symbol: '', sellPrice: '', sellDate: new Date().toISOString().slice(0, 10) };
const allocColors = ['#3B82F6', '#00DC82', '#A78BFA', '#FFB800', '#F97316', '#22D3EE', '#EF4444', '#10B981'];
const PORTFOLIO_PAGE_SIZE = 8;

const PositionRow = memo(function PositionRow({ position, onOpenSell, onDelete }) {
  return (
    <article className="card pos-row">
      <div className="pos-icon">{String(position.symbol).slice(0, 3)}</div>
      <div className="pos-info">
        <div className="pos-sym mono">{position.symbol}</div>
        <div className="pos-detail">
          Cantidad {position.quantity} · Compra {formatUSD(position.buyPrice)} · {shortDate(position.buyDate)}
        </div>
        {position.sellDate ? <div className="pos-detail">Venta {formatUSD(position.sellPrice)} · {shortDate(position.sellDate)}</div> : null}
      </div>
      <div className="pos-vals">
        <div className="pos-value mono">{formatUSD(position.value)}</div>
        <div className={`pos-pnl mono ${position.pnl >= 0 ? 'up' : 'down'}`}>
          {formatUSD(position.pnl)} ({formatPct(position.pnlPctPos)})
        </div>
        {!position.sellDate ? (
          <div className="row" style={{ marginTop: 6, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => onOpenSell(position)}>
              Vender
            </button>
            <button type="button" onClick={() => onDelete(position.id)}>
              Eliminar
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
});

const Portfolio = () => {
  const { state, actions } = useApp();
  const [tab, setTab] = useState('active');
  const [visibleCount, setVisibleCount] = useState(PORTFOLIO_PAGE_SIZE);
  const [form, setForm] = useState(emptyForm);
  const [sellModal, setSellModal] = useState(emptySell);
  const [exportFilter, setExportFilter] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const assetsBySymbol = useMemo(() => Object.fromEntries(state.assets.map((a) => [a.symbol, a])), [state.assets]);
  const active = useMemo(() => state.positions.filter((p) => !p.sellDate), [state.positions]);
  const sold = useMemo(() => state.positions.filter((p) => p.sellDate), [state.positions]);
  const portfolioValue = active.reduce((acc, p) => acc + (assetsBySymbol[p.symbol]?.price ?? p.buyPrice) * p.quantity, 0);
  const invested = active.reduce((acc, p) => acc + p.buyPrice * p.quantity, 0);
  const pnlTotal = portfolioValue - invested;
  const pnlPct = invested ? (pnlTotal / invested) * 100 : 0;

  const activeRows = useMemo(
    () =>
      active.map((p) => {
        const current = assetsBySymbol[p.symbol]?.price ?? p.buyPrice;
        const pnl = (current - p.buyPrice) * p.quantity;
        const pnlPctPos = ((current - p.buyPrice) / p.buyPrice) * 100;
        const value = current * p.quantity;
        return { ...p, current, pnl, pnlPctPos, value };
      }),
    [active, assetsBySymbol]
  );

  const soldRows = useMemo(
    () =>
      sold.map((p) => {
        const pnl = (p.sellPrice - p.buyPrice) * p.quantity;
        const pnlPctPos = ((p.sellPrice - p.buyPrice) / p.buyPrice) * 100;
        const value = (p.sellPrice ?? 0) * p.quantity;
        return { ...p, pnl, pnlPctPos, value };
      }),
    [sold]
  );

  const allocation = activeRows
    .map((row, idx) => ({
      symbol: row.symbol,
      value: row.value,
      pct: portfolioValue > 0 ? (row.value / portfolioValue) * 100 : 0,
      color: allocColors[idx % allocColors.length]
    }))
    .sort((a, b) => b.value - a.value);

  const bestPosition = [...activeRows, ...soldRows].sort((a, b) => b.pnlPctPos - a.pnlPctPos)[0];
  const worstPosition = [...activeRows, ...soldRows].sort((a, b) => a.pnlPctPos - b.pnlPctPos)[0];

  const submit = (e) => {
    e.preventDefault();
    actions.addPosition({
      ...form,
      id: crypto.randomUUID(),
      buyPrice: Number(form.buyPrice),
      quantity: Number(form.quantity)
    });
    setForm(emptyForm);
  };

  const submitSell = (e) => {
    e.preventDefault();
    const price = Number(sellModal.sellPrice);
    if (!sellModal.id || !price || !sellModal.sellDate) return;
    actions.sellPosition(sellModal.id, price, sellModal.sellDate);
    setSellModal(emptySell);
  };

  const exportCsv = async () => {
    setExporting(true);
    setExportError('');

    try {
      const csv = await api.exportPortfolioCsv(exportFilter);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `horsy-portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err?.message || 'No se pudo exportar el portfolio en CSV.');
    } finally {
      setExporting(false);
    }
  };

  const rows = tab === 'active' ? activeRows : tab === 'sold' ? soldRows : [];
  const visibleRows = rows.slice(0, visibleCount);
  const hasMoreRows = visibleRows.length < rows.length;

  useEffect(() => {
    setVisibleCount(PORTFOLIO_PAGE_SIZE);
  }, [tab, rows.length]);

  const handleOpenSell = useCallback(
    (position) =>
      setSellModal({
        id: position.id,
        symbol: position.symbol,
        sellPrice: (assetsBySymbol[position.symbol]?.price ?? position.buyPrice).toFixed(4),
        sellDate: new Date().toISOString().slice(0, 10)
      }),
    [assetsBySymbol]
  );

  const handleDelete = useCallback((id) => actions.deletePosition(id), [actions]);

  return (
    <div className="grid portfolio-page">
      {exportError && <div className="card" style={{ borderColor: '#FF4757AA' }}>{exportError}</div>}

      <section className="card portfolio-hero">
        <div className="portfolio-label">Valor total</div>
        <div className="portfolio-value mono">{formatUSD(portfolioValue)}</div>
        <div className={`portfolio-change ${pnlTotal >= 0 ? 'up' : 'down'} mono`}>
          {formatUSD(pnlTotal)} ({formatPct(pnlPct)})
        </div>

        <div className="alloc-bar" style={{ marginTop: 10 }}>
          {allocation.length
            ? allocation.map((a) => <span key={a.symbol} className="alloc-seg" style={{ width: `${Math.max(2, a.pct)}%`, background: a.color }} />)
            : [<span key="empty" className="alloc-seg" style={{ width: '100%', background: 'rgba(255,255,255,0.08)' }} />]}
        </div>

        {allocation.length ? (
          <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', justifyContent: 'flex-start' }}>
            {allocation.slice(0, 6).map((a) => (
              <span key={a.symbol} className="badge" style={{ background: `${a.color}22`, color: a.color }}>
                {a.symbol} {a.pct.toFixed(1)}%
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">Resumen P&L</h3>
        </div>
        <div className="ind-grid">
          <div className="ind-cell">
            <div className="ind-label">P&L total</div>
            <div className={`ind-val mono ${pnlTotal >= 0 ? 'up' : 'down'}`}>{formatUSD(pnlTotal)}</div>
          </div>
          <div className="ind-cell">
            <div className="ind-label">Capital invertido</div>
            <div className="ind-val mono">{formatUSD(invested)}</div>
          </div>
          <div className="ind-cell">
            <div className="ind-label">Mejor posición</div>
            <div className="ind-val mono">{bestPosition ? `${bestPosition.symbol} ${formatPct(bestPosition.pnlPctPos)}` : '-'}</div>
          </div>
          <div className="ind-cell">
            <div className="ind-label">Peor posición</div>
            <div className="ind-val mono">{worstPosition ? `${worstPosition.symbol} ${formatPct(worstPosition.pnlPctPos)}` : '-'}</div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Nueva posición</h2>
        <form onSubmit={submit} className="grid grid-2" style={{ marginTop: 8 }}>
          <label className="label">
            <span className="muted">Símbolo</span>
            <input value={form.symbol} required onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} />
          </label>
          <label className="label">
            <span className="muted">Nombre</span>
            <input value={form.name} required onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="label">
            <span className="muted">Categoría</span>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="equity">equity</option>
              <option value="crypto">crypto</option>
              <option value="fx">fx</option>
              <option value="metal">metal</option>
              <option value="commodity">commodity</option>
              <option value="bond">bond</option>
            </select>
          </label>
          <label className="label">
            <span className="muted">Fecha compra</span>
            <input type="date" value={form.buyDate} required onChange={(e) => setForm({ ...form, buyDate: e.target.value })} />
          </label>
          <label className="label">
            <span className="muted">Precio compra</span>
            <input type="number" step="0.0001" value={form.buyPrice} required onChange={(e) => setForm({ ...form, buyPrice: e.target.value })} />
          </label>
          <label className="label">
            <span className="muted">Cantidad</span>
            <input type="number" step="0.0001" value={form.quantity} required onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </label>
          <button type="submit">Agregar</button>
        </form>
      </section>

      <section className="card row" style={{ flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setTab('active')} style={{ borderColor: tab === 'active' ? '#00E08E' : undefined }}>
          Activas
        </button>
        <button type="button" onClick={() => setTab('sold')} style={{ borderColor: tab === 'sold' ? '#00E08E' : undefined }}>
          Cerradas
        </button>
        <button type="button" onClick={() => setTab('summary')} style={{ borderColor: tab === 'summary' ? '#00E08E' : undefined }}>
          Resumen
        </button>
        <label className="label" style={{ maxWidth: 240 }}>
          <span className="muted">Exportar</span>
          <select aria-label="Filtro exportación" value={exportFilter} onChange={(e) => setExportFilter(e.target.value)}>
            <option value="all">Todas</option>
            <option value="active">Solo activas</option>
            <option value="sold">Solo vendidas</option>
          </select>
        </label>
        <button type="button" onClick={exportCsv} disabled={exporting}>
          {exporting ? 'Exportando...' : 'Exportar CSV'}
        </button>
      </section>

      {tab !== 'summary'
        ? visibleRows.map((p) => <PositionRow key={p.id} position={p} onOpenSell={handleOpenSell} onDelete={handleDelete} />)
        : (
          <section className="card">
            <h3>Resumen de posiciones</h3>
            <div className="ind-grid" style={{ marginTop: 8 }}>
              <div className="ind-cell">
                <div className="ind-label">Posiciones activas</div>
                <div className="ind-val mono">{activeRows.length}</div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">Posiciones cerradas</div>
                <div className="ind-val mono">{soldRows.length}</div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">Promedio P&L activa</div>
                <div className="ind-val mono">
                  {activeRows.length ? formatPct(activeRows.reduce((acc, p) => acc + p.pnlPctPos, 0) / activeRows.length) : '-'}
                </div>
              </div>
              <div className="ind-cell">
                <div className="ind-label">Promedio P&L cerrada</div>
                <div className="ind-val mono">
                  {soldRows.length ? formatPct(soldRows.reduce((acc, p) => acc + p.pnlPctPos, 0) / soldRows.length) : '-'}
                </div>
              </div>
            </div>
          </section>
        )}
      {tab !== 'summary' && hasMoreRows ? (
        <div className="card portfolio-more">
          <button type="button" className="inline-link-btn" onClick={() => setVisibleCount((prev) => Math.min(prev + PORTFOLIO_PAGE_SIZE, rows.length))}>
            Ver más posiciones
          </button>
        </div>
      ) : null}
      {tab !== 'summary' && !rows.length && <div className="card muted">No hay posiciones en esta pestaña.</div>}

      {sellModal.id && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSellModal(emptySell)}>
          <section className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Vender {sellModal.symbol}</h3>
            <form onSubmit={submitSell} className="grid" style={{ marginTop: 8 }}>
              <label className="label">
                <span className="muted">Precio de venta</span>
                <input
                  type="number"
                  step="0.0001"
                  value={sellModal.sellPrice}
                  required
                  onChange={(e) => setSellModal({ ...sellModal, sellPrice: e.target.value })}
                />
              </label>
              <label className="label">
                <span className="muted">Fecha de venta</span>
                <input
                  type="date"
                  value={sellModal.sellDate}
                  required
                  onChange={(e) => setSellModal({ ...sellModal, sellDate: e.target.value })}
                />
              </label>
              <div className="row">
                <button type="button" onClick={() => setSellModal(emptySell)}>
                  Cancelar
                </button>
                <button type="submit">Confirmar venta</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};

export default Portfolio;
