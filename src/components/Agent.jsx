import React, { useMemo, useState } from 'react';
import { askClaude } from '../api/claude';
import { api } from '../api/apiClient';
import { useApp } from '../store/AppContext';
import { useLanguage } from '../store/LanguageContext';
import { formatPct } from '../utils/format';

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());

const pickRelevantNewsSources = (items = [], query = '') => {
  const q = String(query || '').toLowerCase().trim();
  const words = q.split(/\s+/).filter(Boolean);
  const scoreItem = (item) => {
    const text = [item?.headline, item?.summary, ...(item?.aiReasons || []), item?.aiTheme].filter(Boolean).join(' ').toLowerCase();
    if (!q) return Number(item?.aiScore || 0);
    const hits = words.reduce((acc, w) => (text.includes(w) ? acc + 1 : acc), 0);
    return hits * 10 + Number(item?.aiScore || 0);
  };
  return (items || [])
    .filter((item) => isHttpUrl(item?.url))
    .slice()
    .sort((a, b) => scoreItem(b) - scoreItem(a))
    .slice(0, 3)
    .map((item) => ({
      label: item?.source || item?.headline || item?.url,
      url: item.url
    }));
};

const parseJsonLike = (text = '') => {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // noop
  }
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // noop
    }
  }
  const firstObj = raw.match(/\{[\s\S]*\}/);
  if (firstObj?.[0]) {
    try {
      return JSON.parse(firstObj[0]);
    } catch {
      // noop
    }
  }
  return null;
};

const normalizeAgentResponse = (text = '', fallbackSources = [], isSpanish = false) => {
  const parsed = parseJsonLike(text);
  const summary = Array.isArray(parsed?.summary)
    ? parsed.summary.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 3)
    : [];
  const actions = Array.isArray(parsed?.actions)
    ? parsed.actions.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 5)
    : [];
  const assumptions = Array.isArray(parsed?.assumptions)
    ? parsed.assumptions.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 4)
    : [];
  const confidenceScore = toNum(parsed?.confidence?.score, null);
  const confidenceLabelRaw = String(parsed?.confidence?.label || '').toLowerCase();
  const confidenceLabel =
    confidenceLabelRaw === 'high'
      ? isSpanish ? 'Alta' : 'High'
      : confidenceLabelRaw === 'low'
        ? isSpanish ? 'Baja' : 'Low'
        : confidenceScore != null
          ? confidenceScore >= 0.75
            ? isSpanish ? 'Alta' : 'High'
            : confidenceScore >= 0.55
              ? isSpanish ? 'Media' : 'Medium'
              : isSpanish ? 'Baja' : 'Low'
          : isSpanish ? 'Media' : 'Medium';

  const sourcesFromModel = Array.isArray(parsed?.sources)
    ? parsed.sources
        .map((row) => ({
          label: String(row?.label || row?.title || row?.url || '').trim(),
          url: String(row?.url || '').trim()
        }))
        .filter((row) => row.label && isHttpUrl(row.url))
        .slice(0, 3)
    : [];

  return {
    rawText: String(text || '').trim(),
    summary: summary.length ? summary : [isSpanish ? 'El modelo no devolvió un resumen estructurado.' : 'No structured summary returned by model.'],
    actions: actions.length
      ? actions
      : [isSpanish ? 'Mantener riesgo controlado y esperar setup de mayor convicción.' : 'Keep risk controlled and wait for higher-conviction setup.'],
    assumptions: assumptions.length
      ? assumptions
      : [isSpanish ? 'El contexto puede cambiar intradiario; validar con datos en vivo.' : 'Market context may change intraday; validate against live data.'],
    confidence: {
      label: confidenceLabel,
      score: confidenceScore
    },
    sources: sourcesFromModel.length ? sourcesFromModel : fallbackSources
  };
};

