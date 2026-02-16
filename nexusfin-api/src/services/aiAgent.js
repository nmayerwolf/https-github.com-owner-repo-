const { env } = require('../config/env');

const SYSTEM_PROMPT = [
  'Sos el motor de análisis de Horsy.',
  'Debes confirmar o descartar señales técnicas con un enfoque conservador.',
  'Respondé solo JSON válido, sin markdown ni texto adicional.'
].join(' ');

const toFinite = (value) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

const downgradeConfidence = (value) => {
  const current = String(value || '').toLowerCase();
  if (current === 'high') return 'medium';
  if (current === 'medium') return 'low';
  return 'low';
};

const extractJsonBlock = (input) => {
  const raw = String(input || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const buildUserPrompt = ({ candidate, userConfig, context = {} }) => {
  const technical = candidate?.snapshot || {};
  const historicalAlerts = Array.isArray(context.previousAlerts) ? context.previousAlerts : [];
  const newsHeadlines = Array.isArray(context.news)
    ? context.news.map((x, idx) => `${idx + 1}. ${x?.headline || x?.title || ''}`.trim()).filter(Boolean).slice(0, 5)
    : [];

  const signals = Array.isArray(candidate?.signals)
    ? candidate.signals.map((s) => `${s.indicator || 'N/A'}:${s.type || 'n/a'}:${s.detail || ''}`).join(' | ')
    : '';

  return [
    `SEÑAL DETECTADA: ${candidate.recommendation} para ${candidate.symbol} (${candidate.name || candidate.symbol})`,
    `TÉCNICOS: RSI=${technical.rsi ?? 'n/a'}, ATR=${technical.atr ?? 'n/a'}, SMA50=${technical.sma50 ?? 'n/a'}, SMA200=${technical.sma200 ?? 'n/a'}`,
    `CONFLUENCIA: bull=${candidate.confluenceBull ?? 0}, bear=${candidate.confluenceBear ?? 0}`,
    `SEÑALES: ${signals || 'n/a'}`,
    `FUNDAMENTALS: ${JSON.stringify(context.fundamentals || {})}`,
    `NOTICIAS: ${newsHeadlines.join(' || ') || 'sin noticias'}`,
    `HISTORIAL ALERTAS: ${JSON.stringify(historicalAlerts.slice(0, 5))}`,
    `PERFIL: horizon=${userConfig?.horizon || 'mediano'}, riskProfile=${userConfig?.riskProfile || 'moderado'}`,
    'Respondé con JSON exacto:',
    '{"confirm":boolean,"confidence":"high|medium|low","action":"BUY|SELL|HOLD","thesis":"string","catalysts":["string"],"risks":["string"],"technicalView":"string","fundamentalView":"string","adjustedStopLoss":number,"adjustedTarget":number,"timeframe":"string","reasoning":"string"}'
  ].join('\n');
};

const callAnthropic = async ({ apiKey, model, timeoutMs, systemPrompt, userPrompt }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || 10000)));

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
        max_tokens: 700,
        temperature: 0.2,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      throw new Error(`ANTHROPIC_HTTP_${res.status}`);
    }

    const payload = await res.json();
    const text = Array.isArray(payload?.content)
      ? payload.content.map((x) => x?.text || '').join('\n').trim()
      : '';
    return { text, raw: payload };
  } finally {
    clearTimeout(timer);
  }
};

const createAiAgent = (options = {}) => {
  const enabled = options.enabled ?? env.aiAgentEnabled;
  const apiKey = options.apiKey ?? env.anthropicApiKey;
  const model = options.model ?? env.aiAgentModel;
  const timeoutMs = options.timeoutMs ?? env.aiAgentTimeoutMs;

  const validateSignal = async ({ candidate, userConfig, context = {} }) => {
    if (!enabled || !apiKey) {
      return {
        mode: 'fallback',
        confirm: true,
        aiValidated: false,
        confidence: downgradeConfidence(candidate?.confidence),
        reasoning: enabled ? 'AI_KEY_MISSING' : 'AI_DISABLED',
        model: null,
        adjustedStopLoss: toFinite(candidate?.stopLoss),
        adjustedTarget: toFinite(candidate?.takeProfit),
        thesis: null
      };
    }

    try {
      const userPrompt = buildUserPrompt({ candidate, userConfig, context });
      const out = await callAnthropic({
        apiKey,
        model,
        timeoutMs,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt
      });
      const parsed = extractJsonBlock(out.text);
      if (!parsed) {
        throw new Error('AI_INVALID_JSON');
      }

      const confirm = parsed.confirm === true;
      if (!confirm) {
        return {
          mode: 'rejected',
          confirm: false,
          aiValidated: true,
          confidence: String(parsed.confidence || 'low').toLowerCase(),
          reasoning: String(parsed.reasoning || parsed.thesis || 'AI_REJECTED'),
          model,
          adjustedStopLoss: toFinite(parsed.adjustedStopLoss) ?? toFinite(candidate?.stopLoss),
          adjustedTarget: toFinite(parsed.adjustedTarget) ?? toFinite(candidate?.takeProfit),
          thesis: parsed
        };
      }

      return {
        mode: 'validated',
        confirm: true,
        aiValidated: true,
        confidence: String(parsed.confidence || candidate?.confidence || 'medium').toLowerCase(),
        reasoning: String(parsed.reasoning || parsed.thesis || ''),
        model,
        adjustedStopLoss: toFinite(parsed.adjustedStopLoss) ?? toFinite(candidate?.stopLoss),
        adjustedTarget: toFinite(parsed.adjustedTarget) ?? toFinite(candidate?.takeProfit),
        thesis: parsed
      };
    } catch (error) {
      return {
        mode: 'fallback',
        confirm: true,
        aiValidated: false,
        confidence: downgradeConfidence(candidate?.confidence),
        reasoning: String(error?.message || 'AI_FALLBACK'),
        model,
        adjustedStopLoss: toFinite(candidate?.stopLoss),
        adjustedTarget: toFinite(candidate?.takeProfit),
        thesis: null
      };
    }
  };

  return {
    enabled: Boolean(enabled && apiKey),
    configured: Boolean(apiKey),
    model,
    timeoutMs,
    validateSignal,
    downgradeConfidence,
    extractJsonBlock
  };
};

module.exports = { createAiAgent, downgradeConfidence, extractJsonBlock };
