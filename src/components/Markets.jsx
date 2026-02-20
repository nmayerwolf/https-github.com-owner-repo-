import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api/apiClient';
import { useApp } from '../store/AppContext';
import { formatPct } from '../utils/format';

const TOP_TABS = ['overview', 'themes', 'calendar', 'news'];

const TAB_LABEL = {
  overview: 'Overview',
  themes: 'Themes',
  calendar: 'Calendar',
  news: 'News'
};

const scoreToConfidence = (score) => {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'Low';
  if (n >= 70) return 'High';
  if (n >= 52) return 'Medium';
  return 'Low';
};

const toUnixSeconds = (value) => {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed / 1000) : 0;
};

const shortAgo = (value) => {
  const ts = toUnixSeconds(value);
  if (!ts) return 'now';
  const diff = Math.max(1, Math.floor((Date.now() / 1000 - ts) / 60));
  if (diff < 60) return `${diff}m`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

const buildMarketRegime = (assets = [], digest = null) => {
  if (digest?.regime?.regime === 'risk_on') return 'Risk On';
  if (digest?.regime?.regime === 'risk_off') return 'Risk Off';

  const rows = assets.filter((a) => Number.isFinite(Number(a.changePercent)));
  const advancers = rows.filter((a) => Number(a.changePercent) > 0).length;
  const breadth = rows.length ? (advancers / rows.length) * 100 : 50;
  const avg = rows.length ? rows.reduce((acc, row) => acc + Number(row.changePercent || 0), 0) / rows.length : 0;
  if (breadth >= 56 && avg > 0.2) return 'Risk On';
  if (breadth <= 44 && avg < -0.2) return 'Risk Off';
  return 'Mixed';
};

const buildVolatility = (assets = [], digest = null) => {
  if (digest?.regime?.volatilityRegime === 'crisis') return 'High';
  if (digest?.regime?.volatilityRegime === 'elevated') return 'Elevated';
  const rows = assets.filter((a) => Number.isFinite(Number(a.changePercent)));
  const avgAbs = rows.length ? rows.reduce((acc, row) => acc + Math.abs(Number(row.changePercent || 0)), 0) / rows.length : 0;
  if (avgAbs > 2.2) return 'High';
  if (avgAbs > 1.2) return 'Elevated';
  return 'Contained';
};

const buildLiquidity = (assets = []) => {
  const fx = assets.filter((a) => String(a.category || '').toLowerCase() === 'fx');
  const avgFx = fx.length ? fx.reduce((acc, row) => acc + Number(row.changePercent || 0), 0) / fx.length : 0;
  if (avgFx > 0.25) return 'Tightening';
  if (avgFx < -0.25) return 'Improving';
  return 'Stable';
};

const buildBreadth = (assets = []) => {
  const rows = assets.filter((a) => Number.isFinite(Number(a.changePercent)));
  if (!rows.length) return 'N/A';
  const advancers = rows.filter((a) => Number(a.changePercent || 0) > 0).length;
  const pct = Math.round((advancers / rows.length) * 100);
  return `${pct}% Advancers`;
};

const buildCreditDirection = (assets = []) => {
  const credit = assets.filter((a) => ['bond'].includes(String(a.category || '').toLowerCase()));
  const avg = credit.length ? credit.reduce((acc, row) => acc + Number(row.changePercent || 0), 0) / credit.length : 0;
  if (avg > 0.12) return 'Compressing';
  if (avg < -0.12) return 'Widening';
  return 'Flat';
};

const buildMiniCards = (assets = []) => {
  const groups = [
    { key: 'rates', label: 'Rates', matcher: (a) => String(a.category || '').toLowerCase() === 'bond' || String(a.symbol || '').startsWith('US') },
    { key: 'equities', label: 'Equities', matcher: (a) => String(a.category || '').toLowerCase() === 'equity' },
    { key: 'credit', label: 'Credit', matcher: (a) => String(a.category || '').toLowerCase() === 'bond' },
    { key: 'fx', label: 'FX', matcher: (a) => String(a.category || '').toLowerCase() === 'fx' },
    { key: 'commodities', label: 'Commodities', matcher: (a) => ['commodity', 'metal'].includes(String(a.category || '').toLowerCase()) },
    { key: 'crypto', label: 'Crypto', matcher: (a) => String(a.category || '').toLowerCase() === 'crypto' }
  ];

  return groups.map((group) => {
    const rows = assets.filter(group.matcher).filter((a) => Number.isFinite(Number(a.changePercent)));
    const avg = rows.length ? rows.reduce((acc, row) => acc + Number(row.changePercent || 0), 0) / rows.length : 0;
    return {
      ...group,
      avg,
      tone: avg > 0.2 ? 'up' : avg < -0.2 ? 'down' : 'flat'
    };
  });
};

const Markets = () => {
  const { state } = useApp();
  const [tab, setTab] = useState('overview');
  const [digest, setDigest] = useState(null);
  const [macroInsight, setMacroInsight] = useState(null);
  const [newsItems, setNewsItems] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState('');
  const [search, setSearch] = useState('');
  const [themeFilter, setThemeFilter] = useState('all');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [digestOut, insightOut] = await Promise.all([
          typeof api.getNewsDigestToday === 'function' ? api.getNewsDigestToday().catch(() => null) : Promise.resolve(null),
          typeof api.getMacroInsight === 'function' ? api.getMacroInsight().catch(() => null) : Promise.resolve(null)
        ]);
        if (!active) return;
        setDigest(digestOut || null);
        setMacroInsight(insightOut?.insight || null);
      } catch {
        if (!active) return;
        setDigest(null);
        setMacroInsight(null);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadNews = async () => {
      setNewsLoading(true);
      setNewsError('');
      try {
        const out = await api.marketNewsRecommended({
          symbols: (state.watchlistSymbols || []).slice(0, 8),
          category: 'general',
          minScore: 7,
          limit: 45,
          maxAgeHours: 72,
          strictImpact: false
        });
        if (!active) return;
        setNewsItems(Array.isArray(out?.items) ? out.items : []);
      } catch {
        if (!active) return;
        setNewsItems([]);
        setNewsError('No se pudieron cargar noticias de mercado.');
      } finally {
        if (active) setNewsLoading(false);
      }
    };
    loadNews();
    return () => {
      active = false;
    };
  }, [state.watchlistSymbols]);

  const overview = useMemo(() => {
    const regime = buildMarketRegime(state.assets || [], digest);
    return {
      regime,
      volatility: buildVolatility(state.assets || [], digest),
      liquidity: buildLiquidity(state.assets || []),
      breadth: buildBreadth(state.assets || []),
      credit: buildCreditDirection(state.assets || []),
      miniCards: buildMiniCards(state.assets || [])
    };
  }, [state.assets, digest]);

  const themes = useMemo(() => {
    const grouped = new Map();
    for (const item of newsItems || []) {
      const theme = String(item?.aiTheme || 'global').toLowerCase();
      const current = grouped.get(theme) || { theme, score: 0, count: 0, reasons: [], related: new Set(), symbols: new Set() };
      current.score += Number(item?.aiScore || 0);
      current.count += 1;
      for (const reason of (item?.aiReasons || []).slice(0, 2)) {
        if (reason) current.reasons.push(reason);
      }
      if (item?.related) current.related.add(String(item.related));
      if (item?.symbol) current.symbols.add(String(item.symbol).toUpperCase());
      grouped.set(theme, current);
    }

    const assetsBySymbol = Object.fromEntries((state.assets || []).map((a) => [String(a.symbol || '').toUpperCase(), a]));

    return [...grouped.values()]
      .map((row) => {
        const normalizedScore = row.count ? Math.max(0, Math.min(100, (row.score / row.count) * 5)) : 0;
        const impactedSymbols = [...row.symbols].slice(0, 4);
        const impactedChange = impactedSymbols.length
          ? impactedSymbols.reduce((acc, symbol) => acc + Number(assetsBySymbol[symbol]?.changePercent || 0), 0) / impactedSymbols.length
          : 0;
        const direction = impactedChange >= 0 ? 'Bullish' : 'Bearish';
        const confidence = scoreToConfidence(normalizedScore);
        const drivers = [...new Set(row.reasons)].slice(0, 3);
        const affectedAssets = impactedSymbols.length ? impactedSymbols : [...row.related].slice(0, 4);
        const suggestedStance =
          direction === 'Bullish'
            ? confidence === 'High'
              ? 'Lean long on leaders, keep invalidation tight.'
              : 'Add exposure gradually; avoid crowded entries.'
            : confidence === 'High'
              ? 'Reduce beta and prioritize capital protection.'
              : 'Stay selective and hedge directional risk.';
        return {
          key: row.theme,
          label: row.theme.charAt(0).toUpperCase() + row.theme.slice(1),
          score: normalizedScore,
          direction,
          confidence,
          drivers: drivers.length ? drivers : ['No dominant macro driver identified yet.'],
          assets: affectedAssets.length ? affectedAssets : ['Global Macro'],
          stance: suggestedStance
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [newsItems, state.assets]);

  const calendarEvents = useMemo(() => {
    const fromInsight = Array.isArray(macroInsight?.keyEvents)
      ? macroInsight.keyEvents.map((event, idx) => ({
          id: `macro-${idx}-${event?.event || 'event'}`,
          title: String(event?.event || 'Macro event'),
          when: String(event?.date || 'TBD'),
          impact: String(event?.potential_impact || 'Medium expected impact'),
          watch: 'Watch market reaction in rates, USD and equity breadth.'
        }))
      : [];

    const fromNews = (newsItems || [])
      .filter((item) => /earnings|results|guidance|cpi|inflation|fomc|nfp|jobs/i.test(String(item?.headline || '')))
      .slice(0, 6)
      .map((item, idx) => ({
        id: `news-${idx}-${item?.id || idx}`,
        title: String(item?.headline || 'Earnings highlight'),
        when: item?.datetime ? new Date(toUnixSeconds(item.datetime) * 1000).toLocaleDateString('en-US') : 'Recent',
        impact: `${Number(item?.aiScore || 0) >= 14 ? 'High' : 'Medium'} expected impact`,
        watch: item?.aiReasons?.[0] || 'Watch forward guidance and cross-asset spillover.'
      }));

    return [...fromInsight, ...fromNews].slice(0, 10);
  }, [macroInsight, newsItems]);

  const newsThemeOptions = useMemo(() => {
    const set = new Set(['all']);
    for (const item of newsItems || []) {
      const theme = String(item?.aiTheme || '').toLowerCase().trim();
      if (theme) set.add(theme);
    }
    return [...set];
  }, [newsItems]);

  const filteredNews = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    return (newsItems || [])
      .filter((item) => {
        if (themeFilter !== 'all' && String(item?.aiTheme || '').toLowerCase() !== themeFilter) return false;
        if (!q) return true;
        const haystack = [item?.headline, item?.summary, item?.related, ...(item?.aiReasons || [])]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 30);
  }, [newsItems, search, themeFilter]);

  return (
    <div className="grid markets-v2-page">
      <section className="card">
        <div className="section-header-inline">
          <h2 className="screen-title">Markets</h2>
        </div>
        <div className="markets-v2-tabs">
          {TOP_TABS.map((item) => (
            <button
              key={item}
              type="button"
              className={`markets-v2-tab ${tab === item ? 'is-active' : ''}`}
              onClick={() => setTab(item)}
            >
              {TAB_LABEL[item]}
            </button>
          ))}
        </div>
      </section>

      {tab === 'overview' ? (
        <>
          <section className="card markets-v2-overview-grid">
            <article className="markets-v2-kpi">
              <div className="muted">Market Regime</div>
              <strong>{overview.regime}</strong>
            </article>
            <article className="markets-v2-kpi">
              <div className="muted">Volatility</div>
              <strong>{overview.volatility}</strong>
            </article>
            <article className="markets-v2-kpi">
              <div className="muted">Liquidity</div>
              <strong>{overview.liquidity}</strong>
            </article>
            <article className="markets-v2-kpi">
              <div className="muted">Breadth</div>
              <strong>{overview.breadth}</strong>
            </article>
            <article className="markets-v2-kpi">
              <div className="muted">Credit Spread Direction</div>
              <strong>{overview.credit}</strong>
            </article>
          </section>

          <section className="card">
            <h3 className="section-title">Cross-Asset Overview</h3>
            <div className="markets-v2-mini-grid">
              {overview.miniCards.map((card) => (
                <article key={card.key} className={`markets-v2-mini-card ${card.tone}`}>
                  <div className="muted">{card.label}</div>
                  <strong>{formatPct(card.avg || 0)}</strong>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {tab === 'themes' ? (
        <section className="grid">
          {!themes.length ? <article className="card muted">No themes available yet.</article> : null}
          {themes.map((theme) => (
            <article key={theme.key} className="card markets-v2-theme-card">
              <div className="row">
                <strong>{theme.label}</strong>
                <div className="row" style={{ gap: 6 }}>
                  <span className="badge">Score {Math.round(theme.score)}</span>
                  <span className={`badge ${theme.direction === 'Bullish' ? 'up' : 'down'}`}>{theme.direction}</span>
                  <span className="badge">{theme.confidence}</span>
                </div>
              </div>
              <div className="muted" style={{ marginTop: 8 }}>Drivers</div>
              <ul className="markets-v2-list">
                {theme.drivers.slice(0, 3).map((driver, idx) => (
                  <li key={`${theme.key}-driver-${idx}`}>{driver}</li>
                ))}
              </ul>
              <div className="muted">Assets impacted: {theme.assets.join(', ')}</div>
              <div className="markets-v2-stance">
                <strong>What to do:</strong> {theme.stance}
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === 'calendar' ? (
        <section className="grid">
          {!calendarEvents.length ? <article className="card muted">No macro or earnings events detected yet.</article> : null}
          {calendarEvents.map((event) => (
            <article key={event.id} className="card markets-v2-calendar-card">
              <div className="row">
                <strong>{event.title}</strong>
                <span className="muted">{event.when}</span>
              </div>
              <div className="muted" style={{ marginTop: 8 }}>
                Expected impact: {event.impact}
              </div>
              <div className="markets-v2-watch">
                <strong>What to watch:</strong> {event.watch}
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {tab === 'news' ? (
        <section className="card">
          <div className="markets-v2-news-tools">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search market news..."
              aria-label="Search market news"
            />
            <select value={themeFilter} onChange={(e) => setThemeFilter(e.target.value)} className="select-field" aria-label="Filter by theme">
              {newsThemeOptions.map((theme) => (
                <option key={theme} value={theme}>
                  {theme === 'all' ? 'All themes' : theme}
                </option>
              ))}
            </select>
          </div>

          {newsLoading ? <div className="muted" style={{ marginTop: 8 }}>Loading market news...</div> : null}
          {newsError ? <div className="card" style={{ marginTop: 8, borderColor: '#FF4757AA' }}>{newsError}</div> : null}

          <div className="grid" style={{ marginTop: 8 }}>
            {!newsLoading && !filteredNews.length ? <div className="muted">No news for this filter.</div> : null}
            {filteredNews.map((item) => (
              <article key={item.id || item.url} className="markets-v2-news-item">
                <div className="row">
                  <strong>{item.headline || 'Market update'}</strong>
                  <span className="muted">{shortAgo(item.datetime)}</span>
                </div>
                <div className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
                  <span className="badge">Theme: {item.aiTheme || 'global'}</span>
                  <span className="badge">Impact Score: {Number(item.aiScore || 0)}</span>
                </div>
                <div className="muted">
                  AI summary: {item.aiReasons?.[0] || item.summary || 'Potential market-moving narrative with cross-asset implications.'}
                </div>
                <div className="muted">Why it matters: {item.aiReasons?.[1] || item.related || 'Monitor reaction in risk assets and rates.'}</div>
                {item.url ? (
                  <button type="button" onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}>
                    Open Source
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default Markets;
