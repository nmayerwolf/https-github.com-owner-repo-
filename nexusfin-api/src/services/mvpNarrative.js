const { env } = require('../config/env');

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

const toInt = (value, fallback) => {
  const out = Number(value);
  if (!Number.isFinite(out)) return fallback;
  return Math.trunc(out);
};

const extractJsonObject = (input) => {
  const raw = String(input || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
};

const cleanText = (value, maxLen = 220) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLen);

const normalizeDigestBullets = (items = [], max = 10) =>
  (Array.isArray(items) ? items : [])
    .map((item) => cleanText(item, 180))
    .filter(Boolean)
    .slice(0, max);

const normalizeRationaleList = (items = [], max = 3) =>
  (Array.isArray(items) ? items : [])
    .map((item) => cleanText(item, 190))
    .filter(Boolean)
    .slice(0, max);

const normalizeRiskList = (items = [], max = 2) =>
  (Array.isArray(items) ? items : [])
    .map((item) => cleanText(item, 190))
    .filter(Boolean)
    .slice(0, max);

const toProfile = (profile = {}) => ({
  presetType: String(profile.preset_type || profile.presetType || 'balanced'),
  riskLevel: clamp01(profile.risk_level ?? profile.riskLevel ?? 0.5),
  horizon: clamp01(profile.horizon ?? 0.5),
  focus: clamp01(profile.focus ?? 0.5)
});

