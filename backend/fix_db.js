const db = require('./database.js');
db.prepare('UPDATE users SET bybit_api_key = NULL, bybit_api_secret = NULL, bingx_api_key = NULL, bingx_api_secret = NULL').run();
console.log('Dados de API antigos (inválidos) limpos com sucesso!');
