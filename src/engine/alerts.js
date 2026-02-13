import { calculateConfluence } from './confluence';

const computeStops = (price, atr, rsi) => {
  if (!price || !atr) return { stopLoss: null, takeProfit: null };
  const mult = rsi > 60 ? 2 : rsi < 40 ? 2.5 : 2.2;
  return {
    stopLoss: price - atr * mult,
    takeProfit: price + atr * mult * 2.5
  };
};

export const buildAlerts = (assets, config) => {
  const alerts = [];

  assets.forEach((asset) => {
    if (!asset.indicators) return;
    const conf = calculateConfluence(asset, config);
    const stops = computeStops(asset.price, asset.indicators.atr, asset.indicators.rsi);

    if (conf.recommendation.includes('BUY')) {
      alerts.push({
        id: `op-${asset.symbol}`,
        type: 'compra',
        priority: 2,
        symbol: asset.symbol,
        title: `${conf.recommendation} en ${asset.symbol}`,
        confidence: conf.confidence,
        net: conf.net,
        points: conf.points,
        ...stops
      });
    }

    if (conf.recommendation.includes('SELL')) {
      alerts.push({
        id: `sell-${asset.symbol}`,
        type: 'venta',
        priority: 2,
        symbol: asset.symbol,
        title: `${conf.recommendation} en ${asset.symbol}`,
        confidence: conf.confidence,
        net: conf.net,
        points: conf.points,
        ...stops
      });
    }
  });

  return alerts.sort((a, b) => b.priority - a.priority);
};

export const stopLossAlerts = (positions, assetsBySymbol) => {
  return positions
    .filter((p) => !p.sellDate)
    .map((p) => {
      const asset = assetsBySymbol[p.symbol];
      if (!asset?.indicators?.atr || !asset.price || !p.buyPrice) return null;

      const rsi = asset.indicators.rsi;
      const mult = rsi > 60 ? 2 : rsi < 40 ? 2.5 : 2.2;
      const sl = p.buyPrice - asset.indicators.atr * mult;
      const drawdown = ((asset.price - p.buyPrice) / p.buyPrice) * 100;

      if (asset.price <= sl) {
        return {
          id: `sl-${p.id}`,
          type: 'stoploss',
          priority: 3,
          symbol: p.symbol,
          title: `Stop Loss alcanzado en ${p.symbol}`,
          drawdown,
          stopLoss: sl
        };
      }
      return null;
    })
    .filter(Boolean);
};
