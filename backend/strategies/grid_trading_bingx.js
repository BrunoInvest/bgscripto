// backend/strategies/grid_trading_bingx.js
const ccxt = require('ccxt');
const db = require('../database.js');
const { decrypt } = require('../utils/cryptoUtils.js');
const chalk = require('chalk');
const TA = require('technicalindicators');

// Multi-Tenant Isolation: The client is gracefully injected by the User's master engine loop via Context.

async function analyzeSymbol(context, symbol) {
    if (symbol !== 'BTCUSDT') return;

    const { config, risk, restClient } = context;
    const spacing = config.gridSpacingUSDT;
    if (!spacing || spacing <= 0) return;

    let isBearish = true;
    let trendDebugInfo = '';

    if (config.useTrendFilter) {
        try {
            const klineRes = await restClient.getKline({ category: 'linear', symbol, interval: '60', limit: Math.max(config.emaTrendPeriod, config.adxPeriod) + 10 });
            if (klineRes.retCode === 0 && klineRes.result && klineRes.result.list) {
                const candles = klineRes.result.list.reverse().map(c => ({
                    high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4])
                }));
                const closes = candles.map(c => c.close);
                const highs = candles.map(c => c.high);
                const lows = candles.map(c => c.low);
                
                const ema = TA.EMA.calculate({ period: config.emaTrendPeriod, values: closes });
                const adx = TA.ADX.calculate({ high: highs, low: lows, close: closes, period: config.adxPeriod });
                
                if (ema.length >= 2 && adx.length >= 2) {
                    const lastCandle = candles[candles.length - 1];
                    const lastEma = ema[ema.length - 1];
                    const lastAdx = adx[adx.length - 1].adx;
                    
                    isBearish = (lastAdx > config.adxMinLevel) && (lastCandle.close < lastEma);
                    trendDebugInfo = `(ADX: ${lastAdx.toFixed(1)}, MME: ${lastEma.toFixed(1)}, Funciona Abaixo de: ${lastEma.toFixed(1)})`;
                    
                    if (!isBearish && risk.debugMode) {
                        console.log(chalk.gray(`[DEBUG] GRID ${symbol} | Tendência não é de BAIXA clara ${trendDebugInfo}. Grades pausadas.`));
                    }
                }
            }
        } catch (e) {
            console.error(chalk.red(`[GRID] Erro na análise de tendência: ${e.message}`));
        }
    }

    if (risk.tradingMode === 'PAPER') {
        const currentPrice = context.lastPrices ? context.lastPrices.get(symbol) : null;
        if (!currentPrice) return; 

        // CRITICAL: Isolamento por Inquilino (Multi-Tenant)
        const userId = context.userId;
        const openTrades = db.prepare('SELECT entryPrice FROM open_trades WHERE symbol = ? AND strategyName = ? AND user_id = ?').all(symbol, 'grid_trading_bingx', userId);
        const activeLevels = openTrades.map(t => t.entryPrice);

        const nearestGridHit = currentPrice - (currentPrice % spacing);
        const exists = activeLevels.some(price => Math.abs(price - nearestGridHit) < (spacing * 0.1));

        if (risk.debugMode) {
            console.log(chalk.gray(`[DEBUG] GRID PAPER ${symbol} (Tenant: ${userId}) | Preço: $${currentPrice.toFixed(2)} | Menor Alvo: $${nearestGridHit} | Ativos: ${openTrades.length}/${config.maxActiveGrids}`));
        }

        if (!exists && openTrades.length < config.maxActiveGrids) {
            if (config.useTrendFilter && !isBearish) return; // Interrompe a armação se não estiver em tendência de baixa

            console.log(chalk.cyan(`[GRID PAPER] Simulando execução de Limit Compra no degrau $${nearestGridHit} para ${symbol}!`));
            const tpPercent = config.takeProfitPercent / 100;
            const takeProfitPrice = nearestGridHit * (1 + tpPercent);

            context.handleNewTradeSignal({
                symbol, side: 'LONG', entryPrice: nearestGridHit, 
                takeProfit: takeProfitPrice, stopLoss: null,
                leverage: risk.leverage, entryValueUSDT: risk.entryValueUSDT,
                strategyName: 'grid_trading_bingx', strategyLabel: 'Grid Trading (BingX)', interval: 1, 
                configsUsed: config, 
                entryIndicators: {
                    AlvoDaGrade: `$${nearestGridHit}`,
                    TakeProfitProgramado: `$${takeProfitPrice.toFixed(2)}`,
                    EspaçamentoConfigurado: `$${spacing}`,
                    Modo: 'Simulação Integrada'
                }
            });
        }
        return; // Encerra fluxo do Paper
    }

    // --- LIVE TRADING (BINGX NATIVA) ---
    const client = context.restClient;
    if (!client || context.exchangeId !== 'bingx') return; // Não configurado ou não é bingx

    const ccxtSymbol = symbol.replace('USDT', '/USDT:USDT'); // Formato CCXT Linear Swap

    try {
        const ticker = await client.fetchTicker(ccxtSymbol);
        const currentPrice = ticker.last;

        const openOrders = await client.fetchOpenOrders(ccxtSymbol);
        const buyOrders = openOrders.filter(o => o.side === 'buy' && o.type === 'limit');

        const firstGridLevel = currentPrice - (currentPrice % spacing) - (currentPrice % spacing === 0 ? spacing : 0);
        let missingLevels = [];

        for (let i = 0; i < config.maxActiveGrids; i++) {
            const levelPrice = firstGridLevel - (i * spacing);
            const exists = buyOrders.some(o => Math.abs(o.price - levelPrice) < (spacing * 0.1));
            
            if (!exists) {
                missingLevels.push(levelPrice);
            }
        }

        const missingLevelsCount = missingLevels.length;

        if (risk.debugMode) {
            console.log(chalk.gray(`[DEBUG] GRID NATIVE ${symbol} | Preço: $${currentPrice.toFixed(2)} | Limites Ativos: ${buyOrders.length} | Faltam: ${missingLevelsCount}`));
        }

        if (missingLevelsCount > 0) {
            if (config.useTrendFilter && !isBearish) {
                return; // Impede posicionar novas redes na BingX se a tendência H1 não for de baixa
            }
            
            console.log(chalk.cyan(`[GRID BINGX] ${symbol} | Faltam ${missingLevelsCount} ordens na grade. Preço Atual: $${currentPrice.toFixed(2)}`));
            
            const markets = await client.loadMarkets();
            const market = markets[ccxtSymbol];
            if (!market) return;

            const qtyStep = market.precision.amount;
            
            for (const priceTarget of missingLevels) {
                let rawQty = (risk.entryValueUSDT * risk.leverage) / priceTarget;
                const precisionParts = qtyStep.toString().split('.');
                const decimals = precisionParts.length > 1 ? precisionParts[1].length : 0;
                let adjustedQty = parseFloat(rawQty.toFixed(decimals));
                
                if (adjustedQty < market.limits.amount.min) {
                    adjustedQty = market.limits.amount.min;
                }

                const tpPercent = config.takeProfitPercent / 100;
                const takeProfitPrice = priceTarget * (1 + tpPercent);

                try {
                    await client.createOrder(ccxtSymbol, 'limit', 'buy', adjustedQty, priceTarget, {
                        positionSide: 'LONG',
                        takeProfit: {
                            type: 'TAKE_PROFIT_MARKET',
                            triggerPrice: takeProfitPrice
                        }
                    });
                    console.log(chalk.green(`  -> Ordem LIMIT (Buy) armada em $${priceTarget} com TP em $${takeProfitPrice}`));
                } catch (oe) {
                    console.error(chalk.red(`  -> Falha ao armar rede em ${priceTarget}: `), oe.message);
                }
            }
        }
    } catch (error) {
        console.error(chalk.red(`[ERROR GRID BINGX] ${symbol}: ${error.message}`));
    }
}

