const { calculateIndicators } = require('../engine/analysis');
const { calculateConfluence } = require('../engine/confluence');
const { MARKET_UNIVERSE } = require('../constants/marketUniverse');

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
const toFinite = (value) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : null;
};
const buildSyntheticCandles = (price, previousClose = null, points = 90) => {
  const current = toFinite(price);
  const prev = toFinite(previousClose);
  if (!current || current <= 0) return null;
  const start = prev && prev > 0 ? prev : current;
  const step = points > 1 ? (current - start) / (points - 1) : 0;
  const closes = Array.from({ length: points }, (_, idx) => Number((start + step * idx).toFixed(6)));
  return {
    s: 'ok',
    c: closes,
    h: closes.map((v) => Number((v * 1.002).toFixed(6))),
    l: closes.map((v) => Number((v * 0.998).toFixed(6))),
    v: closes.map(() => 0)
  };
};

const isFinnhubUnavailable = (error) =>
  error?.code === 'FINNHUB_ENDPOINT_FORBIDDEN' ||
  error?.code === 'FINNHUB_RATE_LIMIT' ||
  error?.status === 403 ||
  error?.status === 429;

const symbolBasePrice = (symbol) => {
  const normalized = String(symbol || '').toUpperCase();
  if (!normalized) return 100;

  if (normalized.endsWith('USDT')) {
    if (normalized.startsWith('BTC')) return 60000;
    if (normalized.startsWith('ETH')) return 3000;
    if (normalized.startsWith('SOL')) return 150;
    return 100;
  }

  if (normalized.includes('_')) {
    if (normalized === 'USD_JPY') return 150;
    if (normalized === 'USD_CHF') return 0.9;
    if (normalized === 'USD_CAD') return 1.35;
    return 1.1;
  }

  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  return 40 + (hash % 460);
};

const syntheticQuote = (symbol, retryAfterMs = 0) => {
  const c = Number(symbolBasePrice(symbol).toFixed(6));
  return {
    c,
    pc: c,
    d: 0,
    dp: 0,
    h: c,
    l: c,
    o: c,
    t: Math.floor(Date.now() / 1000),
    fallback: true,
    retryAfterMs: Number(retryAfterMs) || 0
  };
};

const resolveRealtimeQuoteSymbol = (symbol) => {
  const normalized = String(symbol || '').trim().toUpperCase();
  if (!normalized) return { quoteSymbol: null, market: null };
  if (normalized.includes('_')) return { quoteSymbol: `OANDA:${normalized}`, market: 'fx' };
  if (normalized.endsWith('USDT')) return { quoteSymbol: `BINANCE:${normalized}`, market: 'crypto' };
  return { quoteSymbol: normalized, market: 'equity' };
};

const evaluateOutcome = ({ type, priceAtAlert, stopLoss, takeProfit, currentPrice }) => {
  const price = toFinite(currentPrice);
  const base = toFinite(priceAtAlert);
  if (!price || !base || base <= 0) return { outcome: 'open', shouldUpdate: false };

  const sl = toFinite(stopLoss);
  const tp = toFinite(takeProfit);
  const movePct = ((price - base) / base) * 100;
  const normalizedType = String(type || '').toLowerCase();

  if (normalizedType === 'opportunity') {
    if (tp != null && price >= tp) return { outcome: 'win', shouldUpdate: true };
    if (sl != null && price <= sl) return { outcome: 'loss', shouldUpdate: true };
    if (movePct >= 5) return { outcome: 'win', shouldUpdate: true };
    if (movePct <= -5) return { outcome: 'loss', shouldUpdate: true };
    return { outcome: 'open', shouldUpdate: false };
  }

  if (normalizedType === 'bearish') {
    if (tp != null && price <= tp) return { outcome: 'win', shouldUpdate: true };
    if (sl != null && price >= sl) return { outcome: 'loss', shouldUpdate: true };
    if (movePct <= -5) return { outcome: 'win', shouldUpdate: true };
    if (movePct >= 5) return { outcome: 'loss', shouldUpdate: true };
    return { outcome: 'open', shouldUpdate: false };
  }

  return { outcome: 'open', shouldUpdate: false };
};

const uniqUpper = (list = []) => Array.from(new Set(list.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean)));

