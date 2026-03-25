// services/marketDataService.js

const bybitClientManager = require('./bybitClient');

const marketDataService = {
  /**
   * Busca os tickers de futuros lineares, ordena por volume de negociação (turnover)
   * e retorna os 'limit' principais símbolos.
   * @param {number} limit - O número de símbolos a serem retornados.
   * @returns {Promise<string[]>} - Uma lista de símbolos (ex: ['BTCUSDT', 'ETHUSDT', ...]).
   */
  async getTopVolumeSymbols(limit = 30) {
    console.log(`[Market Data] Buscando os ${limit} principais símbolos por volume...`);
    try {
      // Usamos sempre a mainnet para dados de mercado, pois são mais completos.
      const restClient = bybitClientManager.getRestClient(); 
      const response = await restClient.getTickers({ category: 'linear' });

      if (response.retCode !== 0 || !response.result.list) {
        throw new Error(`Falha ao buscar tickers: ${response.retMsg}`);
      }
      
      const symbols = response.result.list
        .filter(ticker => ticker.symbol.endsWith('USDT'))
        .sort((a, b) => parseFloat(b.turnover24h) - parseFloat(a.turnover24h))
        .slice(0, limit)
        .map(ticker => ticker.symbol);

      console.log(`[Market Data] Os ${symbols.length} principais símbolos foram carregados.`);
      return symbols;

    } catch (error) {
      console.error(`[Market Data ERROR] Erro ao buscar símbolos de maior volume: ${error.message}`);
      // Retorna uma lista de fallback em caso de erro para não quebrar o sistema
      return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']; 
    }
  }
};

module.exports = marketDataService;