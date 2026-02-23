ALTER TABLE environments ADD COLUMN promotion_webhook_url TEXT;
ALTER TABLE promotion_intents ADD COLUMN notification_status TEXT DEFAULT 'pending';
ALTER TABLE promotion_intents ADD COLUMN notification_last_error TEXT;
ALTER TABLE promotion_intents ADD COLUMN notification_last_attempt_at TIMESTAMP;
