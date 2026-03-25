// frontend/src/components/TradeHistoryTable.jsx

import React from 'react';
import { exportToCsv } from '../utils/csvExporter';

const formatDuration = (ms) => {
    if (typeof ms !== 'number' || ms < 0) return 'N/A';
    
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);

    seconds = seconds % 60;
    minutes = minutes % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (hours === 0 && minutes < 60) {
        if (seconds > 0 || parts.length === 0) {
             parts.push(`${seconds}s`);
        }
    }
    
    return parts.join(' ') || '0s';
};

export const TradeHistoryTable = ({ title, trades }) => {
    
    const handleExport = () => {
        const tradeType = title.toLowerCase().includes('ganhos') ? 'winners' : 'losers';
        const date = new Date().toISOString().split('T')[0];
        const filename = `historico_${tradeType}_${date}.csv`;
        
        exportToCsv(filename, trades);
    };

    return (
        <div style={{ marginBottom: '20px' }}>
            <div className="exc-header" style={{ marginBottom: '15px', borderBottom: 'none' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#eaecef', margin: 0 }}>{title}</h2>
                <button className="exc-btn" style={{ padding: '6px 12px', fontSize: '0.85em', maxWidth: '200px' }} onClick={handleExport} disabled={trades.length === 0}>
                    📊 Exportar <span className="hide-on-mobile">{trades.length} Registro(s) p/ Excel</span>
                </button>
            </div>
            
            <div className="history-list">
                {trades.length > 0 ? trades.map(trade => (
                    <div className="exchange-card" key={trade.uniqueId}>
                        <div className="exc-header">
                            <div className="exc-symbol">
                                <h1>{trade.symbol}</h1>
                                <span className="exc-badge" style={{background: trade.side === 'LONG' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(248, 113, 113, 0.2)', color: trade.side === 'LONG' ? '#4ade80' : '#f87171'}}>{trade.side}</span>
                                <span className="exc-badge">{trade.strategyLabel}</span>
                                <span className="exc-badge">{trade.interval}m</span>
                            </div>
                            <div className="exc-pnl">
                                <span className="label">P/L Líquido (%)</span>
                                <span className={`val ${typeof trade.pnl === 'number' && trade.pnl >= 0 ? 'profit' : 'loss'}`}>
                                    {typeof trade.pnl === 'number' ? `${trade.pnl > 0 ? '+' : ''}${trade.pnl.toFixed(2)}%` : '---'}
                                </span>
                            </div>
                        </div>
                        <div className="exc-grid">
                            <div className="exc-col">
                                <span className="label">Entrada</span>
                                <span className="val">{trade.entryPrice.toFixed(4)}</span>
                            </div>
                            <div className="exc-col">
                                <span className="label">Saída</span>
                                <span className="val">{trade.exitPrice?.toFixed(4) || '---'}</span>
                            </div>
                            <div className="exc-col right">
                                <span className="label">Motivo da Saída</span>
                                <span className="val" style={{color: '#fcd535'}}>{trade.exitReason || 'N/A'}</span>
                            </div>
                            <div className="exc-col">
                                <span className="label">Duração</span>
                                <span className="val">{formatDuration(trade.durationMs)}</span>
                            </div>
                            <div className="exc-col" style={{ gridColumn: 'span 2' }}>
                                <span className="label">Data / Hora Final</span>
                                <span className="val">{new Date(trade.timestamp).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                )) : (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#848e9c', background: '#0f141d', borderRadius: '8px' }}>
                        Nenhum trade para exibir neste relatório.
                    </div>
                )}
            </div>
        </div>
    );
};