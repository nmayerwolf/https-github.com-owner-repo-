const calculateConfluence = (asset, config) => {
  const ind = asset.indicators;
  if (!ind || !ind.macd || !ind.bollinger) {
    return { recommendation: 'HOLD', net: 0, confidence: 'low', points: [], bull: 0, bear: 0, signals: [] };
  }

  const points = [];
  const signals = [];
  let bull = 0;
  let bear = 0;

  if (ind.rsi < config.rsiOS) {
    bull += 2;
    points.push('RSI sobreventa (+2)');
    signals.push({ indicator: 'RSI', type: 'bull', detail: `Sobreventa (${ind.rsi.toFixed(1)})` });
  } else if (ind.rsi < 40) {
    bull += 1;
    points.push('RSI bajo (+1)');
    signals.push({ indicator: 'RSI', type: 'bull', detail: `RSI bajo (${ind.rsi.toFixed(1)})` });
  }

  if (ind.rsi > config.rsiOB) {
    bear += 2;
    points.push('RSI sobrecompra (-2)');
    signals.push({ indicator: 'RSI', type: 'bear', detail: `Sobrecompra (${ind.rsi.toFixed(1)})` });
  } else if (ind.rsi > 60) {
    bear += 1;
    points.push('RSI alto (-1)');
    signals.push({ indicator: 'RSI', type: 'bear', detail: `RSI alto (${ind.rsi.toFixed(1)})` });
  }

  if (ind.macd.line > ind.macd.signal) {
    bull += 2;
    points.push('MACD alcista (+2)');
    signals.push({ indicator: 'MACD', type: 'bull', detail: 'Cruce alcista' });
  } else {
    bear += 2;
    points.push('MACD bajista (-2)');
    signals.push({ indicator: 'MACD', type: 'bear', detail: 'Cruce bajista' });
  }

  if (ind.macd.histogram > 0) {
    bull += 1;
    signals.push({ indicator: 'MACD', type: 'bull', detail: 'Histograma positivo' });
  }
  if (ind.macd.histogram < 0) {
    bear += 1;
    signals.push({ indicator: 'MACD', type: 'bear', detail: 'Histograma negativo' });
  }

  if (ind.currentPrice <= ind.bollinger.lower) {
    bull += 2;
    signals.push({ indicator: 'BOLL', type: 'bull', detail: 'Precio en banda inferior' });
  }
  if (ind.currentPrice >= ind.bollinger.upper) {
    bear += 2;
    signals.push({ indicator: 'BOLL', type: 'bear', detail: 'Precio en banda superior' });
  }

  if (ind.sma50 && ind.sma200 && ind.currentPrice > ind.sma50 && ind.sma50 > ind.sma200) {
    bull += 1;
    signals.push({ indicator: 'SMA', type: 'bull', detail: 'Tendencia alcista (SMA50>SMA200)' });
  }
  if (ind.sma50 && ind.sma200 && ind.currentPrice < ind.sma50 && ind.sma50 < ind.sma200) {
    bear += 1;
    signals.push({ indicator: 'SMA', type: 'bear', detail: 'Tendencia bajista (SMA50<SMA200)' });
  }

  if ((ind.volumeRatio ?? 0) > config.volThresh) {
    if (asset.changePercent >= 0) {
      bull += 1;
      signals.push({ indicator: 'VOL', type: 'bull', detail: `Volumen anómalo x${ind.volumeRatio.toFixed(2)}` });
    } else {
      bear += 1;
      signals.push({ indicator: 'VOL', type: 'bear', detail: `Volumen anómalo x${ind.volumeRatio.toFixed(2)}` });
    }
  }

  const net = bull - bear;

  if (net >= 4) return { recommendation: 'STRONG BUY', net, confidence: 'high', points, bull, bear, signals };
  if (net >= config.minConfluence) return { recommendation: 'BUY', net, confidence: 'medium', points, bull, bear, signals };
  if (net <= -4) return { recommendation: 'STRONG SELL', net, confidence: 'high', points, bull, bear, signals };
  if (net <= -config.minConfluence) return { recommendation: 'SELL', net, confidence: 'medium', points, bull, bear, signals };
  return { recommendation: 'HOLD', net, confidence: 'low', points, bull, bear, signals };
};

module.exports = { calculateConfluence };
