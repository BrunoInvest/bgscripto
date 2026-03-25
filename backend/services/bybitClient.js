// services/bybitClient.js

const { RestClientV5, WebsocketClient } = require('bybit-api');
const db = require('../database.js');
const { decrypt } = require('../utils/cryptoUtils.js');

let cachedClient = null;
let lastUpdate = 0;

// O Websocket para dados de mercado (preços) é público, não precisa de chave
const wsClient = new WebsocketClient({ 
  market: 'v5'
});

const bybitClientManager = {
  getRestClient: () => {
    // Evita ler o banco e descriptografar a cada milissegundo (cache de 10s)
    if (cachedClient && (Date.now() - lastUpdate < 10000)) {
        return cachedClient;
    }

    const user = db.prepare('SELECT bybit_api_key, bybit_api_secret FROM users LIMIT 1').get();
    
    if (!user || !user.bybit_api_key || !user.bybit_api_secret) {
        // Retorna um cliente sem chaves (funcionará apenas para rotas públicas como klines)
        cachedClient = new RestClientV5({});
        lastUpdate = Date.now();
        return cachedClient;
    }

    try {
        const key = decrypt(user.bybit_api_key);
        const secret = decrypt(user.bybit_api_secret);
        
        cachedClient = new RestClientV5({ key, secret });
        lastUpdate = Date.now();
        return cachedClient;
    } catch(e) {
        console.error('[API] Erro ao decriptar chaves da Bybit!');
        cachedClient = new RestClientV5({}); // Público / Fallback
        lastUpdate = Date.now();
        return cachedClient;
    }
  },
  wsClient: wsClient
};

module.exports = bybitClientManager;