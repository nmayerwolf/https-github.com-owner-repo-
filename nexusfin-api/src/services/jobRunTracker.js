const isoDate = (date = new Date()) => new Date(date).toISOString().slice(0, 10);

const truncate = (value, max = 900) => String(value || '').slice(0, max);

const markJobRun = async ({ query, jobName, runDate, status, error = null }) => {
  await query(
    `INSERT INTO job_runs (job_name, run_date, status, started_at, finished_at, error)
     VALUES (
       $1,
       $2,
       $3,
       CASE WHEN $3 = 'started' THEN NOW() ELSE NOW() END,
       CASE WHEN $3 = 'started' THEN NULL ELSE NOW() END,
       $4
     )
     ON CONFLICT (job_name, run_date)
     DO UPDATE SET
       status = EXCLUDED.status,
       started_at = CASE WHEN EXCLUDED.status = 'started' THEN NOW() ELSE job_runs.started_at END,
       finished_at = CASE WHEN EXCLUDED.status = 'started' THEN NULL ELSE NOW() END,
       error = EXCLUDED.error`,
    [jobName, runDate, status, error]
  );
};

const withTrackedJobRun = async ({ query, jobName, date = null, run }) => {
  const runDate = isoDate(date || new Date());
  let trackingEnabled = true;

  try {
    await markJobRun({ query, jobName, runDate, status: 'started', error: null });
  } catch {
    trackingEnabled = false;
  }

  try {
    const out = await run(runDate);
    if (trackingEnabled) {
      await markJobRun({ query, jobName, runDate, status: 'success', error: null });
    }
    return out;
  } catch (error) {
    if (trackingEnabled) {
      try {
        await markJobRun({
          query,
          jobName,
          runDate,
          status: 'failed',
          error: truncate(error?.code || error?.message || 'UNKNOWN_ERROR')
        });
      } catch {
        // no-op
      }
    }
    throw error;
  }
};

module.exports = { withTrackedJobRun, isoDate };
