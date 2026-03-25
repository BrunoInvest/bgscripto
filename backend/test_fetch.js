require('dotenv').config();
const db = require('./database');
const exchangeService = require('./services/exchangeService');

(async () => {
    try {
        console.log("Fetching for user 1...");
        const result = await exchangeService.fetchLivePositions(1);
        console.log("Result length:", result.length);
        if (result.length > 0) {
            console.log("Mapeamento Final Frontend:", result[0]);
        } else {
            console.log("No open positions found. Please open a position on the exchange manually.");
        }
    } catch (e) {
        console.error("Error:", e);
    }
    process.exit(0);
})();