const Agent = () => {
  const { state } = useApp();
  const { isSpanish } = useLanguage();
  const PROMPT_CHIPS = isSpanish
    ? ['¿Qué cambió hoy?', 'Evaluación de riesgo', 'Oportunidades en acciones', 'Sugerencias de cobertura']
    : ['What changed today?', 'Risk assessment', 'Opportunities in equities', 'Hedge suggestions'];
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [newsPool, setNewsPool] = useState([]);

  const portfolioContext = useMemo(() => {
    const positions = Array.isArray(state.positions) ? state.positions : [];
    const active = positions.filter((position) => !position.sellDate);
    const assetsBySymbol = Object.fromEntries((state.assets || []).map((asset) => [String(asset.symbol || '').toUpperCase(), asset]));
    const exposure = active.reduce((acc, position) => {
      const symbol = String(position.symbol || '').toUpperCase();
      const asset = assetsBySymbol[symbol];
      const category = String(position.category || asset?.category || 'equity').toLowerCase();
      const price = toNum(asset?.price, toNum(position.buyPrice, 0));
      const value = price * toNum(position.quantity, 0);
      acc.total += value;
      acc.byClass[category] = (acc.byClass[category] || 0) + value;
      return acc;
    }, { total: 0, byClass: {} });

    const byClassPct = Object.entries(exposure.byClass)
      .map(([k, value]) => ({ assetClass: k, pct: exposure.total > 0 ? (value / exposure.total) * 100 : 0 }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);

    return {
      hasPortfolio: active.length > 0,
      activePositions: active.length,
      topExposure: byClassPct
    };
  }, [state.positions, state.assets]);

  const marketContext = useMemo(() => {
    const assets = (state.assets || []).filter((asset) => Number.isFinite(Number(asset.changePercent)));
    const advancers = assets.filter((asset) => Number(asset.changePercent) > 0).length;
    const breadthPct = assets.length ? (advancers / assets.length) * 100 : 50;
    const avgMove = assets.length ? assets.reduce((acc, asset) => acc + Number(asset.changePercent || 0), 0) / assets.length : 0;
    const regime = breadthPct >= 56 && avgMove > 0.2 ? 'Risk On' : breadthPct <= 44 && avgMove < -0.2 ? 'Risk Off' : 'Mixed';
    return { breadthPct, avgMove, regime };
  }, [state.assets]);
  const performanceLearning = useMemo(() => {
    const closed = (state.positions || [])
      .filter((position) => !!position.sellDate)
      .map((position) => {
        const buyPrice = toNum(position.buyPrice, 0);
        const sellPrice = toNum(position.sellPrice, buyPrice);
        const qty = toNum(position.quantity, 0);
        const cost = buyPrice * qty;
        const pnl = (sellPrice - buyPrice) * qty;
        return {
          symbol: String(position.symbol || '').toUpperCase(),
          category: String(position.category || 'equity').toLowerCase(),
          pnlPct: cost > 0 ? (pnl / cost) * 100 : 0
        };
      })
      .filter((row) => Number.isFinite(row.pnlPct));

    const wins = closed.filter((row) => row.pnlPct >= 0);
    const losses = closed.filter((row) => row.pnlPct < 0);
    const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
    const avgWin = wins.length ? wins.reduce((acc, row) => acc + row.pnlPct, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((acc, row) => acc + row.pnlPct, 0) / losses.length : 0;

    const byCategory = closed.reduce((acc, row) => {
      acc[row.category] = acc[row.category] || { count: 0, total: 0 };
      acc[row.category].count += 1;
      acc[row.category].total += row.pnlPct;
      return acc;
    }, {});
    const bestTheme = Object.entries(byCategory)
      .map(([category, info]) => ({ category, avg: info.count ? info.total / info.count : 0, count: info.count }))
      .sort((a, b) => b.avg - a.avg)[0];

    const lessons = [];
    if (!closed.length) lessons.push('No closed trades yet to extract robust patterns.');
    if (winRate < 45 && closed.length >= 4) lessons.push('Execution quality weak: reduce sizing and wait for higher confidence setups.');
    if (avgLoss < -4) lessons.push('Average loss too wide: tighten invalidation and stop placement.');
    if (avgWin > Math.abs(avgLoss) && wins.length >= 2) lessons.push('Payoff ratio healthy: prioritize strict discipline on entries.');
    if (bestTheme?.count >= 2) lessons.push(`Best recent theme: ${bestTheme.category.toUpperCase()} (${formatPct(bestTheme.avg)} avg).`);

    return {
      closedCount: closed.length,
      winRate,
      avgWin,
      avgLoss,
      lessons: lessons.slice(0, 4)
    };
  }, [state.positions]);

  const sendAgentQuery = async (raw) => {
    const text = String(raw || '').trim();
    if (!text || loading) return;

    const userMessage = { id: `u-${Date.now()}`, role: 'user', text };
    setMessages((prev) => [...prev, userMessage]);
    setQuery('');
    setLoading(true);

    try {
      let currentNewsPool = newsPool;
      if (!currentNewsPool.length && typeof api.marketNewsRecommended === 'function') {
        const out = await api.marketNewsRecommended({
          symbols: (state.watchlistSymbols || []).slice(0, 8),
          category: 'general',
          minScore: 8,
          limit: 24,
          maxAgeHours: 72,
          strictImpact: false
        });
        currentNewsPool = Array.isArray(out?.items) ? out.items : [];
        setNewsPool(currentNewsPool);
      }

      const fallbackSources = pickRelevantNewsSources(currentNewsPool, text);
      const historyBlock = messages
        .slice(-8)
        .map((item) => `${item.role === 'user' ? 'User' : 'Assistant'}: ${item.text}`)
        .join('\n');
      const prompt = [
        `User question: ${text}`,
        '',
        'Conversation context:',
        historyBlock || 'No previous messages.',
        '',
        'Market context:',
        `- Regime: ${marketContext.regime}`,
        `- Breadth: ${marketContext.breadthPct.toFixed(1)}%`,
        `- Average move: ${formatPct(marketContext.avgMove)}`,
        '',
        'Portfolio context:',
        portfolioContext.hasPortfolio
          ? `- Active positions: ${portfolioContext.activePositions}\n- Top exposure: ${portfolioContext.topExposure
              .map((row) => `${row.assetClass} ${row.pct.toFixed(1)}%`)
              .join(', ')}`
          : '- No active portfolio positions.',
        '',
        'Performance learning context (post-mortem):',
        `- Closed trades: ${performanceLearning.closedCount}`,
        `- Win rate: ${formatPct(performanceLearning.winRate)}`,
        `- Avg win: ${formatPct(performanceLearning.avgWin)}`,
        `- Avg loss: ${formatPct(performanceLearning.avgLoss)}`,
        `- Lessons: ${performanceLearning.lessons.join(' | ') || 'No stable lessons yet.'}`,
        '',
        'Respond in valid JSON only with this exact format:',
        '{',
        '  "summary": ["3 bullets max"],',
        '  "actions": ["5 actions max"],',
        '  "assumptions": ["key assumptions"],',
        '  "confidence": {"label":"high|medium|low","score":0.0},',
        '  "sources": [{"label":"source name","url":"https://..."}]',
        '}'
      ].join('\n');

      const out = await askClaude(prompt, 'You are a strategic market decision partner. Be concise and practical.');
      const normalized = normalizeAgentResponse(out?.text || '', fallbackSources, isSpanish);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: normalized.rawText,
          structured: normalized
        }
      ]);
    } catch {
      const fallbackSources = pickRelevantNewsSources(newsPool, text);
      const fallback = normalizeAgentResponse('', fallbackSources, isSpanish);
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: '',
          structured: fallback
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid agent-v2-page">
      <section className="card">
        <h2 className="screen-title">{isSpanish ? 'Agente' : 'Agent'}</h2>
        <div className="muted">{isSpanish ? 'Asistente de decisión con contexto de mercado y portafolio.' : 'AI decision partner with market + portfolio context.'}</div>
        <div className="row" style={{ marginTop: 8, justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge">{isSpanish ? 'Régimen' : 'Regime'}: {marketContext.regime}</span>
          <span className="badge">{isSpanish ? 'Tasa de acierto' : 'Win rate'}: {formatPct(performanceLearning.winRate)}</span>
          <span className="badge">{isSpanish ? 'Trades cerrados' : 'Closed trades'}: {performanceLearning.closedCount}</span>
        </div>
        <div className="row" style={{ marginTop: 8, justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          {PROMPT_CHIPS.map((chip) => (
            <button key={chip} type="button" className="ai-agent-suggestion-btn" onClick={() => sendAgentQuery(chip)}>
              {chip}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="agent-v2-chat">
          {!messages.length ? <div className="muted">{isSpanish ? 'Hacé una pregunta para iniciar la conversación.' : 'Ask the agent to start the conversation.'}</div> : null}
          {messages.map((message) => (
            <article key={message.id} className={`agent-v2-msg ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}>
              {message.role === 'user' ? (
                <div>{message.text}</div>
              ) : (
                <div className="grid" style={{ gap: 8 }}>
                  <div>
                    <strong>{isSpanish ? 'Resumen' : 'Summary'}</strong>
                    <ul className="agent-v2-list">
                      {(message.structured?.summary || []).map((item, idx) => (
                        <li key={`${message.id}-s-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>{isSpanish ? 'Acciones' : 'Actions'}</strong>
                    <ul className="agent-v2-list">
                      {(message.structured?.actions || []).map((item, idx) => (
                        <li key={`${message.id}-a-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>{isSpanish ? 'Supuestos' : 'Assumptions'}</strong>
                    <ul className="agent-v2-list">
                      {(message.structured?.assumptions || []).map((item, idx) => (
                        <li key={`${message.id}-as-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
                    <span className="badge">
                      {isSpanish ? 'Convicción' : 'Confidence'}: {message.structured?.confidence?.label || (isSpanish ? 'Media' : 'Medium')}
                      {Number.isFinite(message.structured?.confidence?.score)
                        ? ` (${(Number(message.structured.confidence.score) * 100).toFixed(0)}%)`
                        : ''}
                    </span>
                  </div>
                  {(message.structured?.sources || []).length ? (
                    <div>
                      <strong>{isSpanish ? 'Fuentes' : 'Sources'}</strong>
                      <div className="grid" style={{ marginTop: 6, gap: 4 }}>
                        {message.structured.sources.map((source, idx) => (
                          <a key={`${message.id}-src-${idx}`} href={source.url} target="_blank" rel="noopener noreferrer" className="inline-link-btn">
                            {source.label}
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </article>
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendAgentQuery(query);
            }}
            placeholder={isSpanish ? 'Preguntale al agente...' : 'Ask the agent...'}
            aria-label={isSpanish ? 'Preguntale al agente' : 'Ask the agent'}
          />
          <button type="button" onClick={() => sendAgentQuery(query)} disabled={loading}>
            {loading ? (isSpanish ? 'Pensando...' : 'Thinking...') : isSpanish ? 'Enviar' : 'Send'}
          </button>
        </div>
      </section>
    </div>
  );
};

export default Agent;
