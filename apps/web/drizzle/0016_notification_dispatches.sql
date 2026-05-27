-- 0016_notification_dispatches.sql
--
-- Audit log for every push notification attempt. Admins can see what
-- was sent to whom, what landed, what failed, and why. The dispatcher
-- writes one row per sendPush() call regardless of outcome — sent,
-- toggle_off, no_subscription, send_gone, send_failed.
--
-- Why a separate table (not piggybacked on ai_calls): notifications
-- aren't Claude calls. They're a transport-layer concern; mixing them
-- would muddy both surfaces. Separate index sets too — admins filter
-- notifications by user_id + event, while ai_calls is filtered by
-- appeal_id + stage.

CREATE TABLE IF NOT EXISTS notification_dispatches (
  id text PRIMARY KEY,
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  appeal_id text REFERENCES appeals(id) ON DELETE SET NULL,
  -- 'validation_done' | 'validation_failed' | 'submission_done' |
  -- 'submission_failed' | 'council_replied' | 'test' (admin-fired)
  event text NOT NULL,
  -- Full PushPayload JSON: { title, body, url, tag }. Captured at
  -- dispatch time so we can re-display the exact text the user saw.
  payload jsonb NOT NULL,
  -- 'sent' | 'toggle_off' | 'no_subscription' | 'send_gone' |
  -- 'send_failed' | 'no_owner' | 'no_vapid' | 'no_appeal'
  result text NOT NULL,
  -- Short reason for non-sent cases. Mirrors DispatchResult.reason.
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notif_dispatch_user_idx ON notification_dispatches (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notif_dispatch_appeal_idx ON notification_dispatches (appeal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notif_dispatch_event_idx ON notification_dispatches (event, created_at DESC);
CREATE INDEX IF NOT EXISTS notif_dispatch_result_idx ON notification_dispatches (result, created_at DESC);
