import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import { useApp } from '../store/AppContext';
import { WATCHLIST_CATALOG } from '../utils/constants';
import { formatPct, formatUSD, shortDate } from '../utils/format';

const todayIsoDate = () => new Date().toISOString().slice(0, 10);
const createEmptyForm = () => ({ symbol: '', name: '', category: 'equity', buyDate: todayIsoDate(), buyPrice: '', amountUsd: '', stopLoss: '', takeProfit: '' });
const emptySell = { id: '', symbol: '', sellPrice: '', sellDate: new Date().toISOString().slice(0, 10), sellQuantity: '', maxQuantity: 0 };
const emptyRiskTargets = { id: '', symbol: '', stopLoss: '', takeProfit: '' };
const allocColors = ['#3B82F6', '#00DC82', '#A78BFA', '#FFB800', '#F97316', '#22D3EE', '#EF4444', '#10B981'];
const PORTFOLIO_PAGE_SIZE = 8;
const normalizeSearchText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const resolveAssetByQuery = (query, assets = []) => {
  const raw = normalizeSearchText(query);
  if (!raw) return null;
  const list = Array.isArray(assets) ? assets : [];
  const bySymbol = list.find((item) => normalizeSearchText(item.symbol) === raw);
  if (bySymbol) return bySymbol;
  const byName = list.find((item) => normalizeSearchText(item.name) === raw);
  if (byName) return byName;
  const bySymbolPrefix = list.find((item) => normalizeSearchText(item.symbol).startsWith(raw));
  if (bySymbolPrefix) return bySymbolPrefix;
  const byNamePrefix = list.find((item) => normalizeSearchText(item.name).startsWith(raw));
  if (byNamePrefix) return byNamePrefix;
  const byNameContains = list.find((item) => normalizeSearchText(item.name).includes(raw));
  return byNameContains || null;
};

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

