-- Migration 003: Adiciona colunas para rastrear o P/L mínimo (MAE)

-- Adiciona o preço mais desfavorável nos trades abertos
ALTER TABLE open_trades ADD COLUMN nadirPrice REAL;

-- Adiciona o P/L mínimo e o preço mais desfavorável nos trades fechados
ALTER TABLE closed_trades ADD COLUMN minPnl REAL;
ALTER TABLE closed_trades ADD COLUMN nadirPrice REAL;

-- Atualiza a versão do banco de dados
PRAGMA user_version = 3;