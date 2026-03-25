// strategies/structural_scalping_v2.js (VERSÃO FINAL - MOVIMENTO PURO DE PREÇO)

const TA = require('technicalindicators');
const chalk = require('chalk');

async function analyzeSymbol(context, symbol) {
    const { restClient, config, interval, handleNewTradeSignal, risk } = context;
    const debugMode = risk.debugMode || false;
    
    try {
        const [klineOperacionalRes, kline1hRes] = await Promise.all([
            restClient.getKline({ category: 'linear', symbol, interval: String(interval), limit: config.CANDLE_LIMIT }),
            restClient.getKline({ category: 'linear', symbol, interval: '60', limit: config.EMA_TREND_PERIOD_H1 + 5 })
        ]);

        if (klineOperacionalRes.retCode !== 0 || kline1hRes.retCode !== 0 || !klineOperacionalRes.result.list || !kline1hRes.result.list) return;
        
        const candles = klineOperacionalRes.result.list.reverse().map(c => ({ open: parseFloat(c[1]), high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5]) }));
        const candles1h = kline1hRes.result.list.reverse().map(c => ({ close: parseFloat(c[4]) }));

        const minCandlesRequired = Math.max(config.EMA_LONG_PERIOD, config.ADX_PERIOD, config.RSI_PERIOD, config.VOLUME_SMA_PERIOD) + 10;
        if (candles.length < minCandlesRequired || candles1h.length < config.EMA_TREND_PERIOD_H1) return;

        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        const volumes = candles.map(c => c.volume);
        const closes1h = candles1h.map(c => c.close);
        
        const emaShort = TA.EMA.calculate({ period: config.EMA_SHORT_PERIOD, values: closes });
        const emaLong = TA.EMA.calculate({ period: config.EMA_LONG_PERIOD, values: closes });
        const vwap = TA.VWAP.calculate({ high: highs, low: lows, close: closes, volume: volumes });
        const adx = TA.ADX.calculate({ high: highs, low: lows, close: closes, period: config.ADX_PERIOD });
        const emaTrendH1 = TA.EMA.calculate({ period: config.EMA_TREND_PERIOD_H1, values: closes1h });
        const rsi = TA.RSI.calculate({ period: config.RSI_PERIOD, values: closes });
        const volumeSma = TA.SMA.calculate({ period: config.VOLUME_SMA_PERIOD, values: volumes });

        if (emaShort.length < 2 || emaLong.length < 2 || adx.length < 2 || vwap.length < 2 || !emaTrendH1.length || rsi.length < 2 || volumeSma.length < 2) return;
        
        const lastCandle = candles[candles.length - 1];
        const prevCandle = candles[candles.length - 2];
        
        const lastAdx = adx[adx.length - 1];
        const prevAdx = adx[adx.length - 2];
        const lastEmaTrendH1 = emaTrendH1[emaTrendH1.length - 1];
        const isTrendingMarket = prevAdx.adx > config.ADX_MIN_LEVEL;
        
        let signalSide = null;
        let logMessage = '';

        if (isTrendingMarket) {
            const prevEmaShort = emaShort[emaShort.length - 2];
            const prevEmaLong = emaLong[emaLong.length - 2];
            const prevVwap = vwap[vwap.length - 2];
            const lastRsi = rsi[rsi.length - 1];
            const lastVolumeSma = volumeSma[volumeSma.length - 1];

            const isLongSetup = (prevCandle.close > lastEmaTrendH1) && (prevEmaShort > prevEmaLong && prevCandle.close > prevVwap) && (prevCandle.low <= prevEmaShort);
            if (isLongSetup && (lastCandle.close > lastCandle.open)) {
                const volumeOk = !config.useVolumeConfirmation || lastCandle.volume > (lastVolumeSma * config.volumeMultiplier);
                const rsiOk = !config.useRsiConfirmation || lastRsi > 50;
                logMessage = `Setup LONG: Pullback na EMA. VolOK: ${volumeOk}, RsiOK: ${rsiOk}`;
                if (volumeOk && rsiOk) signalSide = 'LONG';
            }
            
            const isShortSetup = (prevCandle.close < lastEmaTrendH1) && (prevEmaShort < prevEmaLong && prevCandle.close < prevVwap) && (prevCandle.high >= prevEmaShort);
            if (isShortSetup && (lastCandle.close < lastCandle.open)) {
                const volumeOk = !config.useVolumeConfirmation || lastCandle.volume > (lastVolumeSma * config.volumeMultiplier);
                const rsiOk = !config.useRsiConfirmation || lastRsi < 50;
                logMessage = `Setup SHORT: Pullback na EMA. VolOK: ${volumeOk}, RsiOK: ${rsiOk}`;
                if (volumeOk && rsiOk) signalSide = 'SHORT';
            }
        } else {
            logMessage = `Mercado lateral, aguardando.`;
        }

        if (debugMode) {
            const trendH1Status = prevCandle.close > lastEmaTrendH1 ? `ALTA (> H1 EMA)` : `BAIXA (< H1 EMA)`;
            console.log(chalk.gray(`[DEBUG Scalping ${interval}m] ${symbol} | Preço: ${prevCandle.close.toFixed(2)} | Tendência H1: ${trendH1Status} | ADX: ${prevAdx.adx.toFixed(2)} (${isTrendingMarket ? 'FORTE' : 'FRACO'})`));
            if(logMessage) console.log(chalk.yellow(`  -> Status: ${logMessage}`));
            if(signalSide) console.log(chalk.green.bold(`  => SINAL DE ${signalSide} IDENTIFICADO!`));
        }

        if (signalSide) {
          if ((signalSide === 'LONG' && config.operationMode === 'SHORT') || (signalSide === 'SHORT' && config.operationMode === 'LONG')) {
            return;
          }
        }
        
        if (signalSide) {
          const entryPrice = lastCandle.close;
          
          // --- MUDANÇA: REMOVIDA A DIVISÃO PELA ALAVANCAGEM ---
          // Agora 5% significa 5% de movimento no gráfico (o que dá 50% de ROE com 10x)
          const percentTp = (config.takeProfitPercent / 100); 
          const percentSl = (config.stopLossPercent / 100);
          // ----------------------------------------------------

          const takeProfit = signalSide === 'LONG' ? entryPrice * (1 + percentTp) : entryPrice * (1 - percentTp);
          const stopLoss = signalSide === 'LONG' ? entryPrice * (1 - percentSl) : entryPrice * (1 + percentSl);
          
          const prevEmaShort = emaShort[emaShort.length - 2];
          const prevEmaLong = emaLong[emaLong.length - 2];
          const prevVwap = vwap[vwap.length - 2];
          
          const entryIndicators = {
              Gatilho: 'Pullback + Confirmação',
              Preco_Entrada: entryPrice.toFixed(4),
              Tendencia_H1: lastCandle.close > lastEmaTrendH1 ? 'ALTA' : 'BAIXA',
              ADX_Entrada: lastAdx.adx.toFixed(2),
              RSI_Entrada: rsi[rsi.length - 1].toFixed(2),
              Volume_Entrada: lastCandle.volume.toFixed(0),
              Confirmacao_RSI: !config.useRsiConfirmation || (signalSide === 'LONG' ? rsi[rsi.length - 1] > 50 : rsi[rsi.length - 1] < 50),
              Confirmacao_Volume: !config.useVolumeConfirmation || lastCandle.volume > (volumeSma[volumeSma.length - 1] * config.volumeMultiplier),
              EMA_Curta: prevEmaShort.toFixed(4),
              EMA_Longa: prevEmaLong.toFixed(4),
              VWAP: prevVwap.toFixed(4),
          };

          const newTradeData = { 
            symbol, side: signalSide, entryPrice, takeProfit, stopLoss, 
            leverage: risk.leverage, entryValueUSDT: risk.entryValueUSDT, 
            strategyName: 'structural_scalping_v2',
            strategyLabel: 'Scalping V2 (ADX + Confirmação)',
            interval: interval,
            configsUsed: config,
            entryIndicators: entryIndicators
          };
          
          handleNewTradeSignal(newTradeData);
        }
    } catch (error) { console.error(`[ERROR] Falha na análise de ${symbol} (${interval}m) na estratégia Scalping V2: ${error.message}`); }
}

