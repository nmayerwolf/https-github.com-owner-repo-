const { env } = require('../config/env');

const clampBullets = (items = [], max = 10, maxLen = 160) =>
  (Array.isArray(items) ? items : [])
    .map((x) => String(x || '').replace(/\s+/g, ' ').trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, max);

const extractJsonObject = (input) => {
  const raw = String(input || '').trim().replace(/```json|```/g, '');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
};

const toFallbackDigest = ({ regimeState = {}, crisisState = {}, newsHeadlines = [] } = {}) => {
  const headlines = (Array.isArray(newsHeadlines) ? newsHeadlines : []).slice(0, 6);
  const bullets = [
    `Regime: ${regimeState.regime || 'transition'} (${regimeState.volatility_regime || 'normal'})`,
    `Leadership: ${(regimeState.leadership || []).join(', ') || 'None'}`,
    `Risk flags: ${(regimeState.risk_flags || []).join(', ') || 'None'}`,
    ...headlines.map((item) => `${String(item.headline || '').trim()}`.slice(0, 120))
  ];

  return {
    bullets: clampBullets(bullets, 10, 120).slice(0, 10),
    key_risks: clampBullets(regimeState.risk_flags || [], 4, 80),
    macro_drivers: clampBullets(regimeState.macro_drivers || regimeState.leadership || [], 3, 80),
    crisis_active: Boolean(crisisState.is_active || crisisState.isActive)
  };
};

const buildPrompt = ({ regimeState = {}, crisisState = {}, newsHeadlines = [], userProfile = {} }) => {
  const focusLabel = userProfile.focus > 0.7 ? 'opportunistic' : userProfile.focus < 0.3 ? 'strategic' : 'balanced';
  const riskLabel = userProfile.risk_level > 0.7 ? 'aggressive' : userProfile.risk_level < 0.3 ? 'conservative' : 'moderate';
  const horizonLabel = userProfile.horizon > 0.7 ? 'long-term' : userProfile.horizon < 0.3 ? 'short-term' : 'medium-term';
  const languageInstruction = String(userProfile.language || '').toLowerCase() === 'en'
    ? 'Respond entirely in English.'
    : 'Respond entirely in Spanish (Latin American, using "vos" instead of "tú").';

  return `You are Horsai's daily market briefing writer.
${languageInstruction}

MARKET STATE:
- Regime: ${regimeState.regime} (${regimeState.volatility_regime})
- Leadership: ${(regimeState.leadership || []).join(', ')}
- Confidence: ${regimeState.confidence}
- Risk flags: ${(regimeState.risk_flags || []).join(', ') || 'None'}
- Crisis active: ${Boolean(crisisState?.is_active || crisisState?.isActive)}

USER PROFILE:
- Focus: ${focusLabel}
- Risk tolerance: ${riskLabel}
- Horizon: ${horizonLabel}

TODAY'S HEADLINES (pick most relevant):
${(newsHeadlines || []).slice(0, 20).map((n, i) => `${i + 1}. ${n.headline} [${n.category || 'general'}]`).join('\n')}

Generate a daily digest with EXACTLY this JSON structure:
{
  "bullets": ["Concise market insight or news impact"],
  "key_risks": ["Top risk to watch"],
  "macro_drivers": ["Key macro theme driving markets"]
}

RULES:
- Max 10 bullets, min 5
- Max 4 key_risks
- Max 3 macro_drivers
- Professional tone, no drama, no urgency
- Return ONLY JSON, nothing else`;
};

const generateDigest = async (regimeState, crisisState, newsHeadlines, userProfile, options = {}) => {
  const fetchImpl = options.fetchImpl || fetch;
  const apiKey = options.apiKey ?? env.anthropicApiKey;
  const model = options.model ?? env.aiNarrativeModel ?? 'claude-haiku-4-5-20251001';
  const timeoutMs = Math.max(2000, Number(options.timeoutMs ?? env.aiNarrativeTimeoutMs ?? 9000));

  if (!apiKey) return { digest: toFallbackDigest({ regimeState, crisisState, newsHeadlines }), usage: null, model, mode: 'fallback' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const prompt = buildPrompt({ regimeState, crisisState, newsHeadlines, userProfile });
  const startedAt = Date.now();

  try {
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`ANTHROPIC_HTTP_${res.status}`);
    const payload = await res.json();
    const text = Array.isArray(payload?.content) ? payload.content.map((x) => x?.text || '').join('\n') : '';
    const parsed = extractJsonObject(text);
    const fallback = toFallbackDigest({ regimeState, crisisState, newsHeadlines });
    const digest = parsed && typeof parsed === 'object'
      ? {
          bullets: clampBullets(parsed.bullets, 10, 120),
          key_risks: clampBullets(parsed.key_risks, 4, 100),
          macro_drivers: clampBullets(parsed.macro_drivers, 3, 100),
          crisis_active: Boolean(crisisState?.is_active || crisisState?.isActive)
        }
      : fallback;
    return { digest, usage: payload?.usage || null, model, mode: parsed ? 'ai' : 'fallback_parse', durationMs: Date.now() - startedAt };
  } catch {
    return { digest: toFallbackDigest({ regimeState, crisisState, newsHeadlines }), usage: null, model, mode: 'fallback_error', durationMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
};

module.exports = { generateDigest };
