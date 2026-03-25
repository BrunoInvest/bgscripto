require('dotenv').config();
const { RestClientV5 } = require('bybit-api');
const client = new RestClientV5({ testnet: false });

async function testKline() {
    try {
        const res = await client.getKline({ category: 'linear', symbol: 'BTCUSDT', interval: "1.0", limit: 250 });
        console.log(`retCode: ${res.retCode}, retMsg: ${res.retMsg}`);
        console.log(`list length: ${res.result?.list?.length}`);
    } catch (e) {
        console.error(e);
    }
}
testKline();