const strategy = {
  name: 'structural_scalping_v2',
  label: 'Scalping V2 (ADX + Confirmação)',
  description: `<p>Uma versão aprimorada da estratégia de Scalping. <strong>Novas confirmações foram adicionadas:</strong></p>
  <ol>
    <li><strong>Candle de Confirmação:</strong> Aguarda um candle de força na direção da tendência antes de entrar.</li>
    <li><strong>Confirmação de Volume (Opcional):</strong> Valida se o candle de confirmação teve volume acima da média.</li>
    <li><strong>Confirmação de Sentimento/RSI (Opcional):</strong> Valida se o momentum do mercado (RSI) está alinhado com a entrada.</li>
    <li><strong>Proteção de Lucro (Opcional):</strong> Ativa um stop dinâmico (trailing stop) para proteger os lucros.</li>
  </ol>`,
  config: {
    takeProfitPercent: 1.0, // Recomendo baixar se usar movimento puro (ex: 1% de movimento = 10% ROE)
    stopLossPercent: 0.5,   // Ex: 0.5% movimento = 5% perda
    operationMode: 'BOTH',
    CANDLE_LIMIT: 200,
    EMA_SHORT_PERIOD: 20,
    EMA_LONG_PERIOD: 50,
    ADX_PERIOD: 14,
    ADX_MIN_LEVEL: 30,
    EMA_TREND_PERIOD_H1: 50,
    useProfitProtection: true,
    profitThresholdPercent: 1.0, // Atenção: Isso aqui é em ROE (com alavancagem), mantenha baixo
    retreatThresholdPercent: 0.3,
    useVolumeConfirmation: true,
    volumeMultiplier: 1.2,
    useRsiConfirmation: true,
    RSI_PERIOD: 14,
    VOLUME_SMA_PERIOD: 20,
  },
  parameterLabels: {
    takeProfitPercent: { label: 'Take Profit (%)', tooltip: 'Movimento do preço no gráfico para o alvo.' },
    stopLossPercent: { label: 'Stop Loss (%)', tooltip: 'Movimento do preço no gráfico para o stop.' },
    operationMode: { label: 'Modo de Operação', tooltip: 'Escolha se a estratégia pode abrir trades LONG, SHORT ou Ambos.' },
    CANDLE_LIMIT: { label: 'Quantidade de Candles', tooltip: 'O número de velas para calcular os indicadores.' },
    EMA_SHORT_PERIOD: { label: 'EMA de Pullback (Curta)', tooltip: 'Média Móvel Exponencial rápida, usada como suporte/resistência dinâmico.' },
    EMA_LONG_PERIOD: { label: 'EMA de Tendência (Longa)', tooltip: 'Média Móvel Exponencial lenta, usada para indicar a tendência principal.' },
    ADX_PERIOD: { label: 'Período ADX', tooltip: 'Período do ADX para medir a força da tendência.' },
    ADX_MIN_LEVEL: { label: 'Nível Mínimo ADX', tooltip: 'O valor mínimo do ADX para operar. Filtra mercados laterais.' },
    EMA_TREND_PERIOD_H1: { label: 'EMA Tendência (1 Hora)', tooltip: 'Período da EMA no gráfico de 1 hora para o filtro de tendência principal.' },
    useProfitProtection: { label: 'Ativar Trailing de Lucro', tooltip: 'Se ativado, ativa um stop dinâmico após o lucro atingir um gatilho.' },
    profitThresholdPercent: { label: 'Gatilho do Trailing (ROE %)', tooltip: 'O P/L % (com alavancagem) para ativar o trailing.' },
    retreatThresholdPercent: { label: 'Recuo do Trailing (ROE %)', tooltip: 'Quanto o P/L pode recuar antes de fechar.' },
    useVolumeConfirmation: { label: 'Usar Confirmação de Volume', tooltip: 'Exige que o candle de confirmação tenha volume acima da média.' },
    volumeMultiplier: { label: 'Multiplicador de Volume', tooltip: 'Ex: 1.2 = Volume 20% acima da média. Usado se a confirmação de volume estiver ativa.' },
    useRsiConfirmation: { label: 'Usar Confirmação de RSI', tooltip: 'Exige que o RSI esteja alinhado com a direção do trade (>50 para Long, <50 para Short).' },
    RSI_PERIOD: { label: 'Período RSI', tooltip: 'Período do RSI para a confirmação de sentimento.' },
    VOLUME_SMA_PERIOD: { label: 'Período Média Volume', tooltip: 'Período da média móvel de volume para a confirmação.' },
  },
  
  async run(context) {
    const { symbols, interval } = context;
    const currentMinute = new Date().getMinutes();
    if (currentMinute % parseInt(interval) !== 0) return;

    const BATCH_SIZE = 10;
    
    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        const batch = symbols.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(symbol => analyzeSymbol(context, symbol)));
    }
  }
};

strategy.analyzeSymbol = analyzeSymbol;
module.exports = strategy;