const { RestClientV5 } = require('bybit-api');
const TA = require('technicalindicators');

const client = new RestClientV5({ testnet: false });

async function getRichIndicatorsForSymbol(symbol, interval) {
    try {
        const klineResponse = await client.getKline({ category: 'linear', symbol, interval: String(interval), limit: 250 });
        if (klineResponse.retCode !== 0 || !klineResponse.result.list) {
            console.log("klineResponse fail:", klineResponse);
            return null;
        }
        
        const candles = klineResponse.result.list.reverse().map(c => ({ open: parseFloat(c[1]), high: parseFloat(c[2]), low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5]) }));
        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        const volumes = candles.map(c => c.volume);
        
        console.log("Closes length:", closes.length);
        
        let rsi, adx, ema20, ema50, macd, vwap;
        try { rsi = TA.RSI.calculate({ period: 14, values: closes }).pop(); } catch(e){ console.log("RSI ERROR:", e); }
        try { adx = TA.ADX.calculate({ high: highs, low: lows, close: closes, period: 14 }).pop(); } catch(e){ console.log("ADX ERROR:", e); }
        try { ema20 = TA.EMA.calculate({ period: 20, values: closes }).pop(); } catch(e){}
        try { ema50 = TA.EMA.calculate({ period: 50, values: closes }).pop(); } catch(e){}
        try { macd = TA.MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }).pop(); } catch(e){}
        try { vwap = TA.VWAP.calculate({ high: highs, low: lows, close: closes, volume: volumes }).pop(); } catch(e){ console.log("VWAP ERROR:", e); }
        
        console.log("RSI:", rsi);
        console.log("ADX:", adx);
        console.log("VWAP:", vwap);
        
        const result = { 
            "RSI (14)": rsi ? rsi.toFixed(2) : 'N/A', 
            "Tendencia ADX": adx && adx.adx > 25 ? `Forte (${adx.adx.toFixed(1)})` : (adx ? `Fraca (${adx.adx.toFixed(1)})` : 'N/A'), 
            "Cruzamento EMAs (20/50)": (ema20 && ema50) ? (ema20 > ema50 ? 'Alta' : 'Baixa') : 'N/A', 
            "MACD Histograma": macd && macd.histogram ? macd.histogram.toFixed(4) : 'N/A', 
            "VWAP": vwap ? vwap.toFixed(4) : 'N/A' 
        };
        console.log("FINAL RESULT:", result);
    } catch (error) { 
        console.log("FATAL:", error);
    }
}

getRichIndicatorsForSymbol('BTCUSDT', 1);
