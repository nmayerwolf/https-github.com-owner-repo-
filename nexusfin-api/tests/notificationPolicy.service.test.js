const { selectPolicyEvents } = require('../src/services/notificationPolicy');

describe('notificationPolicy selectPolicyEvents', () => {
  it('normal mode includes regime shift + high risk + strategic idea', () => {
    const items = [
      { ideaId: 'r1', category: 'risk', severity: 'high', confidence: 0.82, rationale: ['Vol spike'] },
      { ideaId: 's1', category: 'strategic', symbol: 'AAPL', action: 'BUY', confidence: 0.9 }
    ];

    const events = selectPolicyEvents({
      date: '2026-02-20',
      crisisActive: false,
      regime: 'risk_on',
      prevRegime: 'transition',
      items,
      notificationMode: 'normal'
    });

    const types = events.map((e) => e.data.type);
    expect(types).toContain('regime_shift');
    expect(types).toContain('risk_alert');
    expect(types).toContain('strategic_idea');
  });

  it('crisis mode only includes regime shift, critical risk and high dislocation', () => {
    const items = [
      { ideaId: 'r1', category: 'risk', severity: 'high', confidence: 0.9, rationale: ['Credit stress'] },
      { ideaId: 'o1', category: 'opportunistic', opportunisticType: 'overreaction', symbol: 'TSLA', confidence: 0.93 },
      { ideaId: 's1', category: 'strategic', symbol: 'MSFT', confidence: 0.95 }
    ];

    const events = selectPolicyEvents({
      date: '2026-02-20',
      crisisActive: true,
      regime: 'risk_off',
      prevRegime: 'risk_on',
      items,
      notificationMode: 'normal'
    });

    const types = events.map((e) => e.data.type);
    expect(types).toContain('regime_shift');
    expect(types).toContain('critical_risk');
    expect(types).toContain('high_conviction_dislocation');
    expect(types).not.toContain('strategic_idea');
  });

  it('digest_only emits single digest event', () => {
    const events = selectPolicyEvents({
      date: '2026-02-20',
      crisisActive: false,
      regime: 'transition',
      prevRegime: 'transition',
      items: [{ ideaId: 's1', category: 'strategic', confidence: 0.9 }],
      notificationMode: 'digest_only'
    });

    expect(events).toHaveLength(1);
    expect(events[0].data.type).toBe('daily_digest');
  });
});