const strategy = {
    name: 'grid_trading_bingx',
    label: 'Grid Trading (Exclusivo BingX)',
    description: `<p>A Estratégia de Grade perfeita. Posiciona redes de **COMPRA (Long)** limitadas nas quedas do preço e estipula saídas independentes por lote.</p>
    <p>Esta estratégia atua diretamente na BingX, não misturando o preço médio de todas as entradas, o que garante fechamentos com lucro absoluto degrau por degrau.</p>`,
    config: {
        gridSpacingUSDT: 500,
        takeProfitPercent: 1.5,
        maxActiveGrids: 5,
        useTrendFilter: false,
        emaTrendPeriod: 50,
        adxPeriod: 14,
        adxMinLevel: 25
    },
    parameterLabels: {
        gridSpacingUSDT: { label: 'Espaçamento da Grade (USDT)', tooltip: 'Distância em dólares entre uma ordem armada e outra.' },
        takeProfitPercent: { label: 'Take Profit (Variação do Preço %)', tooltip: 'Exemplo: Se colocar 1%, a moeda precisa subir 1% no gráfico para fechar. (Se estiver 10x alavancado, isso rende 10% puro na sua margem!).' },
        maxActiveGrids: { label: 'Limites Simultâneos', tooltip: 'Quantas ordens podem ficar "penduradas" ao mesmo tempo para baixo.' },
        useTrendFilter: { label: 'Usar Filtro de Tendência (H1)', tooltip: 'Se marcado, o Bot SÓ monta grades para baixo se o mercado estiver apontando uma forte Tendência de Baixa (Garante melhores pulls).' },
        emaTrendPeriod: { label: 'Período EMA (H1)', tooltip: 'Tamanho da MME para medir a tendência (Padrão 50).' },
        adxPeriod: { label: 'Período ADX', tooltip: 'Tamanho do ADX para medir a Força da tendência (Padrão 14).' },
        adxMinLevel: { label: 'Força Mínima ADX', tooltip: 'Acima desse valor (ex: 25) consideramos que a tendência é real, não lateralidade.' }
    },
    
    async run(context) {
        const { symbols } = context;
        // Não prendemos ao fechamento de vela. O Grid processa sempre que é acionado.
        for (const symbol of symbols) {
            await analyzeSymbol(context, symbol);
        }
    }
};

strategy.analyzeSymbol = analyzeSymbol;
module.exports = strategy;
