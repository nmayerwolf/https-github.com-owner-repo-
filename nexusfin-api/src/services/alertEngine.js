const { calculateIndicators } = require('../engine/analysis');
const { calculateConfluence } = require('../engine/confluence');

const DEFAULT_CONFIG = {
  rsiOS: 30,
  rsiOB: 70,
  volThresh: 2,
  minConfluence: 2
};

const nowEpoch = () => Math.floor(Date.now() / 1000);

const mapRecommendationToType = (recommendation) => {
  if (recommendation.includes('BUY')) return 'opportunity';
  if (recommendation.includes('SELL')) return 'bearish';
  return null;
};

const computeAdaptiveStops = (price, atr, rsi) => {
  if (!price || !atr) return { stopLoss: null, takeProfit: null };
  const multiplier = rsi > 60 ? 2.0 : rsi < 40 ? 2.5 : 2.2;
  return {
    stopLoss: price - atr * multiplier,
    takeProfit: price + atr * multiplier * 2.5
  };
};

const mergeConfig = (row = {}) => ({
  ...DEFAULT_CONFIG,
  rsiOS: Number(row.rsi_os ?? DEFAULT_CONFIG.rsiOS),
  rsiOB: Number(row.rsi_ob ?? DEFAULT_CONFIG.rsiOB),
  volThresh: Number(row.vol_thresh ?? DEFAULT_CONFIG.volThresh),
  minConfluence: Number(row.min_confluence ?? DEFAULT_CONFIG.minConfluence),
  sectors: Array.isArray(row.sectors) ? row.sectors : []
});

const toNumberArray = (input) => (Array.isArray(input) ? input.map((x) => Number(x)).filter((x) => Number.isFinite(x)) : []);

