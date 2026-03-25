-- Migration 001: Initial database schema

-- Tabela para trades que ainda estão abertos
CREATE TABLE IF NOT EXISTS open_trades (
    uniqueId TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    entryPrice REAL NOT NULL,
    takeProfit REAL,
    stopLoss REAL,
    leverage INTEGER,
    entryValue REAL,
    strategyName TEXT,
    strategyLabel TEXT,
    interval TEXT,
    timestamp INTEGER NOT NULL,
    configsUsed TEXT,
    entryIndicators TEXT
);

-- Tabela para trades já encerrados
CREATE TABLE IF NOT EXISTS closed_trades (
    uniqueId TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    entryPrice REAL NOT NULL,
    takeProfit REAL,
    stopLoss REAL,
    leverage INTEGER,
    entryValue REAL,
    strategyName TEXT,
    strategyLabel TEXT,
    interval TEXT,
    timestamp INTEGER NOT NULL,
    configsUsed TEXT,
    entryIndicators TEXT,
    outcome TEXT,
    exitPrice REAL,
    pnl REAL,
    exitReason TEXT,
    durationMs INTEGER,
    pnlUsdt REAL,
    exitIndicators TEXT
);

-- FIM DA MIGRAÇÃO