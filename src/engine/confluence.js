export const calculateConfluence = (asset, config) => {
  const ind = asset.indicators;
  if (!ind || !ind.macd || !ind.bollinger) return { recommendation: 'HOLD', net: 0, confidence: 'low', points: [] };

  const points = [];
  let bull = 0;
  let bear = 0;

  if (ind.rsi < config.rsiOS) {
    bull += 2;
    points.push('RSI sobreventa (+2)');
  } else if (ind.rsi < 40) {
    bull += 1;
    points.push('RSI bajo (+1)');
  }

  if (ind.rsi > config.rsiOB) {
    bear += 2;
    points.push('RSI sobrecompra (-2)');
  } else if (ind.rsi > 60) {
    bear += 1;
    points.push('RSI alto (-1)');
  }

  if (ind.macd.line > ind.macd.signal) {
    bull += 2;
    points.push('MACD alcista (+2)');
  } else {
    bear += 2;
    points.push('MACD bajista (-2)');
  }

  if (ind.macd.histogram > 0) bull += 1;
  if (ind.macd.histogram < 0) bear += 1;

  if (ind.currentPrice <= ind.bollinger.lower) bull += 2;
  if (ind.currentPrice >= ind.bollinger.upper) bear += 2;

  if (ind.sma50 && ind.sma200 && ind.currentPrice > ind.sma50 && ind.sma50 > ind.sma200) bull += 1;
  if (ind.sma50 && ind.sma200 && ind.currentPrice < ind.sma50 && ind.sma50 < ind.sma200) bear += 1;

  if ((ind.volumeRatio ?? 0) > config.volThresh) {
    if (asset.changePercent >= 0) bull += 1;
    else bear += 1;
  }

  const net = bull - bear;

  if (net >= 4) return { recommendation: 'STRONG BUY', net, confidence: 'high', points };
  if (net >= config.minConfluence) return { recommendation: 'BUY', net, confidence: 'medium', points };
  if (net <= -4) return { recommendation: 'STRONG SELL', net, confidence: 'high', points };
  if (net <= -config.minConfluence) return { recommendation: 'SELL', net, confidence: 'medium', points };
  return { recommendation: 'HOLD', net, confidence: 'low', points };
};
