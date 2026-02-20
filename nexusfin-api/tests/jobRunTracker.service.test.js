const { withTrackedJobRun } = require('../src/services/jobRunTracker');

describe('jobRunTracker', () => {
  test('marks started and success when tracked job completes', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    const out = await withTrackedJobRun({
      query,
      jobName: 'mvp_daily',
      date: '2026-02-20',
      run: async (runDate) => ({ ok: true, date: runDate })
    });

    expect(out.ok).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[0][1][2])).toBe('started');
    expect(String(query.mock.calls[1][1][2])).toBe('success');
  });

  test('marks failed and rethrows when tracked job fails', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    await expect(
      withTrackedJobRun({
        query,
        jobName: 'mvp_daily',
        date: '2026-02-20',
        run: async () => {
          throw new Error('boom');
        }
      })
    ).rejects.toThrow('boom');

    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1][1][2])).toBe('failed');
  });

  test('continues without tracking when job_runs table is unavailable', async () => {
    const query = jest
      .fn()
      .mockRejectedValueOnce(new Error('relation "job_runs" does not exist'))
      .mockResolvedValue({ rows: [] });

    const out = await withTrackedJobRun({
      query,
      jobName: 'mvp_daily',
      date: '2026-02-20',
      run: async () => ({ ok: true })
    });

    expect(out.ok).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