const mapUserSectorsToCategories = (sectors = []) => {
  const values = Array.isArray(sectors) ? sectors.map((x) => String(x || '').toLowerCase()) : [];
  const out = new Set(['equity', 'etf']);
  if (values.includes('crypto')) out.add('crypto');
  if (values.includes('metals')) out.add('metal');
  if (values.includes('bonds')) out.add('bond');
  if (values.includes('fx')) out.add('fx');
  if (values.includes('energy')) out.add('commodity');
  return out;
};

const buildDiscoverySymbols = ({
  sectors = [],
  skip = [],
  categories = [],
  limit = 12
}) => {
  const skipSet = new Set(skip.map((x) => String(x || '').toUpperCase()));
  const allowedByUser = mapUserSectorsToCategories(sectors);
  const forced = new Set(categories.map((x) => String(x || '').toLowerCase()));
  const source = MARKET_UNIVERSE.filter((asset) => {
    const category = String(asset?.category || '').toLowerCase();
    if (forced.size && !forced.has(category)) return false;
    if (!allowedByUser.has(category)) return false;
    return true;
  });

  const picks = [];
  for (const item of source) {
    const symbol = String(item?.symbol || '').toUpperCase();
    if (!symbol || skipSet.has(symbol)) continue;
    picks.push(symbol);
    if (picks.length >= limit) break;
  }
  return picks;
};

