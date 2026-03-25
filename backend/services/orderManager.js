// services/orderManager.js

const chalk = require('chalk');

function countDecimals(value) {
    // Converte para string para evitar problemas com notação científica
    const strValue = String(value);
    if (strValue.includes('e-')) {
        return parseInt(strValue.split('e-')[1], 10);
    }
    if (Math.floor(Number(strValue)) === Number(strValue)) return 0;
    return strValue.split('.')[1].length || 0;
}

const orderManager = {
  // Usa o Order Book para um preço de referência mais preciso.
  async calculateQty(restClient, symbol, entryValueUSDT, leverage, instrumentInfo) {
    const qtyStep = parseFloat(instrumentInfo.lotSizeFilter.qtyStep);
    
    const orderbookResponse = await restClient.getOrderbook({ category: 'linear', symbol: symbol, limit: 1 });
    if (orderbookResponse.retCode !== 0 || !orderbookResponse.result.b[0] || !orderbookResponse.result.a[0]) {
      throw new Error(`Não foi possível obter o preço do order book para ${symbol}`);
    }
    
    const bestBid = parseFloat(orderbookResponse.result.b[0][0]);
    const bestAsk = parseFloat(orderbookResponse.result.a[0][0]);
    const referencePrice = (bestBid + bestAsk) / 2;

    if (referencePrice <= 0) {
        throw new Error(`Preço de referência inválido (${referencePrice}) para ${symbol}`);
    }

    const rawQty = (entryValueUSDT * leverage) / referencePrice;
    const adjustedQty = Math.floor(rawQty / qtyStep) * qtyStep;
    const decimalPlaces = countDecimals(qtyStep);
    
    return adjustedQty.toFixed(decimalPlaces);
  },

  async placeOrder(restClient, tradeData, instrumentInfo) {
    const { symbol, side, takeProfit, stopLoss } = tradeData;
    const { leverage, entryValueUSDT } = tradeData;
    const tickSize = parseFloat(instrumentInfo.priceFilter.tickSize);

    try {
      const qty = await this.calculateQty(restClient, symbol, entryValueUSDT, leverage, instrumentInfo);
      
      const minOrderQty = parseFloat(instrumentInfo.lotSizeFilter.minOrderQty);
      if (parseFloat(qty) < minOrderQty) {
          console.error(chalk.red.bold(`[ORDER REJECTED] Quantidade calculada (${qty}) para ${symbol} está abaixo do mínimo permitido (${minOrderQty}). A ordem não será enviada. Considere aumentar o "Valor por Entrada".`));
          return null;
      }
      
      const tpDecimals = countDecimals(tickSize);
      const slDecimals = countDecimals(tickSize);

      const formattedTp = takeProfit ? takeProfit.toFixed(tpDecimals) : undefined;
      const formattedSl = stopLoss.toFixed(slDecimals);

      console.log(chalk.blue(`[LIVE ORDER] Preparando ordem para ${symbol}... Qty: ${qty}, TP: ${formattedTp}, SL: ${formattedSl}`));

      const orderResponse = await restClient.submitOrder({
        category: 'linear',
        symbol: symbol,
        side: side === 'LONG' ? 'Buy' : 'Sell',
        orderType: 'Market',
        qty: qty,
        takeProfit: formattedTp,
        stopLoss: formattedSl,
        tpslMode: 'Full',
      });
      
      if (orderResponse.retCode === 0 && orderResponse.result.orderId) {
        console.log(chalk.green.bold(`[TRADE SUCCESS] Ordem para ${symbol} enviada! OrderID: ${orderResponse.result.orderId}`));
        return orderResponse.result;
      } else {
        console.error(chalk.red.bold(`[TRADE FAILED] Falha ao enviar ordem para ${symbol}.`), `Bybit Msg: ${orderResponse.retMsg}`);
        return null;
      }

    } catch (error) {
      console.error(chalk.red.bold(`[CRITICAL ORDER ERROR] Erro crítico ao enviar ordem para ${symbol}:`), error.message);
      return null;
    }
  }
};

module.exports = orderManager;