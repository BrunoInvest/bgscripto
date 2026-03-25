// backend/database.js (VERSÃO ATUALIZADA COM NOVAS COLUNAS)

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

const dbPath = path.join(__dirname, 'trading_data.sqlite');
const db = new Database(dbPath);

function applyMigrations() {
    console.log(chalk.yellow('[DB] Verificando migrações do banco de dados...'));
    
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
        console.log(chalk.yellow('[DB] Pasta de migrações não encontrada. Pulando.'));
        return;
    }

    db.exec('PRAGMA journal_mode = WAL;');
    let currentVersion = db.prepare('PRAGMA user_version').get().user_version;
    console.log(chalk.blue(`[DB] Versão atual do banco de dados: ${currentVersion}`));

    const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    for (const file of migrationFiles) {
        const fileVersion = parseInt(file.split('-')[0], 10);
        if (fileVersion > currentVersion) {
            try {
                console.log(chalk.cyan(`[DB] Aplicando migração: ${file}...`));
                const migrationSql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
                db.exec(migrationSql);
                // A migração agora define sua própria versão, então este comando é redundante se estiver no SQL
                db.prepare(`PRAGMA user_version = ${fileVersion}`).run();
                currentVersion = fileVersion;
                console.log(chalk.green(`[DB] Migração ${file} aplicada com sucesso.`));
            } catch (error) {
                console.error(chalk.red.bold(`[DB CRITICAL] Falha ao aplicar a migração ${file}:`), error);
                process.exit(1);
            }
        }
    }
    
    // Fallback para garantir que as tabelas existam em novas instalações
    if (currentVersion === 0) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS open_trades (
                uniqueId TEXT PRIMARY KEY, user_id INTEGER NOT NULL, symbol TEXT NOT NULL, side TEXT NOT NULL,
                entryPrice REAL NOT NULL, takeProfit REAL, stopLoss REAL, leverage INTEGER,
                entryValue REAL, strategyName TEXT, strategyLabel TEXT, interval TEXT,
                timestamp INTEGER NOT NULL, configsUsed TEXT, entryIndicators TEXT,
                peakPrice REAL
            );
            CREATE TABLE IF NOT EXISTS closed_trades (
                uniqueId TEXT PRIMARY KEY, user_id INTEGER NOT NULL, symbol TEXT NOT NULL, side TEXT NOT NULL,
                entryPrice REAL NOT NULL, takeProfit REAL, stopLoss REAL, leverage INTEGER,
                entryValue REAL, strategyName TEXT, strategyLabel TEXT, interval TEXT,
                timestamp INTEGER NOT NULL, configsUsed TEXT, entryIndicators TEXT,
                outcome TEXT, exitPrice REAL, pnl REAL, exitReason TEXT, durationMs INTEGER,
                pnlUsdt REAL, exitIndicators TEXT, maxPnl REAL, peakPrice REAL
            );
        `);
    }

    console.log(chalk.green(`[DB] Banco de dados está na versão ${currentVersion}. Inicialização completa.`));
}

applyMigrations();
module.exports = db;