-- Migration 004: Adiciona a coluna orderId para rastrear trades reais

ALTER TABLE open_trades ADD COLUMN orderId TEXT;
ALTER TABLE closed_trades ADD COLUMN orderId TEXT;

-- Atualiza a versão do banco de dados
PRAGMA user_version = 4;