const createAlertEngine = ({ query, finnhub, wsHub, pushNotifier = null, aiAgent = null, logger = console }) => {
  const hasRecentDuplicate = async ({ userId, symbol, type }) => {
    const exists = await query(
      `SELECT id FROM alerts
       WHERE user_id = $1
         AND symbol = $2
         AND type = $3
         AND created_at > NOW() - INTERVAL '4 hours'
       LIMIT 1`,
      [userId, symbol, type]
    );
    return Boolean(exists.rows.length);
  };

  const directionFromType = (type) => (String(type || '').toLowerCase() === 'bearish' ? 'bear' : 'bull');

  const getCooldown = async ({ symbol, direction }) => {
    try {
      const out = await query('SELECT rejection_count, cooldown_until FROM agent_cooldowns WHERE symbol = $1 AND direction = $2', [symbol, direction]);
      return out.rows[0] || null;
    } catch {
      return null;
    }
  };

  const setCooldown = async ({ symbol, direction, rejectionCount, rejectionThreshold, rejectionCooldownHours }) => {
    try {
      const cooldownUntil =
        rejectionCount >= rejectionThreshold
          ? new Date(Date.now() + rejectionCooldownHours * 60 * 60 * 1000).toISOString()
          : null;

      await query(
        `INSERT INTO agent_cooldowns (symbol, direction, last_alert_at, rejection_count, cooldown_until)
         VALUES ($1, $2, NOW(), $3, $4)
         ON CONFLICT (symbol, direction) DO UPDATE
         SET last_alert_at = NOW(),
             rejection_count = EXCLUDED.rejection_count,
             cooldown_until = EXCLUDED.cooldown_until`,
        [symbol, direction, rejectionCount, cooldownUntil]
      );
    } catch {
      // noop when table is not available yet
    }
  };

  const clearCooldownRejections = async ({ symbol, direction }) => {
    try {
      await query(
        `INSERT INTO agent_cooldowns (symbol, direction, last_alert_at, rejection_count, cooldown_until)
         VALUES ($1, $2, NOW(), 0, NULL)
         ON CONFLICT (symbol, direction) DO UPDATE
         SET last_alert_at = NOW(),
             rejection_count = 0,
             cooldown_until = NULL`,
        [symbol, direction]
      );
    } catch {
      // noop when table is not available yet
    }
  };

  const isInRejectionCooldown = (cooldownRow) => {
    if (!cooldownRow?.cooldown_until) return false;
    const until = new Date(cooldownRow.cooldown_until).getTime();
    return Number.isFinite(until) && until > Date.now();
  };

  const getDailyCount = async (userId) => {
    try {
      const out = await query('SELECT count FROM daily_alert_counts WHERE user_id = $1 AND alert_date = CURRENT_DATE', [userId]);
      return Number(out.rows[0]?.count || 0);
    } catch {
      return 0;
    }
  };

  const bumpDailyCount = async (userId) => {
    try {
      await query(
        `INSERT INTO daily_alert_counts (user_id, alert_date, count)
         VALUES ($1, CURRENT_DATE, 1)
         ON CONFLICT (user_id, alert_date) DO UPDATE
         SET count = daily_alert_counts.count + 1`,
        [userId]
      );
    } catch {
      // noop when table is not available yet
    }
  };

  const insertAlert = async (payload) => {
    const inserted = await query(
      `INSERT INTO alerts
         (user_id, symbol, name, type, recommendation, confidence,
          confluence_bull, confluence_bear, signals,
          price_at_alert, stop_loss, take_profit,
          snapshot, notified, ai_validated, ai_confidence, ai_reasoning, ai_adjusted_stop, ai_adjusted_target, ai_model, ai_thesis, cron_run_id)
       VALUES
         ($1, $2, $3, $4, $5, $6,
          $7, $8, $9::jsonb,
          $10, $11, $12,
          $13::jsonb, $14, $15, $16, $17, $18, $19, $20, $21::jsonb, $22)
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
        false,
        Boolean(payload.aiValidated),
        payload.aiConfidence || null,
        payload.aiReasoning || null,
        payload.aiAdjustedStop ?? null,
        payload.aiAdjustedTarget ?? null,
        payload.aiModel || null,
        JSON.stringify(payload.aiThesis || null),
        payload.cronRunId || null
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
    const normalizedCategory = String(category || '').toLowerCase();
    let quoteSymbol = symbol;
    let quoteData = null;

    if (normalizedCategory === 'crypto' || /USDT$/.test(String(symbol || '').toUpperCase())) {
      quoteSymbol = `BINANCE:${symbol}`;
    } else if (normalizedCategory === 'fx' || String(symbol || '').includes('_')) {
      const [base, quote] = String(symbol || '').split('_');
      if (!base || !quote) return null;
      quoteSymbol = `OANDA:${base}_${quote}`;
    }

    try {
      quoteData = await finnhub.quote(quoteSymbol);
    } catch (error) {
      if (!isFinnhubUnavailable(error)) throw error;
      quoteData = syntheticQuote(symbol, error?.retryAfterMs);
    }

    const candlesData = buildSyntheticCandles(quoteData?.c, quoteData?.pc);
    if (!candlesData?.c?.length) return null;

    return buildAssetFromMarketData(symbol, quoteData, candlesData);
  };

  const fetchCurrentPrice = async (symbol) => {
    const { quoteSymbol } = resolveRealtimeQuoteSymbol(symbol);
    if (!quoteSymbol) return null;
    const out = await finnhub.quote(quoteSymbol);
    return toFinite(out?.c);
  };

  const runUserCycle = async (userId, options = {}) => {
    const metrics = {
      candidatesFound: 0,
      aiValidations: 0,
      aiConfirmations: 0,
      aiRejections: 0,
      aiFailures: 0,
      symbolsScanned: 0
    };
    const configRow =
      options.configOverride ||
      (
        await query(
          'SELECT sectors, risk_profile, horizon, rsi_os, rsi_ob, vol_thresh, min_confluence FROM user_configs WHERE user_id = $1',
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
              'SELECT id, symbol, name, category, buy_price, quantity FROM positions WHERE user_id = $1 AND sell_date IS NULL AND deleted_at IS NULL',
              [userId]
            )
          ).rows ||
          [];

    const config = mergeConfig(configRow);
    const snapshotsBySymbol = new Map();
    const latestSignalBySymbol = new Map();
    const similarStatsCache = new Map();
    const recentNews =
      options.newsOverride ||
      (typeof finnhub.generalNews === 'function' ? await finnhub.generalNews('general', 0).catch(() => []) : []);
    const created = [];
    let dailyCount = await getDailyCount(userId);
    const maxDailyAlerts = Number(options.maxAlertsPerUserPerDay || 10);
    const rejectionCooldownHours = Number(options.rejectionCooldownHours || 24);
    const rejectionThreshold = Number(options.rejectionThreshold || 3);

    const watchlistBySymbol = new Map();
    for (const row of watchlistRows) {
      const symbol = String(row?.symbol || '').toUpperCase();
      if (!symbol) continue;
      watchlistBySymbol.set(symbol, row);
    }

    const positionBySymbol = new Map();
    for (const row of activePositions) {
      const symbol = String(row?.symbol || '').toUpperCase();
      if (!symbol || positionBySymbol.has(symbol)) continue;
      positionBySymbol.set(symbol, row);
    }

    const knownSymbols = uniqUpper([...watchlistBySymbol.keys(), ...positionBySymbol.keys()]);
    const discoveryEnabled = options.enableDiscoverySignals === true;
    const discoveryLimit = Number(options.discoverySymbolsLimit || 10);
    const discoveredSymbols = discoveryEnabled
      ? buildDiscoverySymbols({
          sectors: config.sectors,
          skip: knownSymbols,
          categories: categoryFilter ? [...categoryFilter] : [],
          limit: discoveryLimit
        })
      : [];

    const scanList = [];
    const pushScan = (symbol, source) => {
      const upper = String(symbol || '').toUpperCase();
      if (!upper || scanList.some((item) => item.symbol === upper)) return;
      const watch = watchlistBySymbol.get(upper);
      const pos = positionBySymbol.get(upper);
      const marketRef = MARKET_UNIVERSE.find((item) => String(item?.symbol || '').toUpperCase() === upper);
      const category = String(watch?.category || pos?.category || marketRef?.category || '').toLowerCase();
      if (categoryFilter && category && !categoryFilter.has(category)) return;
      scanList.push({
        symbol: upper,
        name: watch?.name || pos?.name || marketRef?.name || upper,
        category: category || null,
        source
      });
    };

    [...positionBySymbol.keys()].forEach((symbol) => pushScan(symbol, 'position'));
    [...watchlistBySymbol.keys()].forEach((symbol) => pushScan(symbol, 'watchlist'));
    discoveredSymbols.forEach((symbol) => pushScan(symbol, 'discovery'));

    const portfolioSummary = activePositions.reduce(
      (acc, row) => {
        const qty = Number(row?.quantity || 0);
        const buyPrice = Number(row?.buy_price || 0);
        if (!Number.isFinite(qty) || !Number.isFinite(buyPrice)) return acc;
        acc.positionsCount += 1;
        acc.totalValue += qty * buyPrice;
        acc.totalCost += qty * buyPrice;
        return acc;
      },
      { positionsCount: 0, totalValue: 0, totalCost: 0, totalPnlPct: 0 }
    );
    portfolioSummary.totalPnlPct = 0;

    const loadPreviousSimilar = async (symbol, type) => {
      const key = `${symbol}:${type}`;
      if (similarStatsCache.has(key)) return similarStatsCache.get(key);
      const out = await query(
        `SELECT
           COUNT(*)::int AS count,
           COUNT(*) FILTER (WHERE outcome = 'win')::int AS wins,
           COUNT(*) FILTER (WHERE outcome = 'loss')::int AS losses
         FROM alerts
         WHERE user_id = $1 AND symbol = $2 AND type = $3`,
        [userId, symbol, type]
      );
      const row = out.rows?.[0] || {};
      const wins = Number(row.wins || 0);
      const losses = Number(row.losses || 0);
      const stats = {
        count: Number(row.count || 0),
        winRatePct: wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0
      };
      similarStatsCache.set(key, stats);
      return stats;
    };

    const loadLastSignalSummary = async (symbol) => {
      if (latestSignalBySymbol.has(symbol)) return latestSignalBySymbol.get(symbol);
      const out = await query(
        `SELECT created_at, outcome, price_at_alert, outcome_price
         FROM alerts
         WHERE user_id = $1 AND symbol = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, symbol]
      );
      if (!out.rows?.length) {
        latestSignalBySymbol.set(symbol, 'sin historial');
        return 'sin historial';
      }
      const row = out.rows[0];
      const createdAt = new Date(row.created_at);
      const daysAgo = Math.max(0, Math.round((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
      const pct =
        Number(row.price_at_alert) > 0 && Number.isFinite(Number(row.outcome_price))
          ? (((Number(row.outcome_price) - Number(row.price_at_alert)) / Number(row.price_at_alert)) * 100).toFixed(2)
          : null;
      const summary = pct == null ? `hace ${daysAgo}d, outcome=${row.outcome || 'open'}` : `hace ${daysAgo}d, outcome=${row.outcome || 'open'}, variacion=${pct}%`;
      latestSignalBySymbol.set(symbol, summary);
      return summary;
    };

    const pickNewsForSymbol = (symbol) => {
      const list = Array.isArray(recentNews) ? recentNews : [];
      if (!symbol) return list.slice(0, 5);
      const upper = String(symbol).toUpperCase();
      const matching = list.filter((item) => {
        const text = `${item?.headline || ''} ${item?.summary || ''} ${item?.related || ''}`.toUpperCase();
        return text.includes(upper);
      });
      return (matching.length ? matching : list).slice(0, 5);
    };

    for (const item of scanList) {
      const symbol = String(item.symbol || '').toUpperCase();
      if (!symbol) continue;
      metrics.symbolsScanned += 1;

      let snapshot;
      try {
        snapshot = options.assetSnapshotsOverride?.[symbol] || (await fetchAssetSnapshot(symbol, item.category));
      } catch (error) {
        if (!error?.silent) logger.warn?.(`[alertEngine] symbol ${symbol} skipped`, error?.message || error);
        continue;
      }

      if (!snapshot) continue;
      snapshot.name = item.name || symbol;
      snapshot.category = item.category || null;
      snapshotsBySymbol.set(symbol, snapshot);

      const confluence = calculateConfluence(snapshot, config);
      const payload = buildSignalAlertPayload({ userId, asset: snapshot, confluence });
      if (!payload) continue;
      metrics.candidatesFound += 1;

      const duplicate = await hasRecentDuplicate(payload);
      if (duplicate) continue;
      if (dailyCount >= maxDailyAlerts) continue;

      const direction = directionFromType(payload.type);
      const cooldownRow = await getCooldown({ symbol: payload.symbol, direction });
      if (isInRejectionCooldown(cooldownRow)) continue;

      if (aiAgent?.validateSignal) {
        const activePosition = positionBySymbol.get(symbol);
        const previousSimilar = await loadPreviousSimilar(symbol, payload.type);
        const lastSignalSummary = await loadLastSignalSummary(symbol);
        const aiOut = await aiAgent.validateSignal({
          candidate: payload,
          userConfig: {
            riskProfile: configRow.risk_profile || 'moderado',
            horizon: configRow.horizon || 'mediano',
            sectors: Array.isArray(configRow.sectors) ? configRow.sectors : []
          },
          context: {
            watchlistCount: watchlistRows.length,
            watchlistSymbols: [...watchlistBySymbol.keys()],
            positionForSymbol: activePosition
              ? {
                  quantity: Number(activePosition.quantity || 0),
                  buyPrice: Number(activePosition.buy_price || 0),
                  pnlPct:
                    Number(payload.priceAtAlert) > 0
                      ? (((Number(payload.priceAtAlert) - Number(activePosition.buy_price || 0)) / Number(activePosition.buy_price || 1)) * 100)
                      : 0
                }
              : null,
            portfolioSummary,
            previousSimilar,
            lastSignalSummary,
            news: pickNewsForSymbol(symbol)
          }
        });

        if (aiOut.mode === 'rejected' || aiOut.confirm === false) {
          metrics.aiValidations += 1;
          metrics.aiRejections += 1;
          const nextRejectionCount = Number(cooldownRow?.rejection_count || 0) + 1;
          await setCooldown({
            symbol: payload.symbol,
            direction,
            rejectionCount: nextRejectionCount,
            rejectionThreshold,
            rejectionCooldownHours
          });
          continue;
        }

        if (aiOut.mode === 'validated') {
          metrics.aiValidations += 1;
          metrics.aiConfirmations += 1;
          await clearCooldownRejections({ symbol: payload.symbol, direction });
        } else if (aiOut.mode === 'fallback') {
          metrics.aiFailures += 1;
        }

        payload.aiValidated = Boolean(aiOut.aiValidated);
        payload.aiConfidence = aiOut.confidence || payload.confidence;
        payload.aiReasoning = aiOut.reasoning || null;
        payload.aiAdjustedStop = aiOut.adjustedStopLoss ?? payload.stopLoss;
        payload.aiAdjustedTarget = aiOut.adjustedTarget ?? payload.takeProfit;
        payload.aiModel = aiOut.model || null;
        payload.aiThesis = aiOut.thesis || null;
        payload.stopLoss = aiOut.adjustedStopLoss ?? payload.stopLoss;
        payload.takeProfit = aiOut.adjustedTarget ?? payload.takeProfit;
        payload.confidence = aiOut.confidence || payload.confidence;
      } else {
        payload.aiValidated = false;
        payload.aiConfidence = payload.confidence;
      }

      payload.cronRunId = options.cronRunId || null;

      const saved = await insertAlert(payload);
      created.push(saved);
      dailyCount += 1;
      await bumpDailyCount(userId);
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
      dailyCount += 1;
      await bumpDailyCount(userId);
      await notifyAndBroadcast({ userId, savedAlert: saved });
    }

    return {
      userId,
      watchlistScanned: watchlistRows.length,
      discoveredScanned: discoveredSymbols.length,
      positionsScanned: activePositions.length,
      alertsCreated: created.length,
      metrics
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
      symbolsScanned: results.reduce((acc, item) => acc + Number(item?.metrics?.symbolsScanned || 0), 0),
      candidatesFound: results.reduce((acc, item) => acc + Number(item?.metrics?.candidatesFound || 0), 0),
      aiValidations: results.reduce((acc, item) => acc + Number(item?.metrics?.aiValidations || 0), 0),
      aiConfirmations: results.reduce((acc, item) => acc + Number(item?.metrics?.aiConfirmations || 0), 0),
      aiRejections: results.reduce((acc, item) => acc + Number(item?.metrics?.aiRejections || 0), 0),
      aiFailures: results.reduce((acc, item) => acc + Number(item?.metrics?.aiFailures || 0), 0),
      results
    };
  };

  const runOutcomeEvaluationCycle = async () => {
    const openAlerts = await query(
      `SELECT id, symbol, type, price_at_alert, stop_loss, take_profit
       FROM alerts
       WHERE (outcome IS NULL OR outcome = 'open')
         AND type IN ('opportunity', 'bearish')
       ORDER BY created_at DESC
       LIMIT 500`
    );

    const bySymbolPrice = new Map();
    let wins = 0;
    let losses = 0;
    let updated = 0;
    let errors = 0;

    for (const alert of openAlerts.rows) {
      try {
        const symbol = String(alert.symbol || '').toUpperCase();
        if (!bySymbolPrice.has(symbol)) {
          const live = await fetchCurrentPrice(symbol);
          bySymbolPrice.set(symbol, live);
        }
        const livePrice = bySymbolPrice.get(symbol);
        const verdict = evaluateOutcome({
          type: alert.type,
          priceAtAlert: alert.price_at_alert,
          stopLoss: alert.stop_loss,
          takeProfit: alert.take_profit,
          currentPrice: livePrice
        });

        if (!verdict.shouldUpdate) continue;

        await query(
          `UPDATE alerts
           SET outcome = $2, outcome_price = $3, outcome_date = NOW()
           WHERE id = $1`,
          [alert.id, verdict.outcome, livePrice]
        );

        updated += 1;
        if (verdict.outcome === 'win') wins += 1;
        if (verdict.outcome === 'loss') losses += 1;
      } catch (error) {
        errors += 1;
        logger.warn?.(`[alertEngine] outcome eval failed (${alert.id})`, error?.message || error);
      }
    }

    return {
      scanned: openAlerts.rows.length,
      updated,
      wins,
      losses,
      open: Math.max(0, openAlerts.rows.length - updated),
      errors
    };
  };

  return {
    runUserCycle,
    runGlobalCycle,
    runOutcomeEvaluationCycle,
    buildSignalAlertPayload,
    buildStopLossPayload,
    buildAssetFromMarketData,
    fetchCurrentPrice,
    evaluateOutcome,
    resolveRealtimeQuoteSymbol,
    mapRecommendationToType,
    computeAdaptiveStops,
    mergeConfig
  };
};

module.exports = {
  createAlertEngine,
  mapRecommendationToType,
  computeAdaptiveStops,
  mergeConfig,
  evaluateOutcome,
  resolveRealtimeQuoteSymbol
};
