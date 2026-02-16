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
    const to = nowEpoch();
    const from = to - 60 * 60 * 24 * 260;
    const normalizedCategory = String(category || '').toLowerCase();
    let quoteSymbol = symbol;
    let quoteData = null;
    let candlesData = null;

    if (normalizedCategory === 'crypto' || /USDT$/.test(String(symbol || '').toUpperCase())) {
      quoteSymbol = `BINANCE:${symbol}`;
      quoteData = await finnhub.quote(quoteSymbol);
      try {
        candlesData = await finnhub.cryptoCandles(symbol, 'D', from, to);
      } catch (error) {
        if (error?.status === 403 || error?.status === 429 || error?.code === 'FINNHUB_ENDPOINT_FORBIDDEN' || error?.code === 'FINNHUB_RATE_LIMIT') {
          candlesData = buildSyntheticCandles(quoteData?.c, quoteData?.pc);
        } else {
          throw error;
        }
      }
    } else if (normalizedCategory === 'fx' || String(symbol || '').includes('_')) {
      const [base, quote] = String(symbol || '').split('_');
      if (!base || !quote) return null;
      quoteSymbol = `OANDA:${base}_${quote}`;
      quoteData = await finnhub.quote(quoteSymbol);
      try {
        candlesData = await finnhub.forexCandles(base, quote, 'D', from, to);
      } catch (error) {
        if (error?.status === 403 || error?.status === 429 || error?.code === 'FINNHUB_ENDPOINT_FORBIDDEN' || error?.code === 'FINNHUB_RATE_LIMIT') {
          candlesData = buildSyntheticCandles(quoteData?.c, quoteData?.pc);
        } else {
          throw error;
        }
      }
    } else {
      quoteData = await finnhub.quote(quoteSymbol);
      try {
        candlesData = await finnhub.candles(symbol, 'D', from, to);
      } catch (error) {
        if (error?.status === 403 || error?.status === 429 || error?.code === 'FINNHUB_ENDPOINT_FORBIDDEN' || error?.code === 'FINNHUB_RATE_LIMIT') {
          candlesData = buildSyntheticCandles(quoteData?.c, quoteData?.pc);
        } else {
          throw error;
        }
      }
    }
    if (candlesData?.s !== 'ok') return null;

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
    let dailyCount = await getDailyCount(userId);
    const maxDailyAlerts = Number(options.maxAlertsPerUserPerDay || 10);
    const rejectionCooldownHours = Number(options.rejectionCooldownHours || 24);
    const rejectionThreshold = Number(options.rejectionThreshold || 3);

    for (const item of watchlistRows) {
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
        const aiOut = await aiAgent.validateSignal({
          candidate: payload,
          userConfig: {
            riskProfile: configRow.risk_profile || 'moderado',
            horizon: configRow.horizon || 'mediano'
          },
          context: {}
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
