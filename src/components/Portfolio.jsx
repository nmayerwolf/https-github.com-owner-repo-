import React, { useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import { useApp } from '../store/AppContext';
import { formatPct, formatUSD, shortDate } from '../utils/format';

const emptyForm = { symbol: '', name: '', category: 'equity', buyDate: '', buyPrice: '', quantity: 1 };
const emptySell = { id: '', symbol: '', sellPrice: '', sellDate: new Date().toISOString().slice(0, 10) };

const Portfolio = () => {
  const { state, actions } = useApp();
  const [tab, setTab] = useState('active');
  const [form, setForm] = useState(emptyForm);
  const [sellModal, setSellModal] = useState(emptySell);
  const [exportFilter, setExportFilter] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const assetsBySymbol = useMemo(() => Object.fromEntries(state.assets.map((a) => [a.symbol, a])), [state.assets]);
  const active = state.positions.filter((p) => !p.sellDate);
  const sold = state.positions.filter((p) => p.sellDate);

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
      link.download = `nexusfin-portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const rows = tab === 'active' ? active : sold;

  return (
    <div className="grid">
      {exportError && <div className="card" style={{ borderColor: '#FF4757AA' }}>{exportError}</div>}

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
          Active
        </button>
        <button type="button" onClick={() => setTab('sold')} style={{ borderColor: tab === 'sold' ? '#00E08E' : undefined }}>
          Sold
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

      {rows.map((p) => {
        const current = p.sellDate ? p.sellPrice : assetsBySymbol[p.symbol]?.price ?? p.buyPrice;
        const pnl = (current - p.buyPrice) * p.quantity;
        const pnlPct = ((current - p.buyPrice) / p.buyPrice) * 100;
        return (
          <article className="card" key={p.id}>
            <div className="row">
              <strong>{p.symbol}</strong>
              <span className={pnl >= 0 ? 'up' : 'down'}>
                {formatUSD(pnl)} ({formatPct(pnlPct)})
              </span>
            </div>
            <div className="muted">
              Compra: {shortDate(p.buyDate)} @ {formatUSD(p.buyPrice)} | Cantidad: {p.quantity}
            </div>
            {p.sellDate ? (
              <div className="muted">Venta: {shortDate(p.sellDate)} @ {formatUSD(p.sellPrice)}</div>
            ) : (
              <div className="row" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() =>
                    setSellModal({
                      id: p.id,
                      symbol: p.symbol,
                      sellPrice: (assetsBySymbol[p.symbol]?.price ?? p.buyPrice).toFixed(4),
                      sellDate: new Date().toISOString().slice(0, 10)
                    })
                  }
                >
                  Vender
                </button>
                <button type="button" onClick={() => actions.deletePosition(p.id)}>
                  Eliminar
                </button>
              </div>
            )}
          </article>
        );
      })}
      {!rows.length && <div className="card muted">No hay posiciones en esta pestaña.</div>}

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
