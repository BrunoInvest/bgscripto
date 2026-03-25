-- Up
ALTER TABLE users ADD COLUMN active_exchange TEXT DEFAULT 'bybit';
ALTER TABLE users ADD COLUMN bingx_api_key TEXT;
ALTER TABLE users ADD COLUMN bingx_api_secret TEXT;
PRAGMA user_version = 7;

-- Down
-- (SQLite does not support dropping columns easily, so down migration is typically a rebuild or ignored for simple additions)
