-- Migration 005: Adiciona colunas para Taxas e P/L Líquido

-- Adiciona coluna para o total de taxas pagas (Abertura + Fechamento) em USDT
ALTER TABLE closed_trades ADD COLUMN totalFeeUsdt REAL DEFAULT 0;

-- Adiciona coluna para o P/L Líquido em USDT (P/L Bruto - Taxas)
ALTER TABLE closed_trades ADD COLUMN netPnlUsdt REAL DEFAULT 0;

-- Atualiza a versão do banco de dados
PRAGMA user_version = 5;