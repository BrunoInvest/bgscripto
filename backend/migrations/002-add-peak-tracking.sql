-- Migration 002: Adiciona colunas para rastrear o P/L máximo (MFE)

-- Adiciona o preço de pico nos trades abertos (será atualizado em tempo real)
ALTER TABLE open_trades ADD COLUMN peakPrice REAL;

-- Adiciona o P/L máximo e o preço de pico nos trades fechados para análise
ALTER TABLE closed_trades ADD COLUMN maxPnl REAL;
ALTER TABLE closed_trades ADD COLUMN peakPrice REAL;

-- Atualiza a versão do banco de dados
PRAGMA user_version = 2;