const PositionRow = memo(function PositionRow({ position, onOpenSell, onDelete, onOpenRiskTargets, riskPulse = null }) {
  const slPct = Number(position.stopLossPct);
  const tpPct = Number(position.takeProfitPct);

  return (
    <article className="card pos-row">
      <div className="pos-icon">{String(position.symbol).slice(0, 3)}</div>
      <div className="pos-info">
        <div className="pos-sym mono">{position.symbol}</div>
        <div className="pos-detail">
          Invertido {formatUSD(Number(position.buyPrice) * Number(position.quantity))} · Cantidad {position.quantity} · Compra {formatUSD(position.buyPrice)}
          {!position.sellDate && Number.isFinite(slPct) && slPct > 0 ? ` · SL -${slPct.toFixed(2)}%` : ''}
          {!position.sellDate && Number.isFinite(tpPct) && tpPct > 0 ? ` · TP +${tpPct.toFixed(2)}%` : ''}
          {position.sellDate ? ` · Venta ${formatUSD(position.sellPrice)} (${shortDate(position.sellDate)})` : ''}
        </div>
      </div>
      <div className="pos-vals">
        <div className="pos-value mono">{formatUSD(position.value)}</div>
        <div className={`pos-pnl mono ${position.pnl >= 0 ? 'up' : 'down'}`}>
          {formatUSD(position.pnl)} ({formatPct(position.pnlPctPos)})
        </div>
        {!position.sellDate ? (
          <div className="row" style={{ marginTop: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              className={`ai-filter-chip portfolio-row-chip ${riskPulse === 'sl' ? 'portfolio-risk-sl' : riskPulse === 'tp' ? 'portfolio-risk-tp' : ''}`}
              onClick={() => onOpenRiskTargets(position)}
            >
              SL / TP
            </button>
            <button type="button" className="ai-filter-chip portfolio-row-chip" onClick={() => onOpenSell(position)}>
              Vender
            </button>
            <button type="button" className="ai-filter-chip portfolio-row-chip" onClick={() => onDelete(position.id)}>
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
  const portfolios = Array.isArray(state.portfolios) ? state.portfolios : [];
  const hasPortfolios = portfolios.length > 0;
  const defaultPortfolioId = portfolios[0]?.id || '';
  const activePortfolioId = portfolios.some((p) => p.id === state.activePortfolioId) ? state.activePortfolioId : defaultPortfolioId;
  const [tab, setTab] = useState('active');
  const [visibleCount, setVisibleCount] = useState(PORTFOLIO_PAGE_SIZE);
  const [form, setForm] = useState(createEmptyForm());
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
  const [formError, setFormError] = useState('');
  const [portfolioActionById, setPortfolioActionById] = useState({});
  const [inviteEmailByPortfolio, setInviteEmailByPortfolio] = useState({});
  const [inviteBusyByPortfolio, setInviteBusyByPortfolio] = useState({});
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [receivedInvites, setReceivedInvites] = useState([]);
  const [receivedInvitesLoading, setReceivedInvitesLoading] = useState(false);

  const assetsBySymbol = useMemo(() => Object.fromEntries(state.assets.map((a) => [a.symbol, a])), [state.assets]);
  const positionsWithPortfolio = useMemo(
    () =>
      state.positions.map((position) => ({
        ...position,
        portfolioId: position.portfolioId || defaultPortfolioId
      })),
    [state.positions, defaultPortfolioId]
  );

  const selectedPositions = useMemo(
    () => positionsWithPortfolio.filter((p) => p.portfolioId === activePortfolioId),
    [positionsWithPortfolio, activePortfolioId]
  );

  const active = useMemo(() => selectedPositions.filter((p) => !p.sellDate), [selectedPositions]);
  const sold = useMemo(() => selectedPositions.filter((p) => p.sellDate), [selectedPositions]);
  const activeValue = active.reduce((acc, p) => acc + (assetsBySymbol[p.symbol]?.price ?? p.buyPrice) * p.quantity, 0);
  const activeInvested = active.reduce((acc, p) => acc + p.buyPrice * p.quantity, 0);

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

  const realizedPnl = useMemo(() => soldRows.reduce((acc, row) => acc + Number(row.pnl || 0), 0), [soldRows]);
  const unrealizedPnl = activeValue - activeInvested;
  const pnlTotal = unrealizedPnl + realizedPnl;
  const totalInvested = activeInvested + soldRows.reduce((acc, row) => acc + Number(row.buyPrice || 0) * Number(row.quantity || 0), 0);
  const pnlPct = totalInvested ? (pnlTotal / totalInvested) * 100 : 0;
  const portfolioValue = activeValue;

  const globalSummary = useMemo(() => {
    let capitalInvested = 0;
    let realizedValue = 0;
    let pnlTotalAll = 0;

    positionsWithPortfolio.forEach((position) => {
      const quantity = Number(position.quantity || 0);
      const buyPrice = Number(position.buyPrice || 0);
      const invested = buyPrice * quantity;
      capitalInvested += invested;

      if (position.sellDate && Number.isFinite(Number(position.sellPrice))) {
        const soldValue = Number(position.sellPrice) * quantity;
        realizedValue += soldValue;
        pnlTotalAll += soldValue - invested;
      } else {
        const currentPrice = Number(assetsBySymbol[position.symbol]?.price ?? buyPrice);
        pnlTotalAll += (currentPrice - buyPrice) * quantity;
      }
    });

    return {
      capitalInvested,
      realizedValue,
      pnlTotal: pnlTotalAll,
      performancePct: capitalInvested > 0 ? (pnlTotalAll / capitalInvested) * 100 : 0
    };
  }, [positionsWithPortfolio, assetsBySymbol]);

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
    const merged = new Map();
    const push = (item) => {
      const symbol = String(item?.symbol || '').toUpperCase();
      if (!symbol || merged.has(symbol)) return;
      merged.set(symbol, {
        symbol,
        name: String(item?.name || ''),
        category: String(item?.category || 'equity').toLowerCase()
      });
    };
    (assetUniverse || []).forEach(push);
    (state.assets || []).forEach(push);
    (WATCHLIST_CATALOG || []).forEach(push);
    return [...merged.values()].map((item) => ({
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

  const submit = (e) => {
    e.preventDefault();
    setFormError('');
    const selected = selectedAssetMatch || assetSuggestions[0] || resolveAssetByQuery(assetQuery, searchableAssets);
    if (!selected) {
      setFormError('Activo inválido. Escribí ticker o nombre válido.');
      return;
    }
    if (!form.buyDate) {
      setFormError('Completá la fecha de compra.');
      return;
    }
    const buyPrice = Number(parseNumericInput(form.buyPrice));
    const amountUsd = Number(parseNumericInput(form.amountUsd));
    if (!Number.isFinite(buyPrice) || buyPrice <= 0 || !Number.isFinite(amountUsd) || amountUsd <= 0) {
      setFormError('Completá precio y monto total con valores válidos.');
      return;
    }
    const slPct = form.stopLoss ? Number(parseNumericInput(form.stopLoss)) : null;
    const tpPct = form.takeProfit ? Number(parseNumericInput(form.takeProfit)) : null;
    if (form.stopLoss && (!Number.isFinite(slPct) || slPct <= 0)) {
      setFormError('Stop loss debe ser un porcentaje positivo.');
      return;
    }
    if (form.takeProfit && (!Number.isFinite(tpPct) || tpPct <= 0)) {
      setFormError('Take profit debe ser un porcentaje positivo.');
      return;
    }
    const quantity = Number((amountUsd / buyPrice).toFixed(8));
    actions.addPosition({
      portfolioId: activePortfolioId,
      symbol: selected.symbol,
      name: selected.name,
      category: selected.category === 'etf' ? 'equity' : selected.category,
      buyDate: form.buyDate,
      id: crypto.randomUUID(),
      buyPrice,
      quantity,
      notes: '',
      stopLossPct: slPct,
      takeProfitPct: tpPct
    });
    setForm(createEmptyForm());
    setAssetQuery('');
    setAssetRemote([]);
    setFormError('');
  };

  const submitSell = (e) => {
    e.preventDefault();
    const price = Number(parseNumericInput(sellModal.sellPrice));
    const quantity = Number(parseNumericInput(sellModal.sellQuantity));
    const maxQuantity = Number(sellModal.maxQuantity || 0);
    if (!sellModal.id || !price || !sellModal.sellDate || !quantity || quantity <= 0 || quantity > maxQuantity) return;
    actions.sellPosition(sellModal.id, price, sellModal.sellDate, quantity);
    setSellModal(emptySell);
  };

  const sellQtyNumber = Number(parseNumericInput(sellModal.sellQuantity));
  const sellMaxQtyNumber = Number(sellModal.maxQuantity || 0);
  const sellRemainingQty =
    Number.isFinite(sellQtyNumber) && Number.isFinite(sellMaxQtyNumber) ? Number((sellMaxQtyNumber - sellQtyNumber).toFixed(8)) : null;
  const canSubmitSell =
    !!sellModal.id &&
    Number(parseNumericInput(sellModal.sellPrice)) > 0 &&
    !!sellModal.sellDate &&
    Number.isFinite(sellQtyNumber) &&
    sellQtyNumber > 0 &&
    sellQtyNumber <= sellMaxQtyNumber;

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

  const rows = tab === 'active' ? activeRows : tab === 'sold' ? soldRows : tab === 'all' ? [...activeRows, ...soldRows] : [];
  const visibleRows = rows.slice(0, visibleCount);
  const hasMoreRows = visibleRows.length < rows.length;
  const riskPulseBySymbol = useMemo(() => {
    const out = {};
    (state.alerts || []).forEach((alert) => {
      const symbol = String(alert?.symbol || '').toUpperCase();
      if (!symbol) return;
      const type = String(alert?.type || '').toLowerCase();
      if (type === 'stoploss' || type === 'stop_loss') out[symbol] = 'sl';
      if (type === 'takeprofit' && !out[symbol]) out[symbol] = 'tp';
    });
    return out;
  }, [state.alerts]);

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
        sellDate: new Date().toISOString().slice(0, 10),
        sellQuantity: String(position.quantity),
        maxQuantity: Number(position.quantity)
      }),
    [assetsBySymbol]
  );

  const handleDelete = useCallback(
    (id) => {
      const confirmed = window.confirm('¿Seguro que querés eliminar esta posición? Esta acción no se puede deshacer.');
      if (!confirmed) return;
      actions.deletePosition(id);
    },
    [actions]
  );
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

  const canCreatePortfolio = useMemo(() => {
    if (portfolios.length >= 5) return false;
    if (!positionsWithPortfolio.length) return true;
    if (!portfolios.length) return true;
    const byPortfolio = positionsWithPortfolio.reduce((acc, position) => {
      const key = String(position.portfolioId || '');
      if (!key) return acc;
      acc[key] = acc[key] || [];
      acc[key].push(position);
      return acc;
    }, {});
    return Object.values(byPortfolio).some((rows) => rows.length > 0 && rows.every((row) => !!row.sellDate));
  }, [portfolios.length, positionsWithPortfolio]);

  const handleCreatePortfolio = async () => {
    const proposed = window.prompt('Nombre del nuevo portfolio');
    const safeName = String(proposed || '').trim();
    if (!safeName) return;
    const created = await actions.createPortfolio(safeName);
    if (!created) {
      window.alert('No se pudo crear el portfolio. Revisá la regla: máximo 5 y al menos 1 portfolio 100% realizado antes de crear otro.');
      return;
    }
    window.alert(`Portfolio "${created.name}" creado.`);
  };

  const handleDeletePortfolio = async (portfolio) => {
    if (!portfolio?.id) return;
    const confirmed = window.confirm(`¿Eliminar portfolio "${portfolio.name}"? También se eliminarán todas sus posiciones.`);
    if (!confirmed) return;
    const result = await actions.deletePortfolio(portfolio);
    if (!result?.ok) {
      window.alert(result?.message || 'No se pudo eliminar el portfolio.');
      return;
    }
    window.alert(`Portfolio "${portfolio.name}" eliminado.`);
  };

  const loadReceivedInvites = useCallback(async () => {
    setReceivedInvitesLoading(true);
    try {
      const out = await api.getReceivedPortfolioInvites();
      setReceivedInvites(Array.isArray(out?.invitations) ? out.invitations : []);
    } catch {
      setReceivedInvites([]);
    } finally {
      setReceivedInvitesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReceivedInvites();
  }, [loadReceivedInvites]);

  const handleSendInvite = async (portfolioId) => {
    const portfolio = portfolios.find((p) => p.id === portfolioId);
    if (!portfolio?.isOwner) return;
    const email = String(inviteEmailByPortfolio[portfolioId] || '').trim().toLowerCase();
    if (!email) return;
    setInviteBusyByPortfolio((prev) => ({ ...prev, [portfolioId]: true }));
    setInviteError('');
    setInviteMessage('');
    try {
      await api.inviteToPortfolio(portfolioId, email);
      setInviteEmailByPortfolio((prev) => ({ ...prev, [portfolioId]: '' }));
      await actions.refreshUserData();
      setInviteMessage(`Invitación enviada a ${email}.`);
    } catch (error) {
      setInviteError(error?.message || 'No se pudo enviar la invitación.');
    } finally {
      setInviteBusyByPortfolio((prev) => ({ ...prev, [portfolioId]: false }));
    }
  };

  const handleRespondInvite = async (inviteId, action) => {
    try {
      await api.respondPortfolioInvite(inviteId, action);
      await loadReceivedInvites();
      if (action === 'accept') actions.reloadAssets();
    } catch (error) {
      window.alert(error?.message || 'No se pudo responder la invitación.');
    }
  };

  const handleRenamePortfolio = async (portfolio) => {
    if (!portfolio?.id) return;
    const proposed = window.prompt('Nuevo nombre del portfolio', portfolio.name || '');
    const safeName = String(proposed || '').trim();
    if (!safeName || safeName === portfolio.name) return;
    await actions.renamePortfolio(portfolio.id, safeName);
  };

  const handlePortfolioActionChange = async (portfolio, action) => {
    if (!portfolio?.id || !portfolio?.isOwner) return;
    if (!action) {
      setPortfolioActionById((prev) => ({ ...prev, [portfolio.id]: '' }));
      return;
    }
    if (action === 'edit') {
      await handleRenamePortfolio(portfolio);
      setPortfolioActionById((prev) => ({ ...prev, [portfolio.id]: '' }));
      return;
    }
    if (action === 'delete') {
      await handleDeletePortfolio(portfolio);
      setPortfolioActionById((prev) => ({ ...prev, [portfolio.id]: '' }));
      return;
    }
    setPortfolioActionById((prev) => ({ ...prev, [portfolio.id]: action }));
  };

  return (
    <div className="grid portfolio-page">
      {exportError && <div className="card" style={{ borderColor: '#FF4757AA' }}>{exportError}</div>}

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">Consolidado global (todos los portfolios)</h3>
        </div>
        <div className="ind-grid">
          <div className="ind-cell">
            <div className="ind-label">Capital invertido</div>
            <div className="ind-val mono">{formatUSD(globalSummary.capitalInvested)}</div>
          </div>
          <div className="ind-cell">
            <div className="ind-label">Valor realizado</div>
            <div className="ind-val mono">{formatUSD(globalSummary.realizedValue)}</div>
          </div>
          <div className="ind-cell">
            <div className={`ind-val mono ${globalSummary.pnlTotal >= 0 ? 'up' : 'down'}`}>
              {formatUSD(globalSummary.pnlTotal)}
            </div>
            <div className="ind-label">P&L total</div>
          </div>
          <div className="ind-cell">
            <div className={`ind-val mono ${globalSummary.performancePct >= 0 ? 'up' : 'down'}`}>
              {formatPct(globalSummary.performancePct)}
            </div>
            <div className="ind-label">Performance</div>
          </div>
        </div>
        <div className="ai-filter-stack portfolio-collab-panel">
          <div className="ai-filter-group">
            <span className="ai-filter-label">Portfolios</span>
            <div className="portfolio-collab-list">
              {portfolios.map((portfolio) => (
                <div
                  key={portfolio.id}
                  className={`portfolio-collab-item ${activePortfolioId === portfolio.id ? 'is-active' : ''}`}
                >
                  <div className="portfolio-collab-item-main">
                    <div className="portfolio-collab-left">
                      <button
                        type="button"
                        className={`ai-filter-chip portfolio-collab-select ${activePortfolioId === portfolio.id ? 'is-active is-main' : ''}`}
                        onClick={() => actions.setActivePortfolio(portfolio.id)}
                      >
                        {portfolio.name}
                      </button>
                      {!portfolio.isOwner ? <span className="portfolio-collab-role is-shared">Compartido</span> : null}
                    </div>
                    <div className="portfolio-collab-actions">
                      <span className="portfolio-collab-meta">Invitados {Number(portfolio.collaboratorCount || 0)}/5</span>
                      {portfolio.isOwner ? (
                        <select
                          className="portfolio-action-select"
                          value={portfolioActionById[portfolio.id] || ''}
                          onChange={(e) => handlePortfolioActionChange(portfolio, e.target.value)}
                        >
                          <option value="">Acciones</option>
                          <option value="edit">Editar</option>
                          <option value="invite">Invitar</option>
                          <option value="delete">Eliminar</option>
                        </select>
                      ) : (
                        <span className="portfolio-collab-readonly">Solo lectura</span>
                      )}
                    </div>
                  </div>
                  {portfolio.isOwner && portfolioActionById[portfolio.id] === 'invite' ? (
                    <div className="portfolio-collab-invite-row">
                      <input
                        className="portfolio-collab-invite-input"
                        type="email"
                        value={inviteEmailByPortfolio[portfolio.id] || ''}
                        onChange={(e) => setInviteEmailByPortfolio((prev) => ({ ...prev, [portfolio.id]: e.target.value }))}
                        placeholder="Email del usuario a invitar"
                      />
                      <button
                        type="button"
                        onClick={() => handleSendInvite(portfolio.id)}
                        disabled={inviteBusyByPortfolio[portfolio.id] || !String(inviteEmailByPortfolio[portfolio.id] || '').trim()}
                      >
                        {inviteBusyByPortfolio[portfolio.id] ? 'Enviando...' : 'Enviar'}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
              <div className="portfolio-collab-add-wrap">
                <button type="button" className="ai-filter-chip portfolio-add-chip" onClick={handleCreatePortfolio} disabled={!canCreatePortfolio}>
                  + Agregar portfolio
                </button>
              </div>
            </div>
          </div>
        </div>
        <p className="muted portfolio-collab-helper">
          {portfolios.length >= 5
            ? 'Llegaste al máximo de 5 portfolios.'
            : canCreatePortfolio
              ? `Podés crear un nuevo portfolio (${portfolios.length}/5).`
              : 'Para crear uno nuevo, primero completá al 100% un portfolio existente.'}
        </p>
        {inviteMessage ? <div className="muted portfolio-collab-feedback portfolio-collab-feedback-ok">{inviteMessage}</div> : null}
        {inviteError ? <div className="muted portfolio-collab-feedback portfolio-collab-feedback-error">{inviteError}</div> : null}
      </section>

      <section className="card">
        <div className="section-header-inline">
          <h3 className="section-title">Invitaciones {receivedInvites.length ? `(${receivedInvites.length})` : ''}</h3>
        </div>
        {receivedInvitesLoading ? <p className="muted portfolio-invites-empty">Cargando invitaciones...</p> : null}
        {!receivedInvitesLoading && !receivedInvites.length ? <p className="muted portfolio-invites-empty">No tenés invitaciones pendientes.</p> : null}
        {receivedInvites.map((inv) => (
          <article key={inv.id} className="portfolio-invite-item">
            <div className="portfolio-invite-item-row">
              <div className="portfolio-invite-item-info">
                <strong>{inv.portfolio_name}</strong>
                <div className="muted">Invita: {inv.invited_by_email}</div>
              </div>
              <div className="portfolio-invite-item-actions">
                <button type="button" className="ai-filter-chip portfolio-invite-accept" onClick={() => handleRespondInvite(inv.id, 'accept')}>
                  Aceptar
                </button>
                <button type="button" className="ai-filter-chip portfolio-invite-decline" onClick={() => handleRespondInvite(inv.id, 'decline')}>
                  Rechazar
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      {hasPortfolios ? (
        <>
      <section className="card portfolio-hero">
        <div className="portfolio-label">Valor total ({portfolios.find((p) => p.id === activePortfolioId)?.name || 'Sin portfolio'})</div>
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
            <div className="ind-val mono">{formatUSD(totalInvested)}</div>
          </div>
          <div className="ind-cell">
            <div className="ind-label">P&L realizado</div>
            <div className={`ind-val mono ${realizedPnl >= 0 ? 'up' : 'down'}`}>{formatUSD(realizedPnl)}</div>
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
        {formError ? <div className="card" style={{ marginTop: 8, borderColor: '#FF4757AA' }}>{formError}</div> : null}
        <form onSubmit={submit} className="grid grid-2" style={{ marginTop: 8 }}>
          <label className="label portfolio-asset-field">
            <span className="muted">Activo</span>
            <input
              list="portfolio-asset-suggestions"
              value={assetQuery}
              required
              onChange={(e) => setAssetQuery(e.target.value)}
              onBlur={() => {
                if (selectedAssetMatch?.symbol) setAssetQuery(selectedAssetMatch.symbol);
              }}
              placeholder="Escribí activo o ticker (ej: Apple o AAPL)"
            />
            <datalist id="portfolio-asset-suggestions">
              {assetSuggestions.map((item) => (
                <option key={item.symbol} value={item.symbol}>
                  {item.name}
                </option>
              ))}
            </datalist>
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
          <button type="submit">
            Agregar
          </button>
        </form>
      </section>

      <section className="card portfolio-toolbar">
        <div className="ai-filter-stack" style={{ marginBottom: 0 }}>
          <div className="ai-filter-group">
            <span className="ai-filter-label">Posiciones</span>
            <div className="ai-filter-row">
              <button type="button" className={`ai-filter-chip ${tab === 'all' ? 'is-active is-main' : ''}`} onClick={() => setTab('all')}>
                Total
              </button>
              <button type="button" className={`ai-filter-chip ${tab === 'active' ? 'is-active is-main' : ''}`} onClick={() => setTab('active')}>
                Activas
              </button>
              <button type="button" className={`ai-filter-chip ${tab === 'sold' ? 'is-active is-main' : ''}`} onClick={() => setTab('sold')}>
                Cerradas
              </button>
            </div>
          </div>
        </div>
      </section>

      {visibleRows.map((p) => (
        <PositionRow
          key={p.id}
          position={p}
          onOpenSell={handleOpenSell}
          onDelete={handleDelete}
          onOpenRiskTargets={handleOpenRiskTargets}
          riskPulse={riskPulseBySymbol[String(p.symbol || '').toUpperCase()] || null}
        />
      ))}
      {hasMoreRows ? (
        <div className="card portfolio-more">
          <button type="button" className="inline-link-btn" onClick={() => setVisibleCount((prev) => Math.min(prev + PORTFOLIO_PAGE_SIZE, rows.length))}>
            Ver más posiciones
          </button>
        </div>
      ) : null}
      {!rows.length && <div className="card muted">No hay posiciones en esta pestaña.</div>}

      <section className="card portfolio-toolbar portfolio-export-card">
        <label className="label" style={{ maxWidth: 280 }}>
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
        </>
      ) : null}

      {sellModal.id && (
        <div className="modal-backdrop" role="presentation" onClick={() => setSellModal(emptySell)}>
          <section className="modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Vender {sellModal.symbol}</h3>
            <form onSubmit={submitSell} className="grid" style={{ marginTop: 8 }}>
              <label className="label">
                <span className="muted">Cantidad a vender</span>
                <input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  max={sellModal.maxQuantity || undefined}
                  value={sellModal.sellQuantity}
                  required
                  onChange={(e) => setSellModal({ ...sellModal, sellQuantity: e.target.value })}
                />
                <span className="muted">
                  Disponible: {sellModal.maxQuantity}
                  {Number.isFinite(sellRemainingQty) ? ` · Saldo restante: ${Math.max(0, sellRemainingQty)}` : ''}
                </span>
              </label>
              <label className="label">
                <span className="muted">Precio de venta</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={sellModal.sellPrice}
                  required
                  onChange={(e) => setSellModal({ ...sellModal, sellPrice: e.target.value })}
                  onBlur={() => setSellModal((prev) => ({ ...prev, sellPrice: formatMoneyInput(prev.sellPrice) }))}
                  onFocus={() => setSellModal((prev) => ({ ...prev, sellPrice: String(parseNumericInput(prev.sellPrice) ?? '') }))}
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
                <button type="submit" disabled={!canSubmitSell}>
                  {canSubmitSell && sellRemainingQty === 0 ? 'Confirmar venta total' : 'Confirmar venta'}
                </button>
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
