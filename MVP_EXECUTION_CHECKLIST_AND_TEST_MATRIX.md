# MVP Execution Checklist and Test Matrix

## Scope lock (Strategic Decision)
- Market module is kept in codebase, but hidden from product UI for all roles.
- No navigation entry, no visible screen access from app menus.
- Existing market jobs/services remain enabled unless explicitly disabled in a later phase.

## 1) Minimum Automated Tests (Executable Matrix)

| ID | Area | Type | Target | Scenario | Expected Result |
|---|---|---|---|---|---|
| AT-01 | Provider | Unit/Integration | Market data provider service | Fetch daily bars for `SPY` | Returns non-empty bars array with valid OHLCV structure and date ordering |
| AT-02 | Provider | Unit | Market data provider service | Upstream timeout or 5xx | Controlled failure path (typed error/fallback), no app crash |
| AT-03 | Regime | Unit | Regime engine/service | Valid input dataset | Returns enum in allowed set + `confidence` in `[0,1]` |
| AT-04 | Regime | Unit | Regime engine/service | Insufficient dataset | Returns explicit fallback regime and bounded confidence |
| AT-05 | Recommendation | Unit/Integration | Recommendation engine | Data available | Produces at least 1 recommendation |
| AT-06 | Recommendation | Unit/Integration | Recommendation engine/API | Data available | Every item includes required fields: `title`, `type`, `rationale`, `risk`, `actions` |
| AT-07 | Recommendation | Unit/Integration | Recommendation engine | Mixed opportunity set | `type` is correctly labeled as `strategic` or `opportunistic` |
| AT-08 | Profile | Integration | Profile settings + recommendation mix logic | Move focus slider (low to high) | Strategic/opportunistic ratio changes in expected direction |
| AT-09 | Portfolio Limits | API Integration | `POST /portfolios` | Attempt to create 4th portfolio | Request rejected with expected status code and deterministic error payload |
| AT-10 | Portfolio Limits | API Integration | `POST /portfolios/:id/holdings` | Attempt to add 16th holding | Request rejected with expected status code and deterministic error payload |
| AT-11 | Access Control | API Integration | Holdings update endpoint (e.g. `PATCH /portfolios/:id/holdings/:holdingId`) | Viewer token attempts update | `403` forbidden, no mutation persisted |
| AT-12 | Access Control | API Integration | Same endpoint as AT-11 | Editor token attempts valid update | `2xx` success and mutation persisted |
| AT-13 | UI Visibility | Component/E2E | App navigation/router | Any authenticated role | Market route/tab/menu item is not visible |
| AT-14 | UI Guard | E2E | Direct URL to Market route (if route exists) | User opens hidden route directly | Redirect/404/guarded response; no market screen rendered |

## 2) Manual QA Checklist (Release Gate)

### News
- Max 10 bullets in digest/news summary.
- Mentions current regime and macro drivers.
- Tone/style changes when profile changes.

### Recommendations
- All required sections always present in output.
- Strategic recommendations align with active regime.
- Opportunistic recommendations clearly labeled.
- Crisis mode lowers noise (fewer/stricter opportunistic outputs).

### Portfolio
- Snapshots are created after scheduled job run.
- Alignment score is present and non-null.
- Sharing flow works end-to-end.

### Market Hidden (New)
- Market is not visible in primary navigation.
- Market is not visible in secondary navigation/quick actions.
- No onboarding step links to Market.
- Direct deep-link does not expose Market screen.

## 3) Definition of Done (Measurable)

MVP is complete only when all items below are true:

- Jobs populate market, fundamentals, regime, crisis, and ideas data.
- User can set profile and persisted preferences are applied in generation outputs.
- Daily digest is generated for eligible users (daily artifact/record exists).
- Daily recommendations are generated for eligible users (daily artifact/record exists).
- Portfolio tracking works with snapshots + alignment score available via API/UI.
- Crisis Mode activates automatically under defined triggers.
- All APIs return structured JSON (documented error and success envelopes).
- End-to-end demo flow runs without manual DB edits.
- Market feature is hidden from app UI for all roles, while code remains in repository.

## 4) Required Evidence Before Sign-off

- Automated test run artifact (CI link or terminal log) covering AT-01..AT-14.
- Manual QA pass record (date, tester, environment, pass/fail by item).
- E2E demo recording or reproducible script.
- API sample payloads for success and failure envelopes.

## 5) Suggested Mapping to Existing Test Suites

- Frontend component/integration tests: `/Users/nmayerwolf/Documents/nexusfin/src/components/__tests__/`
- Frontend e2e tests: `/Users/nmayerwolf/Documents/nexusfin/tests/e2e/`
- API integration/service tests: `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/`

## 6) Immediate Implementation Order

1. Implement/verify Market hidden behavior in UI routing + navigation.
2. Add AT-13 and AT-14 to frontend e2e/component coverage.
3. Harden API tests for limits + ACL (AT-09..AT-12) with explicit status/error assertions.
4. Harden regime/recommendation provider fallback tests (AT-02, AT-04, AT-06, AT-07).
5. Run manual QA checklist and attach evidence for release gate.
