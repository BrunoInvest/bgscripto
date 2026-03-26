// backend/index.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const chalk = require('chalk');
const db = require('./database.js');
const TA = require('technicalindicators');
const jwt = require('jsonwebtoken');

// Importação dos Controllers e Auth
const { register, login, getMe, updateProfile } = require('./controllers/authController.js');
const { requireAuth } = require('./middleware/authMiddleware.js');

// Importação dos Serviços
const bybitClientManager = require('./services/bybitClient.js');
const marketDataService = require('./services/marketDataService.js');
const orderManager = require('./services/orderManager.js');
const backtestService = require('./services/backtestService.js');
const { fetchLivePositions, closeLivePosition, fetchOpenOrders, cancelOrder, editOrder } = require('./services/exchangeService.js');


const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

// Proteções Antibomba & Sniff
app.set('trust proxy', 1);
app.use(helmet());

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // 300 requisições por IP a cada 15 min
    message: { error: 'Limite de taxa excedido. Tente novamente mais tarde.' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', apiLimiter);

app.use(express.json());

// --- ROTAS DE AUTENTICAÇÃO ---
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);
app.get('/api/auth/me', requireAuth, getMe);
app.put('/api/auth/profile', requireAuth, updateProfile);

// --- ROTAS DE POSIÇÕES MANUAIS (LIVE EXCHANGE) ---
app.get('/api/exchange/positions', requireAuth, async (req, res) => {
    try {
        const positions = await fetchLivePositions(req.user.id);
        res.json(positions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/exchange/positions/close', requireAuth, async (req, res) => {
    try {
        const { ccxtSymbol, side, size } = req.body;
        const result = await closeLivePosition(req.user.id, ccxtSymbol, side, size);
        res.json({ success: true, message: 'Posição liquidada com sucesso.', result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/exchange/open-orders', requireAuth, async (req, res) => {
    try {
        const orders = await fetchOpenOrders(req.user.id);
        res.json(orders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/exchange/orders/cancel', requireAuth, async (req, res) => {
    try {
        const { orderId, symbol } = req.body;
        const result = await cancelOrder(req.user.id, orderId, symbol);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/exchange/orders/edit', requireAuth, async (req, res) => {
    try {
        const { orderId, symbol, side, amount, price } = req.body;
        const result = await editOrder(req.user.id, orderId, symbol, side, amount, price);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});




// --- AUTO-SERVE FRONTEND (WebApp Monorepo - Nuvem) ---
const frontendDistPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDistPath));

app.get('*', (req, res) => {
    // Preserva fallbacks 404 estritos para APIs inexistentes
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Endpoint não encontrado.' });
    
    // Devolve o aplicativo React para qualquer outra rota (Client-Side Routing)
    if (fs.existsSync(path.join(frontendDistPath, 'index.html'))) {
        res.sendFile(path.join(frontendDistPath, 'index.html'));
    } else {
        res.status(404).send('<h2>HFT WebApp Frontend não compilado ainda.</h2><p>Na nuvem, garanta que o comando de Start rodou o build do React ("npm run build").</p>');
    }
});

const ESTIMATED_FEE_RATE = 0.00055; // Taxa estimada (Taker)

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const jwtSecretLocal = process.env.JWT_SECRET || 'your-secret-key'; // Fallback compatível


io.on('connection', (socket) => {
    const token = socket.handshake.auth?.token;
    if (!token) return socket.disconnect();
    
    try {
        const decoded = jwt.verify(token, jwtSecretLocal);
        const userId = decoded.id;
        socket.join(`user_${userId}`);
        
        console.log(chalk.cyan(`[WEBSOCKET] Túnel Seguro estabelecido para Usuário ${userId}.`));
        
        // Ativação da Arquitetura CCXT Pro 0-Latência
        require('./services/exchangeService.js').startWsStreams(userId, io);
        
        // Disparo IMEDIATO do saldo (sem esperar o intervalo de 30s)
        setTimeout(() => broadcastAccountBalance(userId), 2000);
        
        socket.on('disconnect', () => {
             console.log(chalk.gray(`[WEBSOCKET] Túnel encerrado para Usuário ${userId}.`));
        });
    } catch (e) {
        socket.disconnect();
    }
});

// --- CARREGAMENTO DE ESTRATÉGIAS ---
const STRATEGIES = new Map();
const strategiesPath = path.join(__dirname, 'strategies');

console.log(chalk.blue('[SYSTEM] Carregando estratégias...'));
try {
    if (fs.existsSync(strategiesPath)) {
        fs.readdirSync(strategiesPath)
          .filter(file => file.endsWith('.js'))
          .forEach(file => {
              const strategy = require(path.join(strategiesPath, file));
              if (strategy && strategy.name && strategy.label) {
                  STRATEGIES.set(strategy.name, strategy);
                  console.log(chalk.cyan(`[STRATEGY] Estratégia '${strategy.label}' (${strategy.name}) carregada.`));
              }
          });
    } else {
        console.log(chalk.yellow('[WARN] Pasta de estratégias não encontrada, criando...'));
        fs.mkdirSync(strategiesPath, { recursive: true });
    }
} catch (error) {
    console.error(chalk.red.bold('[CRITICAL] Falha ao carregar a pasta de estratégias:'), error);
    process.exit(1);
}

// --- CONFIGURAÇÃO MULTI-TENANT (Map de Usuários) ---
const TENANTS = new Map();
// Estado Global Compartilhado (Apenas Preços)
const GLOBAL_PRICES = new Map();

// --- ENGINE CORE (HFT ENGINE) ---
const settingsFilePath = path.join(__dirname, 'settings.json'); // Mantido para fallback padrão

async function getTenant(userId) {
    if (TENANTS.has(userId)) return TENANTS.get(userId);

    const user = db.prepare('SELECT settings, active_exchange FROM users WHERE id = ?').get(userId);
    if (!user) return null;

    const settings = user.settings ? JSON.parse(user.settings) : {};
    
    // Retrocompatibilidade para Multi-Estratégia dentro do perfil do usuário
    if (!settings.strategyConfigs) settings.strategyConfigs = {};
    Array.from(STRATEGIES.values()).forEach(strategy => {
        if (!settings.strategyConfigs[strategy.name]) {
            settings.strategyConfigs[strategy.name] = { ...strategy.config };
        } else {
            settings.strategyConfigs[strategy.name] = { ...strategy.config, ...settings.strategyConfigs[strategy.name] };
        }
    });

    // Garante que as configurações de risco existem
    if (!settings.risk) settings.risk = { tradingMode: 'PAPER', symbolsToMonitor: ['BTCUSDT'], entryValueUSDT: 10, leverage: 10, maxTradesPerStrategy: 1, cooldownMinutes: 60, debugMode: true };
    // Garante que as estratégias habilitadas existem
    if (!settings.enabledStrategies) settings.enabledStrategies = {};

    const tenant = {
        userId,
        settings,
        state: {
            isBotRunning: false,
            botStartTime: null,
            symbolCooldown: new Map(),
            activeExchange: user.active_exchange || 'bybit'
        },
        clients: {
            rest: null,
            ws: null
        }
    };

    TENANTS.set(userId, tenant);
    return tenant;
}

async function saveTenantSettings(userId, settings) {
    try {
        db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(JSON.stringify(settings), userId);
        const tenant = TENANTS.get(userId);
        if (tenant) tenant.settings = settings;
    } catch (error) {
        console.error(chalk.red('[ERROR] Falha ao salvar configurações do usuário:'), userId, error);
    }
}

// getRestClient e loadSettings legados foram removidos em favor de instâncias por Tenant.
const { getLiveClient } = require('./services/exchangeService.js');

// --- ESTADO GLOBAL REMOVIDO EM FAVOR DO TENANTS ---

// Função auxiliar para cálculos financeiros
function calculateFinancials(trade, exitPrice, grossPnlUsdt) {
    const positionValueEntry = trade.entryValue * trade.leverage;
    const entryFee = positionValueEntry * ESTIMATED_FEE_RATE;
    const quantity = positionValueEntry / trade.entryPrice;
    const positionValueExit = quantity * exitPrice;
    const exitFee = positionValueExit * ESTIMATED_FEE_RATE;
    const totalFeeUsdt = entryFee + exitFee;
    const netPnlUsdt = grossPnlUsdt - totalFeeUsdt;
    return { totalFeeUsdt, netPnlUsdt };
}

// --- ROTA DE BACKTEST (PORTFOLIO MULTI-ESTRATÉGIA + OVERRIDES) ---
app.post('/api/backtest', requireAuth, async (req, res) => {
    const { strategyNames, symbols, intervals, days, initialCapital, entryValue, leverage, maxTrades, useSavedConfigs } = req.body;
    const userId = req.user.id;
    const tenant = await getTenant(userId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

    const uiSymbols = Array.isArray(symbols) ? symbols : [symbols];
    const intervalList = Array.isArray(intervals) ? intervals : [intervals];
    // Garante que é um array, mesmo se vier apenas uma string (retrocompatibilidade)
    const strategiesToTest = Array.isArray(strategyNames) ? strategyNames : [req.body.strategyName];

    console.log(chalk.blue(`[BACKTEST PORTFOLIO] Validando Mode: ${useSavedConfigs} para usuário ${userId}`));

    const endTime = Date.now();
    const startTime = endTime - (days * 24 * 60 * 60 * 1000);

    const allDetailedResults = [];
    
    // Acumuladores Globais
    let globalTotalPnl = 0;
    let globalTrades = 0;
    let globalWins = 0;
    let globalBankruptcies = 0;
    let globalFees = 0;
    let globalMaxDrawdown = 0;
    let globalMaxConcurrent = 0;
    let globalEquityCurve = []; 

    try {
        for (const stratName of strategiesToTest) {
            const strategy = STRATEGIES.get(stratName);
            if (!strategy) continue;

            const config = tenant.settings.strategyConfigs[stratName];

            for (const interval of intervalList) {
                
                // --- LÓGICA DE FILTRAGEM DE SÍMBOLOS ---
                let symbolsToRun = [];

                if (useSavedConfigs) {
                    // MODO VALIDAÇÃO: Pega APENAS os símbolos que estão salvos em activePairs
                    // para esta estratégia E este timeframe.
                    // Ignora completamente o que está marcado nos checkboxes de símbolos do frontend.
                    symbolsToRun = (tenant.settings.activePairs || [])
                        .filter(p => p.strategy === stratName && p.interval === interval)
                        .map(p => p.symbol);
                    
                    if (symbolsToRun.length === 0) {
                        // Se não houver nada salvo para essa combinação, pula
                        continue;
                    }
                    console.log(chalk.magenta(`[VALIDATION] Executando apenas salvos para ${stratName} ${interval}m (usuário ${userId}): ${symbolsToRun.join(', ')}`));
                } else {
                    // MODO PADRÃO: Usa os símbolos selecionados na UI
                    symbolsToRun = uiSymbols;
                }
                // ----------------------------------------

                // Passa 'tenant.settings.activePairs' para permitir os overrides de TP/SL
                const result = await backtestService.runPortfolioBacktest(
                    strategy, config, symbolsToRun, interval, startTime, endTime,
                    parseFloat(initialCapital), 
                    parseFloat(entryValue), 
                    parseInt(leverage),
                    parseInt(maxTrades),
                    tenant.settings.activePairs // Passa a lista completa para o serviço buscar os overrides
                );

                globalTotalPnl += parseFloat(result.globalStats.totalPnl);
                globalTrades += result.globalStats.totalTrades;
                globalWins += result.globalStats.wins;
                globalBankruptcies += result.globalStats.bankruptcies;
                globalFees += parseFloat(result.globalStats.totalFeesPaid);

                if (parseFloat(result.globalStats.maxDrawdown) > globalMaxDrawdown) {
                    globalMaxDrawdown = parseFloat(result.globalStats.maxDrawdown);
                }
                if (result.globalStats.maxConcurrentReached > globalMaxConcurrent) {
                    globalMaxConcurrent = result.globalStats.maxConcurrentReached;
                }
                
                // Usa a primeira curva válida como referência visual
                if (globalEquityCurve.length === 0 && result.globalStats.equityCurve.length > 0) {
                    globalEquityCurve = result.globalStats.equityCurve;
                }

                result.detailedResults.forEach(r => {
                    r.strategyName = stratName;
                    allDetailedResults.push(r);
                });
            }
        }

        const finalGlobalStats = {
            totalPnl: globalTotalPnl.toFixed(2),
            totalTrades: globalTrades,
            avgWinRate: globalTrades > 0 ? ((globalWins / globalTrades) * 100).toFixed(2) : "0.00",
            bankruptcies: globalBankruptcies,
            totalFeesPaid: globalFees.toFixed(2),
            maxDrawdown: globalMaxDrawdown.toFixed(2),
            maxConcurrentReached: globalMaxConcurrent,
            finalBalance: (parseFloat(initialCapital) + globalTotalPnl).toFixed(2),
            equityCurve: globalEquityCurve
        };

        res.json({ 
            globalStats: finalGlobalStats, 
            detailedResults: allDetailedResults,
            failures: [] 
        });

    } catch (error) {
        console.error(chalk.red('[BACKTEST ERROR]'), error);
        res.status(500).json({ error: error.message });
    }
});

// --- ROTA SALVAR CONFIGS (MERGE + NOTIFICAÇÃO) ---
app.post('/api/save-best-pairs', requireAuth, async (req, res) => {
    try {
        const { bestPairs } = req.body; 
        const userId = req.user.id;
        const tenant = await getTenant(userId);
        if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });

        if (!Array.isArray(bestPairs)) return res.status(400).json({ error: 'Formato inválido.' });

        console.log(chalk.magenta(`[CONFIG] Mesclando ${bestPairs.length} novos pares otimizados para usuário ${userId}...`));

        // 1. Identifica quais estratégias estão sendo atualizadas neste lote
        const strategiesInUpdate = new Set(bestPairs.map(p => p.strategy));

        // 2. Filtra a lista atual: Mantém apenas os pares de estratégias QUE NÃO ESTÃO no update atual
        // Isso preserva configurações de outras estratégias (ex: Elliott) enquanto atualiza Scalping
        const currentPairsToKeep = (tenant.settings.activePairs || []).filter(p => !strategiesInUpdate.has(p.strategy));

        // 3. Cria a nova lista combinada
        const newActivePairs = [...currentPairsToKeep, ...bestPairs];

        tenant.settings.activePairs = newActivePairs;

        // Atualiza lista de monitoramento do WebSocket
        const newSymbols = new Set(tenant.settings.risk.symbolsToMonitor);
        bestPairs.forEach(p => newSymbols.add(p.symbol));
        tenant.settings.risk.symbolsToMonitor = Array.from(newSymbols);

        await saveTenantSettings(userId, tenant.settings);

        // Reinicia assinaturas do WebSocket (se o tenant tiver um cliente WS ativo)
        // Isso é mais complexo em um ambiente multi-tenant, pois cada tenant pode ter seu próprio WS.
        // Por enquanto, o marketDataService é global. A re-assinatura global pode ser feita se houver uma mudança significativa.
        // Para um sistema multi-tenant robusto, cada tenant precisaria gerenciar suas próprias assinaturas.
        // Por simplicidade, vamos assumir que o marketDataService global já cobre os símbolos necessários.
        // Se o marketDataService for global, ele precisa ser atualizado para monitorar todos os símbolos de todos os tenants.
        // Isso será tratado na função `main` ou em um mecanismo de atualização de símbolos global.

        // --- AVISA O FRONTEND QUE AS CONFIGURAÇÕES MUDARAM ---
        io.to(`user_${userId}`).emit('settings_updated_from_server', tenant.settings);
        // -----------------------------------------------------

        res.json({ message: 'Configurações mescladas e salvas com sucesso!' });
    } catch (error) {
        console.error(chalk.red('[SAVE CONFIG ERROR]'), error);
        res.status(500).json({ error: 'Erro ao salvar configurações.' });
    }
});

// --- FUNÇÕES AUXILIARES DE TRADES E INDICADORES (TENANT AWARE) ---

async function getRichIndicatorsForSymbol(symbol, interval, restClient) {
    try {
        let cleanInterval = String(interval).replace('.0', '');
        if (cleanInterval === 'null' || cleanInterval === 'undefined' || !cleanInterval) cleanInterval = '1';

        const client = restClient || bybitClientManager.getRestClient();
        const klineResponse = await client.getKline({ category: 'linear', symbol, interval: cleanInterval, limit: 250 });
        if (klineResponse.retCode !== 0 || !klineResponse.result.list) {
            console.error(chalk.red(`[INDICATORS] Erro Bybit Kline para ${symbol}: ${klineResponse.retMsg}`));
            return null;
        }
        
        const candles = klineResponse.result.list.reverse().map(c => ({ open: parseFloat(c[1]), high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5]) }));
        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        const volumes = candles.map(c => c.volume);
        
        let rsi, adx, ema20, ema50, macd, vwap;
        try { rsi = TA.RSI.calculate({ period: 14, values: closes }).pop(); } catch(e){}
        try { adx = TA.ADX.calculate({ high: highs, low: lows, close: closes, period: 14 }).pop(); } catch(e){}
        try { ema20 = TA.EMA.calculate({ period: 20, values: closes }).pop(); } catch(e){}
        try { ema50 = TA.EMA.calculate({ period: 50, values: closes }).pop(); } catch(e){}
        try { macd = TA.MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }).pop(); } catch(e){}
        try { vwap = TA.VWAP.calculate({ high: highs, low: lows, close: closes, volume: volumes }).pop(); } catch(e){}
        
        return { 
            "RSI (14)": rsi ? rsi.toFixed(2) : 'N/A',  
            "Tendencia ADX": adx && adx.adx > 25 ? `Forte (${adx.adx.toFixed(1)})` : (adx ? `Fraca (${adx.adx.toFixed(1)})` : 'N/A'), 
            "Cruzamento EMAs (20/50)": (ema20 && ema50) ? (ema20 > ema50 ? 'Alta' : 'Baixa') : 'N/A', 
            "MACD Histograma": macd && macd.histogram ? macd.histogram.toFixed(4) : 'N/A', 
            "VWAP": vwap ? vwap.toFixed(4) : 'N/A' 
        };
    } catch (error) { 
        console.error(chalk.red(`[INDICATORS FATAL] Erro crasso em ${symbol}:`), error.message);
        return null; 
    }
}

async function updateOpenTradesIndicatorsPerTenant(tenant) {
    if (!tenant.state.isBotRunning) return;
    const openTrades = db.prepare('SELECT * FROM open_trades WHERE user_id = ?').all(tenant.userId);
    if (openTrades.length === 0) return;
    
    const clientData = await getLiveClient(tenant.userId);
    const indicatorsPromises = openTrades.map(trade => getRichIndicatorsForSymbol(trade.symbol, trade.interval, clientData?.client));
    const indicatorsResults = await Promise.all(indicatorsPromises);
    const updatedTrades = openTrades.map((trade, index) => ({ uniqueId: trade.uniqueId, liveIndicators: indicatorsResults[index] }));
    
    io.to(`user-${tenant.userId}`).emit('open_trades_indicators_update', updatedTrades);
}

async function getExitIndicators(trade, exitPrice, restClient) {
    try {
        const client = restClient || bybitClientManager.getRestClient();
        const klineResponse = await client.getKline({ category: 'linear', symbol: trade.symbol, interval: String(trade.interval), limit: 250 });
        if (klineResponse.retCode !== 0 || !klineResponse.result.list) return {};
        const candles = klineResponse.result.list.reverse().map(c => ({ open: parseFloat(c[1]), high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4]) }));
        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        
        const adx = TA.ADX.calculate({ high: highs, low: lows, close: closes, period: 14 }).pop();
        const rsi = TA.RSI.calculate({ period: 14, values: closes }).pop();
        
        return { 
            Preco_Saida: exitPrice.toFixed(4), 
            ADX_Saida: adx?.adx.toFixed(2), 
            RSI_Saida: rsi?.toFixed(2) 
        };
    } catch (error) { return {}; }
}

