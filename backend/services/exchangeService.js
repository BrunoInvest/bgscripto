// backend/services/exchangeService.js
const ccxt = require('ccxt');
const ccxtPro = require('ccxt').pro;
const db = require('../database.js');
const { decrypt } = require('../utils/cryptoUtils.js');
const chalk = require('chalk');

const activeWsStreams = new Map();

// --- RECORD FORMATTERS ---
function formatPositionsForFrontend(positions, exchangeId) {
    const openPositions = positions.filter(p => {
        const size = p.contracts || Math.abs(parseFloat(p.info.size || p.info.position || p.info.positionAmt || 0));
        return size > 0;
    });
    
    return openPositions.map(p => {
        const symbol = p.symbol || p.info.symbol;
        let side = 'LONG';
        if (p.side === 'long') side = 'LONG';
        else if (p.side === 'short') side = 'SHORT';
        else if (p.info.positionSide) side = p.info.positionSide.toUpperCase();
        else if (parseFloat(p.info.size || p.info.positionAmt || 0) < 0) side = 'SHORT';

        const size = p.contracts || Math.abs(parseFloat(p.info.size || p.info.position || p.info.positionAmt || 0));
        const entryPrice = p.entryPrice || parseFloat(p.info.entryPrice || p.info.avgPrice || 0);
        const unrealizedPnl = p.unrealizedPnl || parseFloat(p.info.unrealizedPnl || p.info.unrealisedPnl || 0);
        const leverage = p.leverage || parseFloat(p.info.leverage || 1);
        
        const markPrice = p.markPrice || parseFloat(p.info.markPrice || 0);
        const liqPrice = p.liquidationPrice || parseFloat(p.info.liquidationPrice || p.info.liqPrice || p.info.estLiqPrice || 0);
        const takeProfit = parseFloat(p.info.takeProfit || p.info.tpPrice || p.info.tp || p.info.takeProfitPrice || 0);
        const stopLoss = parseFloat(p.info.stopLoss || p.info.slPrice || p.info.sl || p.info.stopLossPrice || 0);

        return {
            id: `${exchangeId}-${symbol}-${side}`,
            exchange: exchangeId,
            symbol: symbol.replace('/USDT:USDT', 'USDT').replace(':', ''),
            ccxtSymbol: p.symbol,
            side: side,
            size: size,
            entryPrice: entryPrice,
            unrealizedPnl: unrealizedPnl,
            leverage: leverage,
            markPrice: markPrice,
            liqPrice: liqPrice,
            takeProfit: takeProfit,
            stopLoss: stopLoss
        };
    });
}

function formatOrdersForFrontend(orders, exchangeId) {
    return orders.map(o => ({
        id: o.id,
        symbol: o.symbol,
        side: o.side ? o.side.toUpperCase() : 'UNKNOWN',
        price: o.price,
        amount: o.amount,
        remaining: o.remaining,
        status: o.status,
        timestamp: o.timestamp,
        datetime: o.datetime,
        type: o.type,
        exchange: exchangeId
    }));
}

function formatTradesForFrontend(trades, exchangeId) {
    return trades.map(t => ({
        id: t.id,
        order: t.order || t.id,
        symbol: t.symbol,
        side: t.side ? t.side.toUpperCase() : 'UNKNOWN',
        price: t.price || t.average,
        amount: t.amount,
        cost: t.cost,
        fee: t.fee ? t.fee.cost : 0,
        timestamp: t.timestamp,
        datetime: t.datetime,
        exchange: exchangeId
    })).sort((a,b) => b.timestamp - a.timestamp);
}

