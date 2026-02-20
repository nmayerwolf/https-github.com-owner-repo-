import React, { useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import {
  computeDynamicLimits,
  computeExposureByClass,
  computeExposureByRegion,
  computeExposureByTicker,
  inferRegimeContext
} from '../engine/riskLimits';
import { useApp } from '../store/AppContext';
import { formatPct, formatUSD, shortDate } from '../utils/format';

const ACTION_LABEL = {
  compra: 'BUY',
  venta: 'SELL',
  stoploss: 'REDUCE',
  takeprofit: 'HOLD'
};

const HORIZON_LABEL = {
  compra: 'Tactical',
  venta: 'Short',
  stoploss: 'Short',
  takeprofit: 'Tactical'
};

const baseLimits = {
  equity: 70,
  crypto: 25,
  commodity: 20,
  metal: 20,
  fx: 20,
  bond: 35
};
const regionBaseLimits = {
  US: 65,
  LATAM: 25,
  APAC: 25,
  EM: 20,
  GLOBAL: 35
};
const tickerBaseLimit = 18;

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const confidenceLabel = (raw) => {
  const value = String(raw || 'medium').toLowerCase();
  if (value === 'high') return 'High';
  if (value === 'low') return 'Low';
  return 'Medium';
};

const toTs = (value) => {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const Portfolio = () => {
  const { state, actions } = useApp();
  const [crisisManual, setCrisisManual] = useState(false);
  const [exportFilter, setExportFilter] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [postMortemExporting, setPostMortemExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const portfolios = Array.isArray(state.portfolios) ? state.portfolios : [];
  const hasPortfolios = portfolios.length > 0;
  const defaultPortfolioId = portfolios[0]?.id || '';
  const activePortfolioId = portfolios.some((p) => p.id === state.activePortfolioId) ? state.activePortfolioId : defaultPortfolioId;
  const activePortfolioName = portfolios.find((p) => p.id === activePortfolioId)?.name || 'Portfolio';

  const assetsBySymbol = useMemo(
    () => Object.fromEntries((state.assets || []).map((asset) => [String(asset.symbol || '').toUpperCase(), asset])),
    [state.assets]
  );

  const positions = useMemo(() => {
    return (state.positions || [])
      .filter((position) => (position.portfolioId || defaultPortfolioId) === activePortfolioId)
      .map((position) => {
        const symbol = String(position.symbol || '').toUpperCase();
        const asset = assetsBySymbol[symbol];
        const buyPrice = toNum(position.buyPrice, 0);
        const qty = toNum(position.quantity, 0);
        const currentPrice = toNum(asset?.price, buyPrice);
        const marketValue = qty * currentPrice;
        const cost = qty * buyPrice;
        const unrealized = position.sellDate ? 0 : marketValue - cost;
        const realized = position.sellDate ? qty * toNum(position.sellPrice, buyPrice) - cost : 0;
        return {
          ...position,
          symbol,
          category: String(position.category || asset?.category || 'equity').toLowerCase(),
          marketValue,
          cost,
          currentPrice,
          unrealized,
          realized
        };
      });
  }, [state.positions, activePortfolioId, defaultPortfolioId, assetsBySymbol]);

  const activePositions = useMemo(() => positions.filter((position) => !position.sellDate), [positions]);
  const closedPositions = useMemo(() => positions.filter((position) => !!position.sellDate), [positions]);

  const regimeContext = useMemo(() => inferRegimeContext(state.assets || []), [state.assets]);

  const crisisActive = crisisManual || regimeContext.regime === 'Risk Off' || regimeContext.volatility === 'High';

  const snapshot = useMemo(() => {
    const equity = activePositions.reduce((acc, position) => acc + position.marketValue, 0);
    const costBasis = activePositions.reduce((acc, position) => acc + position.cost, 0);
    const realized = closedPositions.reduce((acc, position) => acc + position.realized, 0);
    const unrealized = activePositions.reduce((acc, position) => acc + position.unrealized, 0);
    const pnl = realized + unrealized;
    const performance = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    const drawdown = activePositions.length
      ? Math.abs(
          Math.min(
            0,
            ...activePositions.map((position) => {
              if (!position.cost) return 0;
              return (position.unrealized / position.cost) * 100;
            })
          )
        )
      : 0;
    const notionalCapital = costBasis > 0 ? costBasis : 0;
    const cash = Math.max(0, notionalCapital - equity);
    return { equity, cash, pnl, performance, drawdown };
  }, [activePositions, closedPositions]);

  const exposureByClass = useMemo(() => computeExposureByClass(activePositions), [activePositions]);
  const exposureByTicker = useMemo(() => computeExposureByTicker(activePositions), [activePositions]);
  const exposureByRegion = useMemo(() => computeExposureByRegion(activePositions), [activePositions]);

  const limits = useMemo(
    () =>
      computeDynamicLimits({
        exposureByClass,
        exposureByTicker,
        exposureByRegion,
        baseLimits,
        tickerBaseLimit,
        regionBaseLimits,
        volatility: regimeContext.volatility,
        crisisActive
      }),
    [exposureByClass, exposureByTicker, exposureByRegion, regimeContext.volatility, crisisActive]
  );

  const recommendations = useMemo(() => {
    return (state.alerts || [])
      .slice(0, 10)
      .map((alert, idx) => {
        const symbol = String(alert.symbol || 'MARKET').toUpperCase();
        const action = ACTION_LABEL[String(alert.type || '').toLowerCase()] || 'HOLD';
        const confidence = confidenceLabel(alert.confidence);
        const riskLevel =
          action === 'SELL' || action === 'REDUCE'
            ? 'High'
            : confidence === 'High'
              ? 'Medium'
              : 'Low';
        const sizing = confidence === 'High' ? '3-5% portfolio' : confidence === 'Medium' ? '2-3% portfolio' : '1-2% portfolio';
        const stop = Number.isFinite(Number(alert.stopLoss)) ? formatUSD(Number(alert.stopLoss)) : 'Use tactical stop at invalidation level';
        const target = Number.isFinite(Number(alert.takeProfit)) ? formatUSD(Number(alert.takeProfit)) : null;
        const rationale = String(alert.aiReasoning || `Signal confluence supports ${action} on ${symbol}.`);
        return {
          id: alert.id || `${symbol}-${idx}`,
          symbol,
          action,
          sizing,
          stop,
          target,
          confidence,
          riskLevel,
          horizon: HORIZON_LABEL[String(alert.type || '').toLowerCase()] || 'Tactical',
          rationale
        };
      });
  }, [state.alerts]);

  const journal = useMemo(() => {
    const alertEntries = (state.alerts || []).slice(0, 12).map((alert, idx) => ({
      id: `alert-${alert.id || idx}`,
      kind: 'Alert',
      when: alert.createdAt ? shortDate(alert.createdAt) : 'Recent',
      text: `${String(alert.symbol || '').toUpperCase()} · ${ACTION_LABEL[String(alert.type || '').toLowerCase()] || 'HOLD'} · ${confidenceLabel(alert.confidence)} confidence`,
      outcome: alert.outcome || 'open'
    }));

    const closedEntries = closedPositions.slice(0, 12).map((position) => ({
      id: `closed-${position.id}`,
      kind: 'Decision',
      when: shortDate(position.sellDate),
      text: `Closed ${position.symbol} at ${formatUSD(position.sellPrice)}.`,
      outcome: position.realized >= 0 ? 'win' : 'loss'
    }));

    return [...closedEntries, ...alertEntries].slice(0, 20);
  }, [state.alerts, closedPositions]);

  const postMortem = useMemo(() => {
    const closed = closedPositions
      .map((position) => ({
        symbol: position.symbol,
        pnlPct: position.cost > 0 ? (position.realized / position.cost) * 100 : 0,
        outcome: position.realized >= 0 ? 'win' : 'loss',
        category: position.category || 'equity'
      }))
      .filter((row) => Number.isFinite(row.pnlPct));

    const wins = closed.filter((row) => row.outcome === 'win');
    const losses = closed.filter((row) => row.outcome === 'loss');
    const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
    const avgWin = wins.length ? wins.reduce((acc, row) => acc + row.pnlPct, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((acc, row) => acc + row.pnlPct, 0) / losses.length : 0;

    const byCategory = closed.reduce((acc, row) => {
      const key = String(row.category || 'equity');
      acc[key] = acc[key] || { count: 0, total: 0 };
      acc[key].count += 1;
      acc[key].total += row.pnlPct;
      return acc;
    }, {});
    const bestCategory = Object.entries(byCategory)
      .map(([category, info]) => ({ category, avg: info.count ? info.total / info.count : 0, count: info.count }))
      .sort((a, b) => b.avg - a.avg)[0];

    const lessons = [];
    if (!closed.length) lessons.push('Aún no hay operaciones cerradas para evaluar patrones.');
    if (winRate < 45 && closed.length >= 4) lessons.push('La tasa de acierto está baja: conviene reducir sizing y subir filtro de entrada.');
    if (winRate >= 55 && closed.length >= 4) lessons.push('La tasa de acierto mejora: podés escalar gradualmente sólo en setups de alta confianza.');
    if (avgLoss < -4) lessons.push('Las pérdidas promedio son amplias: ajustar stops iniciales y invalidación temprana.');
    if (avgWin > Math.abs(avgLoss) && wins.length) lessons.push('El payoff es favorable: priorizar ejecución disciplinada de take profit parcial.');
    if (bestCategory?.count >= 2) lessons.push(`Mejor desempeño reciente en ${bestCategory.category.toUpperCase()}: ${formatPct(bestCategory.avg)} promedio.`);

    return {
      closedCount: closed.length,
      winRate,
      avgWin,
      avgLoss,
      bestCategory,
      lessons: lessons.slice(0, 5)
    };
  }, [closedPositions]);
  const postMortemByRegime = useMemo(() => {
    const alertsBySymbol = (state.alerts || []).reduce((acc, alert) => {
      const symbol = String(alert.symbol || '').toUpperCase();
      if (!symbol) return acc;
      acc[symbol] = acc[symbol] || [];
      acc[symbol].push({
        type: String(alert.type || '').toLowerCase(),
        ts: toTs(alert.createdAt)
      });
      return acc;
    }, {});
    Object.values(alertsBySymbol).forEach((rows) => rows.sort((a, b) => a.ts - b.ts));

    const classify = (position) => {
      const symbol = String(position.symbol || '').toUpperCase();
      const rows = alertsBySymbol[symbol] || [];
      const sellTs = toTs(position.sellDate);
      const nearest = rows.filter((row) => !sellTs || row.ts <= sellTs).slice(-1)[0];
      const type = String(nearest?.type || '');
      if (type === 'compra') return 'Risk On';
      if (type === 'venta' || type === 'stoploss') return 'Risk Off';
      return 'Mixed';
    };

    const buckets = { 'Risk On': [], 'Risk Off': [], Mixed: [] };
    closedPositions.forEach((position) => {
      const regime = classify(position);
      const pnlPct = position.cost > 0 ? (position.realized / position.cost) * 100 : 0;
      buckets[regime].push(pnlPct);
    });

    return Object.entries(buckets).map(([regime, values]) => {
      const wins = values.filter((value) => value >= 0).length;
      return {
        regime,
        count: values.length,
        winRate: values.length ? (wins / values.length) * 100 : 0,
        avg: values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : 0
      };
    });
  }, [closedPositions, state.alerts]);
  const postMortemDrilldown = useMemo(() => {
    const closed = closedPositions
      .map((position) => ({
        symbol: String(position.symbol || '').toUpperCase(),
        category: String(position.category || 'equity').toLowerCase(),
        pnlPct: position.cost > 0 ? (position.realized / position.cost) * 100 : 0
      }))
      .filter((row) => Number.isFinite(row.pnlPct));

    const aggregate = (rows, keySelector) => {
      const acc = {};
      rows.forEach((row) => {
        const key = keySelector(row);
        acc[key] = acc[key] || { count: 0, total: 0, wins: 0 };
        acc[key].count += 1;
        acc[key].total += row.pnlPct;
        if (row.pnlPct >= 0) acc[key].wins += 1;
      });
      return Object.entries(acc)
        .map(([key, info]) => ({
          key,
          count: info.count,
          avg: info.count ? info.total / info.count : 0,
          winRate: info.count ? (info.wins / info.count) * 100 : 0
        }))
        .sort((a, b) => b.avg - a.avg);
    };

    return {
      bySymbol: aggregate(closed, (row) => row.symbol).slice(0, 5),
      byTheme: aggregate(closed, (row) => row.category.toUpperCase()).slice(0, 5)
    };
  }, [closedPositions]);

  const handleCreatePortfolio = async () => {
    if (typeof actions.createPortfolio !== 'function') return;
    const proposed = window.prompt('Portfolio name');
    const safeName = String(proposed || '').trim();
    if (!safeName) return;
    await actions.createPortfolio(safeName);
  };

  const downloadCsv = (content, filename) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = async () => {
    setExporting(true);
    setExportError('');
    try {
      const csv = await api.exportPortfolioCsv(exportFilter);
      downloadCsv(csv, `horsai-portfolio-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      setExportError(error?.message || 'No se pudo exportar el portfolio en CSV.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportPostMortemCsv = async () => {
    setPostMortemExporting(true);
    setExportError('');
    try {
      const lines = [];
      lines.push('section,key,count,win_rate_pct,avg_return_pct');
      postMortemByRegime.forEach((row) => {
        lines.push(`regime,${row.regime},${row.count},${row.winRate.toFixed(2)},${row.avg.toFixed(2)}`);
      });
      postMortemDrilldown.bySymbol.forEach((row) => {
        lines.push(`symbol,${row.key},${row.count},${row.winRate.toFixed(2)},${row.avg.toFixed(2)}`);
      });
      postMortemDrilldown.byTheme.forEach((row) => {
        lines.push(`theme,${row.key},${row.count},${row.winRate.toFixed(2)},${row.avg.toFixed(2)}`);
      });
      lines.push('');
      lines.push('lessons');
      postMortem.lessons.forEach((lesson) => {
        lines.push(`"${String(lesson || '').replace(/"/g, '""')}"`);
      });
      downloadCsv(lines.join('\n'), `horsai-postmortem-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (error) {
      setExportError(error?.message || 'No se pudo exportar el post-mortem.');
    } finally {
      setPostMortemExporting(false);
    }
  };

  if (!hasPortfolios) {
    return (
      <div className="grid portfolio-v2-page">
        <section className="card portfolio-empty-card">
          <h2 className="screen-title">Portfolio</h2>
          <p className="muted" style={{ marginTop: 8 }}>
            Connect your portfolio to unlock personalized limits, dynamic risk control and tailored actions.
          </p>
          <div className="row" style={{ marginTop: 10, justifyContent: 'flex-start', gap: 8 }}>
            <button type="button">Import</button>
            <button type="button" onClick={handleCreatePortfolio}>Manual Entry</button>
          </div>
        </section>

        <section className="card">
          <h3 className="section-title">Preview of personalized insights</h3>
          <div className="grid" style={{ marginTop: 8, gap: 8 }}>
            <article className="portfolio-preview-item">
              <strong>Dynamic limits</strong>
              <div className="muted">Equity limit can be reduced automatically when volatility regime rises.</div>
            </article>
            <article className="portfolio-preview-item">
              <strong>Risk adaptation</strong>
              <div className="muted">Crisis mode tightens stops and highlights hedging ideas.</div>
            </article>
            <article className="portfolio-preview-item">
              <strong>Action plan</strong>
              <div className="muted">Prioritized recommendations with sizing, stop and confidence.</div>
            </article>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="grid portfolio-v2-page">
      {exportError ? <div className="card" style={{ borderColor: '#FF4757AA' }}>{exportError}</div> : null}

      <section className="card">
        <div className="section-header-inline">
          <h2 className="screen-title">Portfolio</h2>
        </div>
        <div className="row" style={{ justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          {portfolios.map((portfolio) => (
            <button
              key={portfolio.id}
              type="button"
              className={`ai-filter-chip ${portfolio.id === activePortfolioId ? 'is-active is-main' : ''}`}
              onClick={() => actions.setActivePortfolio(portfolio.id)}
            >
              {portfolio.name}
            </button>
          ))}
        </div>
        <div className="muted" style={{ marginTop: 8 }}>Active portfolio: {activePortfolioName}</div>
      </section>

      <section className="card">
        <h3 className="section-title">Snapshot</h3>
        <div className="ind-grid" style={{ marginTop: 8 }}>
          <div className="ind-cell">
            <div className="ind-label">Equity</div>
            <div className="ind-val mono">{formatUSD(snapshot.equity)}</div>
          </div>
          <div className="ind-cell">
            <div className="ind-label">Cash</div>
            <div className="ind-val mono">{formatUSD(snapshot.cash)}</div>
          </div>
          <div className="ind-cell">
            <div className="ind-label">P&L</div>
            <div className={`ind-val mono ${snapshot.pnl >= 0 ? 'up' : 'down'}`}>{formatUSD(snapshot.pnl)}</div>
          </div>
          <div className="ind-cell">
            <div className="ind-label">Performance</div>
            <div className={`ind-val mono ${snapshot.performance >= 0 ? 'up' : 'down'}`}>{formatPct(snapshot.performance)}</div>
          </div>
          <div className="ind-cell">
            <div className="ind-label">Drawdown</div>
            <div className="ind-val mono">{snapshot.drawdown.toFixed(2)}%</div>
          </div>
        </div>
        <div className="grid" style={{ marginTop: 8, gap: 6 }}>
          <div className="muted">Exposure by asset class</div>
          {exposureByClass.length ? (
            exposureByClass.map((row) => (
              <div key={row.assetClass} className="portfolio-limit-row">
                <span>{row.assetClass.toUpperCase()}</span>
                <strong>{row.pct.toFixed(1)}%</strong>
              </div>
            ))
          ) : (
            <div className="muted">No active exposure.</div>
          )}
        </div>
      </section>

      <section className="card">
        <h3 className="section-title">Risk & Limits</h3>
        <div className="grid" style={{ marginTop: 8, gap: 6 }}>
          {limits.classLimits.rows.map((row) => (
            <div key={row.assetClass} className="portfolio-limit-row">
              <span>{row.assetClass.toUpperCase()}</span>
              <span className="muted">Current {row.current.toFixed(1)}%</span>
              <strong>Allowed {row.adjusted}%</strong>
            </div>
          ))}
        </div>
        <div className="grid" style={{ marginTop: 10, gap: 6 }}>
          <strong>Ticker limits</strong>
          {!limits.tickerLimits.rows.length ? <div className="muted">No active ticker concentration.</div> : null}
          {limits.tickerLimits.rows.map((row) => (
            <div key={row.ticker} className="portfolio-limit-row">
              <span>{row.ticker}</span>
              <span className="muted">Current {row.pct.toFixed(1)}%</span>
              <strong>Allowed {row.adjusted}%</strong>
            </div>
          ))}
        </div>
        <div className="grid" style={{ marginTop: 10, gap: 6 }}>
          <strong>Regional limits</strong>
          {!limits.regionLimits.rows.length ? <div className="muted">No active regional concentration.</div> : null}
          {limits.regionLimits.rows.map((row) => (
            <div key={row.region} className="portfolio-limit-row">
              <span>{row.region}</span>
              <span className="muted">Current {row.current.toFixed(1)}%</span>
              <strong>Allowed {row.adjusted}%</strong>
            </div>
          ))}
        </div>
        <div className="grid" style={{ marginTop: 8, gap: 6 }}>
          {limits.explanations.length ? (
            limits.explanations.map((item, idx) => (
              <div key={`limit-explain-${idx}`} className="portfolio-limit-explain">
                {item}
              </div>
            ))
          ) : (
            <div className="muted">No dynamic adjustments right now.</div>
          )}
        </div>
      </section>

      <section className={`card ${crisisActive ? 'portfolio-crisis-card is-active' : 'portfolio-crisis-card'}`}>
        <div className="row">
          <h3 className="section-title">Crisis Mode</h3>
          {crisisActive ? <span className="badge">Crisis mode active</span> : null}
          <button type="button" onClick={() => setCrisisManual((prev) => !prev)}>
            {crisisManual ? 'Disable manual crisis mode' : 'Enable manual crisis mode'}
          </button>
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          {crisisActive
            ? `Why crisis mode is active: ${crisisManual ? 'manually activated by user' : `${regimeContext.regime} regime with ${regimeContext.volatility.toLowerCase()} volatility`}.`
            : 'Crisis mode inactive. Current regime does not require tighter controls.'}
        </div>
        <div className="grid" style={{ marginTop: 8, gap: 6 }}>
          <div className="portfolio-crisis-item">Tighten stops across high-beta positions.</div>
          <div className="portfolio-crisis-item">Reduce max exposure on equity and crypto buckets.</div>
          <div className="portfolio-crisis-item">Highlight hedging suggestions via defensive assets and FX strength.</div>
        </div>
      </section>

      <section className="card">
        <h3 className="section-title">Recommendations</h3>
        <div className="grid" style={{ marginTop: 8, gap: 8 }}>
          {!recommendations.length ? <div className="muted">No recommendations yet.</div> : null}
          {recommendations.slice(0, 10).map((rec) => (
            <article key={rec.id} className="portfolio-reco-card">
              <div className="row">
                <strong>{rec.symbol}</strong>
                <div className="row" style={{ gap: 6 }}>
                  <span className="badge">{rec.action}</span>
                  <span className="badge">{rec.confidence}</span>
                  <span className="badge">{rec.riskLevel} risk</span>
                </div>
              </div>
              <div className="muted">Sizing suggestion: {rec.sizing}</div>
              <div className="muted">Stop level: {rec.stop}</div>
              {rec.target ? <div className="muted">Target: {rec.target}</div> : null}
              <div className="muted">Horizon: {rec.horizon}</div>
              <div className="portfolio-reco-rationale">{rec.rationale}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="section-title">Activity / Journal</h3>
        <div className="grid" style={{ marginTop: 8, gap: 6 }}>
          {!journal.length ? <div className="muted">No activity yet.</div> : null}
          {journal.map((entry) => (
            <article key={entry.id} className="portfolio-journal-item">
              <div className="row">
                <strong>{entry.kind}</strong>
                <span className="muted">{entry.when}</span>
              </div>
              <div className="muted">{entry.text}</div>
              <div className="muted">Outcome: {entry.outcome}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="section-title">Post-mortem analysis</h3>
        <div className="ind-grid" style={{ marginTop: 8 }}>
          <div className="ind-cell">
            <div className="ind-label">Closed trades</div>
            <div className="ind-val mono">{postMortem.closedCount}</div>
          </div>
          <div className="ind-cell">
            <div className="ind-label">Win rate</div>
            <div className="ind-val mono">{formatPct(postMortem.winRate)}</div>
          </div>
          <div className="ind-cell">
            <div className="ind-label">Avg win</div>
            <div className="ind-val mono up">{formatPct(postMortem.avgWin)}</div>
          </div>
          <div className="ind-cell">
            <div className="ind-label">Avg loss</div>
            <div className="ind-val mono down">{formatPct(postMortem.avgLoss)}</div>
          </div>
        </div>
        <div className="grid" style={{ marginTop: 8, gap: 6 }}>
          {postMortem.lessons.map((item, idx) => (
            <div key={`lesson-${idx}`} className="portfolio-postmortem-item">
              {item}
            </div>
          ))}
        </div>
        <div className="grid" style={{ marginTop: 10, gap: 6 }}>
          <strong>Desempeño por régimen</strong>
          {postMortemByRegime.map((row) => (
            <div key={row.regime} className="portfolio-limit-row">
              <span>{row.regime}</span>
              <span className="muted">{row.count} trades</span>
              <span className="muted">Win rate {formatPct(row.winRate)}</span>
              <strong className={row.avg >= 0 ? 'up' : 'down'}>{formatPct(row.avg)}</strong>
            </div>
          ))}
        </div>
        <div className="grid" style={{ marginTop: 10, gap: 6 }}>
          <strong>Drill-down por activo</strong>
          {postMortemDrilldown.bySymbol.length ? (
            postMortemDrilldown.bySymbol.map((row) => (
              <div key={row.key} className="portfolio-limit-row">
                <span>{row.key}</span>
                <span className="muted">{row.count} trades</span>
                <span className="muted">Win rate {formatPct(row.winRate)}</span>
                <strong className={row.avg >= 0 ? 'up' : 'down'}>{formatPct(row.avg)}</strong>
              </div>
            ))
          ) : (
            <div className="muted">Sin operaciones cerradas por activo.</div>
          )}
        </div>
        <div className="grid" style={{ marginTop: 10, gap: 6 }}>
          <strong>Drill-down por tema</strong>
          {postMortemDrilldown.byTheme.length ? (
            postMortemDrilldown.byTheme.map((row) => (
              <div key={row.key} className="portfolio-limit-row">
                <span>{row.key}</span>
                <span className="muted">{row.count} trades</span>
                <span className="muted">Win rate {formatPct(row.winRate)}</span>
                <strong className={row.avg >= 0 ? 'up' : 'down'}>{formatPct(row.avg)}</strong>
              </div>
            ))
          ) : (
            <div className="muted">Sin operaciones cerradas por tema.</div>
          )}
        </div>
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button type="button" onClick={handleExportPostMortemCsv} disabled={postMortemExporting}>
            {postMortemExporting ? 'Exportando...' : 'Exportar post-mortem CSV'}
          </button>
        </div>
      </section>

      <section className="card portfolio-export-card">
        <label className="label" style={{ maxWidth: 280 }}>
          <span className="muted">Exportar</span>
          <select className="select-field" aria-label="Filtro exportación" value={exportFilter} onChange={(e) => setExportFilter(e.target.value)}>
            <option value="all">Todas las posiciones</option>
            <option value="active">Solo activas</option>
            <option value="sold">Solo cerradas</option>
          </select>
        </label>
        <button type="button" onClick={handleExportCsv} disabled={exporting}>
          {exporting ? 'Exportando...' : 'Exportar CSV'}
        </button>
      </section>
    </div>
  );
};

export default Portfolio;
