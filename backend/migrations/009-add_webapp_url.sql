ALTER TABLE users ADD COLUMN telegram_webapp_url TEXT DEFAULT '';
PRAGMA user_version = 9;