// --- CCXT PRO WEBSOCKET ENGINE ---
async function startWsStreams(userId, io) {
    if (activeWsStreams.has(userId)) return;

    const user = db.prepare('SELECT active_exchange, bingx_api_key, bingx_api_secret, bybit_api_key, bybit_api_secret FROM users WHERE id = ?').get(userId);
    if (!user) return;

    let apiKey = ''; let secret = ''; let exchangeId = user.active_exchange || 'bybit';
    if (exchangeId === 'bingx') { apiKey = decrypt(user.bingx_api_key); secret = decrypt(user.bingx_api_secret); }
    else { apiKey = decrypt(user.bybit_api_key); secret = decrypt(user.bybit_api_secret); }

    if (!apiKey || !secret) return;

    try {
        const exchangeClass = ccxtPro[exchangeId];
        const client = new exchangeClass({
            apiKey: apiKey, secret: secret,
            options: { defaultType: 'swap' }
        });

        activeWsStreams.set(userId, { client, active: true });
        console.log(chalk.magenta(`[WS ENGINE] Iniciando Streams CCXT Pro (Zero-Latency) para Usuário: ${userId} na Corretora: ${exchangeId.toUpperCase()}`));

        // Loop: Positions
        (async () => {
            while (activeWsStreams.get(userId)?.active) {
                try {
                    const positions = await client.watchPositions();
                    io.to(`user_${userId}`).emit('positions_stream', formatPositionsForFrontend(positions, exchangeId));
                } catch (e) {
                    await new Promise(res => setTimeout(res, 5000));
                }
            }
        })();

        // Loop: Open Orders
        (async () => {
            while (activeWsStreams.get(userId)?.active) {
                try {
                    const orders = await client.watchOrders();
                    io.to(`user_${userId}`).emit('orders_stream', formatOrdersForFrontend(orders, exchangeId));
                } catch (e) {
                    await new Promise(res => setTimeout(res, 5000));
                }
            }
        })();

        // Loop: Trade History
        (async () => {
             while (activeWsStreams.get(userId)?.active) {
                try {
                    const trades = await client.watchMyTrades();
                    io.to(`user_${userId}`).emit('history_stream', formatTradesForFrontend(trades, exchangeId));
                } catch (e) {
                    await new Promise(res => setTimeout(res, 5000));
                }
            }
        })();

    } catch (e) {
        console.error(chalk.red(`[WS ENGINE] Falha fatal no WS para Usuário ${userId}:`), e.message);
        activeWsStreams.delete(userId);
    }
}

// --- LEGACY REST APIS (Usados para o primeiro Puxão / Fallback) ---
async function getLiveClient(userId) {
    if (!userId) return null;
    const user = db.prepare('SELECT active_exchange, bingx_api_key, bingx_api_secret, bybit_api_key, bybit_api_secret FROM users WHERE id = ?').get(userId);
    if (!user) return null;

    let apiKey = '';
    let secret = '';
    let exchangeId = user.active_exchange || 'bybit';

    try {
        if (exchangeId === 'bingx') { apiKey = decrypt(user.bingx_api_key); secret = decrypt(user.bingx_api_secret); }
        else { apiKey = decrypt(user.bybit_api_key); secret = decrypt(user.bybit_api_secret); }

        if (!apiKey || !secret) return null;

        const exchangeClass = ccxt[exchangeId];
        const client = new exchangeClass({ apiKey: apiKey, secret: secret, enableRateLimit: true, options: { defaultType: 'swap' } });
        return { client, exchangeId };
    } catch (e) { return null; }
}

async function fetchLivePositions(userId) {
    const data = await getLiveClient(userId);
    if (!data) return [];
    try {
        const positions = await data.client.fetchPositions();
        return formatPositionsForFrontend(positions, data.exchangeId);
    } catch (e) { return []; }
}

async function fetchOpenOrders(userId) {
    const data = await getLiveClient(userId);
    if (!data) return [];
    try {
        const orders = await data.client.fetchOpenOrders();
        return formatOrdersForFrontend(orders, data.exchangeId);
    } catch (e) { return []; }
}

async function fetchMyTrades(userId) {
    const data = await getLiveClient(userId);
    if (!data) return [];
    try {
        let trades = [];
        if (data.client.has['fetchMyTrades']) trades = await data.client.fetchMyTrades(undefined, undefined, 50);
        else if (data.client.has['fetchClosedOrders']) trades = await data.client.fetchClosedOrders(undefined, undefined, 50);
        return formatTradesForFrontend(trades, data.exchangeId);
    } catch (e) { return []; }
}

async function closeLivePosition(userId, symbol, side, size) {
    const data = await getLiveClient(userId);
    if (!data) throw new Error("Cliente Exchange indisponível.");
    const orderSide = side.toUpperCase() === 'LONG' ? 'sell' : 'buy';
    
    try {
        const params = { reduceOnly: true };
        const result = await data.client.createMarketOrder(symbol, orderSide, size, undefined, params);
        return result;
    } catch (e) {
        throw new Error(e.message);
    }
}

module.exports = {
    getLiveClient,
    fetchLivePositions,
    closeLivePosition,
    fetchOpenOrders,
    fetchMyTrades
};
