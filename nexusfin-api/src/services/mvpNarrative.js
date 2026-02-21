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
  const timeoutMs = toInt(options.timeoutMs ?? env.aiNarrativeTimeoutMs, 22000);

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
          max_tokens: 2200,
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

    const systemPrompt = [
      'Sos el editor de mercado senior de Horsai. Tu trabajo es transformar bullets informativos en insights accionables y personalizados.',
      '',
      'REGLAS DE REESCRITURA:',
      '1. Cada bullet debe tener 3 partes: HECHO (con números) + IMPACTO (qué significa) + RELEVANCIA (por qué le importa a ESTE usuario).',
      '2. Priorizar bullets que conecten con el portfolio del usuario. Si tiene tech y tech sube, decirlo.',
      '3. Eliminar headlines de consumidor general (ej: "Apple lanza nuevo iPhone") a menos que impacten valuaciones.',
      '4. Reescribir en tono de estratega, no de periodista. No "X anunció Y". Sí "X +3% tras anunciar Y; implica Z para el sector."',
      '5. Si hay divergencias cross-asset (equity sube, bonds bajan), SIEMPRE incluir un bullet sobre eso.',
      '6. NUNCA inventar datos — usar SOLO los hechos provistos. Pero sí agregar contexto analítico.',
      '7. Cada bullet máximo 180 caracteres, en español.',
      '',
      'ANTI-PATTERNS:',
      '- "Mercados operan mixtos" → identificar el sesgo dominante',
      '- Repetir el mismo dato en múltiples bullets',
      '- Bullets sin números concretos',
      '- Headlines de clickbait o consumidor general',
      '',
      'Responde solo JSON estricto.'
    ].join('\n');

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
        bad: 'S&P 500 subió por earnings. Mercados mixtos hoy.',
        good: 'SPY +0.8% y tech +1.4% con breadth en 63%. Tu cartera (45% tech via NVDA/AAPL) se beneficia, pero concentración sube riesgo si semis corrigen. GLD -0.3% confirma apetito por riesgo, no por refugio.'
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

    const systemPrompt = [
      'Sos el editor de estrategia de inversión de Horsai. Tu trabajo es transformar rationale y risks técnicos en narrativa que un inversor pueda entender y actuar.',
      '',
      'REGLAS DE EDICIÓN:',
      '1. RATIONALE: No solo listar métricas. Explicar la LÓGICA: "RSI 62 con precio 8% sobre SMA200 → tendencia fuerte sin sobrecompra extrema → espacio para continuar si breadth se mantiene arriba de 55%."',
      '2. RISKS: Cuantificar siempre. No "puede bajar". Sí "si pierde SMA50 en 485.20, target de corrección en SMA200 (462.10), implicando downside de -6.2%."',
      '3. INVALIDATION: Debe ser binaria y verificable. "Cerrar posición si cierra bajo X por N sesiones" — no "si la tendencia se debilita".',
      '4. Mantener todos los números originales (RSI/SMA/vol/precio) — agregar contexto analítico, no reemplazar datos.',
      '5. Cada rationale bullet: mínimo 1 número + 1 explicación de por qué importa.',
      '6. En español, máximo 190 caracteres por bullet.',
      '',
      'ANTI-PATTERNS:',
      '- "Strong trend" / "Good relative strength" → vacío, decir vs qué y cuánto',
      '- "Si se rompe la tendencia" → especificar nivel, timeframe, y consecuencia',
      '- Rationale que solo lista datos sin conectarlos: "RSI 62, SMA50 alcista, vol 18%" → agregar "lo cual sugiere..."',
      '',
      'Responde solo JSON estricto.'
    ].join('\n');

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
        badRationale: ['Strong trend', 'Good relative strength', 'Tendencia positiva en el activo'],
        goodRationale: [
          'RSI 62 con precio 8% sobre SMA200 → tendencia fuerte sin sobrecompra; espacio para continuar si breadth >55%.',
          'Vol20D 22% (percentil 60) permite sizing estándar. Relación riesgo/retorno 1:2.3 vs pares sectoriales más volátiles (XLE 31%).'
        ],
        badInvalidation: 'Si se rompe la tendencia',
        goodInvalidation: 'Cerrar si cierra bajo SMA50 (485.20) por 2 sesiones consecutivas. Target de corrección: SMA200 en 462.10 (-6.2%).'
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
