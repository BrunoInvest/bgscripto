// frontend/src/components/StrategyPerformance.jsx (VERSÃO ATUALIZADA COM BARRA DE PROGRESSO)

import React from 'react';

// Componente para a barra de progresso visual da Taxa de Acerto.
// O texto agora é controlado pelo CSS usando o atributo data-text.
const WinRateBar = ({ percentage }) => (
    <div className="win-rate-bar" data-text={`${percentage.toFixed(2)}%`}>
        <div className="win-rate-fill" style={{ width: `${percentage}%` }}></div>
    </div>
);

export const StrategyPerformance = ({ performanceData }) => {
    return (
        <div style={{ marginBottom: '20px' }}>
            <div className="exc-header" style={{ marginBottom: '15px', borderBottom: 'none' }}>
                <h2 style={{ fontSize: '1.2rem', color: '#eaecef', margin: 0 }}>Desempenho por Estratégia</h2>
            </div>
            <div className="history-list">
                {performanceData.length > 0 ? (
                    performanceData.map(item => (
                        <div className="exchange-card" key={item.key}>
                            <div className="exc-header">
                                <div className="exc-symbol">
                                    <h1>{item.label}</h1>
                                    <span className="exc-badge">{item.timeframe}</span>
                                </div>
                                <div className="exc-pnl">
                                    <span className="label">P/L Total (USDT)</span>
                                    <span className={`val ${item.totalPnl >= 0 ? 'profit' : 'loss'}`}>
                                        {item.totalPnl >= 0 ? '+' : ''}{item.totalPnl.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                            <div className="exc-grid">
                                <div className="exc-col">
                                    <span className="label">Trades Totais</span>
                                    <span className="val">{item.totalTrades}</span>
                                </div>
                                <div className="exc-col">
                                    <span className="label">Taxa de Acerto</span>
                                    <span className="val">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <div style={{ width: '40px', height: '4px', background: '#334155', borderRadius: '2px', overflow: 'hidden' }}>
                                                <div style={{ width: `${item.winRate}%`, height: '100%', background: '#4ade80' }}></div>
                                            </div>
                                            <span style={{ fontSize: '11px' }}>{item.winRate.toFixed(1)}%</span>
                                        </div>
                                    </span>
                                </div>
                                <div className="exc-col right">
                                    <span className="label">Fator de Lucro</span>
                                    <span className="val">
                                        {item.profitFactor === Infinity ? '∞' : item.profitFactor.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#848e9c', background: '#0f141d', borderRadius: '8px' }}>
                        Nenhum trade fechado para analisar o desempenho.
                    </div>
                )}
            </div>
        </div>
    );
};