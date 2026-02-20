const sma = (closes, period) => {
  if (!Array.isArray(closes) || closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((acc, value) => acc + Number(value || 0), 0) / period;
};

const rsi = (closes, period = 14) => {
  if (!Array.isArray(closes) || closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i += 1) {
    const prev = Number(closes[i - 1]);
    const curr = Number(closes[i]);
    if (!Number.isFinite(prev) || !Number.isFinite(curr)) return null;
    const diff = curr - prev;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
};

const atr = (bars, period = 14) => {
  if (!Array.isArray(bars) || bars.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < bars.length; i += 1) {
    const prevClose = Number(bars[i - 1]?.close);
    const high = Number(bars[i]?.high);
    const low = Number(bars[i]?.low);
    if (!Number.isFinite(prevClose) || !Number.isFinite(high) || !Number.isFinite(low)) return null;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  return slice.reduce((acc, value) => acc + value, 0) / period;
};

const volatility20d = (closes) => {
  if (!Array.isArray(closes) || closes.length < 21) return null;
  const returns = [];
  for (let i = closes.length - 20; i < closes.length; i += 1) {
    const prev = Number(closes[i - 1]);
    const curr = Number(closes[i]);
    if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev === 0) return null;
    returns.push((curr - prev) / prev);
  }
  const mean = returns.reduce((acc, value) => acc + value, 0) / returns.length;
  const variance = returns.reduce((acc, value) => acc + (value - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(252);
};

const perf20d = (closes) => {
  if (!Array.isArray(closes) || closes.length < 21) return null;
  const first = Number(closes[closes.length - 21]);
  const last = Number(closes[closes.length - 1]);
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
  return last / first - 1;
};

const relativeStrength20d = (symbolCloses, spyCloses) => {
  const symbolPerf = perf20d(symbolCloses);
  const spyPerf = perf20d(spyCloses);
  if (!Number.isFinite(symbolPerf) || !Number.isFinite(spyPerf)) return null;
  return symbolPerf - spyPerf;
};

const calculateMetrics = ({ bars = [], spyCloses = [] } = {}) => {
  const closes = (Array.isArray(bars) ? bars : [])
    .map((bar) => Number(bar?.close))
    .filter((value) => Number.isFinite(value));
  return {
    sma_20: sma(closes, 20),
    sma_50: sma(closes, 50),
    sma_200: sma(closes, 200),
    rsi_14: rsi(closes, 14),
    atr_14: atr(bars, 14),
    volatility_20d: volatility20d(closes),
    relative_strength: relativeStrength20d(closes, spyCloses)
  };
};

module.exports = { sma, rsi, atr, volatility20d, relativeStrength20d, calculateMetrics };
