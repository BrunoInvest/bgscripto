// frontend/src/components/TradeDetailsRow.jsx (VERSÃO FINAL COMPLETA E ATUALIZADA)

import React from 'react';

const formatParamKey = (key) => {
    let result = key.replace(/_/g, ' ');
    result = result.replace(/([A-Z])([a-z])/g, ' $1$2');
    result = result.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
    return result.replace(/\b\w/g, char => char.toUpperCase()).trim();
};

export const TradeDetailsRow = ({ trade }) => {
    const entryIndicators = trade.entryIndicators || {};
    const exitIndicators = trade.exitIndicators || {};
    const liveIndicators = trade.liveIndicators || {};

    let maxPnlToShow, minPnlToShow;

    if (trade.outcome) { // Trade Fechado
        maxPnlToShow = trade.maxPnl;
        minPnlToShow = trade.minPnl;
    } else { // Trade Aberto
        if (trade.peakPrice) {
            maxPnlToShow = ((trade.side === 'LONG' ? (trade.peakPrice - trade.entryPrice) : (trade.entryPrice - trade.peakPrice)) / trade.entryPrice) * 100 * trade.leverage;
        }
        if (trade.nadirPrice) {
            minPnlToShow = ((trade.side === 'LONG' ? (trade.nadirPrice - trade.entryPrice) : (trade.entryPrice - trade.nadirPrice)) / trade.entryPrice) * 100 * trade.leverage;
        }
    }

    const shouldShowMaxPnl = typeof maxPnlToShow === 'number';
    const shouldShowMinPnl = typeof minPnlToShow === 'number';
    
    // Define a cor baseada no PnL
    const maxPnlClass = maxPnlToShow >= 0 ? 'profit' : 'loss';
    const minPnlClass = minPnlToShow >= 0 ? 'profit' : 'loss';


    return (
        <tr className="trade-details">
            <td colSpan={trade.outcome ? 9 : 6}>
                <div className="trade-details-content">
                    <div className="details-columns-container">
                        <div className="details-column">
                             <h5>Análise de Entrada (Indicadores)</h5>
                             <div className="indicator-list">
                                {trade.orderId && (
                                    <div key="orderId"><strong>Order ID:</strong><span>{trade.orderId}</span></div>
                                )}
                                {Object.entries(entryIndicators).map(([key, value]) => (
                                    <div key={key}><strong>{formatParamKey(key)}:</strong><span>{String(value)}</span></div>
                                ))}
                            </div>
                        </div>
                        
                        {trade.outcome && ( // Para Trades Fechados
                            <div className="details-column">
                                <h5>Análise de Saída</h5>
                                <div className="indicator-list">
                                    {shouldShowMaxPnl && (<div key="maxPnl"><strong>P/L Máximo (MFE):</strong><span className={maxPnlClass}>{maxPnlToShow.toFixed(2)}%</span></div>)}
                                    {shouldShowMinPnl && (<div key="minPnl"><strong>P/L Mínimo (MAE):</strong><span className={minPnlClass}>{minPnlToShow.toFixed(2)}%</span></div>)}
                                    {Object.keys(exitIndicators).length > 0 ? Object.entries(exitIndicators).map(([key, value]) => (
                                        <div key={key}><strong>{formatParamKey(key)}:</strong><span>{String(value)}</span></div>
                                    )) : ( !shouldShowMaxPnl && !shouldShowMinPnl && <div><span>Sem dados de indicadores de saída.</span></div> )}
                                </div>
                            </div>
                        )}

                        {!trade.outcome && ( // Para Trades Abertos
                            <div className="details-column">
                                <h5>Análise em Tempo Real</h5>
                                <div className="indicator-list">
                                    <div key="currentPrice"><strong>Preço Atual da Moeda:</strong><span>{trade.currentPrice ? `$${trade.currentPrice.toFixed(2)}` : 'Sincronizando...'}</span></div>
                                    {shouldShowMaxPnl && (<div key="maxPnl"><strong>P/L Máximo (MFE):</strong><span className={maxPnlClass}>{maxPnlToShow.toFixed(2)}%</span></div>)}
                                    {shouldShowMinPnl && (<div key="minPnl"><strong>P/L Mínimo (MAE):</strong><span className={minPnlClass}>{minPnlToShow.toFixed(2)}%</span></div>)}
                                    {Object.keys(liveIndicators).length > 0 ? (
                                        Object.entries(liveIndicators).map(([key, value]) => (
                                            <div key={key}><strong>{formatParamKey(key)}:</strong><span>{value || '...'}</span></div>
                                        ))
                                    ) : (
                                        <div><span style={{color: '#666'}}>Sem indicadores contínuos.</span></div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </td>
        </tr>
    );
};