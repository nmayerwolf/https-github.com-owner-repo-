const sma = (arr, period) => {
  if (arr.length < period) return null;
  return arr.slice(-period).reduce((a, b) => a + b, 0) / period;
};

const emaSeries = (arr, period) => {
  if (arr.length < period) return [];
  const k = 2 / (period + 1);
  const out = [];
  let prev = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out.push(prev);
  for (let i = period; i < arr.length; i += 1) {
    prev = arr[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
};

const rsi = (closes, period = 14) => {
  if (closes.length <= period) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = closes[i] - closes[i - 1];
    gains += diff > 0 ? diff : 0;
    losses += diff < 0 ? -diff : 0;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

const macd = (closes) => {
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  if (!ema12.length || !ema26.length) return null;

  const len = Math.min(ema12.length, ema26.length);
  const fast = ema12.slice(-len);
  const slow = ema26.slice(-len);
  const line = fast.map((v, i) => v - slow[i]);
  const signalSeries = emaSeries(line, 9);
  if (!signalSeries.length) return null;
  const signal = signalSeries[signalSeries.length - 1];
  const macdValue = line[line.length - 1];

  return {
    line: macdValue,
    signal,
    histogram: macdValue - signal
  };
};

const bollinger = (closes, period = 20, stdev = 2) => {
  if (closes.length < period) return null;
  const base = closes.slice(-period);
  const mean = base.reduce((a, b) => a + b, 0) / period;
  const variance = base.reduce((acc, value) => acc + (value - mean) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  return {
    middle: mean,
    upper: mean + stdev * sd,
    lower: mean - stdev * sd
  };
};

const atr = (highs, lows, closes, period = 14) => {
  if (highs.length <= period || lows.length <= period || closes.length <= period) return null;
  const trs = [];
  for (let i = 1; i < highs.length; i += 1) {
    const hl = highs[i] - lows[i];
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    trs.push(Math.max(hl, hc, lc));
  }
  if (trs.length < period) return null;

  let value = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i += 1) {
    value = (value * (period - 1) + trs[i]) / period;
  }
  return value;
};

const volumeRatio = (volumes) => {
  if (!volumes?.length || volumes.length < 20) return null;
  const avg20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const current = volumes[volumes.length - 1];
  if (!avg20) return null;
  return current / avg20;
};

const calculateIndicators = ({ closes = [], highs = [], lows = [], volumes = [] }) => {
  if (closes.length < 30) return null;
  return {
    rsi: rsi(closes, 14),
    macd: macd(closes),
    bollinger: bollinger(closes, 20, 2),
    sma50: sma(closes, 50),
    sma200: sma(closes, 200),
    atr: atr(highs, lows, closes, 14),
    volumeRatio: volumeRatio(volumes),
    currentPrice: closes[closes.length - 1]
  };
};

module.exports = { calculateIndicators };
