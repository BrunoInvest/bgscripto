const ccxt = require('ccxt');
async function test() {
    console.log('Available pro exchanges:', Object.keys(ccxt.pro).length);
    if (ccxt.pro.bingx) {
        console.log('BingX Pro is available!');
        const exchange = new ccxt.pro.bingx();
        try {
            const ticker = await exchange.watchTicker('BTC/USDT:USDT');
            console.log('Ticker received:', ticker.last);
            process.exit(0);
        } catch (e) {
            console.error('Watch Ticker error:', e.message);
            process.exit(1);
        }
    } else {
        console.log('BingX Pro NOT available');
        process.exit(1);
    }
}
test();
