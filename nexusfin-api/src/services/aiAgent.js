const { env } = require('../config/env');

const SYSTEM_PROMPT = [
  'Sos un analista financiero profesional del equipo de Horsai.',
  'Validás y ajustás señales técnicas con contexto de riesgo y portfolio.',
  'Respondé solo JSON válido, sin markdown ni texto adicional.'
].join(' ');

const ACTIONS = ['STRONG_BUY', 'BUY', 'HOLD', 'SELL', 'STRONG_SELL'];
const RISK_LEVELS = ['low', 'medium', 'high'];

const toFinite = (value) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toConfidenceScore = (value) => {
  if (value == null) return 5;
  if (typeof value === 'number') return clamp(Math.round(value), 1, 10);
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'high') return 9;
  if (normalized === 'medium') return 6;
  if (normalized === 'low') return 3;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? clamp(Math.round(parsed), 1, 10) : 5;
};

const scoreToLevel = (score) => {
  const n = toConfidenceScore(score);
  if (n >= 8) return 'high';
  if (n >= 5) return 'medium';
  return 'low';
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

const summarizePortfolio = (context = {}) => {
  const summary = context.portfolioSummary || {};
  const lines = [];
  if (Number.isFinite(Number(summary.totalValue))) lines.push(`valor=${Number(summary.totalValue).toFixed(2)}`);
  if (Number.isFinite(Number(summary.totalPnlPct))) lines.push(`pnl_pct=${Number(summary.totalPnlPct).toFixed(2)}`);
  if (Number.isFinite(Number(summary.positionsCount))) lines.push(`posiciones=${Number(summary.positionsCount)}`);
  return lines.join(', ') || 'Sin portfolio cargado';
};

const summarizePosition = (position = null) => {
  if (!position) return 'No tiene posición';
  const qty = Number(position.quantity || 0);
  const buyPrice = Number(position.buyPrice || 0);
  const pnlPct = Number(position.pnlPct || 0);
  return `Tiene ${qty} unidades compradas a ${buyPrice.toFixed(2)} con PnL ${pnlPct.toFixed(2)}%`;
};

const buildUserPrompt = ({ candidate, userConfig, context = {} }) => {
  const technical = candidate?.snapshot || {};
  const newsHeadlines = Array.isArray(context.news)
    ? context.news.map((x, idx) => `${idx + 1}. ${x?.headline || x?.title || ''}`.trim()).filter(Boolean).slice(0, 6)
    : [];
  const signals = Array.isArray(candidate?.signals)
    ? candidate.signals.map((s) => `${s.indicator || 'N/A'}:${s.type || 'n/a'}:${s.detail || ''}`).join(' | ')
    : '';
  const prevSimilar = context.previousSimilar || {};

  return [
    `DATOS DEL ACTIVO:`,
    `- Simbolo: ${candidate?.symbol || 'N/A'}`,
    `- Precio actual: ${candidate?.priceAtAlert ?? 'n/a'}`,
    `- Tecnicos: RSI=${technical.rsi ?? 'n/a'}, MACD=${technical.macd ?? 'n/a'}, BollingerPos=${technical.bollingerUpper && technical.bollingerLower ? 'known' : 'n/a'}, VolumenRatio=${technical.volumeRatio ?? 'n/a'}x`,
    `- Cambio diario: ${technical.dailyChangePct ?? 'n/a'}%`,
    `- Señales: ${signals || 'n/a'}`,
    `- Confluencia bull=${candidate?.confluenceBull ?? 0}, bear=${candidate?.confluenceBear ?? 0}`,
    `- Noticias recientes: ${newsHeadlines.join(' || ') || 'sin noticias recientes'}`,
    ``,
    `CONTEXTO DEL USUARIO:`,
    `- Riesgo: ${userConfig?.riskProfile || 'moderado'}`,
    `- Horizonte: ${userConfig?.horizon || 'mediano'}`,
    `- Sectores: ${Array.isArray(userConfig?.sectors) && userConfig.sectors.length ? userConfig.sectors.join(', ') : 'no definido'}`,
    `- Watchlist size: ${Number(context.watchlistCount || 0)}`,
    `- Posicion abierta en este activo: ${summarizePosition(context.positionForSymbol || null)}`,
    `- Portfolio total: ${summarizePortfolio(context)}`,
    ``,
    `HISTORIAL DEL AGENTE:`,
    `- Señales similares: ${Number(prevSimilar.count || 0)}`,
    `- Win rate similares: ${Number(prevSimilar.winRatePct || 0).toFixed(2)}%`,
    `- Ultima señal en este activo: ${context.lastSignalSummary || 'sin historial'}`,
    ``,
    `Respondé en JSON estricto con este schema:`,
    '{"action":"STRONG_BUY|BUY|HOLD|SELL|STRONG_SELL","confidence":1,"reasoning":"string","target_price":0,"stop_loss":0,"timeframe":"1d|1w|2w|1m","risk_level":"low|medium|high","portfolio_impact":"string|null","action_suggestion":"string"}'
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
        max_tokens: 900,
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

const normalizeAiResult = ({ candidate, parsed }) => {
  const actionRaw = String(parsed?.action || '').toUpperCase();
  const action = ACTIONS.includes(actionRaw) ? actionRaw : null;
  const confidenceScore = toConfidenceScore(parsed?.confidence);
  const confidenceLevel = scoreToLevel(confidenceScore);
  const riskRaw = String(parsed?.risk_level || '').toLowerCase();
  const riskLevel = RISK_LEVELS.includes(riskRaw) ? riskRaw : 'medium';

  const explicitConfirm = typeof parsed?.confirm === 'boolean' ? parsed.confirm : null;

  const type = String(candidate?.type || '').toLowerCase();
  const defaultConfirm =
    type === 'bearish'
      ? action === 'SELL' || action === 'STRONG_SELL'
      : action === 'BUY' || action === 'STRONG_BUY' || action === 'HOLD';

  const confirm = explicitConfirm == null ? defaultConfirm : explicitConfirm;

  return {
    confirm: Boolean(confirm),
    action: action || (type === 'bearish' ? 'SELL' : 'BUY'),
    confidenceScore,
    confidenceLevel,
    reasoning: String(parsed?.reasoning || parsed?.action_suggestion || parsed?.thesis || ''),
    adjustedStopLoss: toFinite(parsed?.adjustedStopLoss ?? parsed?.stop_loss),
    adjustedTarget: toFinite(parsed?.adjustedTarget ?? parsed?.target_price),
    timeframe: String(parsed?.timeframe || '1w'),
    riskLevel,
    portfolioImpact: parsed?.portfolio_impact == null ? null : String(parsed.portfolio_impact),
    actionSuggestion: String(parsed?.action_suggestion || ''),
    raw: parsed
  };
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
        confidenceScore: toConfidenceScore(candidate?.confidence),
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
      if (!parsed) throw new Error('AI_INVALID_JSON');

      const normalized = normalizeAiResult({ candidate, parsed });

      if (!normalized.confirm) {
        return {
          mode: 'rejected',
          confirm: false,
          aiValidated: true,
          confidence: normalized.confidenceLevel,
          confidenceScore: normalized.confidenceScore,
          reasoning: normalized.reasoning || 'AI_REJECTED',
          model,
          adjustedStopLoss: normalized.adjustedStopLoss ?? toFinite(candidate?.stopLoss),
          adjustedTarget: normalized.adjustedTarget ?? toFinite(candidate?.takeProfit),
          thesis: normalized.raw
        };
      }

      return {
        mode: 'validated',
        confirm: true,
        aiValidated: true,
        confidence: normalized.confidenceLevel,
        confidenceScore: normalized.confidenceScore,
        reasoning: normalized.reasoning,
        model,
        adjustedStopLoss: normalized.adjustedStopLoss ?? toFinite(candidate?.stopLoss),
        adjustedTarget: normalized.adjustedTarget ?? toFinite(candidate?.takeProfit),
        thesis: {
          ...normalized.raw,
          action: normalized.action,
          risk_level: normalized.riskLevel,
          timeframe: normalized.timeframe,
          portfolio_impact: normalized.portfolioImpact,
          action_suggestion: normalized.actionSuggestion
        }
      };
    } catch (error) {
      return {
        mode: 'fallback',
        confirm: true,
        aiValidated: false,
        confidence: downgradeConfidence(candidate?.confidence),
        confidenceScore: toConfidenceScore(candidate?.confidence),
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
    extractJsonBlock,
    callAnthropic,
    toConfidenceScore
  };
};

module.exports = { createAiAgent, downgradeConfidence, extractJsonBlock, toConfidenceScore };
