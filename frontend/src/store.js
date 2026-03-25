// frontend/src/store.js (VERSÃO FINAL COMPLETA)

import { create } from 'zustand';

export const useStore = create((set, get) => ({
    // --- STATE ---
    token: localStorage.getItem('token') || null,
    user: JSON.parse(localStorage.getItem('user')) || null,
    isBotRunning: false,
    botStartTime: null,
    openTrades: [],
    closedTrades: [],
    settings: null,
    strategies: [],
    activeExchange: 'bybit',
    walletBalance: { balance: 0, exchange: '' },
    activeTab: 'dashboard',
    selectedTradeContext: null,

    // --- ACTIONS ---
    setActiveTab: (tab) => set({ activeTab: tab }),
    setSelectedTradeContext: (ctx) => set({ selectedTradeContext: ctx }),
    setAuth: (token, user) => {
        if (token) {
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
        } else {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
        }
        set({ token, user, settings: null, isBotRunning: false, openTrades: [], closedTrades: [] });
    },
    setInitialData: (data) => set({
        openTrades: data.openTrades || [],
        closedTrades: data.closedTrades || [],
        isBotRunning: data.isBotRunning || false,
        botStartTime: data.botStartTime || null,
        settings: data.settings,
        strategies: data.strategies || [],
        activeExchange: data.activeExchange || 'bybit',
    }),
    
    setBotStatus: (data) => set({ 
        isBotRunning: data.isBotRunning,
        botStartTime: data.botStartTime 
    }),
    updateWalletBalance: (data) => set({ walletBalance: data }),
    
    addOpenTrade: (newTrade) => set((state) => ({
        openTrades: [newTrade, ...state.openTrades]
    })),
    
    closeTrade: (closedTrade) => set((state) => ({
        openTrades: state.openTrades.filter(t => t.uniqueId !== closedTrade.uniqueId),
        closedTrades: [closedTrade, ...state.closedTrades]
    })),
    
    updateOpenTradePnl: (ticker) => set((state) => ({
        openTrades: state.openTrades.map(trade => {
            if (trade.symbol === ticker.symbol) {
                const pnl = ((ticker.lastPrice - trade.entryPrice) / trade.entryPrice) * 100 * trade.leverage * (trade.side === 'SHORT' ? -1 : 1);
                return { ...trade, pnl, currentPrice: ticker.lastPrice };
            }
            return trade;
        })
    })),

    updateAllTrades: ({ openTrades, closedTrades }) => set({
        openTrades: openTrades || [],
        closedTrades: closedTrades || [],
    }),

    setSettings: (newSettings) => set({ settings: newSettings }),
    setActiveExchange: (exchange) => set({ activeExchange: exchange }),

    updateOpenTradesIndicators: (updatedTrades) => set((state) => ({
        openTrades: state.openTrades.map(trade => {
            const update = updatedTrades.find(u => u.uniqueId === trade.uniqueId);
            if (update) {
                return { ...trade, liveIndicators: update.liveIndicators };
            }
            return trade;
        })
    })),

    updateTradeExcursion: (data) => set((state) => ({
        openTrades: state.openTrades.map(trade => {
            if (trade.uniqueId === data.uniqueId) {
                return {
                    ...trade,
                    peakPrice: data.peakPrice,
                    nadirPrice: data.nadirPrice,
                };
            }
            return trade;
        })
    })),
}));