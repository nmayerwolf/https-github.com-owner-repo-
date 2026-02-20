const { env } = require('../config/env');

const toNum = (value, fallback = 0) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
};

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const selectCandidates = async (regimeState = {}, metrics = [], bars = []) => {
  const candidates = { strategic: [], opportunistic: [], risk: [] };
  const barsBySymbol = new Map((Array.isArray(bars) ? bars : []).map((row) => [String(row.symbol || '').toUpperCase(), row]));
  const regime = String(regimeState.regime || '').toLowerCase();

  for (const m of Array.isArray(metrics) ? metrics : []) {
    const symbol = String(m.symbol || '').toUpperCase();
    const bar = barsBySymbol.get(symbol);
    if (!bar) continue;

    const close = toNum(bar.close, null);
    if (!Number.isFinite(close)) continue;

    const changePct = toNum(bar.change_pct, 0);
    const rsi = toNum(m.rsi_14, 50);
    const relStrength = toNum(m.relative_strength, 0);
    const vol = toNum(m.volatility_20d, toNum(m.vol_20d, 0));
    const sma50 = toNum(m.sma_50, toNum(m.ma50, 0));
    const sma200 = toNum(m.sma_200, 0);
    const aboveSma50 = close > sma50;
    const aboveSma200 = close > sma200;

    if (regime === 'risk_on') {
      if (aboveSma50 && aboveSma200 && relStrength > 0.02 && rsi > 40 && rsi < 75) {
        candidates.strategic.push({ symbol, score: relStrength * 100, reason: 'trend_aligned' });
      }
    } else if (regime === 'risk_off') {
      if (vol < 0.2 && aboveSma200) {
        candidates.strategic.push({ symbol, score: (0.25 - vol) * 100, reason: 'defensive_quality' });
      }
    }

    if (rsi < 30 && aboveSma200) {
      candidates.opportunistic.push({ symbol, score: 30 - rsi, reason: 'oversold_bounce', type: 'mean_reversion' });
    }
    if (rsi > 70 && !aboveSma50) {
      candidates.opportunistic.push({ symbol, score: rsi - 70, reason: 'overbought_reversal', type: 'momentum_fade' });
    }

    if (vol > 0.35) {
      candidates.risk.push({ symbol, severity: 'high', reason: 'extreme_volatility', vol });
    }
    if (changePct < -5) {
      candidates.risk.push({ symbol, severity: 'high', reason: 'sharp_decline', changePct });
    }
  }

  candidates.strategic.sort((a, b) => b.score - a.score);
  candidates.opportunistic.sort((a, b) => b.score - a.score);

  return {
    strategic: candidates.strategic.slice(0, 6),
    opportunistic: candidates.opportunistic.slice(0, 5),
    risk: candidates.risk.slice(0, 6)
  };
};

const extractJsonArray = (input) => {
  const raw = String(input || '').trim().replace(/```json|```/g, '');
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start < 0 || end <= start) return [];
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
};

const fallbackIdeasFromCandidates = (candidates = {}) => {
  const strategic = (candidates.strategic || []).slice(0, 4).map((c) => ({
    category: 'strategic',
    symbol: c.symbol,
    action: 'WATCH',
    confidence: clamp01(0.55 + Math.min(0.3, toNum(c.score, 0) / 300)),
    timeframe: 'months',
    invalidation: 'Close below 50-day SMA.',
    rationale: ['Trend aligned with current regime', `Candidate score ${toNum(c.score, 0).toFixed(2)}`],
    risks: ['Momentum reversal'],
    tags: ['trend', 'regime_aligned'],
    opportunistic_type: null
  }));

  const opportunistic = (candidates.opportunistic || []).slice(0, 3).map((c) => ({
    category: 'opportunistic',
    symbol: c.symbol,
    action: 'WATCH',
    confidence: clamp01(0.5 + Math.min(0.25, toNum(c.score, 0) / 200)),
    timeframe: 'weeks',
    invalidation: 'No momentum recovery in 5 sessions.',
    rationale: ['Setup identified by RSI extremes', `Candidate score ${toNum(c.score, 0).toFixed(2)}`],
    risks: ['False reversal'],
    tags: ['mean_reversion'],
    opportunistic_type: c.type || null
  }));

  const risk = (candidates.risk || []).slice(0, 4).map((c) => ({
    category: 'risk',
    severity: c.severity || 'medium',
    title: `${c.symbol || 'Market'} risk`,
    bullets: [String(c.reason || 'Market risk condition'), 'Monitor volatility and downside follow-through'],
    tags: ['risk']
  }));

  return [...strategic, ...opportunistic, ...risk];
};

const buildIdeasPrompt = (candidates, regimeState) => `You are a professional market analyst for Horsai, a macro-first investment companion.

Current market regime: ${regimeState.regime} (${regimeState.volatility_regime})
Leadership: ${(regimeState.leadership || []).join(', ')}
Risk flags: ${(regimeState.risk_flags || []).join(', ') || 'None'}
Confidence: ${regimeState.confidence}

Based on the pre-selected candidates below, generate structured investment ideas.

STRATEGIC CANDIDATES (pick 2-4 best, regime-aligned):
${JSON.stringify(candidates.strategic, null, 2)}

OPPORTUNISTIC CANDIDATES (pick 1-3 best, clearly labeled):
${JSON.stringify(candidates.opportunistic, null, 2)}

RISK ALERTS (pick 2-4 most relevant):
${JSON.stringify(candidates.risk, null, 2)}

RULES:
- Never include price targets or timing instructions
- Never guarantee outcomes
- Never suggest leverage
- Be factual, direct, professional
- Rationale must be data-driven (reference RSI, trend, volatility)
- Each invalidation must be specific and measurable
- Return ONLY a JSON array of ideas, nothing else`;

const generateIdeas = async (candidates, regimeState, options = {}) => {
  const fetchImpl = options.fetchImpl || fetch;
  const apiKey = options.apiKey ?? env.anthropicApiKey;
  const model = options.model ?? env.aiNarrativeModel ?? 'claude-haiku-4-5-20251001';
  const timeoutMs = Math.max(2000, Number(options.timeoutMs ?? env.aiNarrativeTimeoutMs ?? 9000));
  const prompt = buildIdeasPrompt(candidates, regimeState || {});

  if (!apiKey) {
    return { ideas: fallbackIdeasFromCandidates(candidates), usage: null, model, mode: 'fallback' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    });

    if (!res.ok) throw new Error(`ANTHROPIC_HTTP_${res.status}`);
    const payload = await res.json();
    const text = Array.isArray(payload?.content) ? payload.content.map((x) => x?.text || '').join('\n') : '';
    const ideas = extractJsonArray(text);
    if (!ideas.length) {
      return { ideas: fallbackIdeasFromCandidates(candidates), usage: payload?.usage || null, model, mode: 'fallback_parse' };
    }
    return {
      ideas,
      usage: payload?.usage || null,
      model,
      mode: 'ai',
      durationMs: Date.now() - startedAt
    };
  } catch {
    return { ideas: fallbackIdeasFromCandidates(candidates), usage: null, model, mode: 'fallback_error', durationMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
};

module.exports = {
  selectCandidates,
  generateIdeas,
  fallbackIdeasFromCandidates
};
