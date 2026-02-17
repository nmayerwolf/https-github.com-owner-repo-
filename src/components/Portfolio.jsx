import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import { useApp } from '../store/AppContext';
import { formatPct, formatUSD, shortDate } from '../utils/format';

const emptyForm = { symbol: '', name: '', category: 'equity', buyDate: '', buyPrice: '', amountUsd: '', stopLoss: '', takeProfit: '' };
const emptySell = { id: '', symbol: '', sellPrice: '', sellDate: new Date().toISOString().slice(0, 10) };
const emptyRiskTargets = { id: '', symbol: '', stopLoss: '', takeProfit: '' };
const allocColors = ['#3B82F6', '#00DC82', '#A78BFA', '#FFB800', '#F97316', '#22D3EE', '#EF4444', '#10B981'];
const PORTFOLIO_PAGE_SIZE = 8;
const normalizeSearchText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const parseNumericInput = (value) => {
  const raw = String(value || '').trim().replace('%', '').replace(/\s/g, '');
  if (!raw) return null;
  const sanitized = raw.replace(/,/g, '');
  const out = Number(sanitized);
  return Number.isFinite(out) ? out : null;
};

const formatMoneyInput = (value) => {
  const n = parseNumericInput(value);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const normalizePercentInput = (value) => {
  const n = parseNumericInput(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${n.toFixed(2)}%`;
};

const PositionRow = memo(function PositionRow({ position, onOpenSell, onDelete, onOpenRiskTargets }) {
  const slPct = Number(position.stopLossPct);
  const legacySlPrice = Number(position.stopLoss);
  const stopPrice =
    !position.sellDate && Number.isFinite(slPct) && slPct > 0 && Number(position.buyPrice) > 0
      ? Number(position.buyPrice) * (1 - slPct / 100)
      : Number.isFinite(legacySlPrice) && legacySlPrice > 0
        ? legacySlPrice
        : null;
  const stopDistancePct = !position.sellDate && Number.isFinite(stopPrice) && stopPrice > 0 && Number(position.current) > 0
    ? ((Number(position.current) - Number(stopPrice)) / Number(position.current)) * 100
    : null;
  const tpPct = Number(position.takeProfitPct);
  const legacyTpPrice = Number(position.takeProfit);
  const takeProfitPrice =
    !position.sellDate && Number.isFinite(tpPct) && tpPct > 0 && Number(position.buyPrice) > 0
      ? Number(position.buyPrice) * (1 + tpPct / 100)
      : Number.isFinite(legacyTpPrice) && legacyTpPrice > 0
        ? legacyTpPrice
        : null;
  const takeProfitDistancePct = !position.sellDate && Number.isFinite(takeProfitPrice) && takeProfitPrice > 0 && Number(position.current) > 0
    ? ((Number(takeProfitPrice) - Number(position.current)) / Number(position.current)) * 100
    : null;

  return (
    <article className="card pos-row">
      <div className="pos-icon">{String(position.symbol).slice(0, 3)}</div>
      <div className="pos-info">
        <div className="pos-sym mono">{position.symbol}</div>
        <div className="pos-detail">
          Cantidad {position.quantity} · Compra {formatUSD(position.buyPrice)} · {shortDate(position.buyDate)}
        </div>
        {!position.sellDate && Number.isFinite(stopPrice) && stopPrice > 0 ? (
          <div className="pos-detail">
            Stop loss {Number.isFinite(slPct) && slPct > 0 ? `-${slPct.toFixed(2)}%` : formatUSD(Number(stopPrice))}
            {Number.isFinite(slPct) && slPct > 0 ? ` (${formatUSD(Number(stopPrice))})` : ''}
            {stopDistancePct != null ? ` · Distancia ${formatPct(stopDistancePct)}` : ''}
          </div>
        ) : null}
        {!position.sellDate && Number.isFinite(takeProfitPrice) && takeProfitPrice > 0 ? (
          <div className="pos-detail">
            Take profit {Number.isFinite(tpPct) && tpPct > 0 ? `+${tpPct.toFixed(2)}%` : formatUSD(Number(takeProfitPrice))}
            {Number.isFinite(tpPct) && tpPct > 0 ? ` (${formatUSD(Number(takeProfitPrice))})` : ''}
            {takeProfitDistancePct != null ? ` · Distancia ${formatPct(takeProfitDistancePct)}` : ''}
          </div>
        ) : null}
        {position.sellDate ? <div className="pos-detail">Venta {formatUSD(position.sellPrice)} · {shortDate(position.sellDate)}</div> : null}
      </div>
      <div className="pos-vals">
        <div className="pos-value mono">{formatUSD(position.value)}</div>
        <div className={`pos-pnl mono ${position.pnl >= 0 ? 'up' : 'down'}`}>
          {formatUSD(position.pnl)} ({formatPct(position.pnlPctPos)})
        </div>
        {!position.sellDate ? (
          <div className="row" style={{ marginTop: 6, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => onOpenRiskTargets(position)}>
              SL / TP
            </button>
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
  const [assetQuery, setAssetQuery] = useState('');
  const [assetUniverse, setAssetUniverse] = useState([]);
  const [assetRemote, setAssetRemote] = useState([]);
  const [assetLoading, setAssetLoading] = useState(false);
  const [sellModal, setSellModal] = useState(emptySell);
  const [riskTargetsModal, setRiskTargetsModal] = useState(emptyRiskTargets);
  const [exportFilter, setExportFilter] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advisorRefreshing, setAdvisorRefreshing] = useState(false);
  const [advisorError, setAdvisorError] = useState('');
  const [advisorData, setAdvisorData] = useState(null);
  const [advisorSkipped, setAdvisorSkipped] = useState(null);

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

  const searchableAssets = useMemo(() => {
    if (Array.isArray(assetUniverse) && assetUniverse.length) return assetUniverse;
    return (state.assets || []).map((item) => ({
      symbol: String(item?.symbol || '').toUpperCase(),
      name: String(item?.name || ''),
      category: String(item?.category || 'equity').toLowerCase()
    }));
  }, [assetUniverse, state.assets]);

  const localAssetMatches = useMemo(() => {
    const raw = normalizeSearchText(assetQuery);
    const base = searchableAssets || [];
    if (!raw) return base.slice(0, 8);
    return base
      .filter((item) => {
        const symbol = normalizeSearchText(item.symbol);
        const name = normalizeSearchText(item.name);
        return symbol.includes(raw) || name.includes(raw);
      })
      .sort((a, b) => {
        const aSymbol = normalizeSearchText(a.symbol);
        const bSymbol = normalizeSearchText(b.symbol);
        const aName = normalizeSearchText(a.name);
        const bName = normalizeSearchText(b.name);
        const aScore = aSymbol === raw ? 0 : aName === raw ? 1 : aSymbol.startsWith(raw) ? 2 : aName.startsWith(raw) ? 3 : 4;
        const bScore = bSymbol === raw ? 0 : bName === raw ? 1 : bSymbol.startsWith(raw) ? 2 : bName.startsWith(raw) ? 3 : 4;
        if (aScore !== bScore) return aScore - bScore;
        return aSymbol.localeCompare(bSymbol);
      })
      .slice(0, 8);
  }, [searchableAssets, assetQuery]);

  const assetSuggestions = useMemo(() => {
    const map = new Map();
    [...localAssetMatches, ...(assetRemote || [])].forEach((item) => {
      const symbol = String(item?.symbol || '').toUpperCase();
      if (!symbol || map.has(symbol)) return;
      map.set(symbol, {
        symbol,
        name: String(item?.name || ''),
        category: String(item?.category || 'equity').toLowerCase()
      });
    });
    return [...map.values()].slice(0, 8);
  }, [localAssetMatches, assetRemote]);

  const selectedAssetMatch = useMemo(() => {
    const raw = normalizeSearchText(assetQuery);
    if (!raw) return null;
    const bySymbol = assetSuggestions.find((item) => normalizeSearchText(item.symbol) === raw);
    if (bySymbol) return bySymbol;
    const byExactName = assetSuggestions.find((item) => normalizeSearchText(item.name) === raw);
    if (byExactName) return byExactName;
    const bySymbolPrefix = assetSuggestions.find((item) => normalizeSearchText(item.symbol).startsWith(raw));
    if (bySymbolPrefix) return bySymbolPrefix;
    const byNamePrefix = assetSuggestions.find((item) => normalizeSearchText(item.name).startsWith(raw));
    if (byNamePrefix) return byNamePrefix;
    const byNameContains = assetSuggestions.find((item) => normalizeSearchText(item.name).includes(raw));
    return byNameContains || null;
  }, [assetSuggestions, assetQuery]);

  const canSubmitPosition =
    !!(selectedAssetMatch || assetSuggestions[0]) &&
    !!form.buyDate &&
    Number(parseNumericInput(form.buyPrice)) > 0 &&
    Number(parseNumericInput(form.amountUsd)) > 0 &&
    (!form.stopLoss || Number(parseNumericInput(form.stopLoss)) > 0) &&
    (!form.takeProfit || Number(parseNumericInput(form.takeProfit)) > 0);

  const submit = (e) => {
    e.preventDefault();
    const selected = selectedAssetMatch || assetSuggestions[0];
    if (!selected) return;
    const buyPrice = Number(parseNumericInput(form.buyPrice));
    const amountUsd = Number(parseNumericInput(form.amountUsd));
    if (!Number.isFinite(buyPrice) || buyPrice <= 0 || !Number.isFinite(amountUsd) || amountUsd <= 0) return;
    const quantity = Number((amountUsd / buyPrice).toFixed(8));
    actions.addPosition({
      symbol: selected.symbol,
      name: selected.name,
      category: selected.category === 'etf' ? 'equity' : selected.category,
      buyDate: form.buyDate,
      id: crypto.randomUUID(),
      buyPrice,
      quantity,
      notes: '',
      stopLossPct: form.stopLoss ? Number(parseNumericInput(form.stopLoss)) : null,
      takeProfitPct: form.takeProfit ? Number(parseNumericInput(form.takeProfit)) : null
    });
    setForm(emptyForm);
    setAssetQuery('');
    setAssetRemote([]);
  };

  const submitSell = (e) => {
    e.preventDefault();
    const price = Number(sellModal.sellPrice);
    if (!sellModal.id || !price || !sellModal.sellDate) return;
    actions.sellPosition(sellModal.id, price, sellModal.sellDate);
    setSellModal(emptySell);
  };

  const submitRiskTargets = (e) => {
    e.preventDefault();
    const stopLossPct = Number(parseNumericInput(riskTargetsModal.stopLoss));
    const takeProfitPct = Number(parseNumericInput(riskTargetsModal.takeProfit));
    const hasStopLoss = Number.isFinite(stopLossPct) && stopLossPct > 0;
    const hasTakeProfit = Number.isFinite(takeProfitPct) && takeProfitPct > 0;
    if (!riskTargetsModal.id || (!hasStopLoss && !hasTakeProfit)) return;
    actions.setPositionRiskTargets(riskTargetsModal.id, {
      stopLossPct: hasStopLoss ? stopLossPct : null,
      takeProfitPct: hasTakeProfit ? takeProfitPct : null
    });
    setRiskTargetsModal(emptyRiskTargets);
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
      link.download = `horsai-portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
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

  useEffect(() => {
    let active = true;
    const loadUniverse = async () => {
      try {
        const out = await api.marketUniverse();
        if (!active) return;
        const assets = Array.isArray(out?.assets) ? out.assets : [];
        setAssetUniverse(
          assets.map((item) => ({
            symbol: String(item?.symbol || '').toUpperCase(),
            name: String(item?.name || ''),
            category: String(item?.category || 'equity').toLowerCase() === 'etf' ? 'equity' : String(item?.category || 'equity').toLowerCase()
          }))
        );
      } catch {
        if (!active) return;
        setAssetUniverse([]);
      }
    };
    loadUniverse();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const raw = String(assetQuery || '').trim();
    if (raw.length < 2) {
      setAssetRemote([]);
      setAssetLoading(false);
      return undefined;
    }

    let active = true;
    setAssetLoading(true);
    const timer = setTimeout(async () => {
      try {
        const out = await api.marketSearch(raw);
        if (!active) return;
        const items = Array.isArray(out?.items) ? out.items : [];
        setAssetRemote(
          items.map((item) => ({
            symbol: String(item?.symbol || '').toUpperCase(),
            name: String(item?.name || ''),
            category: String(item?.category || 'equity').toLowerCase()
          }))
        );
      } catch {
        if (!active) return;
        setAssetRemote([]);
      } finally {
        if (active) setAssetLoading(false);
      }
    }, 260);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [assetQuery]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setAdvisorLoading(true);
      setAdvisorError('');
      try {
        const out = await api.getPortfolioAdvice();
        if (!active) return;
        setAdvisorData(out?.advice || null);
        setAdvisorSkipped(out?.skipped ? out : null);
      } catch {
        if (!active) return;
        setAdvisorError('No se pudo cargar Portfolio Advisor.');
      } finally {
        if (active) setAdvisorLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const refreshAdvisor = async () => {
    setAdvisorRefreshing(true);
    setAdvisorError('');
    try {
      const out = await api.refreshPortfolioAdvice();
      if (out?.skipped) {
        setAdvisorData(null);
        setAdvisorSkipped(out);
      } else {
        setAdvisorData(out?.advice || null);
        setAdvisorSkipped(null);
      }
    } catch {
      setAdvisorError('No se pudo recalcular Portfolio Advisor.');
    } finally {
      setAdvisorRefreshing(false);
    }
  };

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
  const handleOpenRiskTargets = useCallback(
    (position) =>
      setRiskTargetsModal({
        id: position.id,
        symbol: position.symbol,
        stopLoss: position.stopLossPct ? String(position.stopLossPct) : '',
        takeProfit: position.takeProfitPct ? String(position.takeProfitPct) : ''
      }),
    []
  );

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
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="section-title">Portfolio Advisor</h3>
          <button type="button" onClick={refreshAdvisor} disabled={advisorRefreshing}>
            {advisorRefreshing ? 'Analizando...' : 'Pedir análisis AI'}
          </button>
        </div>
        {advisorLoading ? <div className="muted" style={{ marginTop: 8 }}>Cargando análisis...</div> : null}
        {advisorError ? <div className="card" style={{ marginTop: 8, borderColor: '#FF4757AA' }}>{advisorError}</div> : null}
        {advisorSkipped ? (
          <div className="muted" style={{ marginTop: 8 }}>
            Necesitás al menos {advisorSkipped.minimumPositions || 2} posiciones activas para recibir recomendaciones.
          </div>
        ) : null}
        {advisorData ? (
          <div className="grid" style={{ marginTop: 8 }}>
            <div className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
              <span className="badge" style={{ background: '#8CC8FF22', color: '#8CC8FF' }}>
                Health {Number(advisorData.healthScore || 0)}/10
              </span>
              <span className="badge" style={{ background: '#FBBF2422', color: '#FBBF24' }}>
                Riesgo {advisorData.concentrationRisk || 'medium'}
              </span>
            </div>
            <div className="muted">{advisorData.healthSummary}</div>
            {(advisorData.recommendations || []).slice(0, 3).map((rec, idx) => (
              <article key={`${rec.asset || 'asset'}-${idx}`} className="card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{rec.asset}</strong>
                  <span className="muted">{rec.priority || 'medium'}</span>
                </div>
                <div className="muted" style={{ marginTop: 6 }}>{rec.detail}</div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2>Nueva posición</h2>
        <p className="muted" style={{ marginTop: 6 }}>Cargá una posición para monitorear P&L y señales relacionadas.</p>
        <form onSubmit={submit} className="grid grid-2" style={{ marginTop: 8 }}>
          <label className="label">
            <span className="muted">Activo</span>
            <input
              value={assetQuery}
              required
              onChange={(e) => setAssetQuery(e.target.value)}
              placeholder="Escribí activo o ticker (ej: Apple o AAPL)"
            />
            {assetQuery ? (
              <span className="muted" style={{ marginTop: 4, display: 'block' }}>
                {selectedAssetMatch
                  ? `Se cargará: ${selectedAssetMatch.symbol} - ${selectedAssetMatch.name}`
                  : assetSuggestions.length
                    ? `Sugerido: ${assetSuggestions[0].symbol} - ${assetSuggestions[0].name}`
                  : assetLoading
                    ? 'Buscando activos...'
                    : String(assetQuery || '').trim().length >= 2
                      ? 'No encontramos ese activo. Probá con nombre o ticker.'
                      : 'Escribí al menos 2 letras o elegí una sugerencia.'}
              </span>
            ) : null}
            {assetSuggestions.length ? (
              <div className="markets-watchlist-suggestions">
                {assetSuggestions.map((item) => (
                  <button
                    key={item.symbol}
                    type="button"
                    className={`markets-watchlist-suggestion ${selectedAssetMatch?.symbol === item.symbol ? 'is-active' : ''}`}
                    onClick={() => setAssetQuery(item.symbol)}
                  >
                    <span className="mono">{item.symbol}</span>
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </label>
          <label className="label">
            <span className="muted">Fecha compra</span>
            <input type="date" value={form.buyDate} required onChange={(e) => setForm({ ...form, buyDate: e.target.value })} />
          </label>
          <label className="label">
            <span className="muted">Precio compra</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.buyPrice}
              required
              onChange={(e) => setForm({ ...form, buyPrice: e.target.value })}
              onBlur={() => setForm((prev) => ({ ...prev, buyPrice: formatMoneyInput(prev.buyPrice) }))}
              onFocus={() => setForm((prev) => ({ ...prev, buyPrice: String(parseNumericInput(prev.buyPrice) ?? '') }))}
            />
          </label>
          <label className="label">
            <span className="muted">Monto total (USD)</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.amountUsd}
              required
              onChange={(e) => setForm({ ...form, amountUsd: e.target.value })}
              onBlur={() => setForm((prev) => ({ ...prev, amountUsd: formatMoneyInput(prev.amountUsd) }))}
              onFocus={() => setForm((prev) => ({ ...prev, amountUsd: String(parseNumericInput(prev.amountUsd) ?? '') }))}
            />
          </label>
          <label className="label">
            <span className="muted">Stop loss % (opcional)</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.stopLoss}
              onChange={(e) => setForm({ ...form, stopLoss: e.target.value })}
              onBlur={() => setForm((prev) => ({ ...prev, stopLoss: normalizePercentInput(prev.stopLoss) }))}
              onFocus={() => setForm((prev) => ({ ...prev, stopLoss: String(parseNumericInput(prev.stopLoss) ?? '') }))}
            />
          </label>
          <label className="label">
            <span className="muted">Take profit % (opcional)</span>
            <input
              type="text"
              inputMode="decimal"
              value={form.takeProfit}
              onChange={(e) => setForm({ ...form, takeProfit: e.target.value })}
              onBlur={() => setForm((prev) => ({ ...prev, takeProfit: normalizePercentInput(prev.takeProfit) }))}
              onFocus={() => setForm((prev) => ({ ...prev, takeProfit: String(parseNumericInput(prev.takeProfit) ?? '') }))}
            />
          </label>
          <button type="submit" disabled={!canSubmitPosition}>
            Agregar
          </button>
        </form>
      </section>

      <section className="card portfolio-toolbar">
        <div className="ai-filter-stack" style={{ marginBottom: 0 }}>
          <div className="ai-filter-group">
            <span className="ai-filter-label">Posiciones</span>
            <div className="ai-filter-row">
              <button type="button" className={`ai-filter-chip ${tab === 'active' ? 'is-active is-main' : ''}`} onClick={() => setTab('active')}>
                Activas
              </button>
              <button type="button" className={`ai-filter-chip ${tab === 'sold' ? 'is-active is-main' : ''}`} onClick={() => setTab('sold')}>
                Cerradas
              </button>
            </div>
          </div>
        </div>
        <label className="label" style={{ maxWidth: 240 }}>
          <span className="muted">Exportar</span>
          <select className="select-field" aria-label="Filtro exportación" value={exportFilter} onChange={(e) => setExportFilter(e.target.value)}>
            <option value="all">Todas las posiciones</option>
            <option value="active">Solo activas</option>
            <option value="sold">Solo cerradas</option>
          </select>
        </label>
        <button type="button" onClick={exportCsv} disabled={exporting}>
          {exporting ? 'Exportando...' : 'Exportar CSV'}
        </button>
      </section>

      {visibleRows.map((p) => (
        <PositionRow key={p.id} position={p} onOpenSell={handleOpenSell} onDelete={handleDelete} onOpenRiskTargets={handleOpenRiskTargets} />
      ))}
      {hasMoreRows ? (
        <div className="card portfolio-more">
          <button type="button" className="inline-link-btn" onClick={() => setVisibleCount((prev) => Math.min(prev + PORTFOLIO_PAGE_SIZE, rows.length))}>
            Ver más posiciones
          </button>
        </div>
      ) : null}
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

      {riskTargetsModal.id && (
        <div className="modal-backdrop" role="presentation" onClick={() => setRiskTargetsModal(emptyRiskTargets)}>
          <section className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Definir SL / TP · {riskTargetsModal.symbol}</h3>
            <form onSubmit={submitRiskTargets} className="grid" style={{ marginTop: 8 }}>
              <label className="label">
                <span className="muted">Stop loss %</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={riskTargetsModal.stopLoss}
                  onChange={(e) => setRiskTargetsModal({ ...riskTargetsModal, stopLoss: e.target.value })}
                  onBlur={() => setRiskTargetsModal((prev) => ({ ...prev, stopLoss: normalizePercentInput(prev.stopLoss) }))}
                  onFocus={() => setRiskTargetsModal((prev) => ({ ...prev, stopLoss: String(parseNumericInput(prev.stopLoss) ?? '') }))}
                />
              </label>
              <label className="label">
                <span className="muted">Take profit %</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={riskTargetsModal.takeProfit}
                  onChange={(e) => setRiskTargetsModal({ ...riskTargetsModal, takeProfit: e.target.value })}
                  onBlur={() => setRiskTargetsModal((prev) => ({ ...prev, takeProfit: normalizePercentInput(prev.takeProfit) }))}
                  onFocus={() => setRiskTargetsModal((prev) => ({ ...prev, takeProfit: String(parseNumericInput(prev.takeProfit) ?? '') }))}
                />
              </label>
              <div className="row">
                <button type="button" onClick={() => setRiskTargetsModal(emptyRiskTargets)}>
                  Cancelar
                </button>
                <button type="submit">Guardar SL / TP</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};

export default Portfolio;
