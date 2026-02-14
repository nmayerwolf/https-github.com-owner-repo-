WITH ranked_web AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, platform, subscription->>'endpoint'
      ORDER BY active DESC, created_at DESC
    ) AS rn
  FROM push_subscriptions
  WHERE platform = 'web'
    AND subscription->>'endpoint' IS NOT NULL
),
ranked_mobile AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, platform, subscription->>'expoPushToken'
      ORDER BY active DESC, created_at DESC
    ) AS rn
  FROM push_subscriptions
  WHERE platform IN ('ios', 'android')
    AND subscription->>'expoPushToken' IS NOT NULL
)
UPDATE push_subscriptions p
SET active = false
FROM (
  SELECT id FROM ranked_web WHERE rn > 1
  UNION ALL
  SELECT id FROM ranked_mobile WHERE rn > 1
) d
WHERE p.id = d.id
  AND p.active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_push_web_active_endpoint
ON push_subscriptions (user_id, platform, (subscription->>'endpoint'))
WHERE active = true
  AND platform = 'web'
  AND subscription->>'endpoint' IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_push_mobile_active_token
ON push_subscriptions (user_id, platform, (subscription->>'expoPushToken'))
WHERE active = true
  AND platform IN ('ios', 'android')
  AND subscription->>'expoPushToken' IS NOT NULL;
