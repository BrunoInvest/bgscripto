// backend/controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../database.js');
const { encrypt } = require('../utils/cryptoUtils.js');
const { reloadTelegramBot } = require('../services/telegramBot.js');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';

    const register = async (req, res) => {
        try {
            const { username, password, bybitApiKey, bybitApiSecret, bingxApiKey, bingxApiSecret, activeExchange } = req.body;
            
            if (!username || !password) {
                return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
            }

            const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
            if (existing) {
                return res.status(400).json({ error: 'Nome de usuário já existe' });
            }

            const passwordHash = await bcrypt.hash(password, 10);
            const encryptedBybitKey = encrypt(bybitApiKey);
            const encryptedBybitSecret = encrypt(bybitApiSecret);
            const encryptedBingxKey = encrypt(bingxApiKey);
            const encryptedBingxSecret = encrypt(bingxApiSecret);
            const exchange = activeExchange || 'bybit';
            const now = Date.now();
            
            // Configurações Padrão para Multi-Tenant
            const defaultSettings = JSON.stringify({
                risk: {
                    tradingMode: "PAPER", // Cadastrados começam em Simulação por segurança
                    symbolsToMonitor: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
                    entryValueUSDT: 10,
                    leverage: 10,
                    maxTradesPerStrategy: 1,
                    cooldownMinutes: 60,
                    debugMode: true
                },
                enabledStrategies: {
                    structural_scalping_v2: ["1"],
                    elliott_wave_impulse: [],
                    grid_trading_bingx: []
                },
                strategyConfigs: {
                    structural_scalping_v2: { takeProfitPercent: 5, stopLossPercent: 10, operationMode: "BOTH", CANDLE_LIMIT: 200, EMA_SHORT_PERIOD: 20, EMA_LONG_PERIOD: 50, ADX_PERIOD: 14, ADX_MIN_LEVEL: 45, EMA_TREND_PERIOD_H1: 50, useProfitProtection: false, profitThresholdPercent: 30, retreatThresholdPercent: 13, useVolumeConfirmation: false, volumeMultiplier: 1.2, useRsiConfirmation: true, RSI_PERIOD: 14, VOLUME_SMA_PERIOD: 20 },
                    elliott_wave_impulse: { takeProfitPercent: 1, stopLossPercent: 1.5, operationMode: "BOTH", CANDLE_LIMIT: 300, EMA_TREND_PERIOD: 200, profitThresholdPercent: 1, retreatThresholdPercent: 0.5, useProfitProtection: false },
                    grid_trading_bingx: { gridSpacingUSDT: 300, takeProfitPercent: 1.5, maxActiveGrids: 1, useTrendFilter: false, emaTrendPeriod: 50, adxPeriod: 14, adxMinLevel: 25 }
                },
                activePairs: []
            });

            const stmt = db.prepare(`
                INSERT INTO users (username, password_hash, bybit_api_key, bybit_api_secret, bingx_api_key, bingx_api_secret, active_exchange, settings, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            const info = stmt.run(username, passwordHash, encryptedBybitKey, encryptedBybitSecret, encryptedBingxKey, encryptedBingxSecret, exchange, defaultSettings, now);
        
        // Generate token right away so they Auto-Login
        const token = jwt.sign({ id: info.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '7d' });
        
        res.status(201).json({ message: 'Usuário registrado com sucesso', token, user: { id: info.lastInsertRowid, username } });
    } catch (e) {
        console.error('[AUTH ERROR]', e);
        res.status(500).json({ error: 'Falha no registro' });
    }
};

const login = async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ message: 'Login bem-sucedido', token, user: { id: user.id, username: user.username } });
    } catch (e) {
        console.error('[AUTH ERROR]', e);
        res.status(500).json({ error: 'Falha no login' });
    }
};

const getMe = (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Não autorizado' });
    
    try {
        const user = db.prepare('SELECT id, username, active_exchange, bybit_api_key, bingx_api_key, telegram_bot_token, telegram_chat_id FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
        
        res.json({
            id: user.id,
            username: user.username,
            activeExchange: user.active_exchange || 'bybit',
            hasBybitKeys: !!user.bybit_api_key,
            hasBingxKeys: !!user.bingx_api_key,
            hasTelegramToken: !!user.telegram_bot_token,
            hasTelegramChatId: !!user.telegram_chat_id,
            settings: user.settings ? JSON.parse(user.settings) : null
        });
    } catch (e) {
        console.error('[GET ME ERROR]', e);
        res.status(500).json({ error: 'Erro ao buscar perfil' });
    }
};

const updateProfile = (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Não autorizado' });

    try {
        const { activeExchange, bybitApiKey, bybitApiSecret, bingxApiKey, bingxApiSecret, telegramBotToken, telegramChatId } = req.body;
        
        // Mantém as antigas se não enviar a nova chave
        const user = db.prepare('SELECT bybit_api_key, bybit_api_secret, bingx_api_key, bingx_api_secret, active_exchange, telegram_bot_token, telegram_chat_id FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        const encryptedBybitKey = bybitApiKey !== undefined ? encrypt(bybitApiKey) : user.bybit_api_key;
        const encryptedBybitSecret = bybitApiSecret !== undefined ? encrypt(bybitApiSecret) : user.bybit_api_secret;
        const encryptedBingxKey = bingxApiKey !== undefined ? encrypt(bingxApiKey) : user.bingx_api_key;
        const encryptedBingxSecret = bingxApiSecret !== undefined ? encrypt(bingxApiSecret) : user.bingx_api_secret;
        const encryptedTelegramToken = telegramBotToken !== undefined ? encrypt(telegramBotToken) : user.telegram_bot_token;
        const encryptedTelegramChatId = telegramChatId !== undefined ? encrypt(telegramChatId) : user.telegram_chat_id;
        const finalExchange = activeExchange || user.active_exchange || 'bybit';

        const stmt = db.prepare(`
            UPDATE users SET 
                active_exchange = ?, 
                bybit_api_key = ?, 
                bybit_api_secret = ?, 
                bingx_api_key = ?, 
                bingx_api_secret = ?,
                telegram_bot_token = ?,
                telegram_chat_id = ?
            WHERE id = ?
        `);

        stmt.run(finalExchange, encryptedBybitKey, encryptedBybitSecret, encryptedBingxKey, encryptedBingxSecret, encryptedTelegramToken, encryptedTelegramChatId, req.user.id);

        reloadTelegramBot(); // Hot-reloads the connection instantly!

        res.json({ message: 'Perfil atualizado com sucesso!' });
    } catch (e) {
        console.error('[UPDATE PROFILE ERROR]', e);
        res.status(500).json({ error: 'Falha ao atualizar perfil' });
    }
};

module.exports = { register, login, getMe, updateProfile };
