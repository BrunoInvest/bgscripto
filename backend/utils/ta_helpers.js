// utils/ta_helpers.js (CÓDIGO ATUALIZADO)

/**
 * Este módulo contém funções auxiliares de análise técnica customizadas.
 */

/**
 * Detecta divergências Bullish (de alta) ou Bearish (de baixa) entre o preço e um indicador.
 * 
 * @param {number[]} prices - Array com os preços de fechamento (do mais antigo para o mais novo).
 * @param {number[]} indicatorValues - Array com os valores do indicador (ex: RSI), na mesma ordem dos preços.
 * @param {number} lookback - O número de candles para olhar para trás em busca de topos/fundos.
 * @returns {'BULLISH' | 'BEARISH' | 'NONE'} - O tipo de divergência encontrada, ou 'NONE'.
 */
function detectDivergence(prices, indicatorValues, lookback = 14) {
  if (prices.length < lookback) return 'NONE';

  // Pega os últimos 'lookback' pontos para análise
  const priceSlice = prices.slice(-lookback);
  const indicatorSlice = indicatorValues.slice(-lookback);

  // --- Lógica para encontrar fundos (troughs) para divergência de ALTA ---
  let lowestPrice = Infinity, secondLowestPrice = Infinity;
  let lowestPriceIndex = -1, secondLowestPriceIndex = -1;

  for (let i = 0; i < priceSlice.length; i++) {
    if (priceSlice[i] < lowestPrice) {
      secondLowestPrice = lowestPrice;
      secondLowestPriceIndex = lowestPriceIndex;
      lowestPrice = priceSlice[i];
      lowestPriceIndex = i;
    } else if (priceSlice[i] < secondLowestPrice) {
      secondLowestPrice = priceSlice[i];
      secondLowestPriceIndex = i;
    }
  }

  // Se encontramos dois fundos distintos
  if (lowestPriceIndex !== -1 && secondLowestPriceIndex !== -1) {
    const p1 = Math.min(lowestPriceIndex, secondLowestPriceIndex);
    const p2 = Math.max(lowestPriceIndex, secondLowestPriceIndex);
    
    // Divergência Bullish: Preço fez um fundo mais baixo, mas o indicador fez um fundo mais alto.
    if (priceSlice[p2] < priceSlice[p1] && indicatorSlice[p2] > indicatorSlice[p1]) {
      return 'BULLISH';
    }
  }

  // --- Lógica para encontrar topos (peaks) para divergência de BAIXA ---
  let highestPrice = -Infinity, secondHighestPrice = -Infinity;
  let highestPriceIndex = -1, secondHighestPriceIndex = -1;

  for (let i = 0; i < priceSlice.length; i++) {
    if (priceSlice[i] > highestPrice) {
      secondHighestPrice = highestPrice;
      secondHighestPriceIndex = highestPriceIndex;
      highestPrice = priceSlice[i];
      highestPriceIndex = i;
    } else if (priceSlice[i] > secondHighestPrice) {
      secondHighestPrice = priceSlice[i];
      secondHighestPriceIndex = i;
    }
  }

  // Se encontramos dois topos distintos
  if (highestPriceIndex !== -1 && secondHighestPriceIndex !== -1) {
    const p1 = Math.min(highestPriceIndex, secondHighestPriceIndex);
    const p2 = Math.max(highestPriceIndex, secondHighestPriceIndex);

    // Divergência Bearish: Preço fez um topo mais alto, mas o indicador fez um topo mais baixo.
    if (priceSlice[p2] > priceSlice[p1] && indicatorSlice[p2] < indicatorSlice[p1]) {
      return 'BEARISH';
    }
  }

  return 'NONE';
}

/**
 * Calcula os níveis de Retração de Fibonacci com base nos altos e baixos de um período.
 * @param {number[]} highs - Array com os preços mais altos de cada candle.
 * @param {number[]} lows - Array com os preços mais baixos de cada candle.
 * @returns {{ high: number, low: number, levels: { '23.6': number, '38.2': number, '50.0': number, '61.8': number }, isUptrend: boolean } | null}
 */
function calculateFibonacciRetracement(highs, lows) {
  if (highs.length === 0 || lows.length === 0) return null;

  const highestHigh = Math.max(...highs);
  const lowestLow = Math.min(...lows);
  const range = highestHigh - lowestLow;

  if (range === 0) return null;

  const firstPrice = (highs[0] + lows[0]) / 2;
  const lastPrice = (highs[highs.length - 1] + lows[lows.length - 1]) / 2;
  const isUptrend = lastPrice > firstPrice;

  const levels = {
    '23.6': isUptrend ? highestHigh - (range * 0.236) : lowestLow + (range * 0.236),
    '38.2': isUptrend ? highestHigh - (range * 0.382) : lowestLow + (range * 0.382),
    '50.0': isUptrend ? highestHigh - (range * 0.5) : lowestLow + (range * 0.5),
    '61.8': isUptrend ? highestHigh - (range * 0.618) : lowestLow + (range * 0.618),
  };

  return { high: highestHigh, low: lowestLow, levels, isUptrend };
}

module.exports = {
  detectDivergence,
  calculateFibonacciRetracement,
};