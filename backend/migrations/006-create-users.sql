CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    bybit_api_key TEXT,
    bybit_api_secret TEXT,
    created_at INTEGER NOT NULL
);
PRAGMA user_version = 6;
