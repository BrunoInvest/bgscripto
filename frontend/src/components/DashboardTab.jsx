// frontend/src/components/DashboardTab.jsx

import React, { useMemo, useState, useEffect } from 'react';
import { useStore } from '../store';
import { getSocket } from '../socket';
import { StrategyPerformance } from './StrategyPerformance';

const formatUptime = (startTime) => {
    if (!startTime) return '00:00:00';
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const h = Math.floor(uptimeSeconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((uptimeSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = (uptimeSeconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
};

export const DashboardTab = () => {
    const closedTrades = useStore((state) => state.closedTrades);
    const isBotRunning = useStore((state) => state.isBotRunning);
    const botStartTime = useStore((state) => state.botStartTime);
    const walletBalance = useStore((state) => state.walletBalance);
    const activeExchange = useStore((state) => state.activeExchange);

    const [uptime, setUptime] = useState('00:00:00');

    // Busca o saldo via REST ao montar (evita problema de timing do socket)
    useEffect(() => {
        const tok = useStore.getState().token;
        if (!tok) return;
        fetch('/api/exchange/balance', { headers: { 'Authorization': `Bearer ${tok}` } })
            .catch(() => {}); // o backend emite via socket após buscar
    }, []);

    useEffect(() => {
        let interval;
        if (isBotRunning && botStartTime) {
            interval = setInterval(() => {
                setUptime(formatUptime(botStartTime));
            }, 1000);
        } else {
            setUptime('00:00:00');
        }
        return () => clearInterval(interval);
    }, [isBotRunning, botStartTime]);

    const performanceGeral = useMemo(() => {
        const total = closedTrades.length;
        if (total === 0) { return { pnl: '$0.00', total: 0, winRate: '0.00%', isProfit: true }; }
        const totalPnl = closedTrades.reduce((acc, trade) => acc + (trade.pnlUsdt || 0), 0);
        const winners = closedTrades.filter(t => t.pnl >= 0).length;
        const winRate = (winners / total) * 100;
        return { pnl: `$${totalPnl.toFixed(2)}`, total, winRate: `${winRate.toFixed(2)}%`, isProfit: totalPnl >= 0, };
    }, [closedTrades]);

    const strategyPerformance = useMemo(() => {
        const performanceMap = {};
        closedTrades.forEach(trade => {
            const key = `${trade.strategyLabel}-${trade.interval}m`;
            if (!performanceMap[key]) { performanceMap[key] = { key, label: trade.strategyLabel, timeframe: `${trade.interval}m`, totalTrades: 0, wins: 0, totalPnl: 0, profitSum: 0, lossSum: 0 }; }
            const group = performanceMap[key];
            const pnlUsdt = trade.pnlUsdt || 0;
            group.totalTrades++;
            group.totalPnl += pnlUsdt;
            if (pnlUsdt >= 0) { group.wins++; group.profitSum += pnlUsdt; } 
            else { group.lossSum += Math.abs(pnlUsdt); }
        });
        return Object.values(performanceMap).map(group => ({ ...group, winRate: group.totalTrades > 0 ? (group.wins / group.totalTrades) * 100 : 0, profitFactor: group.lossSum > 0 ? (group.profitSum / group.lossSum) : Infinity, })).sort((a, b) => b.totalPnl - a.totalPnl);
    }, [closedTrades]);

    return (
        <div className="dashboard-container">
            <div className="dashboard-header-banner">
                <div className="banner-content">
                    <h1>Módulo HFT ⚡</h1>
                    <p>Acompanhamento estrutural ao vivo.</p>
                </div>
                <div className="banner-stats">
                    <div className="b-stat">
                        <span>{activeExchange === 'bingx' ? 'Balanço BingX' : 'Balanço Bybit'}</span>
                        <h3>${typeof walletBalance.balance === 'number' ? walletBalance.balance.toFixed(4) : '0.0000'}</h3>
                    </div>
                    <div className="b-stat">
                        <span>Status Lógico</span>
                        <h3 className={isBotRunning ? 'profit pulse-text' : 'loss'}>
                            {isBotRunning ? '🟢 ONLINE' : '🔴 OFFLINE'}
                        </h3>
                    </div>
                    <div className="b-stat">
                        <span>Sessão</span>
                        <h3>🕒 {uptime}</h3>
                    </div>
                </div>
            </div>
            
            <div className="dashboard-metrics-grid">
                <div className="metric-card">
                    <div className="metric-icon">💰</div>
                    <div className="metric-info">
                        <span>P/L Histórico Líquido</span>
                        <h2 className={performanceGeral.isProfit ? 'profit' : 'loss'}>{performanceGeral.pnl}</h2>
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-icon">📊</div>
                    <div className="metric-info">
                        <span>Operações Concluídas</span>
                        <h2>{performanceGeral.total}</h2>
                    </div>
                </div>
                <div className="metric-card">
                    <div className="metric-icon">🎯</div>
                    <div className="metric-info">
                        <span>Taxa de Acerto Automática</span>
                        <h2>{performanceGeral.winRate}</h2>
                    </div>
                </div>
            </div>

            <div className="dashboard-strategy-section">
                <StrategyPerformance performanceData={strategyPerformance} />
            </div>
        </div>
    );
};