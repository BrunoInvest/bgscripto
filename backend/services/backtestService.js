// backend/services/backtestService.js

const bybitClientManager = require('./bybitClient');
const chalk = require('chalk');

const ESTIMATED_FEE_RATE = 0.00055; // 0.055% Taker fee

// Função auxiliar para calcular percentis (ex: P50 = Mediana, P75 = Top 25%)
function getPercentile(data, percentile) {
    if (data.length === 0) return 0;
    data.sort((a, b) => a - b);
    const index = (percentile / 100) * (data.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    return data[lower] * (1 - weight) + data[upper] * weight;
}

const backtestService = {
  // Baixa os candles de UMA moeda (com paginação para baixar mais de 1000)
  async fetchCandlesForSymbol(symbol, interval, startTime, endTime) {
    const client = bybitClientManager.getRestClient();
    let allCandles = [];
    let currentEnd = endTime;
    const limit = 1000;

    while (currentEnd > startTime) {
      try {
        const response = await client.getKline({
            category: 'linear', symbol, interval, end: currentEnd, limit
        });

        if (response.retCode !== 0 || !response.result.list || !response.result.list.length) break;

        const chunk = response.result.list;
        allCandles = [...allCandles, ...chunk];
        
        const oldestCandleTime = parseInt(chunk[chunk.length - 1][0]);
        currentEnd = oldestCandleTime - (parseInt(interval) * 60 * 1000);

        if (oldestCandleTime <= startTime) break;
        // Pequeno delay para não estourar rate limit da API
        await new Promise(r => setTimeout(r, 20)); 
      } catch (e) {
          console.error(chalk.red(`[DOWNLOAD ERROR ${symbol}]`), e.message);
          break;
      }
    }

    return allCandles
      .map(c => ({
        startTime: parseInt(c[0]),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
        raw: c 
      }))
      .sort((a, b) => a.startTime - b.startTime)
      .filter(c => c.startTime >= startTime && c.startTime <= endTime);
  },

  // --- OTIMIZADOR DE PARÂMETROS (MFE/MAE - "IA") ---
  calculateOptimalParams(trades, marketData) {
      const suggestions = {};

      // Agrupa trades por Símbolo, Estratégia e Timeframe
      const groups = {};
      trades.forEach(t => {
          const key = `${t.symbol}|${t.strategyName}|${t.interval}`;
          if (!groups[key]) groups[key] = [];
          groups[key].push(t);
      });

      for (const key in groups) {
          const groupTrades = groups[key];
          const [symbol, strategyName, interval] = key.split('|');
          const candles = marketData[symbol];
          
          if (!candles || groupTrades.length < 3) continue; // Precisa de mín. 3 trades para estatística relevante

          const mfeList = []; // Max Profit possível (Maximum Favorable Excursion)
          const maeList = []; // Max Drawdown sofrido (Maximum Adverse Excursion)

          groupTrades.forEach(trade => {
              // Encontra o candle de entrada pelo timestamp exato
              const entryIndex = candles.findIndex(c => c.startTime === trade.rawEntryTime);
              
              if (entryIndex === -1) return;

              // Olha até 200 candles para frente (Horizonte de Análise)
              const lookAhead = 200; 
              const futureCandles = candles.slice(entryIndex, entryIndex + lookAhead);

              let maxPnl = 0;
              let maxDrawdown = 0;

              for (const candle of futureCandles) {
                  let currentHighPnl, currentLowPnl;
                  
                  // Calcula variação percentual pura (sem alavancagem para a estatística)
                  if (trade.side === 'LONG') {
                      currentHighPnl = ((candle.high - trade.entryPrice) / trade.entryPrice) * 100;
                      currentLowPnl = ((candle.low - trade.entryPrice) / trade.entryPrice) * 100;
                  } else {
                      currentHighPnl = ((trade.entryPrice - candle.low) / trade.entryPrice) * 100;
                      currentLowPnl = ((trade.entryPrice - candle.high) / trade.entryPrice) * 100;
                  }

                  if (currentHighPnl > maxPnl) maxPnl = currentHighPnl;
                  if (currentLowPnl < maxDrawdown) maxDrawdown = currentLowPnl;
              }

              // Só consideramos MAE de trades que tiveram algum potencial de lucro 
              // (para filtrar erros grosseiros onde o trade só deu prejuízo direto)
              if (maxPnl > 0.2) { 
                  maeList.push(Math.abs(maxDrawdown));
              }
              mfeList.push(maxPnl);
          });

          // --- LÓGICA DE SUGESTÃO ESTATÍSTICA (ATUALIZADA: MAIS AGRESSIVA) ---
          
          // TP Ideal: P75. Isso busca os movimentos maiores.
          // Significa que estamos dispostos a perder alguns trades curtos para tentar pegar os 25-30% melhores movimentos.
          const optimalTpRaw = getPercentile(mfeList, 75); 
          
          // SL Ideal: P85. O stop deve ser seguro o suficiente para aguentar a "violinada" de 85% dos trades vencedores.
          const optimalSlRaw = getPercentile(maeList, 85); 

          // Se os valores forem muito pequenos (ruído), ignoramos para não criar stops de 0.05%
          if (optimalTpRaw > 0.15 && optimalSlRaw > 0.15) {
              suggestions[key] = {
                  symbol,
                  strategyName,
                  interval,
                  // Margem de segurança leve
                  suggestedTpPercent: (optimalTpRaw * 0.95).toFixed(2), 
                  suggestedSlPercent: (optimalSlRaw * 1.1).toFixed(2),
                  confidence: groupTrades.length > 15 ? 'Alta' : 'Moderada'
              };
          }
      }

      return suggestions;
  },

  // --- MOTOR DE PORTFÓLIO (SIMULAÇÃO CRONOLÓGICA) ---
  // Aceita activePairs para usar configurações salvas (Overrides)
  async runPortfolioBacktest(strategy, config, symbols, interval, startTime, endTime, initialCapital, entryValue, leverage, maxConcurrentTrades, activePairs = []) {
    console.log(chalk.blue(`[BACKTEST ENGINE] Iniciando simulação para ${symbols.length} pares no timeframe ${interval}m...`));
    
    // 1. CARREGAMENTO DE DADOS (Lotes de 5 para não estourar memória/API)
    const marketData = {};
    const timestampsSet = new Set();
    const BATCH_SIZE = 5;

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        const batch = symbols.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (sym) => {
            const candles = await this.fetchCandlesForSymbol(sym, interval, startTime, endTime);
            if (candles.length >= config.CANDLE_LIMIT) {
                marketData[sym] = candles;
                candles.forEach(c => timestampsSet.add(c.startTime));
            } else {
                console.warn(chalk.yellow(`[WARN] Dados insuficientes para ${sym}. Ignorando.`));
            }
        }));
    }

    // Cria linha do tempo mestre (ordenada)
    const masterTimeline = Array.from(timestampsSet).sort((a, b) => a - b);
    
    if (masterTimeline.length === 0) {
        return { 
            globalStats: { totalPnl: "0.00", totalTrades: 0, wins: 0, bankruptcies: 0, maxDrawdown: "0.00", totalFeesPaid: "0.00", maxConcurrentReached: 0, equityCurve: [] }, 
            detailedResults: [], 
            trades: [] 
        };
    }

    console.log(chalk.green(`[DATA] ${interval}m: ${masterTimeline.length} candles sincronizados. Processando lógica...`));

    // Variáveis de Estado
    let balance = parseFloat(initialCapital);
    let openPositions = []; 
    const closedTrades = [];
    const analysisTrades = []; // Array auxiliar com dados crus para o otimizador
    let isBankrupt = false;
    const startIndex = config.CANDLE_LIMIT;

    // Estatísticas Avançadas
    let peakBalance = balance;
    let maxDrawdown = 0;
    let maxConcurrentReached = 0;
    let totalFeesPaid = 0;
    const equityCurve = [{ time: masterTimeline[0], balance: balance }];

    // --- LOOP MESTRE (CRONOLÓGICO) ---
    for (let t = startIndex; t < masterTimeline.length; t++) {
        const currentTime = masterTimeline[t];

        if (balance <= 0) { isBankrupt = true; break; }

        // A. GERENCIAR POSIÇÕES ABERTAS
        for (let i = openPositions.length - 1; i >= 0; i--) {
            const trade = openPositions[i];
            const symbolData = marketData[trade.symbol];
            
            if (!symbolData) continue;
            const currentCandle = symbolData.find(c => c.startTime === currentTime);
            if (!currentCandle) continue;

            let exitPrice = null;
            let exitReason = null;
            let outcome = null;

            // Determina a configuração usada (pode ser override específico do par)
            const tradeConfig = trade.configsUsed || config;

            // --- TRAILING STOP LOGIC ---
            if (tradeConfig.useProfitProtection) {
                if (trade.side === 'LONG') {
                    if (currentCandle.high > trade.highestPrice) trade.highestPrice = currentCandle.high;
                } else {
                    if (currentCandle.low < trade.lowestPrice) trade.lowestPrice = currentCandle.low;
                }

                let maxPnlPct = 0;
                if (trade.side === 'LONG') {
                    maxPnlPct = ((trade.highestPrice - trade.entryPrice) / trade.entryPrice) * 100 * leverage;
                } else {
                    maxPnlPct = ((trade.entryPrice - trade.lowestPrice) / trade.entryPrice) * 100 * leverage;
                }

                if (maxPnlPct >= tradeConfig.profitThresholdPercent) {
                    const stopPnl = maxPnlPct - tradeConfig.retreatThresholdPercent;
                    let dynamicStopPrice = 0;
                    if (trade.side === 'LONG') {
                        dynamicStopPrice = trade.entryPrice * (1 + (stopPnl / leverage / 100)); 
                        if (dynamicStopPrice > trade.stopLoss) {
                            trade.stopLoss = dynamicStopPrice;
                            trade.isTrailingActive = true;
                        }
                    } else {
                        dynamicStopPrice = trade.entryPrice * (1 - (stopPnl / leverage / 100));
                        if (dynamicStopPrice < trade.stopLoss) {
                            trade.stopLoss = dynamicStopPrice;
                            trade.isTrailingActive = true;
                        }
                    }
                }
            }

            // --- CHECAGEM DE SAÍDA (PRIORIDADE PARA O TAKE PROFIT) ---
            if (trade.side === 'LONG') {
                if (currentCandle.high >= trade.takeProfit) {
                    exitPrice = trade.takeProfit;
                    exitReason = 'Take Profit';
                    outcome = 'WIN';
                } else if (currentCandle.low <= trade.stopLoss) {
                    exitPrice = trade.stopLoss;
                    exitReason = trade.isTrailingActive ? 'Trailing Stop' : 'Stop Loss';
                    outcome = trade.isTrailingActive ? 'WIN' : 'LOSS';
                }
            } else { // SHORT
                if (currentCandle.low <= trade.takeProfit) {
                    exitPrice = trade.takeProfit;
                    exitReason = 'Take Profit';
                    outcome = 'WIN';
                } else if (currentCandle.high >= trade.stopLoss) {
                    exitPrice = trade.stopLoss;
                    exitReason = trade.isTrailingActive ? 'Trailing Stop' : 'Stop Loss';
                    outcome = trade.isTrailingActive ? 'WIN' : 'LOSS';
                }
            }

            // Forçar saída no fim do período
            if (!exitPrice && t === masterTimeline.length - 1) {
                exitPrice = currentCandle.close;
                exitReason = 'Fim do Período';
                outcome = 'NEUTRAL';
            }

            if (exitPrice) {
                // Cálculos Financeiros
                const pnlPercent = ((trade.side === 'LONG' ? (exitPrice - trade.entryPrice) : (trade.entryPrice - exitPrice)) / trade.entryPrice) * 100 * leverage;
                const margin = parseFloat(entryValue);
                const grossPnl = margin * (pnlPercent / 100);
                
                const positionSize = margin * leverage;
                const entryFee = positionSize * ESTIMATED_FEE_RATE;
                const exitFee = (positionSize / trade.entryPrice * exitPrice) * ESTIMATED_FEE_RATE;
                const fees = entryFee + exitFee;
                const netPnl = grossPnl - fees;

                balance += netPnl;
                totalFeesPaid += fees;

                if (balance > peakBalance) {
                    peakBalance = balance;
                } else {
                    const dd = ((peakBalance - balance) / peakBalance) * 100;
                    if (dd > maxDrawdown) maxDrawdown = dd;
                }

                equityCurve.push({ time: currentTime, balance: balance });

                // Objeto para exibição (com datas formatadas)
                const closedTradeObj = {
                    symbol: trade.symbol,
                    interval: interval,
                    strategyName: strategy.name,
                    date: new Date(trade.entryTime).toLocaleString(),
                    exitDate: new Date(currentCandle.startTime).toLocaleString(),
                    side: trade.side,
                    entryPrice: trade.entryPrice,
                    exitPrice: exitPrice,
                    exitReason: exitReason,
                    pnlPercent: pnlPercent.toFixed(2),
                    netPnl: netPnl.toFixed(2),
                    fees: fees.toFixed(2),
                    configsUsed: tradeConfig
                };
                closedTrades.push(closedTradeObj);

                // Objeto para análise (com timestamp numérico)
                analysisTrades.push({
                    symbol: trade.symbol,
                    strategyName: strategy.name,
                    interval: interval,
                    side: trade.side,
                    entryPrice: trade.entryPrice,
                    rawEntryTime: trade.entryTime 
                });

                openPositions.splice(i, 1);
            }
        }

        // B. BUSCAR NOVAS ENTRADAS
        if (openPositions.length < maxConcurrentTrades) {
            const shuffledSymbols = [...symbols].sort(() => 0.5 - Math.random());

            for (const sym of shuffledSymbols) {
                if (openPositions.length >= maxConcurrentTrades) break;
                if (openPositions.find(p => p.symbol === sym)) continue; // Sem pyramiding

                const symbolCandles = marketData[sym];
                if (!symbolCandles) continue;
                const currentCandle = symbolCandles.find(c => c.startTime === currentTime);
                if (!currentCandle) continue;

                const candleIndex = symbolCandles.indexOf(currentCandle);
                if (candleIndex < config.CANDLE_LIMIT) continue;

                const historicSlice = symbolCandles.slice(candleIndex - config.CANDLE_LIMIT + 1, candleIndex + 1).map(c => c.raw).reverse();

                const mockRestClient = { getKline: async () => ({ retCode: 0, result: { list: historicSlice } }) };
                const mockRisk = { leverage: parseInt(leverage), entryValueUSDT: parseFloat(entryValue), debugMode: false };

                let signal = null;
                const handleSignal = (tradeData) => { signal = tradeData; };

                // --- LÓGICA DE OVERRIDE (CONFIGURAÇÃO ESPECÍFICA) ---
                // Se activePairs foi passado, verifica se este par tem configuração específica salva
                let effectiveConfig = { ...config };
                
                if (activePairs && activePairs.length > 0) {
                    const specificConfig = activePairs.find(p => 
                        p.symbol === sym && 
                        p.interval === interval && 
                        p.strategy === strategy.name
                    );

                    if (specificConfig && specificConfig.overrides) {
                        // Mescla os overrides (TP, SL) na config que será usada
                        effectiveConfig = { ...effectiveConfig, ...specificConfig.overrides };
                    }
                }
                // -----------------------------------------------------

                await strategy.analyzeSymbol({
                    restClient: mockRestClient, 
                    config: effectiveConfig, // Passa a config (potencialmente customizada)
                    interval, 
                    handleNewTradeSignal: handleSignal, 
                    risk: mockRisk
                }, sym);

                if (signal && balance >= parseFloat(entryValue)) {
                    openPositions.push({
                        symbol: sym,
                        side: signal.side,
                        entryPrice: currentCandle.close,
                        takeProfit: signal.takeProfit,
                        stopLoss: signal.stopLoss,
                        entryTime: currentCandle.startTime,
                        highestPrice: currentCandle.close,
                        lowestPrice: currentCandle.close,
                        isTrailingActive: false,
                        strategyName: strategy.name,
                        configsUsed: effectiveConfig // Salva a config usada para o loop de saída
                    });
                }
            }
        }

        if (openPositions.length > maxConcurrentReached) maxConcurrentReached = openPositions.length;
    }

    const wins = closedTrades.filter(t => parseFloat(t.netPnl) > 0).length;
    const totalPnl = balance - parseFloat(initialCapital);

    // --- CÁLCULO DE OTIMIZAÇÃO (MFE/MAE) ---
    const optimizationSuggestions = this.calculateOptimalParams(analysisTrades, marketData);

    const resultsByPair = {};
    symbols.forEach(sym => {
        const pairTrades = closedTrades.filter(t => t.symbol === sym);
        if (pairTrades.length > 0) {
            const pairPnl = pairTrades.reduce((acc, t) => acc + parseFloat(t.netPnl), 0);
            const pairWins = pairTrades.filter(t => parseFloat(t.netPnl) > 0).length;
            const key = `${sym}|${strategy.name}|${interval}`;
            
            resultsByPair[sym] = {
                symbol: sym,
                interval: interval,
                strategyName: strategy.name,
                stats: {
                    totalTrades: pairTrades.length,
                    totalPnl: pairPnl.toFixed(2),
                    winRate: ((pairWins / pairTrades.length) * 100).toFixed(2),
                    isBankrupt: false 
                },
                optimization: optimizationSuggestions[key] || null 
            };
        }
    });

    return {
        globalStats: {
            totalTrades: closedTrades.length,
            wins,
            winRate: closedTrades.length > 0 ? ((wins / closedTrades.length) * 100).toFixed(2) : "0.00",
            totalPnl: totalPnl.toFixed(2),
            finalBalance: balance.toFixed(2),
            bankruptcies: isBankrupt ? 1 : 0,
            maxDrawdown: maxDrawdown.toFixed(2),
            maxConcurrentReached: maxConcurrentReached,
            totalFeesPaid: totalFeesPaid.toFixed(2),
            equityCurve: equityCurve
        },
        detailedResults: Object.values(resultsByPair),
        trades: closedTrades.reverse()
    };
  }
};

module.exports = backtestService;