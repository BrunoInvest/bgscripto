// backend/strategies/elliott_wave_impulse.js

const TA = require('technicalindicators');
const chalk = require('chalk');

// --- HELPER: Detecção de Fractais (Bill Williams) ---
// Retorna arrays de índices onde ocorreram Highs ou Lows relevantes
function findFractals(highs, lows, period = 2) {
    const fractals = { highs: [], lows: [] };
    
    // Precisamos de (2 * period + 1) candles para confirmar um fractal central
    for (let i = period; i < highs.length - period; i++) {
        let isHigh = true;
        let isLow = true;

        for (let j = 1; j <= period; j++) {
            if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isHigh = false;
            if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isLow = false;
        }

        if (isHigh) fractals.highs.push({ index: i, price: highs[i] });
        if (isLow) fractals.lows.push({ index: i, price: lows[i] });
    }
    return fractals;
}

async function analyzeSymbol(context, symbol) {
    const { restClient, config, interval, handleNewTradeSignal, risk } = context;
    const debugMode = risk.debugMode || false;

    try {
        // 1. Download de Dados (Precisamos de bastante histórico para achar pivôs)
        const klineLimit = config.CANDLE_LIMIT || 300;
        const response = await restClient.getKline({ 
            category: 'linear', 
            symbol, 
            interval: String(interval), 
            limit: klineLimit 
        });

        if (response.retCode !== 0 || !response.result.list) return;

        // Processa candles (vem do mais novo para o mais antigo, invertemos para calcular)
        const candles = response.result.list.map(c => ({
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5])
        })).reverse();

        if (candles.length < 100) return; // Proteção

        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);

        // 2. Cálculo de Indicadores
        const emaTrend = TA.EMA.calculate({ period: config.EMA_TREND_PERIOD, values: closes });
        // Awesome Oscillator (AO) - Vital para Elliott
        // Nota: A lib technicalindicators calcula AO usando High+Low/2.
        // Simularemos inputs adequados:
        const aoInput = { high: highs, low: lows, fastPeriod: 5, slowPeriod: 34 };
        const ao = TA.AwesomeOscillator.calculate(aoInput);
        
        // Se não tiver dados suficientes de indicadores, sai
        if (!emaTrend.length || !ao.length) return;

        const lastCandle = candles[candles.length - 1];
        const lastEma = emaTrend[emaTrend.length - 1];
        const lastAo = ao[ao.length - 1];
        const prevAo = ao[ao.length - 2];

        // 3. Lógica de Pivôs (Fractais) para identificar Onda 1 e 2
        // Buscamos os últimos fractais confirmados
        const fractals = findFractals(highs, lows, 2); // Periodo 2 = Fractal de 5 barras
        
        let signalSide = null;
        let fibLevelHit = false;
        let logMsg = '';

        // --- LÓGICA LONG (Surfando a Onda 3 de Alta) ---
        // Condição 0: Tendência de Alta (Preço > EMA 200)
        if (lastCandle.close > lastEma) {
            // Precisamos do padrão: Low (Início Onda 1) -> High (Fim Onda 1) -> Low Atual (Fim Onda 2?)
            // Pega o último topo confirmado
            const lastFractalHigh = fractals.highs[fractals.highs.length - 1];
            // Pega o fundo que antecedeu esse topo (Início da Onda 1)
            const startWave1Low = fractals.lows.filter(f => f.index < lastFractalHigh?.index).pop();

            if (lastFractalHigh && startWave1Low) {
                const wave1Height = lastFractalHigh.price - startWave1Low.price;
                const wave1Top = lastFractalHigh.price;
                const currentPrice = lastCandle.close;

                // Fibonacci Retracement: Onda 2 deve corrigir entre 38.2% e 61.8% (Golden Zone)
                const fib0382 = wave1Top - (wave1Height * 0.382);
                const fib0618 = wave1Top - (wave1Height * 0.618);
                
                // O preço atual (ou o low recente) deve ter tocado a zona, mas não perdido o fundo da Onda 1
                const inGoldenZone = currentPrice <= fib0382 && currentPrice >= (startWave1Low.price * 1.001); 
                
                // Gatilho de Entrada:
                // 1. Estamos na zona de correção (ou acabamos de sair dela)
                // 2. AO está virando para cima (momentum retomando)
                const aoTurningUp = lastAo > prevAo && lastAo > 0; // AO Verde acima de zero é o ideal para Onda 3
                
                if (inGoldenZone && aoTurningUp) {
                    logMsg = `Golden Zone (${fib0618.toFixed(2)} - ${fib0382.toFixed(2)}). AO Virando.`;
                    signalSide = 'LONG';
                }
            }
        }

        // --- LÓGICA SHORT (Surfando a Onda 3 de Baixa) ---
        // Condição 0: Tendência de Baixa (Preço < EMA 200)
        else if (lastCandle.close < lastEma) {
            // Padrão: High (Início Onda 1) -> Low (Fim Onda 1) -> High Atual (Fim Onda 2?)
            const lastFractalLow = fractals.lows[fractals.lows.length - 1];
            const startWave1High = fractals.highs.filter(f => f.index < lastFractalLow?.index).pop();

            if (lastFractalLow && startWave1High) {
                const wave1Height = startWave1High.price - lastFractalLow.price;
                const wave1Bottom = lastFractalLow.price;
                const currentPrice = lastCandle.close;

                // Fibonacci Retracement invertido
                const fib0382 = wave1Bottom + (wave1Height * 0.382);
                const fib0618 = wave1Bottom + (wave1Height * 0.618);

                const inGoldenZone = currentPrice >= fib0382 && currentPrice <= (startWave1High.price * 0.999);
                
                // Gatilho: AO virando para baixo
                const aoTurningDown = lastAo < prevAo && lastAo < 0;

                if (inGoldenZone && aoTurningDown) {
                    logMsg = `Golden Zone (${fib0382.toFixed(2)} - ${fib0618.toFixed(2)}). AO Virando.`;
                    signalSide = 'SHORT';
                }
            }
        }

        // Logs de Debug para entender o que o bot está "vendo"
        if (debugMode && !signalSide) {
            // console.log(chalk.gray(`[EW Debug ${symbol}] ${lastCandle.close} | EMA Trend: ${lastEma.toFixed(2)} | AO: ${lastAo.toFixed(4)}`));
        }

        if (signalSide) {
             // Respeita o modo de operação global (LONG/SHORT/BOTH)
             if ((signalSide === 'LONG' && config.operationMode === 'SHORT') || 
                 (signalSide === 'SHORT' && config.operationMode === 'LONG')) return;

             const entryPrice = lastCandle.close;
             
             // Stops e Alvos baseados na Teoria de Elliott
             // Stop Loss: Logo abaixo do início da Onda 1 (invalidação da contagem)
             // Take Profit: Expansão de 161.8% da Onda 1 (alvo clássico da Onda 3)
             
             // Para simplificar e garantir Risco:Retorno, usaremos multiplicadores sobre a volatilidade ou fixos do config
             const percentTp = (config.takeProfitPercent / 100);
             const percentSl = (config.stopLossPercent / 100);

             const takeProfit = signalSide === 'LONG' ? entryPrice * (1 + percentTp) : entryPrice * (1 - percentTp);
             const stopLoss = signalSide === 'LONG' ? entryPrice * (1 - percentSl) : entryPrice * (1 + percentSl);

             const entryIndicators = {
                 Setup: 'Elliott Wave 3 Impulse',
                 Tendencia_EMA200: signalSide === 'LONG' ? 'Alta' : 'Baixa',
                 AO_Momentum: lastAo.toFixed(4),
                 Fib_Retracao: logMsg
             };

             const newTradeData = {
                 symbol,
                 side: signalSide,
                 entryPrice,
                 takeProfit,
                 stopLoss,
                 leverage: risk.leverage,
                 entryValueUSDT: risk.entryValueUSDT,
                 strategyName: 'elliott_wave_impulse',
                 strategyLabel: 'Elliott Wave Impulse (Fib + AO)',
                 interval: interval,
                 configsUsed: config,
                 entryIndicators
             };

             handleNewTradeSignal(newTradeData);
        }

    } catch (error) {
        console.error(`[EW STRATEGY ERROR] ${symbol}:`, error.message);
    }
}

