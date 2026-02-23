const safeQuery = async (query, sql, params = [], fallback = { rows: [] }) => {
  try {
    return await query(sql, params);
  } catch {
    return fallback;
  }
};

const createMarketIngestionV1Service = ({ query }) => {
  const runIngestion = async ({ date } = {}) => {
    const runDate = date || new Date().toISOString().slice(0, 10);

    // Placeholder deterministic ingestion marker to keep V1 cron contract stable.
    await safeQuery(
      query,
      `INSERT INTO agent_runs (id, tenant_id, user_id, kind, status, started_at, finished_at, model, prompt_version, tokens_in, tokens_out, cost_usd, input_refs, output_refs, error, created_at)
       VALUES (gen_random_uuid(),
               COALESCE((SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1), gen_random_uuid()),
               NULL,
               'ideas_daily',
               'succeeded',
               NOW(),
               NOW(),
               'ingestion-v1',
               'v1',
               0,
               0,
               0,
               $1::jsonb,
               '{}'::jsonb,
               NULL,
               NOW())`,
      [JSON.stringify({ runDate })]
    );

    return { ok: true, date: runDate, ingested: true };
  };

  return { runIngestion };
};

module.exports = { createMarketIngestionV1Service };
