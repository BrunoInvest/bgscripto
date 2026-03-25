require('dotenv').config();
const { RestClientV5 } = require('bybit-api');
const TA = require('technicalindicators');

const client = new RestClientV5({ testnet: false });

async function testKline() {
    try {
        console.log('Fetching klines...');
        const res = await client.getKline({ category: 'linear', symbol: 'BTCUSDT', interval: "1", limit: 250 });
        console.log(`retCode: ${res.retCode}, list length: ${res.result?.list?.length}`);
        
        if (res.result?.list?.length > 0) {
            const closes = res.result.list.map(c => parseFloat(c[4]));
            const rsi = TA.RSI.calculate({ period: 14, values: closes }).pop();
            console.log('RSI calculado:', rsi);
        }
    } catch (e) {
        console.error(e);
    }
}
testKline();
