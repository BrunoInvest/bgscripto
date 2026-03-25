-- Adicionar coluna de configurações por usuário (Multi-Tenant)
ALTER TABLE users ADD COLUMN settings TEXT;
PRAGMA user_version = 11;