const strategy = {
    name: 'elliott_wave_impulse',
    label: 'Elliott Wave Impulse (Fib + AO)',
    description: `<p>Esta estratégia busca identificar o início da <strong>Onda 3 de Elliott</strong>, historicamente a mais forte e lucrativa.</p>
    <ul>
        <li><strong>Filtro de Tendência:</strong> EMA de longo período (ex: 200).</li>
        <li><strong>Estrutura:</strong> Identifica topos e fundos (Fractais) para encontrar a Onda 1.</li>
        <li><strong>Gatilho (Golden Zone):</strong> Aguarda um recuo (Onda 2) até a retração de Fibonacci de 38.2% a 61.8%.</li>
        <li><strong>Confirmação:</strong> Usa o <strong>Awesome Oscillator (AO)</strong> para validar o momentum da nova onda.</li>
    </ul>
    <p><em>Ideal para timeframes de 15m, 1h e 4h.</em></p>`,
    config: {
        takeProfitPercent: 3.0,  // Onda 3 costuma ser longa
        stopLossPercent: 1.5,    // Stop curto se perder o fundo da Onda 1
        operationMode: 'BOTH',
        CANDLE_LIMIT: 300,       // Necessário histórico longo para fractais
        EMA_TREND_PERIOD: 200,   // Filtro Macro
        profitThresholdPercent: 1.5, // Trailing Start
        retreatThresholdPercent: 0.5, // Trailing Step
        useProfitProtection: true
    },
    parameterLabels: {
        takeProfitPercent: { label: 'Alvo (TP) %', tooltip: 'Alvo fixo da operação.' },
        stopLossPercent: { label: 'Stop Loss %', tooltip: 'Stop de proteção.' },
        operationMode: { label: 'Modo de Operação', tooltip: 'LONG, SHORT ou Ambos.' },
        CANDLE_LIMIT: { label: 'Histórico de Candles', tooltip: 'Mantenha alto (200+) para achar pivôs.' },
        EMA_TREND_PERIOD: { label: 'EMA Tendência', tooltip: 'Filtro de tendência macro (ex: 200).' },
        useProfitProtection: { label: 'Trailing Stop', tooltip: 'Ativar proteção de lucro.' },
        profitThresholdPercent: { label: 'Gatilho Trailing (ROE)', tooltip: 'Lucro % para ativar trailing.' },
        retreatThresholdPercent: { label: 'Recuo Trailing (ROE)', tooltip: 'Recuo permitido.' }
    },
    async run(context) {
        const { symbols, interval } = context;
        // Batch processing para não sobrecarregar
        const BATCH_SIZE = 5;
        for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
            const batch = symbols.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(symbol => analyzeSymbol(context, symbol)));
        }
    },
    analyzeSymbol
};

module.exports = strategy;