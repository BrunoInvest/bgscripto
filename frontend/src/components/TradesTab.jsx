// frontend/src/components/TradesTab.jsx

import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '../store';
import { TradeHistoryTable } from './TradeHistoryTable';
import { ConfirmButton } from './ConfirmButton';
import { getSocket } from '../socket';

const formatDurationObj = (ms) => {
    if (typeof ms !== 'number' || ms < 0) return '0s';
    let s = Math.floor(ms / 1000);
    let m = Math.floor(s / 60);
    let h = Math.floor(m / 60);
    s = s % 60; m = m % 60;
    const p = [];
    if (h > 0) p.push(`${h}h`);
    if (m > 0) p.push(`${m}m`);
    if (h === 0 && m < 60 && (s > 0 || p.length === 0)) p.push(`${s}s`);
    return p.join(' ');
};

export const TradesTab = () => {
    const socket = getSocket();
    const { openTrades, closedTrades, strategies } = useStore();
    const token = useStore((state) => state.token);
    const activeExchange = useStore((state) => state.activeExchange);
    const setActiveTab = useStore((state) => state.setActiveTab);
    const setSelectedTradeContext = useStore((state) => state.setSelectedTradeContext);
    const [activeTradeSubTab, setActiveTradeSubTab] = useState('posicoes');
    const [strategyFilter, setStrategyFilter] = useState('ALL');
    const [livePositions, setLivePositions] = useState([]);
    const [openOrders, setOpenOrders] = useState([]);

    const [loadingLive, setLoadingLive] = useState(false);
    // Fetch Mestre - Dados Vivos (Sockets + Fallback Inicial)
    useEffect(() => {
        let isMounted = true;
        const socket = getSocket();

        const fetchInitialState = async () => {
            try {
                const token = useStore.getState().token;
                if (!token || !isMounted) return;
                
                // Puxões REST para carregar a tela instantaneamente ao abrir enquanto o WS conecta
                const resPos = await fetch('/api/exchange/positions', { headers: { 'Authorization': `Bearer ${token}` } });
                if (resPos.ok && isMounted) setLivePositions(await resPos.json());

                const resOrd = await fetch('/api/exchange/open-orders', { headers: { 'Authorization': `Bearer ${token}` } });
                if (resOrd.ok && isMounted) setOpenOrders(await resOrd.json());


            } catch (error) {
                console.error("Erro no puxão inicial da janela:", error);
            }
        };

        // Roda push inicial 1 vez
        fetchInitialState();

        // 🔴 Arquitetura Baseada a Eventos WebSocket CCXT Pro (0-Latência)
        const handlePositions = (updatedPositions) => isMounted && setLivePositions(updatedPositions);
        const handleOrders = (updatedOrders) => isMounted && setOpenOrders(updatedOrders);


        socket.on('positions_stream', handlePositions);
        socket.on('orders_stream', handleOrders);


        return () => {
            isMounted = false;
            socket.off('positions_stream', handlePositions);
            socket.off('orders_stream', handleOrders);

        };
    }, []);

    const handleForceCloseLive = async (pos) => {
        const token = useStore.getState().token;
        try {
            setLoadingLive(true);
            const res = await fetch('/api/exchange/positions/close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ ccxtSymbol: pos.ccxtSymbol, side: pos.side, size: pos.size })
            });
            const data = await res.json();
            if (res.ok) {
                setLivePositions(prev => prev.filter(p => p.id !== pos.id));
            } else {
                alert("Falha: " + data.error);
            }
        } catch (e) {
            alert("Erro: " + e.message);
        } finally {
            setLoadingLive(false);
        }
    };

    const handleCloseSingle = (trade) => socket.emit('close_single_trade', trade.uniqueId);
    
    const filteredClosedTrades = useMemo(() => {
        if (strategyFilter === 'ALL') return closedTrades;
        return closedTrades.filter(t => t.strategyName === strategyFilter);
    }, [closedTrades, strategyFilter]);

    const winners = useMemo(() => filteredClosedTrades.filter(t => t.pnl >= 0).sort((a,b) => b.timestamp - a.timestamp), [filteredClosedTrades]);
    const losers = useMemo(() => filteredClosedTrades.filter(t => t.pnl < 0).sort((a,b) => b.timestamp - a.timestamp), [filteredClosedTrades]);

    return (
        <div className="trades-tab-container" style={{ display: 'flex', flexDirection: 'column' }}>
            
            {/* SUB NAVEGAÇÃO NATIVA */}
            <div className="exchange-subnav" style={{ overflowX: 'auto', whiteSpace: 'nowrap', paddingBottom: '4px', display: 'flex' }}>
                <div className={`subnav-item ${activeTradeSubTab === 'posicoes' ? 'active' : ''}`} onClick={() => setActiveTradeSubTab('posicoes')}>
                    Posição ({livePositions.length})
                </div>
                <div className={`subnav-item ${activeTradeSubTab === 'abertas_broker' ? 'active' : ''}`} onClick={() => setActiveTradeSubTab('abertas_broker')}>
                    Órd. Nativa ({openOrders.length})
                </div>

                <div className={`subnav-item ${activeTradeSubTab === 'abertas' ? 'active' : ''}`} onClick={() => setActiveTradeSubTab('abertas')}>
                    Lógicas Bot ({openTrades.length})
                </div>
                <div className={`subnav-item ${activeTradeSubTab === 'historico' ? 'active' : ''}`} onClick={() => setActiveTradeSubTab('historico')}>
                    Hist. Bot
                </div>
            </div>

            {/* ABA: POSIÇÕES LIVE */}
            {activeTradeSubTab === 'posicoes' && (
                <div className="trade-sub-content">
                    {livePositions.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#848e9c' }}>Nenhuma posição viva na Corretora.</div>
                    ) : (
                        livePositions.map(pos => (
                            <div className="exchange-card" key={pos.id}>
                                <div className="exc-header">
                                    <div className="exc-symbol">
                                        <h1>{pos.symbol}</h1>
                                        <span className="exc-badge" style={{background: pos.side === 'LONG' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(248, 113, 113, 0.2)', color: pos.side === 'LONG' ? '#4ade80' : '#f87171'}}>{pos.side}</span>
                                        <span className="exc-badge">Isolada</span>
                                        <span className="exc-badge">{pos.leverage}X</span>
                                    </div>
                                    <div className="exc-pnl">
                                        <span className="label">PnL Não Realizado (USDT)</span>
                                        <span className={`val ${pos.unrealizedPnl >= 0 ? 'profit' : 'loss'}`}>
                                            {pos.unrealizedPnl >= 0 ? '+' : ''}{pos.unrealizedPnl.toFixed(4)}
                                        </span>
                                    </div>
                                </div>
                    
                                <div className="exc-grid">
                                    <div className="exc-col">
                                        <span className="label">Posição (USDT)</span>
                                        <span className="val">{(pos.size * pos.entryPrice).toFixed(4)}</span>
                                    </div>
                                    <div className="exc-col">
                                        <span className="label">Margem (USDT)</span>
                                        <span className="val">{((pos.entryPrice * pos.size) / pos.leverage).toFixed(4)}</span>
                                    </div>
                                    <div className="exc-col right">
                                        <span className="label">Risco</span>
                                        <span className="val profit">Auto</span>
                                    </div>
                                    
                                    <div className="exc-col">
                                        <span className="label">Preço de Entrada</span>
                                        <span className="val">{pos.entryPrice?.toFixed(4)}</span>
                                    </div>
                                    <div className="exc-col">
                                        <span className="label">Preço de Referência</span>
                                        <span className="val">{pos.markPrice?.toFixed(4) || '---'}</span>
                                    </div>
                                    <div className="exc-col right">
                                        <span className="label">Preço de Liq. Est.</span>
                                        <span className="val profit">{pos.liqPrice?.toFixed(4) || '--'}</span>
                                    </div>

                                    <div className="exc-col" style={{ gridColumn: 'span 3', marginTop: '4px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                            <span className="label">PnL Realizado (USDT)</span>
                                            <span className="val loss">-0.0000</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span className="label" style={{color: '#eaecef', fontWeight: 'bold'}}>TP/SL</span>
                                            <span className="label" style={{fontSize: '11px'}}>Posição inteira: {pos.takeProfit > 0 ? pos.takeProfit.toFixed(4) : '--'} / {pos.stopLoss > 0 ? pos.stopLoss.toFixed(4) : '--'} &gt;</span>
                                        </div>
                                    </div>
                                </div>
                    
                                <div className="exc-actions" style={{ gap: '6px' }}>
                                    <button className="exc-btn" onClick={() => { setSelectedTradeContext({ symbol: pos.symbol }); setActiveTab('config'); }} style={{ padding: '8px 4px', fontSize: '11px' }}>Definir TP/SL</button>
                                    <button className="exc-btn" onClick={() => {
                                        const pct = window.prompt(`Qual porcentagem de ${pos.symbol} deseja fechar a mercado? (1 a 100)`, '100');
                                        if (pct && !isNaN(pct) && Number(pct) > 0 && Number(pct) <= 100) {
                                            if (Number(pct) === 100) handleForceCloseLive(pos);
                                            else alert('O fechamento parcial nativo CCXT está sendo implantado. Por favor, use "Fechamento rápido" para liquidar a posição completa ou feche parcial diretamente na corretora por segurança.');
                                        }
                                    }} style={{ padding: '8px 4px', fontSize: '11px' }}>Fechar</button>
                                    <ConfirmButton 
                                        onConfirm={() => handleForceCloseLive(pos)} 
                                        className="exc-btn"
                                        confirmText="Confirma"
                                        disabled={loadingLive}
                                        style={{ padding: '8px 4px', fontSize: '11px', flex: 1.5 }}
                                    >
                                        Fechamento rápido
                                    </ConfirmButton>
                                    <button className="exc-btn" onClick={() => alert('O recurso de Reversão Rápida (Inverter Posição a Mercado) será habilitado em breve via API Unificada CCXT.')} style={{ padding: '8px', flex: 0.3, display:'flex', alignItems:'center', justifyContent:'center' }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
            {/* ABA: ORDENS NATIVAS (BROKER) */}
            {activeTradeSubTab === 'abertas_broker' && (
                <div className="trade-sub-content">
                    {openOrders.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#848e9c' }}>Nenhuma ordem nativa pendente na corretora.</div>
                    ) : (
                        openOrders.map(order => (
                            <div className="exchange-card" key={order.id}>
                                <div className="exc-header">
                                    <div className="exc-symbol">
                                        <h1>{order.symbol}</h1>
                                        <span className="exc-badge" style={{background: order.side === 'BUY' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(248, 113, 113, 0.2)', color: order.side === 'BUY' ? '#4ade80' : '#f87171'}}>{order.side}</span>
                                        <span className="exc-badge">{order.type}</span>
                                    </div>
                                    <div className="exc-pnl">
                                        <span className="label">Status</span>
                                        <span className="val profit">{order.status}</span>
                                    </div>
                                </div>
                                <div className="exc-grid">
                                    <div className="exc-col">
                                        <span className="label">Preço</span>
                                        <span className="val">{order.price || 'Market'}</span>
                                    </div>
                                    <div className="exc-col">
                                        <span className="label">Qtd Total</span>
                                        <span className="val">{order.amount}</span>
                                    </div>
                                    <div className="exc-col right">
                                        <span className="label">Restante</span>
                                        <span className="val">{order.remaining}</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}



            {/* ABA: ORDENS LÓGICAS ABERTAS */}
            {activeTradeSubTab === 'abertas' && (
                <div className="trade-sub-content">
                    {openTrades.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#848e9c' }}>Nenhum registro lógico em andamento.</div>
                    ) : (
                        openTrades.map(trade => (
                            <div className="exchange-card" key={trade.uniqueId}>
                                <div className="exc-header">
                                    <div className="exc-symbol">
                                        <h1>{trade.symbol}</h1>
                                        <span className="exc-badge" style={{background: trade.side === 'LONG' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(248, 113, 113, 0.2)', color: trade.side === 'LONG' ? '#4ade80' : '#f87171'}}>{trade.side}</span>
                                        <span className="exc-badge">{trade.strategyLabel}</span>
                                        <span className="exc-badge">{trade.interval}m</span>
                                    </div>
                                    <div className="exc-pnl">
                                        <span className="label">P/L Lógico (%)</span>
                                        <span className={`val ${typeof trade.pnl === 'number' && trade.pnl >= 0 ? 'profit' : 'loss'}`}>
                                            {typeof trade.pnl === 'number' ? `${trade.pnl > 0 ? '+' : ''}${trade.pnl.toFixed(2)}%` : '---'}
                                        </span>
                                    </div>
                                </div>
                                
                                <div className="exc-grid">
                                    <div className="exc-col">
                                        <span className="label">Entrada Exata</span>
                                        <span className="val">{trade.entryPrice.toFixed(4)}</span>
                                    </div>
                                    <div className="exc-col">
                                        <span className="label">Ticker Atual</span>
                                        <span className="val">{trade.currentPrice?.toFixed(4) || '---'}</span>
                                    </div>
                                    <div className="exc-col right">
                                        <span className="label">Duração</span>
                                        <span className="val">{formatDurationObj(trade.durationMs)}</span>
                                    </div>
                                </div>

                                <div className="exc-actions">
                                    <button className="exc-btn" style={{ opacity: 0.5, cursor: 'not-allowed' }}>Modificar TP/SL</button>
                                    <ConfirmButton 
                                        onConfirm={() => handleCloseSingle(trade)} 
                                        className="exc-btn danger"
                                        confirmText="Confirmar"
                                    >
                                        Forçar Encerramento
                                    </ConfirmButton>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* ABA: HISTÓRICO FECHADO */}
            {activeTradeSubTab === 'historico' && (
                <div className="trade-sub-content">
                    <div style={{ marginBottom: '15px' }}>
                        <select 
                            value={strategyFilter} 
                            onChange={(e) => setStrategyFilter(e.target.value)}
                            style={{ width: '100%', padding: '12px', background: '#0f141d', color: '#eaecef', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px' }}
                        >
                            <option value="ALL">Todas as Estratégias</option>
                            {strategies.map(s => <option key={s.name} value={s.name}>{s.label}</option>)}
                        </select>
                    </div>

                    <TradeHistoryTable
                        title="Histórico de Ganhos"
                        trades={winners}
                        expandedTradeId={null}
                        handleRowClick={() => {}}
                    />

                    <TradeHistoryTable
                        title="Histórico de Perdas"
                        trades={losers}
                        expandedTradeId={null}
                        handleRowClick={() => {}}
                    />
                </div>
            )}
            
        </div>
    );
};