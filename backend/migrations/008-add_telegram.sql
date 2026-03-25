ALTER TABLE users ADD COLUMN telegram_bot_token TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN telegram_chat_id TEXT DEFAULT '';
PRAGMA user_version = 8;