const createMvpNarrativeService = (options = {}) => {
  const enabled = options.enabled ?? env.aiNarrativeEnabled;
  const apiKey = options.apiKey ?? env.anthropicApiKey;
  const model = options.model ?? env.aiNarrativeModel;
  const timeoutMs = toInt(options.timeoutMs ?? env.aiNarrativeTimeoutMs, 9000);

  const callAnthropicJson = async ({ systemPrompt, userPrompt }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(2000, timeoutMs));

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          max_tokens: 900,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`AI_NARRATIVE_HTTP_${res.status}`);
      }

      const payload = await res.json();
      const text = Array.isArray(payload?.content) ? payload.content.map((x) => x?.text || '').join('\n').trim() : '';
      const parsed = extractJsonObject(text);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('AI_NARRATIVE_INVALID_JSON');
      }
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  };

  const polishDigestBullets = async ({ profile, regimeState, crisisState, bullets = [], marketContext = {}, userContext = {} }) => {
    const fallbackBullets = normalizeDigestBullets(bullets, 10);
    const fallback = { bullets: fallbackBullets, meta: { mode: 'fallback', reason: 'disabled_or_not_configured', model: null } };
    if (!enabled || !apiKey) return fallback;

    const systemPrompt =
      'You are Horsai\'s personalized market editor. Rewrite digest bullets in Spanish using ONLY supplied facts and numbers. Never invent prices, percentages, symbols, dates, or holdings. Return strict JSON.';

    const userPrompt = JSON.stringify({
      task: 'rewrite_digest',
      rules: {
        maxBullets: Math.min(10, fallbackBullets.length || 10),
        maxCharsPerBullet: 180,
        preserveFactBoundaries: true
      },
      profile: toProfile(profile),
      regime: {
        regime: regimeState?.regime || 'transition',
        volatilityRegime: regimeState?.volatilityRegime || 'normal',
        leadership: Array.isArray(regimeState?.leadership) ? regimeState.leadership : [],
        riskFlags: Array.isArray(regimeState?.riskFlags) ? regimeState.riskFlags : [],
        confidence: clamp01(regimeState?.confidence ?? 0.5)
      },
      marketContext,
      userContext,
      crisis: {
        isActive: Boolean(crisisState?.isActive),
        triggers: Array.isArray(crisisState?.triggers) ? crisisState.triggers : []
      },
      personalizationRules: [
        'Si hay portfolio, conecta al menos 2 bullets con holdings o exposición sectorial.',
        'Si alignment score < 40, mencionar desalineación explícita.',
        'Si risk_level < 0.3, priorizar riesgos y coberturas.',
        'Si risk_level > 0.7, priorizar oportunidades.',
        'Si horizon < 0.3, enfoque táctico semanal. Si horizon > 0.7, enfoque estructural.'
      ],
      examples: {
        bad: 'S&P 500 subió por earnings.',
        good: 'S&P 500 +0.8% y tech +1.4%. Tu cartera tiene 45% tech: favorece NVDA/AAPL, pero concentración elevada sube riesgo de reversión.'
      },
      sourceBullets: fallbackBullets,
      outputSchema: { bullets: ['string'] }
    });

    try {
      const parsed = await callAnthropicJson({ systemPrompt, userPrompt });
      const polished = normalizeDigestBullets(parsed?.bullets, 10);
      if (!polished.length) return fallback;
      return { bullets: polished, meta: { mode: 'ai', model } };
    } catch (error) {
      return { bullets: fallbackBullets, meta: { mode: 'fallback', reason: String(error?.message || 'error'), model } };
    }
  };

  const polishRecommendationItems = async ({ profile, regimeState, crisisState, items = [], marketContext = {} }) => {
    const baseItems = (Array.isArray(items) ? items : []).map((item) => ({
      ...item,
      rationale: normalizeRationaleList(item?.rationale, 3),
      risks: normalizeRiskList(item?.risks, 2)
    }));

    if (!enabled || !apiKey || !baseItems.length) {
      return { items: baseItems, meta: { mode: 'fallback', reason: 'disabled_or_not_configured', model: null } };
    }

    const systemPrompt =
      'You are Horsai\'s investment strategist editor. Polish rationale and risks in Spanish using ONLY supplied facts. Each idea must keep concrete numbers (RSI/SMA/volatility/price) and a specific invalidation condition. Return strict JSON.';

    const userPrompt = JSON.stringify({
      task: 'rewrite_recommendation_cards',
      rules: {
        maxRationaleBullets: 3,
        maxRiskBullets: 2,
        maxCharsPerBullet: 190,
        preserveIdeaIds: true,
        preserveActionsAndConfidence: true
      },
      profile: toProfile(profile),
      regime: {
        regime: regimeState?.regime || 'transition',
        volatilityRegime: regimeState?.volatilityRegime || 'normal',
        leadership: Array.isArray(regimeState?.leadership) ? regimeState.leadership : [],
        riskFlags: Array.isArray(regimeState?.riskFlags) ? regimeState.riskFlags : [],
        confidence: clamp01(regimeState?.confidence ?? 0.5)
      },
      marketContext,
      crisis: {
        isActive: Boolean(crisisState?.isActive),
        triggers: Array.isArray(crisisState?.triggers) ? crisisState.triggers : []
      },
      qualityRules: [
        'Cada rationale debe mencionar números concretos de los facts provistos.',
        'Explicar por qué el número respalda la acción, no solo listar métricas.',
        'Mantener invalidation específica con precio/condición.',
        'Incluir al menos un riesgo cuantificable.'
      ],
      examples: {
        badRationale: ['Strong trend', 'Good relative strength'],
        goodRationale: [
          'RSI 62 con precio 8% sobre SMA200 sugiere tendencia fuerte sin sobrecompra extrema.',
          'Vol20D 22% permite mejor relación riesgo/retorno frente a pares más volátiles.'
        ],
        badInvalidation: 'Si se rompe la tendencia',
        goodInvalidation: 'Cerrar bajo SMA50 por 2 sesiones consecutivas'
      },
      ideas: baseItems.map((item) => ({
        ideaId: item.ideaId,
        symbol: item.symbol || null,
        category: item.category,
        action: item.action,
        confidence: clamp01(item.confidence ?? 0),
        timeframe: item.timeframe,
        invalidation: cleanText(item.invalidation, 190),
        rationale: normalizeRationaleList(item.rationale, 3),
        risks: normalizeRiskList(item.risks, 2),
        rawScores: item.rawScores && typeof item.rawScores === 'object' ? item.rawScores : {}
      })),
      outputSchema: {
        ideas: [
          {
            ideaId: 'string',
            rationale: ['string'],
            risks: ['string']
          }
        ]
      }
    });

    try {
      const parsed = await callAnthropicJson({ systemPrompt, userPrompt });
      const byId = new Map();
      for (const item of Array.isArray(parsed?.ideas) ? parsed.ideas : []) {
        byId.set(String(item?.ideaId || ''), {
          rationale: normalizeRationaleList(item?.rationale, 3),
          risks: normalizeRiskList(item?.risks, 2)
        });
      }

      const merged = baseItems.map((item) => {
        const narrative = byId.get(String(item.ideaId || ''));
        if (!narrative) return item;
        return {
          ...item,
          rationale: narrative.rationale.length ? narrative.rationale : item.rationale,
          risks: narrative.risks.length ? narrative.risks : item.risks
        };
      });

      return { items: merged, meta: { mode: 'ai', model } };
    } catch (error) {
      return { items: baseItems, meta: { mode: 'fallback', reason: String(error?.message || 'error'), model } };
    }
  };

  return {
    enabled: Boolean(enabled && apiKey),
    configured: Boolean(apiKey),
    model,
    timeoutMs,
    polishDigestBullets,
    polishRecommendationItems
  };
};

module.exports = {
  createMvpNarrativeService,
  extractJsonObject
};