const createAlertEngine = ({ query, finnhub, wsHub, pushNotifier = null, logger = console }) => {
  const hasRecentDuplicate = async ({ userId, symbol, type, recommendation }) => {
    const exists = await query(
      `SELECT id FROM alerts
       WHERE user_id = $1
         AND symbol = $2
         AND type = $3
         AND recommendation = $4
         AND created_at > NOW() - INTERVAL '4 hours'
       LIMIT 1`,
      [userId, symbol, type, recommendation]
    );
    return Boolean(exists.rows.length);
  };

  const insertAlert = async (payload) => {
    const inserted = await query(
      `INSERT INTO alerts
         (user_id, symbol, name, type, recommendation, confidence,
          confluence_bull, confluence_bear, signals,
          price_at_alert, stop_loss, take_profit,
          snapshot, notified)
       VALUES
         ($1, $2, $3, $4, $5, $6,
          $7, $8, $9::jsonb,
          $10, $11, $12,
          $13::jsonb, $14)
       RETURNING id, symbol, type, recommendation, confidence, price_at_alert, stop_loss, take_profit, created_at`,
      [
        payload.userId,
        payload.symbol,
        payload.name,
        payload.type,
        payload.recommendation,
        payload.confidence,
        payload.confluenceBull,
        payload.confluenceBear,
        JSON.stringify(payload.signals || []),
        payload.priceAtAlert,
        payload.stopLoss,
        payload.takeProfit,
        JSON.stringify(payload.snapshot || {}),
        false
      ]
    );
    return inserted.rows[0];
  };

  const setNotified = async (alertId, notified) => {
    await query('UPDATE alerts SET notified = $2 WHERE id = $1', [alertId, Boolean(notified)]);
  };

  const notifyAndBroadcast = async ({ userId, savedAlert }) => {
    wsHub?.broadcastAlert?.({ userId, ...savedAlert });

    let sent = 0;
    if (pushNotifier?.notifyAlert) {
      try {
        const out = await pushNotifier.notifyAlert({
          userId,
          alert: {
            id: savedAlert.id,
            symbol: savedAlert.symbol,
            type: savedAlert.type,
            recommendation: savedAlert.recommendation,
            confidence: savedAlert.confidence,
            priceAtAlert: Number(savedAlert.price_at_alert),
            stopLoss: savedAlert.stop_loss ? Number(savedAlert.stop_loss) : null,
            takeProfit: savedAlert.take_profit ? Number(savedAlert.take_profit) : null
          }
        });
        sent = Number(out?.sent || 0);
      } catch (error) {
        logger.warn?.(`[alertEngine] push failed (${savedAlert.id})`, error?.message || error);
      }
    }

    await setNotified(savedAlert.id, sent > 0);
  };

  const buildAssetFromMarketData = (symbol, quoteData, candlesData) => {
    const closes = toNumberArray(candlesData?.c);
    const highs = toNumberArray(candlesData?.h);
    const lows = toNumberArray(candlesData?.l);
    const volumes = toNumberArray(candlesData?.v);

    if (closes.length < 30 || highs.length < 30 || lows.length < 30) {
      return null;
    }

    const indicators = calculateIndicators({ closes, highs, lows, volumes });
    if (!indicators) return null;

    const price = Number(quoteData?.c ?? indicators.currentPrice);
    const previousClose = Number(quoteData?.pc ?? closes[closes.length - 2] ?? price);
    const changePercent = previousClose ? ((price - previousClose) / previousClose) * 100 : 0;

    return {
      symbol,
      name: symbol,
      price,
      changePercent,
      indicators
    };
  };

  const buildSignalAlertPayload = ({ userId, asset, confluence }) => {
    const type = mapRecommendationToType(confluence.recommendation);
    if (!type) return null;

    const { stopLoss, takeProfit } = computeAdaptiveStops(asset.price, asset.indicators.atr, asset.indicators.rsi);

    return {
      userId,
      symbol: asset.symbol,
      name: asset.name,
      type,
      recommendation: confluence.recommendation,
      confidence: confluence.confidence,
      confluenceBull: confluence.bull,
      confluenceBear: confluence.bear,
      signals: confluence.signals,
      priceAtAlert: asset.price,
      stopLoss,
      takeProfit,
      snapshot: {
        rsi: asset.indicators.rsi,
        macd: asset.indicators.macd,
        sma50: asset.indicators.sma50,
        sma200: asset.indicators.sma200,
        atr: asset.indicators.atr,
        bollingerUpper: asset.indicators.bollinger?.upper ?? null,
        bollingerLower: asset.indicators.bollinger?.lower ?? null,
        volumeRatio: asset.indicators.volumeRatio
      }
    };
  };

  const buildStopLossPayload = ({ userId, position, asset }) => {
    if (!asset?.indicators?.atr || !position?.buy_price) return null;

    const { stopLoss } = computeAdaptiveStops(Number(position.buy_price), asset.indicators.atr, asset.indicators.rsi);
    if (!stopLoss || asset.price > stopLoss) return null;

    const drawdown = ((asset.price - Number(position.buy_price)) / Number(position.buy_price)) * 100;

    return {
      userId,
      symbol: position.symbol,
      name: position.name,
      type: 'stop_loss',
      recommendation: 'STOP LOSS',
      confidence: 'high',
      confluenceBull: 0,
      confluenceBear: 0,
      signals: [{ indicator: 'ATR', type: 'risk', detail: `Precio tocó stop (${stopLoss.toFixed(2)})` }],
      priceAtAlert: asset.price,
      stopLoss,
      takeProfit: null,
      snapshot: {
        drawdown,
        buyPrice: Number(position.buy_price),
        quantity: Number(position.quantity)
      }
    };
  };

  const fetchAssetSnapshot = async (symbol, category = null) => {
    const to = nowEpoch();
    const from = to - 60 * 60 * 24 * 260;
    const normalizedCategory = String(category || '').toLowerCase();
    let quoteSymbol = symbol;
    let quotePromise = null;
    let candlesPromise = null;

    if (normalizedCategory === 'crypto' || /USDT$/.test(String(symbol || '').toUpperCase())) {
      quoteSymbol = `BINANCE:${symbol}`;
      quotePromise = finnhub.quote(quoteSymbol);
      candlesPromise = finnhub.cryptoCandles(symbol, 'D', from, to);
    } else if (normalizedCategory === 'fx' || String(symbol || '').includes('_')) {
      const [base, quote] = String(symbol || '').split('_');
      if (!base || !quote) return null;
      quoteSymbol = `OANDA:${base}_${quote}`;
      quotePromise = finnhub.quote(quoteSymbol);
      candlesPromise = finnhub.forexCandles(base, quote, 'D', from, to);
    } else {
      quotePromise = finnhub.quote(quoteSymbol);
      candlesPromise = finnhub.candles(symbol, 'D', from, to);
    }

    const [quoteData, candlesData] = await Promise.all([quotePromise, candlesPromise]);
    if (candlesData?.s !== 'ok') return null;

    return buildAssetFromMarketData(symbol, quoteData, candlesData);
  };

  const runUserCycle = async (userId, options = {}) => {
    const configRow =
      options.configOverride ||
      (
        await query(
          'SELECT sectors, rsi_os, rsi_ob, vol_thresh, min_confluence FROM user_configs WHERE user_id = $1',
          [userId]
        )
      ).rows?.[0] ||
      {};

    const allWatchlistRows =
      options.watchlistOverride ||
      (
        await query('SELECT symbol, name, category FROM watchlist_items WHERE user_id = $1 ORDER BY added_at ASC LIMIT 50', [userId])
      ).rows ||
      [];

    const categoryFilter = Array.isArray(options.categories) && options.categories.length ? new Set(options.categories.map((x) => String(x || '').toLowerCase())) : null;
    const watchlistRows = categoryFilter
      ? allWatchlistRows.filter((item) => categoryFilter.has(String(item?.category || '').toLowerCase()))
      : allWatchlistRows;

    const activePositions =
      options.includeStopLoss === false
        ? []
        : options.positionsOverride ||
          (
            await query(
              'SELECT id, symbol, name, buy_price, quantity FROM positions WHERE user_id = $1 AND sell_date IS NULL AND deleted_at IS NULL',
              [userId]
            )
          ).rows ||
          [];

    const config = mergeConfig(configRow);
    const snapshotsBySymbol = new Map();
    const created = [];

    for (const item of watchlistRows) {
      const symbol = String(item.symbol || '').toUpperCase();
      if (!symbol) continue;

      let snapshot;
      try {
        snapshot = options.assetSnapshotsOverride?.[symbol] || (await fetchAssetSnapshot(symbol, item.category));
      } catch (error) {
        logger.warn?.(`[alertEngine] symbol ${symbol} skipped`, error?.message || error);
        continue;
      }

      if (!snapshot) continue;
      snapshot.name = item.name || symbol;
      snapshot.category = item.category || null;
      snapshotsBySymbol.set(symbol, snapshot);

      const confluence = calculateConfluence(snapshot, config);
      const payload = buildSignalAlertPayload({ userId, asset: snapshot, confluence });
      if (!payload) continue;

      const duplicate = await hasRecentDuplicate(payload);
      if (duplicate) continue;

      const saved = await insertAlert(payload);
      created.push(saved);
      await notifyAndBroadcast({ userId, savedAlert: saved });
    }

    for (const position of activePositions) {
      const symbol = String(position.symbol || '').toUpperCase();
      if (!symbol) continue;

      let snapshot = snapshotsBySymbol.get(symbol);
      if (!snapshot) {
        try {
          snapshot = options.assetSnapshotsOverride?.[symbol] || (await fetchAssetSnapshot(symbol, position.category));
        } catch {
          snapshot = null;
        }
      }
      if (!snapshot) continue;

      const payload = buildStopLossPayload({ userId, position, asset: snapshot });
      if (!payload) continue;

      const duplicate = await hasRecentDuplicate(payload);
      if (duplicate) continue;

      const saved = await insertAlert(payload);
      created.push(saved);
      await notifyAndBroadcast({ userId, savedAlert: saved });
    }

    return {
      userId,
      watchlistScanned: watchlistRows.length,
      positionsScanned: activePositions.length,
      alertsCreated: created.length
    };
  };

  const runGlobalCycle = async (options = {}) => {
    const users = await query('SELECT id FROM users ORDER BY created_at ASC');
    const results = [];

    for (const user of users.rows) {
      try {
        const out = await runUserCycle(user.id, options);
        results.push(out);
      } catch (error) {
        logger.error?.(`[alertEngine] user cycle failed (${user.id})`, error?.message || error);
      }
    }

    return {
      usersScanned: users.rows.length,
      alertsCreated: results.reduce((acc, item) => acc + item.alertsCreated, 0),
      results
    };
  };

  return {
    runUserCycle,
    runGlobalCycle,
    buildSignalAlertPayload,
    buildStopLossPayload,
    buildAssetFromMarketData,
    mapRecommendationToType,
    computeAdaptiveStops,
    mergeConfig
  };
};

module.exports = { createAlertEngine, mapRecommendationToType, computeAdaptiveStops, mergeConfig };