function monitorPaperTrades(userId, symbol, lastPrice) {
    const openTrades = db.prepare('SELECT * FROM open_trades WHERE symbol = ? AND user_id = ?').all(symbol, userId);
    const tenant = TENANTS.get(userId);
    if (!tenant) return;

    for (const trade of openTrades) {
        // --- Atualiza Picos e Valos (MFE/MAE) ---
        let excursionUpdated = false;
        let shouldUpdatePeak = false;
        if (trade.side === 'LONG' && lastPrice > (trade.peakPrice || trade.entryPrice)) shouldUpdatePeak = true;
        else if (trade.side === 'SHORT' && lastPrice < (trade.peakPrice || trade.entryPrice)) shouldUpdatePeak = true;
        
        if (shouldUpdatePeak) {
            db.prepare('UPDATE open_trades SET peakPrice = ? WHERE uniqueId = ?').run(lastPrice, trade.uniqueId);
            trade.peakPrice = lastPrice;
            excursionUpdated = true;
        }

        let shouldUpdateNadir = false;
        if (trade.side === 'LONG' && lastPrice < (trade.nadirPrice || trade.entryPrice)) shouldUpdateNadir = true;
        else if (trade.side === 'SHORT' && lastPrice > (trade.nadirPrice || trade.entryPrice)) shouldUpdateNadir = true;
        
        if (shouldUpdateNadir) {
            db.prepare('UPDATE open_trades SET nadirPrice = ? WHERE uniqueId = ?').run(lastPrice, trade.uniqueId);
            trade.nadirPrice = lastPrice;
            excursionUpdated = true;
        }
        
        if (excursionUpdated) {
            io.to(`user_${userId}`).emit('open_trade_excursion_update', { uniqueId: trade.uniqueId, peakPrice: trade.peakPrice, nadirPrice: trade.nadirPrice });
        }
        
        // --- Lógica de Saída (TP/SL/Trailing) ---
        let outcome = null, exitPrice = null, exitReason = null;
        const config = JSON.parse(trade.configsUsed);
        
        // Trailing Stop Logic (Simulado)
        if (config.useProfitProtection) {
            const currentPnl = ((trade.side === 'LONG' ? (lastPrice - trade.entryPrice) : (trade.entryPrice - lastPrice)) / trade.entryPrice) * 100 * trade.leverage;
            const peakPriceValue = trade.peakPrice || trade.entryPrice;
            const maxPnlValue = ((trade.side === 'LONG' ? (peakPriceValue - trade.entryPrice) : (trade.entryPrice - peakPriceValue)) / trade.entryPrice) * 100 * trade.leverage;

            if (maxPnlValue >= config.profitThresholdPercent && currentPnl <= (maxPnlValue - config.retreatThresholdPercent)) {
                outcome = currentPnl >= 0 ? 'TRAILING WIN' : 'TRAILING LOSS';
                exitPrice = lastPrice;
                exitReason = `Trailing Stop Ativado (Pico: ${maxPnlValue.toFixed(1)}% | Atual: ${currentPnl.toFixed(1)}%)`;
            }
        }

        // TP / SL Fixo
        if (!outcome) {
            if (trade.side === 'LONG') {
                if (trade.takeProfit && lastPrice >= trade.takeProfit) { outcome = 'TAKE PROFIT'; exitPrice = trade.takeProfit; exitReason = 'Alvo de Lucro atingido.'; }
                else if (trade.stopLoss && lastPrice <= trade.stopLoss) { outcome = 'STOP LOSS'; exitPrice = trade.stopLoss; exitReason = 'Limite de perda atingido.'; }
            } else if (trade.side === 'SHORT') {
                if (trade.takeProfit && lastPrice <= trade.takeProfit) { outcome = 'TAKE PROFIT'; exitPrice = trade.takeProfit; exitReason = 'Alvo de Lucro atingido.'; }
                else if (trade.stopLoss && lastPrice >= trade.stopLoss) { outcome = 'STOP LOSS'; exitPrice = trade.stopLoss; exitReason = 'Limite de perda atingido.'; }
            }
        }

        if (outcome) {
            (async () => {
                db.prepare('DELETE FROM open_trades WHERE uniqueId = ?').run(trade.uniqueId);
                
                if (tenant.settings.risk.cooldownMinutes > 0) {
                    const cooldownMs = tenant.settings.risk.cooldownMinutes * 60 * 1000;
                    tenant.state.symbolCooldown.set(symbol, Date.now() + cooldownMs);
                    console.log(chalk.yellow(`[COOLDOWN] Símbolo ${symbol} em cooldown para o usuário ${tenant.userId} por ${tenant.settings.risk.cooldownMinutes} minutos.`));
                }

                // Cálculo Final
                const pnl = ((trade.side === 'LONG' ? (exitPrice - trade.entryPrice) : (trade.entryPrice - exitPrice)) / trade.entryPrice) * 100 * trade.leverage;
                const pnlUsdt = trade.entryValue * (pnl / 100);
                const { totalFeeUsdt, netPnlUsdt } = calculateFinancials(trade, exitPrice, pnlUsdt);
                const durationMs = Date.now() - trade.timestamp;
                const clientData = await getLiveClient(tenant.userId);
                const exitIndicators = await getExitIndicators(trade, exitPrice, clientData?.client);
                
                // Consolidação de Picos Finais
                let finalPeakPrice = trade.peakPrice || trade.entryPrice;
                if (trade.side === 'LONG' && exitPrice > finalPeakPrice) finalPeakPrice = exitPrice;
                else if (trade.side === 'SHORT' && exitPrice < finalPeakPrice) finalPeakPrice = exitPrice;
                const maxPnl = ((trade.side === 'LONG' ? (finalPeakPrice - trade.entryPrice) : (trade.entryPrice - finalPeakPrice)) / trade.entryPrice) * 100 * trade.leverage;
                
                let finalNadirPrice = trade.nadirPrice || trade.entryPrice;
                if (trade.side === 'LONG' && exitPrice < finalNadirPrice) finalNadirPrice = exitPrice;
                else if (trade.side === 'SHORT' && exitPrice > finalNadirPrice) finalNadirPrice = exitPrice;
                const minPnl = ((trade.side === 'LONG' ? (finalNadirPrice - trade.entryPrice) : (trade.entryPrice - finalNadirPrice)) / trade.entryPrice) * 100 * trade.leverage;

                const closedTrade = { ...trade, outcome, exitPrice, pnl, pnlUsdt, durationMs, exitReason, exitIndicators, maxPnl, peakPrice: finalPeakPrice, minPnl, nadirPrice: finalNadirPrice, timestamp: Date.now(), configsUsed: JSON.parse(trade.configsUsed), entryIndicators: JSON.parse(trade.entryIndicators), totalFeeUsdt, netPnlUsdt, user_id: tenant.userId };
                
                const stmt = db.prepare(`INSERT INTO closed_trades (uniqueId, user_id, symbol, side, entryPrice, takeProfit, stopLoss, leverage, entryValue, strategyName, strategyLabel, interval, timestamp, configsUsed, entryIndicators, outcome, exitPrice, pnl, pnlUsdt, durationMs, exitReason, exitIndicators, maxPnl, peakPrice, minPnl, nadirPrice, orderId, totalFeeUsdt, netPnlUsdt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                stmt.run(closedTrade.uniqueId, closedTrade.user_id, closedTrade.symbol, closedTrade.side, closedTrade.entryPrice, closedTrade.takeProfit, closedTrade.stopLoss, closedTrade.leverage, closedTrade.entryValue, closedTrade.strategyName, closedTrade.strategyLabel, closedTrade.interval, closedTrade.timestamp, JSON.stringify(closedTrade.configsUsed), JSON.stringify(closedTrade.entryIndicators), closedTrade.outcome, closedTrade.exitPrice, closedTrade.pnl, closedTrade.pnlUsdt, closedTrade.durationMs, closedTrade.exitReason, JSON.stringify(closedTrade.exitIndicators), closedTrade.maxPnl, closedTrade.peakPrice, closedTrade.minPnl, closedTrade.nadirPrice, closedTrade.orderId, closedTrade.totalFeeUsdt, closedTrade.netPnlUsdt);
                io.to(`user_${tenant.userId}`).emit('trade_closed', closedTrade);
            })();
        }
    }
}

async function handleNewTradeSignal(tradeData) {
    const { user_id: userId } = tradeData;
    const tenant = TENANTS.get(userId);
    if (!tenant) {
        console.error(chalk.red(`[TRADE SIGNAL] Tenant não encontrado para o userId: ${userId}`));
        return;
    }
    const risk = tenant.settings.risk;

    // Bloqueio de duplicatas por usuário
    if (tradeData.strategyName !== 'grid_trading_bingx') {
        if (db.prepare('SELECT 1 FROM open_trades WHERE symbol = ? AND user_id = ?').get(tradeData.symbol, userId)) {
            console.log(chalk.yellow(`[TRADE SIGNAL] Sinal ignorado para ${tradeData.symbol} (já existe trade aberto para o usuário ${userId}).`));
            return;
        }
    }

    const maxTrades = risk.maxTradesPerStrategy || 5; 
    const totalOpenTrades = db.prepare('SELECT COUNT(*) as count FROM open_trades WHERE user_id = ?').get(userId).count;
    if (totalOpenTrades >= maxTrades) {
        if(risk.debugMode) console.log(chalk.yellow(`[MAX TRADES] Limite de ${maxTrades} trades simultâneos atingido para o usuário ${userId}.`));
        return;
    }

    console.log(chalk.green.bold(`  => SINAL DE ${tradeData.side} EM ${tradeData.symbol} VALIDADO E ENVIADO PARA EXECUÇÃO PARA O USUÁRIO ${userId}!`));

    const currentMode = risk.tradingMode;
    let orderResult = null;
    const clientData = await getLiveClient(userId);
    const restClient = clientData?.client || bybitClientManager.getRestClient(); // Fallback to global if tenant client not ready

    if (currentMode === 'LIVE') {
        try {
            const instrumentsInfo = await restClient.getInstrumentsInfo({ category: 'linear', symbol: tradeData.symbol });
            if (instrumentsInfo.retCode !== 0 || !instrumentsInfo.result.list[0]) {
                console.error(chalk.red(`[ORDER ERROR] Falha infos ${tradeData.symbol} para usuário ${userId}.`), instrumentsInfo.retMsg);
                return;
            }
            const instrument = instrumentsInfo.result.list[0];
            console.log(chalk.magenta.bold(`[LIVE MODE] Tentando enviar ordem real para ${tradeData.symbol} (usuário ${userId})...`));
            orderResult = await orderManager.placeOrder(restClient, tradeData, instrument);
            if (!orderResult) {
                console.error(chalk.red.bold(`[ABORT] Falha envio ordem ${tradeData.symbol} para usuário ${userId}.`));
                return;
            }
        } catch(e) {
            console.error(chalk.red.bold(`[CRITICAL LIVE ERROR] ${tradeData.symbol} (usuário ${userId}):`), e.message);
            return;
        }
    }

    const uniqueId = `${tradeData.symbol}-${Date.now()}-${userId}`;
    const tradeWithDetails = { ...tradeData, uniqueId, timestamp: Date.now(), peakPrice: tradeData.entryPrice, nadirPrice: tradeData.entryPrice, orderId: orderResult ? orderResult.orderId : null, entryValue: tradeData.entryValueUSDT, user_id: userId };
    const stmt = db.prepare(`INSERT INTO open_trades (uniqueId, user_id, symbol, side, entryPrice, takeProfit, stopLoss, leverage, entryValue, strategyName, strategyLabel, interval, timestamp, configsUsed, entryIndicators, peakPrice, nadirPrice, orderId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run(tradeWithDetails.uniqueId, tradeWithDetails.user_id, tradeWithDetails.symbol, tradeWithDetails.side, tradeWithDetails.entryPrice, tradeWithDetails.takeProfit, tradeWithDetails.stopLoss, tradeWithDetails.leverage, tradeWithDetails.entryValue, tradeWithDetails.strategyName, tradeWithDetails.strategyLabel, tradeWithDetails.interval, tradeWithDetails.timestamp, JSON.stringify(tradeWithDetails.configsUsed), JSON.stringify(tradeWithDetails.entryIndicators), tradeWithDetails.peakPrice, tradeWithDetails.nadirPrice, tradeWithDetails.orderId);
    io.to(`user_${userId}`).emit('new_trade', tradeWithDetails);
    console.log(chalk.cyan.bold(`[${currentMode === 'LIVE' ? 'LIVE' : 'PAPER'} TRADE LOGGED] ${tradeData.symbol} salvo para usuário ${userId}.`));
}

async function runStrategies() {
    // Itera sobre todos os inquilinos (usuários ativos)
    for (const [userId, tenant] of TENANTS.entries()) {
        if (!tenant.state.isBotRunning) continue;

        const { settings, state } = tenant;
        const availableSymbols = settings.risk.symbolsToMonitor || [];
        
        // Handler para novos sinais injetando o user_id
        const handleTenantTradeSignal = async (tradeData) => {
            const extendedData = { ...tradeData, user_id: userId };
            return handleNewTradeSignal(extendedData);
        };

        for (const [strategyName, timeframes] of Object.entries(settings.enabledStrategies)) {
            if (!timeframes || timeframes.length === 0) continue;
            
            const strategy = STRATEGIES.get(strategyName);
            if (!strategy) continue;

            // ISOLAMENTO DE CORRETORA
            if (state.activeExchange === 'bybit' && strategyName.includes('bingx')) continue;
            if (state.activeExchange === 'bingx' && !strategyName.includes('bingx')) continue;

            const clientData = await getLiveClient(userId);
            const client = clientData?.client;
            
            for (const interval of timeframes) {
                const context = { 
                    restClient: client, 
                    userId,
                    exchangeId: clientData?.exchangeId || state.activeExchange,
                    symbols: availableSymbols, 
                    config: settings.strategyConfigs[strategyName], 
                    risk: settings.risk, 
                    interval, 
                    handleNewTradeSignal: handleTenantTradeSignal, 
                    lastPrices: GLOBAL_PRICES 
                };
                strategy.run(context).catch(err => console.error(chalk.red(`[USER ${userId}] Erro na estratégia ${strategyName}:`), err.message));
            }
        }
    }
}

// --- INICIALIZAÇÃO E SOCKETS ---
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Autenticação necessária (Token ausente)'));
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.user = decoded;
        next();
    } catch (err) {
        return next(new Error('Token inválido'));
    }
});

io.on('connection', async (socket) => {
    const userId = socket.user.id;
    console.log(chalk.green(`[IO] Autenticado: Usuário ${socket.user.username} (ID: ${userId})`));
    
    // Entra na sala privada do usuário para multicasting isolado
    socket.join(`user_${userId}`);

    const tenant = await getTenant(userId);
    if (!tenant) return socket.disconnect();

    const openTrades = db.prepare('SELECT * FROM open_trades WHERE user_id = ?').all(userId)
        .map(t => ({...t, configsUsed: JSON.parse(t.configsUsed), entryIndicators: JSON.parse(t.entryIndicators)}));
    const closedTrades = db.prepare('SELECT * FROM closed_trades WHERE user_id = ? ORDER BY timestamp DESC').all(userId)
        .map(t => ({...t, configsUsed: JSON.parse(t.configsUsed), entryIndicators: JSON.parse(t.entryIndicators), exitIndicators: JSON.parse(t.exitIndicators || '{}')}));
    
    socket.emit('initial_data', { 
        settings: tenant.settings, 
        strategies: Array.from(STRATEGIES.values()), 
        openTrades, 
        closedTrades, 
        isBotRunning: tenant.state.isBotRunning, 
        botStartTime: tenant.state.botStartTime, 
        activeExchange: tenant.state.activeExchange 
    });

    socket.on('toggle_bot', () => {
        tenant.state.isBotRunning = !tenant.state.isBotRunning;
        tenant.state.botStartTime = tenant.state.isBotRunning ? Date.now() : null;
        console.log(chalk.bold.magenta(`[TENANT ${userId}] Bot ${tenant.state.isBotRunning ? 'INICIADO' : 'PARADO'}.`));
        
        if (tenant.state.isBotRunning) {
            // Execução imediata
            runStrategies();
        }
        
        io.to(`user_${userId}`).emit('bot_status_changed', { isBotRunning: tenant.state.isBotRunning, botStartTime: tenant.state.botStartTime });
    });

    socket.on('update_settings', (newSettings) => {
        tenant.settings = newSettings;
        saveTenantSettings(userId, newSettings);
        // Nota: O subsheet global do WS continua gerenciado pelo marketDataService ou re-assinado se necessário
    });

    socket.on('exchange_switched', (newExchange) => {
        tenant.state.activeExchange = newExchange;
        db.prepare('UPDATE users SET active_exchange = ? WHERE id = ?').run(newExchange, userId);
        console.log(chalk.bold.yellow(`[TENANT ${userId}] Corretora Ativa MUDOU para ${newExchange.toUpperCase()}`));
    });

    socket.on('close_single_trade', (uniqueId) => {
        const trade = db.prepare('SELECT * FROM open_trades WHERE uniqueId = ? AND user_id = ?').get(uniqueId, userId);
        if (trade) {
            const currentPrice = GLOBAL_PRICES.get(trade.symbol) || trade.entryPrice;
            // Força fechamento usando lógica similar ao monitoramento
             (async () => {
                db.prepare('DELETE FROM open_trades WHERE uniqueId = ?').run(trade.uniqueId);
                const pnl = ((trade.side === 'LONG' ? (currentPrice - trade.entryPrice) : (trade.entryPrice - currentPrice)) / trade.entryPrice) * 100 * trade.leverage;
                const pnlUsdt = trade.entryValue * (pnl / 100);
                const { totalFeeUsdt, netPnlUsdt } = calculateFinancials(trade, currentPrice, pnlUsdt);
                const durationMs = Date.now() - trade.timestamp;
                const closedTrade = { ...trade, outcome: pnl >= 0 ? 'MANUAL WIN' : 'MANUAL LOSS', exitPrice: currentPrice, pnl, pnlUsdt, durationMs, exitReason: 'Fechamento Manual', exitIndicators: {}, maxPnl: 0, minPnl: 0, peakPrice: currentPrice, nadirPrice: currentPrice, timestamp: Date.now(), configsUsed: JSON.parse(trade.configsUsed), entryIndicators: JSON.parse(trade.entryIndicators), totalFeeUsdt, netPnlUsdt, user_id: userId };
                const stmt = db.prepare(`INSERT INTO closed_trades (uniqueId, user_id, symbol, side, entryPrice, takeProfit, stopLoss, leverage, entryValue, strategyName, strategyLabel, interval, timestamp, configsUsed, entryIndicators, outcome, exitPrice, pnl, pnlUsdt, durationMs, exitReason, exitIndicators, maxPnl, peakPrice, minPnl, nadirPrice, orderId, totalFeeUsdt, netPnlUsdt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                stmt.run(closedTrade.uniqueId, userId, closedTrade.symbol, closedTrade.side, closedTrade.entryPrice, closedTrade.takeProfit, closedTrade.stopLoss, closedTrade.leverage, closedTrade.entryValue, closedTrade.strategyName, closedTrade.strategyLabel, closedTrade.interval, closedTrade.timestamp, JSON.stringify(closedTrade.configsUsed), JSON.stringify(closedTrade.entryIndicators), closedTrade.outcome, closedTrade.exitPrice, closedTrade.pnl, closedTrade.pnlUsdt, closedTrade.durationMs, closedTrade.exitReason, JSON.stringify(closedTrade.exitIndicators), closedTrade.maxPnl, closedTrade.peakPrice, closedTrade.minPnl, closedTrade.nadirPrice, closedTrade.orderId, closedTrade.totalFeeUsdt, closedTrade.netPnlUsdt);
                io.to(`user_${userId}`).emit('trade_closed', closedTrade);
             })();
        }
    });
    
    socket.on('close_all_trades', () => {
        const trades = db.prepare('SELECT * FROM open_trades WHERE user_id = ?').all(userId);
        trades.forEach(trade => {
             const currentPrice = GLOBAL_PRICES.get(trade.symbol) || trade.entryPrice;
             // Mesma lógica manual repetida
             (async () => {
                db.prepare('DELETE FROM open_trades WHERE uniqueId = ?').run(trade.uniqueId);
                const pnl = ((trade.side === 'LONG' ? (currentPrice - trade.entryPrice) : (trade.entryPrice - currentPrice)) / trade.entryPrice) * 100 * trade.leverage;
                const pnlUsdt = trade.entryValue * (pnl / 100);
                const { totalFeeUsdt, netPnlUsdt } = calculateFinancials(trade, currentPrice, pnlUsdt);
                const durationMs = Date.now() - trade.timestamp;
                const closedTrade = { ...trade, outcome: pnl >= 0 ? 'MANUAL WIN' : 'MANUAL LOSS', exitPrice: currentPrice, pnl, pnlUsdt, durationMs, exitReason: 'Fechamento Manual (Todos)', exitIndicators: {}, maxPnl: 0, minPnl: 0, peakPrice: currentPrice, nadirPrice: currentPrice, timestamp: Date.now(), configsUsed: JSON.parse(trade.configsUsed), entryIndicators: JSON.parse(trade.entryIndicators), totalFeeUsdt, netPnlUsdt, user_id: userId };
                const stmt = db.prepare(`INSERT INTO closed_trades (uniqueId, user_id, symbol, side, entryPrice, takeProfit, stopLoss, leverage, entryValue, strategyName, strategyLabel, interval, timestamp, configsUsed, entryIndicators, outcome, exitPrice, pnl, pnlUsdt, durationMs, exitReason, exitIndicators, maxPnl, peakPrice, minPnl, nadirPrice, orderId, totalFeeUsdt, netPnlUsdt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                stmt.run(closedTrade.uniqueId, userId, closedTrade.symbol, closedTrade.side, closedTrade.entryPrice, closedTrade.takeProfit, closedTrade.stopLoss, closedTrade.leverage, closedTrade.entryValue, closedTrade.strategyName, closedTrade.strategyLabel, closedTrade.interval, closedTrade.timestamp, JSON.stringify(closedTrade.configsUsed), JSON.stringify(closedTrade.entryIndicators), closedTrade.outcome, closedTrade.exitPrice, closedTrade.pnl, closedTrade.pnlUsdt, closedTrade.durationMs, closedTrade.exitReason, JSON.stringify(closedTrade.exitIndicators), closedTrade.maxPnl, closedTrade.peakPrice, closedTrade.minPnl, closedTrade.nadirPrice, closedTrade.orderId, closedTrade.totalFeeUsdt, closedTrade.netPnlUsdt);
                io.to(`user_${userId}`).emit('trade_closed', closedTrade);
             })();
        });
    });

    socket.on('clear_trade_history', () => {
        try {
            db.prepare('DELETE FROM open_trades WHERE user_id = ?').run(userId);
            db.prepare('DELETE FROM closed_trades WHERE user_id = ?').run(userId);
            io.to(`user_${userId}`).emit('trades_updated', { openTrades: [], closedTrades: [] });
        } catch (error) { console.error(error); }
    });

    socket.on('disconnect', () => console.log(chalk.yellow('[IO] Cliente desconectado:', socket.id)));
});

async function broadcastAccountBalance(userId) {
    try {
        const data = await getLiveClient(userId);
        if (!data) return;
        
        const { client, exchangeId } = data;
        let balanceUsdt = 0;

        // Usa fetchBalance do CCXT unificado (funciona em BingX, Bybit, etc)
        const bal = await client.fetchBalance();
        if (bal?.USDT?.total !== undefined) {
            balanceUsdt = parseFloat(bal.USDT.total) || 0;
        } else if (bal?.total?.USDT !== undefined) {
            balanceUsdt = parseFloat(bal.total.USDT) || 0;
        }
        
        console.log(chalk.green(`[WALLET] Usuário ${userId} | ${exchangeId.toUpperCase()} | Saldo USDT: ${balanceUsdt.toFixed(2)}`));
        io.to(`user_${userId}`).emit('wallet_balance_update', { balance: balanceUsdt, exchange: exchangeId });
    } catch(e) {
        console.error(chalk.red(`[WALLET ${userId}] Erro ao buscar saldo:`), e.message);
    }
}


async function main() {
    console.log(chalk.bold.inverse('--- INICIANDO SERVIDOR DO BOT ---'));
    
    // No boot Multi-Tenant, o motor agnóstico espera conexões.
    console.log(chalk.bold.yellow(`[SYSTEM] Motor em modo Multi-Tenant (Aguardando Sessões).`));

    const { initTelegramBot, registerDynamicTunnelUrl } = require('./services/telegramBot.js');
    initTelegramBot();
    
    // --- RESTAURANDO AUTO-TÚNEL DO CLOUDFLARE ---
    const { spawn } = require('child_process');
    console.log(chalk.cyan('[TUNNEL] Iniciando ponte Cloudflare invisível...'));
    const cloudflared = spawn('npx', ['cloudflared', 'tunnel', '--url', 'http://localhost:5173'], {
        shell: true
    });

    cloudflared.stderr.on('data', (data) => {
        const output = data.toString();
        // Regex para capturar a URL gerada (termos como trycloudflare.com)
        const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match) {
            const url = match[0];
            console.log(chalk.green.bold(`\n[TUNNEL] URL Pública Capturada: ${url}`));
            // Injeta instantaneamente no Telegram WebApp de todos os usuários
            registerDynamicTunnelUrl(url);
        }
    });

    // Carrega símbolos de interesse global (fallback para monitoramento inicial)
    const settingsFilePath = path.join(__dirname, 'settings.json');
    let initialSymbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
    try {
        if (fs.existsSync(settingsFilePath)) {
            const tempSettings = JSON.parse(fs.readFileSync(settingsFilePath, 'utf-8'));
            if (tempSettings.risk?.symbolsToMonitor) initialSymbols = tempSettings.risk.symbolsToMonitor;
        }
    } catch(e) {}
    
    const wsClient = bybitClientManager.wsClient;
    
    wsClient.on('update', (data) => {
        if (data.data && data.data.symbol && data.data.lastPrice) {
            const price = parseFloat(data.data.lastPrice);
            GLOBAL_PRICES.set(data.data.symbol, price);
            
            // Notifica todos os inquilinos interessados
            for (const [userId, tenant] of TENANTS.entries()) {
                if (tenant.state.isBotRunning) {
                    monitorPaperTrades(userId, data.data.symbol, price);
                    io.to(`user_${userId}`).emit('ticker_update', { symbol: data.data.symbol, lastPrice: price });
                }
            }
        }
    });

    if (initialSymbols.length > 0) {
        console.log(chalk.blue(`[WS] Inscrevendo ${initialSymbols.length} símbolos iniciais para o pool global...`));
        wsClient.subscribeV5(initialSymbols.map(s => `tickers.${s}`), 'linear');
    }

    // Motor de execução de HFT: Avalia estratégias a cada 2 segundos para Reação Instantânea
    setInterval(runStrategies, 2000);
    // Indicadores em Tempo Real puxados a cada 5 segundos (Limite de segurança da API)
    setInterval(async () => {
        for (const userId of TENANTS.keys()) {
            const tenant = TENANTS.get(userId);
            if (tenant && tenant.state.isBotRunning) {
                // Implementação simplificada de indicadores por usuário
                const openTrades = db.prepare('SELECT * FROM open_trades WHERE user_id = ?').all(userId);
                if (openTrades.length === 0) continue;
                const indicatorsPromises = openTrades.map(trade => getRichIndicatorsForSymbol(trade.symbol, trade.interval));
                const indicatorsResults = await Promise.all(indicatorsPromises);
                const updatedTrades = openTrades.map((trade, index) => ({ uniqueId: trade.uniqueId, liveIndicators: indicatorsResults[index] }));
                io.to(`user_${userId}`).emit('open_trades_indicators_update', updatedTrades);
            }
        }
    }, 5000);
    // Saldo em tempo real atualizado a cada 30 segundos
    setInterval(async () => {
        for (const userId of TENANTS.keys()) {
            await broadcastAccountBalance(userId);
        }
    }, 30000);

    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
        console.log(chalk.green(`[SERVER] Rodando em http://localhost:${PORT}`));
    });
}

main();