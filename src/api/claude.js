const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

const stats = {
  calls: 0,
  errors: 0,
  fallbacks: 0,
  lastError: '',
  lastCallAt: 0
};

const callClaude = async ({ system, prompt, maxTokens = 900 }) => {
  const key = import.meta.env.VITE_ANTHROPIC_KEY;
  if (!key) return null;

  stats.calls += 1;
  stats.lastCallAt = Date.now();

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) {
    stats.errors += 1;
    stats.lastError = `HTTP ${res.status}`;
    throw new Error(`Claude API ${res.status}`);
  }

  const data = await res.json();
  return data?.content?.[0]?.text ?? '';
};

export const askClaude = async (prompt, system = 'Respond in Spanish (Argentina). Return concise investment analysis.') => {
  const text = await callClaude({ system, prompt, maxTokens: 900 });
  if (!text) {
    stats.fallbacks += 1;
    return { fallback: true, text: 'No hay API key de Anthropic configurada. Mostrando análisis local.' };
  }
  return { text };
};

export const generateInvestmentThesis = async ({ asset, config }) => {
  const system = 'Sos un analista financiero. Respondé solo JSON válido en español (Argentina), sin markdown.';
  const prompt = `Generá tesis de inversión para ${asset.symbol} con este contexto:\n${JSON.stringify(
    {
      symbol: asset.symbol,
      category: asset.category,
      price: asset.price,
      changePercent: asset.changePercent,
      indicators: asset.indicators,
      config
    },
    null,
    2
  )}\n\nFormato JSON exacto:\n{\n  "summary": "",\n  "action": "BUY/SELL/HOLD",\n  "confidence": "high/medium/low",\n  "catalysts": ["", "", ""],\n  "risks": ["", "", ""],\n  "technicalView": "",\n  "fundamentalView": "",\n  "priceTarget": "",\n  "timeframe": "",\n  "suitability": ""\n}`;

  const text = await callClaude({ system, prompt, maxTokens: 1200 });
  if (!text) {
    stats.fallbacks += 1;
    return {
      fallback: true,
      data: {
        summary: `${asset.symbol} muestra señal ${asset.signal?.recommendation ?? 'HOLD'} con confluencia ${asset.signal?.net ?? 0}.`,
        action: asset.signal?.recommendation?.includes('BUY') ? 'BUY' : asset.signal?.recommendation?.includes('SELL') ? 'SELL' : 'HOLD',
        confidence: asset.signal?.confidence ?? 'low',
        catalysts: ['Momentum técnico actual', 'Confluencia de indicadores', 'Gestión activa con SL/TP'],
        risks: ['Volatilidad de mercado', 'Cambios macroeconómicos', 'Ruptura de soporte/resistencia'],
        technicalView: 'El setup técnico se basa en RSI, MACD y Bollinger con validación de tendencia.',
        fundamentalView: 'Sin backend de fundamentales completo en esta fase, la lectura fundamental es preliminar.',
        priceTarget: asset.indicators?.atr ? `Objetivo dinámico: ${Number(asset.price + asset.indicators.atr * 2.5).toFixed(2)}` : 'N/D',
        timeframe: config?.horizon ?? 'mediano',
        suitability: `Alineado de forma ${config?.riskProfile ?? 'moderada'} al perfil configurado.`
      }
    };
  }

  try {
    return { data: JSON.parse(text) };
  } catch {
    stats.fallbacks += 1;
    return {
      fallback: true,
      data: {
        summary: text.slice(0, 280),
        action: 'HOLD',
        confidence: 'low',
        catalysts: [],
        risks: [],
        technicalView: text,
        fundamentalView: 'N/D',
        priceTarget: 'N/D',
        timeframe: config?.horizon ?? 'mediano',
        suitability: 'Revisar manualmente la salida del modelo.'
      }
    };
  }
};

export const getClaudeHealth = () => ({ ...stats });
