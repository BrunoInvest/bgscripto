const db = require('./database.js');
try {
    const res = db.prepare("DELETE FROM open_trades WHERE strategyName = 'grid_trading_bingx' AND symbol != 'BTCUSDT'").run();
    console.log(`Deleted ${res.changes} invalid trades from open_trades`);
} catch (e) { console.error(e); }
