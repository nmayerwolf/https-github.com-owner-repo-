const toNum = (value, fallback = 0) => {
  const out = Number(value);
  return Number.isFinite(out) ? out : fallback;
};

const HAIKU_INPUT_USD_PER_MTOK = 0.8;
const HAIKU_OUTPUT_USD_PER_MTOK = 4.0;

const estimateCostUsd = ({ inputTokens = 0, outputTokens = 0 } = {}) =>
  Number((((toNum(inputTokens) * HAIKU_INPUT_USD_PER_MTOK) + (toNum(outputTokens) * HAIKU_OUTPUT_USD_PER_MTOK)) / 1_000_000).toFixed(6));

const logAiUsage = async ({ query, userId = null, feature, model, usage, success = true, durationMs = 0 } = {}) => {
  if (typeof query !== 'function' || !feature) return;
  const inputTokens = toNum(usage?.input_tokens || usage?.inputTokens, 0);
  const outputTokens = toNum(usage?.output_tokens || usage?.outputTokens, 0);
  const estimatedCostUsd = estimateCostUsd({ inputTokens, outputTokens });
  try {
    await query(
      `INSERT INTO ai_usage_log (
        user_id, feature, model, input_tokens, output_tokens, estimated_cost_usd, success, duration_ms, created_at
      )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [userId, feature, model || null, inputTokens, outputTokens, estimatedCostUsd, Boolean(success), Math.max(0, toNum(durationMs, 0))]
    );
  } catch {
    // silent: table can be absent in local environments
  }
};

module.exports = { logAiUsage, estimateCostUsd };
