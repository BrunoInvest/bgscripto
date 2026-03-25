-- Adicionar isolamento de Tenant (Multi-usuário) às tabelas de Trades
-- Como a versão do DB já está em 9, esta será a versão 10.

-- Caso seja a primeira vez executando a migração em tabelas existentes:
ALTER TABLE open_trades ADD COLUMN user_id INTEGER;
ALTER TABLE closed_trades ADD COLUMN user_id INTEGER;

PRAGMA user_version = 10;
