const { env } = require('../config/env');

const safeList = (value) => (Array.isArray(value) ? value : []);

const normalizeNotes = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 4);
};

const parseNotes = (text = '') => {
  const clean = String(text || '').replace(/```json|```/g, '').trim();
  if (!clean) return [];
  try {
    return normalizeNotes(JSON.parse(clean));
  } catch {
    const lines = clean
      .split('\n')
      .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
      .filter(Boolean);
    return normalizeNotes(lines);
  }
};

const generatePortfolioNotes = async (snapshot, metrics, regimeState, userProfile, options = {}) => {
  const apiKey = options.apiKey ?? env.anthropicApiKey;
  const model = options.model ?? env.aiNarrativeModel ?? 'claude-haiku-4-5-20251001';
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Number(options.timeoutMs || env.aiNarrativeTimeoutMs || 9000);

  if (!apiKey || !env.aiNarrativeEnabled) {
    return { notes: [], mode: 'disabled', model, usage: {}, durationMs: 0 };
  }

  const topHoldings = safeList(snapshot?.holdings_detail)
    .slice()
    .sort((a, b) => Number(b?.weight_pct || 0) - Number(a?.weight_pct || 0))
    .slice(0, 5);
  const leadership = safeList(regimeState?.leadership).join(', ');
  const languageInstruction = String(userProfile?.language || '').toLowerCase() === 'en'
    ? 'Write notes in English.'
    : 'Write notes in Spanish (Latin American).';

  const prompt = `You are Horsai's portfolio analyst.
${languageInstruction}
Generate 2-4 short, actionable notes about this portfolio.

PORTFOLIO:
Total value: $${Number(snapshot?.total_value || 0).toFixed(2)}
P&L: ${Number(snapshot?.pnl_pct || 0).toFixed(2)}%
Holdings: ${safeList(snapshot?.holdings_detail).length}

TOP HOLDINGS:
${topHoldings.map((h) => `${h.symbol}: ${h.weight_pct}% weight, ${h.pnl_pct}% P&L, sector: ${h.sector || 'N/A'}`).join('\n')}

EXPOSURE:
By category: ${JSON.stringify(metrics?.category_exposure || {})}
By sector: ${JSON.stringify(metrics?.sector_exposure || {})}
Concentration (top 3): ${Number(metrics?.concentration_top3_pct || 0).toFixed(2)}%

MARKET CONTEXT:
Regime: ${String(regimeState?.regime || 'transition')} (${String(regimeState?.volatility_regime || 'normal')})
Leadership: ${leadership}
Alignment score: ${Number(metrics?.alignment_score || 50)}/100

USER PROFILE:
Risk: ${userProfile?.risk_level ?? 0.5}, Horizon: ${userProfile?.horizon ?? 0.5}

RULES:
- 2-4 notes, each 1 sentence, max 25 words
- Be direct and factual
- Note concentration risks if top 3 > 60%
- Note regime misalignment if alignment < 40
- Note if exposure is unusual for risk profile
- Never suggest specific trades, just observations
- Return ONLY a JSON array of strings`;

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
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`portfolio notes failed: HTTP ${res.status} ${text.slice(0, 240)}`);
    }

    const json = await res.json();
    const text = String(json?.content?.[0]?.text || '');
    return {
      notes: parseNotes(text),
      usage: json?.usage || {},
      model,
      mode: 'ai',
      durationMs: Date.now() - startedAt
    };
  } catch (error) {
    clearTimeout(timer);
    return {
      notes: [],
      usage: {},
      model,
      mode: 'fallback',
      durationMs: Date.now() - startedAt,
      error
    };
  }
};

module.exports = { generatePortfolioNotes, parseNotes, normalizeNotes };
