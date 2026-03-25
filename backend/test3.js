const db = require('./database.js');
const trades = db.prepare('SELECT uniqueId, symbol, interval FROM open_trades').all();
console.log(JSON.stringify(trades, null, 2));
