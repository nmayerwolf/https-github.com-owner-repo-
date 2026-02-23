const { createConvictionEngine } = require('./convictionEngine');

const ART_TIMEZONE = 'America/Argentina/Buenos_Aires';

const dtfCache = new Map();

const getFormatter = (opts) => {
  const key = JSON.stringify(opts);
  if (!dtfCache.has(key)) {
    dtfCache.set(
      key,
      new Intl.DateTimeFormat('en-CA', {
        timeZone: ART_TIMEZONE,
        ...opts
      })
    );
  }
  return dtfCache.get(key);
};

const nowInArtDate = (date = new Date()) => {
  const parts = getFormatter({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
};

const toNum = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const asArray = (value, fallback = []) => (Array.isArray(value) ? value : fallback);

const buildDefaultBrief = ({ date, contextText }) => ({
  mainParagraph: `We reviewed the available market and macro inputs for ${date} and prepared an informative brief. Evidence quality is still limited when source coverage is thin, so we keep conclusions explicit and conservative.`,
  bullets: [
    'We prioritize verified moves with numbers before interpretation.',
    'We separate what changed from why it matters to avoid overfitting.',
    contextText || 'We keep this brief informative only and avoid investment recommendations.'
  ].slice(0, 5),
  highlightedAssets: []
});

const extractSymbolHint = (prompt) => {
  const text = String(prompt || '').toUpperCase();
  const match = text.match(/\b[A-Z]{1,5}(?:\.[A-Z]{1,2})?\b/);
  return match ? match[0] : null;
};

const countPromptNumbers = (prompt) => {
  const matches = String(prompt || '').match(/\b\d+(?:[.,]\d+)?(?:%|bps|x|m|bn|b|k)?\b/gi);
  return Array.isArray(matches) ? matches.length : 0;
};

const buildAnalysisFromPrompt = ({ prompt, date }) => {
  const symbol = extractSymbolHint(prompt);
  const numericCount = countPromptNumbers(prompt);
  const focus = symbol || 'the requested asset/theme';

  const fundamentals =
    numericCount >= 2
      ? `We see at least ${numericCount} concrete numeric references in your prompt, which helps us frame baseline valuation and momentum context with explicit anchors.`
      : 'We do not yet have enough hard numbers in your prompt, so we treat fundamentals confidence as moderate until confirmed with fresh source data.';

  return {
    title: symbol ? `Idea on ${symbol}` : 'Idea under analysis',
    horizon: /earnings|cpi|event|meeting|election|deadline/i.test(String(prompt || '')) ? 'EVENT_DRIVEN' : 'ONE_TO_THREE_MONTHS',
    thesis: `We can frame ${focus} as an actionable thesis only if the current setup still shows misalignment between expected and priced outcomes.`,
    fundamentals,
    catalyst: `What changed now: we are tracking near-term catalysts into ${date}, including macro prints and company-specific disclosures when applicable.`,
    dislocation: 'We look for signs that positioning and consensus are not fully pricing the scenario yet (possible mispricing).',
    risks: 'Key risks include data surprises, policy shifts, and fast positioning reversals; if these invalidate the setup, we downgrade priority quickly.',
    sources: [{ label: 'Prompt context', provider: 'user_input', date_or_period: date }]
  };
};

const latestChangeExplanation = ({ prevStatus, nextStatus, prevTotal, nextTotal }) => {
  const base = `We re-reviewed this idea and moved conviction from ${prevTotal.toFixed(1)} to ${nextTotal.toFixed(1)}. Status changed from ${prevStatus} to ${nextStatus} only when the new evidence justified it.`;
  if (nextStatus === 'UNDER_REVIEW') {
    return `${base} To return to priority, conviction needs to recover to at least 3.0 with clearer dated catalysts and explicit dislocation evidence.`;
  }
  return base;
};

const createHorsaiV1Service = ({ query, logger = console, convictionEngine = createConvictionEngine() }) => {
  const loadBrief = async ({ userId, date }) => {
    const out = await query(
      `SELECT id, date::text AS date, generated_at, main_paragraph, bullets, highlighted_assets, qa_flags, last_updated_at
       FROM horsai_briefs
       WHERE user_id = $1 AND date = $2::date
       LIMIT 1`,
      [userId, date]
    );
    return out.rows?.[0] || null;
  };

  const upsertBrief = async ({ userId, date, payload }) => {
    const out = await query(
      `INSERT INTO horsai_briefs (user_id, date, generated_at, main_paragraph, bullets, highlighted_assets, qa_flags, last_updated_at)
       VALUES ($1, $2::date, NOW(), $3, $4::jsonb, $5::jsonb, $6::jsonb, NOW())
       ON CONFLICT (user_id, date)
       DO UPDATE SET
         generated_at = EXCLUDED.generated_at,
         main_paragraph = EXCLUDED.main_paragraph,
         bullets = EXCLUDED.bullets,
         highlighted_assets = EXCLUDED.highlighted_assets,
         qa_flags = EXCLUDED.qa_flags,
         last_updated_at = NOW()
       RETURNING id, date::text AS date, generated_at, main_paragraph, bullets, highlighted_assets, qa_flags, last_updated_at`,
      [
        userId,
        date,
        String(payload.mainParagraph || ''),
        JSON.stringify(asArray(payload.bullets).slice(0, 5)),
        JSON.stringify(asArray(payload.highlightedAssets).slice(0, 10)),
        payload.qaFlags ? JSON.stringify(payload.qaFlags) : null
      ]
    );
    return out.rows[0];
  };

  const getBriefByDate = async ({ userId, date }) => {
    let brief = await loadBrief({ userId, date });
    if (brief) return brief;

    const stats = await query(
      `SELECT COUNT(*)::int AS symbols,
              MAX(date)::text AS latest_market_date
       FROM market_daily_bars`
    ).catch(() => ({ rows: [{ symbols: 0, latest_market_date: null }] }));

    const contextText = Number(stats.rows?.[0]?.symbols || 0)
      ? `We used ${Number(stats.rows[0].symbols)} market series with latest date ${stats.rows[0].latest_market_date || 'n/a'} where available.`
      : 'We are waiting for broader ingestion coverage and handling missing data gracefully.';

    const generated = buildDefaultBrief({ date, contextText });
    brief = await upsertBrief({ userId, date, payload: generated });
    return brief;
  };

  const listIdeas = async ({ userId, status }) => {
    const params = [userId];
    let where = 'WHERE user_id = $1';
    if (status) {
      params.push(status);
      where += ' AND status = $2';
    }

    const out = await query(
      `SELECT id, title, status, horizon, thesis, fundamentals, catalyst, dislocation, risks,
              conviction_total, conviction_breakdown, high_conviction,
              last_reviewed_at, last_visible_update_at, sources, change_log
       FROM horsai_ideas
       ${where}
       ORDER BY last_visible_update_at DESC`,
      params
    );
    return out.rows || [];
  };

  const getIdeaById = async ({ userId, ideaId }) => {
    const out = await query(
      `SELECT id, user_id, title, status, horizon, thesis, fundamentals, catalyst, dislocation, risks,
              conviction_total, conviction_breakdown, high_conviction,
              last_reviewed_at, last_visible_update_at, sources, change_log
       FROM horsai_ideas
       WHERE user_id = $1 AND id = $2
       LIMIT 1`,
      [userId, ideaId]
    );
    return out.rows?.[0] || null;
  };

  const updateIdea = async ({ userId, ideaId, patch }) => {
    const out = await query(
      `UPDATE horsai_ideas
       SET status = COALESCE($3, status),
           horizon = COALESCE($4, horizon),
           thesis = COALESCE($5, thesis),
           fundamentals = COALESCE($6, fundamentals),
           catalyst = COALESCE($7, catalyst),
           dislocation = COALESCE($8, dislocation),
           risks = COALESCE($9, risks),
           conviction_total = COALESCE($10, conviction_total),
           conviction_breakdown = COALESCE($11::jsonb, conviction_breakdown),
           high_conviction = COALESCE($12, high_conviction),
           last_reviewed_at = COALESCE($13::timestamptz, last_reviewed_at),
           last_visible_update_at = COALESCE($14::timestamptz, last_visible_update_at),
           sources = COALESCE($15::jsonb, sources),
           change_log = COALESCE($16::jsonb, change_log),
           updated_at = NOW()
       WHERE user_id = $1 AND id = $2
       RETURNING id, title, status, horizon, thesis, fundamentals, catalyst, dislocation, risks,
                 conviction_total, conviction_breakdown, high_conviction,
                 last_reviewed_at, last_visible_update_at, sources, change_log`,
      [
        userId,
        ideaId,
        patch.status ?? null,
        patch.horizon ?? null,
        patch.thesis ?? null,
        patch.fundamentals ?? null,
        patch.catalyst ?? null,
        patch.dislocation ?? null,
        patch.risks ?? null,
        patch.conviction_total ?? null,
        patch.conviction_breakdown ? JSON.stringify(patch.conviction_breakdown) : null,
        patch.high_conviction ?? null,
        patch.last_reviewed_at ?? null,
        patch.last_visible_update_at ?? null,
        patch.sources ? JSON.stringify(patch.sources) : null,
        patch.change_log ? JSON.stringify(patch.change_log) : null
      ]
    );
    return out.rows?.[0] || null;
  };

  const createIdea = async ({ userId, payload }) => {
    const out = await query(
      `INSERT INTO horsai_ideas (
         user_id, title, status, horizon, thesis, fundamentals, catalyst, dislocation, risks,
         conviction_total, conviction_breakdown, high_conviction,
         last_reviewed_at, last_visible_update_at, sources, change_log
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11::jsonb, $12,
         NOW(), NOW(), $13::jsonb, $14::jsonb
       )
       RETURNING id, title, status, horizon, thesis, fundamentals, catalyst, dislocation, risks,
                 conviction_total, conviction_breakdown, high_conviction,
                 last_reviewed_at, last_visible_update_at, sources, change_log`,
      [
        userId,
        payload.title,
        payload.status,
        payload.horizon,
        payload.thesis,
        payload.fundamentals,
        payload.catalyst,
        payload.dislocation,
        payload.risks,
        payload.conviction_total,
        JSON.stringify(payload.conviction_breakdown || {}),
        Boolean(payload.high_conviction),
        JSON.stringify(asArray(payload.sources)),
        JSON.stringify(asArray(payload.change_log))
      ]
    );
    return out.rows[0];
  };

  const persistInteraction = async ({ userId, prompt, response, producedIdeaId, convictionTotal, qualifiesActive }) => {
    await query(
      `INSERT INTO horsai_idea_interactions (
         user_id, user_prompt, agent_response, produced_idea_id, conviction_total, qualifies_active
       )
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)`,
      [userId, prompt, JSON.stringify(response), producedIdeaId || null, convictionTotal, Boolean(qualifiesActive)]
    );
  };

  const normalizeStatus = (status, currentStatus) => {
    if (String(currentStatus || '').toUpperCase() === 'CLOSED') return 'CLOSED';
    return status;
  };

  const reviewOneIdea = async ({ userId, ideaId, manual = false }) => {
    const idea = await getIdeaById({ userId, ideaId });
    if (!idea) return null;

    const score = convictionEngine.scoreIdea(idea);
    const nextStatusRaw = score.total >= 3 ? 'ACTIVE' : 'UNDER_REVIEW';
    const nextStatus = normalizeStatus(nextStatusRaw, idea.status);
    const prevTotal = toNum(idea.conviction_total, 2);

    const shouldPublish = convictionEngine.shouldPublishUpdate(
      { conviction_total: prevTotal, status: idea.status, high_conviction: idea.high_conviction },
      { conviction_total: score.total, status: nextStatus, high_conviction: score.highConviction },
      { catalyst: idea.catalyst, risks: idea.risks },
      { catalyst: idea.catalyst, risks: idea.risks }
    );

    const changeLog = asArray(idea.change_log);
    if (shouldPublish || manual) {
      changeLog.push({
        at: new Date().toISOString(),
        change_type: nextStatus === 'CLOSED' ? 'CLOSE' : 'SCORE_CHANGE',
        previous: {
          conviction_total: prevTotal,
          breakdown: idea.conviction_breakdown,
          status: idea.status,
          thesis: idea.thesis,
          fundamentals: idea.fundamentals,
          catalyst: idea.catalyst,
          dislocation: idea.dislocation,
          risks: idea.risks
        },
        current: {
          conviction_total: score.total,
          breakdown: score.breakdown,
          status: nextStatus,
          thesis: idea.thesis,
          fundamentals: idea.fundamentals,
          catalyst: idea.catalyst,
          dislocation: idea.dislocation,
          risks: idea.risks
        },
        explanation: latestChangeExplanation({
          prevStatus: idea.status,
          nextStatus,
          prevTotal,
          nextTotal: score.total
        })
      });
    }

    return updateIdea({
      userId,
      ideaId,
      patch: {
        status: nextStatus,
        conviction_total: score.total,
        conviction_breakdown: score.breakdown,
        high_conviction: score.highConviction,
        last_reviewed_at: new Date().toISOString(),
        last_visible_update_at: shouldPublish || manual ? new Date().toISOString() : null,
        change_log: shouldPublish || manual ? changeLog : null
      }
    });
  };

  const analyzePrompt = async ({ userId, prompt }) => {
    const date = nowInArtDate();
    const structured = buildAnalysisFromPrompt({ prompt, date });
    const score = convictionEngine.scoreIdea(structured);
    const qualifiesActive = score.total >= 3;

    const response = {
      title: structured.title,
      horizon: structured.horizon,
      thesis: structured.thesis,
      fundamentals: structured.fundamentals,
      what_changed_now: structured.catalyst,
      dislocation: structured.dislocation,
      risks: structured.risks,
      conviction_total: score.total,
      conviction_breakdown: score.breakdown,
      conviction_justification:
        'We use a deterministic placeholder score today. We will replace the scoring model without changing this structure.',
      sources: structured.sources,
      qualifies_as_active_idea: qualifiesActive ? 'YES' : 'NO'
    };

    let createdIdea = null;
    if (qualifiesActive) {
      const status = 'ACTIVE';
      createdIdea = await createIdea({
        userId,
        payload: {
          ...structured,
          status,
          conviction_total: score.total,
          conviction_breakdown: score.breakdown,
          high_conviction: score.highConviction,
          change_log: [
            {
              at: new Date().toISOString(),
              change_type: 'NEW',
              previous: null,
              current: {
                conviction_total: score.total,
                breakdown: score.breakdown,
                status,
                thesis: structured.thesis,
                fundamentals: structured.fundamentals,
                catalyst: structured.catalyst,
                dislocation: structured.dislocation,
                risks: structured.risks
              },
              explanation: 'We created this active idea because current evidence passed our minimum conviction threshold.'
            }
          ]
        }
      });
    }

    await persistInteraction({
      userId,
      prompt,
      response,
      producedIdeaId: createdIdea?.id || null,
      convictionTotal: score.total,
      qualifiesActive
    });

    return { response, createdIdea };
  };

  const closeIdea = async ({ userId, ideaId, reason }) => {
    const idea = await getIdeaById({ userId, ideaId });
    if (!idea) return null;

    const changeLog = asArray(idea.change_log);
    changeLog.push({
      at: new Date().toISOString(),
      change_type: 'CLOSE',
      previous: {
        conviction_total: idea.conviction_total,
        breakdown: idea.conviction_breakdown,
        status: idea.status,
        thesis: idea.thesis,
        fundamentals: idea.fundamentals,
        catalyst: idea.catalyst,
        dislocation: idea.dislocation,
        risks: idea.risks
      },
      current: {
        conviction_total: idea.conviction_total,
        breakdown: idea.conviction_breakdown,
        status: 'CLOSED',
        thesis: idea.thesis,
        fundamentals: idea.fundamentals,
        catalyst: idea.catalyst,
        dislocation: idea.dislocation,
        risks: idea.risks
      },
      explanation: reason || 'We closed this idea because the setup was invalidated or rotated out of priority.'
    });

    return updateIdea({
      userId,
      ideaId,
      patch: {
        status: 'CLOSED',
        last_reviewed_at: new Date().toISOString(),
        last_visible_update_at: new Date().toISOString(),
        change_log: changeLog
      }
    });
  };

  const runDailyBriefAndReview = async ({ runDate = nowInArtDate() } = {}) => {
    const usersOut = await query(`SELECT id FROM users`);
    const users = usersOut.rows || [];

    let briefs = 0;
    let reviewed = 0;

    for (const user of users) {
      const briefPayload = buildDefaultBrief({
        date: runDate,
        contextText: 'We refreshed the brief after the scheduled ingestion and kept the output informative only.'
      });
      await upsertBrief({ userId: user.id, date: runDate, payload: briefPayload });
      briefs += 1;

      const ideas = await listIdeas({ userId: user.id });
      for (const idea of ideas) {
        if (String(idea.status || '').toUpperCase() === 'CLOSED') continue;
        await reviewOneIdea({ userId: user.id, ideaId: idea.id, manual: false });
        reviewed += 1;
      }
    }

    logger.log('[horsai-v1] daily review completed', { runDate, briefs, reviewed });
    return { runDate, briefs, reviewed, generated: briefs + reviewed };
  };

  return {
    nowInArtDate,
    getBriefByDate,
    upsertBrief,
    listIdeas,
    analyzePrompt,
    reviewOneIdea,
    closeIdea,
    runDailyBriefAndReview
  };
};

module.exports = {
  createHorsaiV1Service
};
