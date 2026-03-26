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

// Detecta o tipo da ordem nativa com lógica baseada em lado oposto à posição
function classifyOrder(order, positions) {
    const rawType = (order.rawType || order.type || '').toUpperCase();

    // Detecção direta pelo tipo raw da exchange (BingX/Bybit nomeiam claramente)
    if (rawType.includes('TAKE_PROFIT')) {
        const pos = positions.find(p => orderMatchesPosition(order, p));
        return { label: 'Take Profit', badge: '#4ade80', description: pos ? `Fecha posição ${pos.side} em ${pos.symbol}` : 'Realiza lucro ao atingir preço' };
    }
    if (rawType.includes('STOP_MARKET') || rawType.includes('STOP_LIMIT') || rawType.includes('STOP')) {
        const pos = positions.find(p => orderMatchesPosition(order, p));
        return { label: 'Stop Loss', badge: '#f87171', description: pos ? `Protege posição ${pos.side} em ${pos.symbol}` : 'Para perda ao atingir preço' };
    }

    // Detecção pela relação lado-oposto (SELL em posição LONG = fechamento)
    const closingPosition = positions.find(p => orderMatchesPosition(order, p));

    if (closingPosition) {
        const isOppositeSide = (
            (closingPosition.side === 'LONG' && order.side === 'SELL') ||
            (closingPosition.side === 'SHORT' && order.side === 'BUY')
        );
        if (isOppositeSide) {
            // Distingue TP de SL pelo preço vs entrada
            const orderPrice = order.price || order.stopPrice;
            const isProfit = closingPosition.side === 'LONG'
                ? orderPrice > closingPosition.entryPrice
                : orderPrice < closingPosition.entryPrice;
            if (isProfit) {
                return { label: 'Take Profit', badge: '#4ade80', description: `Fecha posição ${closingPosition.side} em ${closingPosition.symbol}` };
            }
            return { label: 'Stop Loss', badge: '#f87171', description: `Protege posição ${closingPosition.side} em ${closingPosition.symbol}` };
        }
    }

    if (order.reduceOnly) {
        return { label: 'Fecha Pos.', badge: '#fb923c', description: 'Reduz posição aberta' };
    }

    return { label: 'Entrada Pendente', badge: '#60a5fa', description: 'Aguarda para abrir nova posição' };
}

// Verifica se uma ordem corresponde a uma posição pelo símbolo
function orderMatchesPosition(order, pos) {
    const orderSym = (order.symbol || '').replace('/USDT:USDT', 'USDT').replace(':USDT', '').replace('/USDT', 'USDT');
    const posSym = (pos.symbol || '').replace('/USDT:USDT', 'USDT').replace(':USDT', '').replace('/USDT', 'USDT');
    return orderSym === posSym || order.symbol === pos.ccxtSymbol;
}


export const TradesTab = () => {
    const socket = getSocket();
    const { openTrades, closedTrades, strategies } = useStore();
    const [activeTradeSubTab, setActiveTradeSubTab] = useState('posicoes');
    const [strategyFilter, setStrategyFilter] = useState('ALL');
    const [livePositions, setLivePositions] = useState([]);
    const [openOrders, setOpenOrders] = useState([]);
    const [loadingLive, setLoadingLive] = useState(false);
    const [editingOrder, setEditingOrder] = useState(null);
    const [editPrice, setEditPrice] = useState('');
    const [savingOrder, setSavingOrder] = useState(false);

    useEffect(() => {
        let isMounted = true;
        const sock = getSocket();

        const fetchInitialState = async () => {
            try {
                const tok = useStore.getState().token;
                if (!tok || !isMounted) return;
                const resPos = await fetch('/api/exchange/positions', { headers: { 'Authorization': `Bearer ${tok}` } });
                if (resPos.ok && isMounted) setLivePositions(await resPos.json());
                const resOrd = await fetch('/api/exchange/open-orders', { headers: { 'Authorization': `Bearer ${tok}` } });
                if (resOrd.ok && isMounted) setOpenOrders(await resOrd.json());
            } catch (e) { console.error('Fetch inicial:', e); }
        };

        fetchInitialState();

        const onPositions = (d) => isMounted && setLivePositions(d);
        const onOrders = (d) => isMounted && setOpenOrders(d);
        sock.on('positions_stream', onPositions);
        sock.on('orders_stream', onOrders);

        return () => {
            isMounted = false;
            sock.off('positions_stream', onPositions);
            sock.off('orders_stream', onOrders);
        };
    }, []);

    // Fecha posição a mercado
    const handleForceCloseLive = async (pos) => {
        const tok = useStore.getState().token;
        try {
            setLoadingLive(true);
            const res = await fetch('/api/exchange/positions/close', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
                body: JSON.stringify({ ccxtSymbol: pos.ccxtSymbol, side: pos.side, size: pos.size })
            });
            const data = await res.json();
            if (res.ok) setLivePositions(prev => prev.filter(p => p.id !== pos.id));
            else alert('Falha: ' + data.error);
        } catch (e) { alert('Erro: ' + e.message); }
        finally { setLoadingLive(false); }
    };

    // Cancela ordem nativa
    const handleCancelOrder = async (orderId, symbol) => {
        const tok = useStore.getState().token;
        try {
            const res = await fetch('/api/exchange/orders/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
                body: JSON.stringify({ orderId, symbol })
            });
            const data = await res.json();
            if (res.ok) setOpenOrders(prev => prev.filter(o => o.id !== orderId));
            else alert('Falha ao cancelar: ' + data.error);
        } catch (e) { alert('Erro: ' + e.message); }
    };

    // Edita preço de ordem nativa
    const handleEditOrder = async (order) => {
        const tok = useStore.getState().token;
        const newPrice = parseFloat(editPrice);
        if (!newPrice || isNaN(newPrice)) { alert('Preço inválido.'); return; }
        try {
            setSavingOrder(true);
            const res = await fetch('/api/exchange/orders/edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tok}` },
                body: JSON.stringify({ orderId: order.id, symbol: order.symbol, side: order.side, amount: order.amount, price: newPrice })
            });
            const data = await res.json();
            if (res.ok) {
                setOpenOrders(prev => prev.map(o => o.id === order.id ? { ...o, price: newPrice } : o));
                setEditingOrder(null);
            } else { alert('Falha ao editar: ' + data.error); }
        } catch (e) { alert('Erro: ' + e.message); }
        finally { setSavingOrder(false); }
    };

    const handleCloseSingle = (trade) => socket.emit('close_single_trade', trade.uniqueId);

    // Cruza ordens abertas com a posição para descobrir TP e SL reais
    const getTpSlForPosition = (pos) => {
        const closingOrders = openOrders.filter(o => {
            // Mesma lógica do classifyOrder: verifica se é do mesmo símbolo
            if (!orderMatchesPosition(o, pos)) return false;

            const rawType = (o.rawType || o.type || '').toUpperCase();

            // Detecção 1: rawType explícito da exchange (mais confiável)
            if (rawType.includes('TAKE_PROFIT') || rawType.includes('STOP_MARKET') ||
                rawType.includes('STOP_LIMIT') || rawType.includes('STOP')) return true;

            // Detecção 2: reduceOnly confirmado
            if (o.reduceOnly === true) return true;

            // Detecção 3: lado oposto à posição (SELL em LONG = fechamento)
            const isOppositeSide = (pos.side === 'LONG' && o.side === 'SELL') ||
                                   (pos.side === 'SHORT' && o.side === 'BUY');
            return isOppositeSide;
        });

        let tp = null, sl = null;
        closingOrders.forEach(o => {
            const rawType = (o.rawType || o.type || '').toUpperCase();
            const orderPrice = o.price || o.stopPrice;

            // Detecção por rawType tem prioridade
            if (rawType.includes('TAKE_PROFIT')) { tp = orderPrice; return; }
            if (rawType.includes('STOP')) { sl = o.stopPrice || orderPrice; return; }

            // Fallback: preço maior que entrada = TP, menor = SL (para LONG)
            if (orderPrice && pos.entryPrice) {
                if (pos.side === 'LONG') {
                    if (orderPrice > pos.entryPrice) tp = orderPrice;
                    else sl = orderPrice;
                } else {
                    if (orderPrice < pos.entryPrice) tp = orderPrice;
                    else sl = orderPrice;
                }
            }
        });
        return { tp, sl };
    };


    const filteredClosedTrades = useMemo(() => {
        if (strategyFilter === 'ALL') return closedTrades;
        return closedTrades.filter(t => t.strategyName === strategyFilter);
    }, [closedTrades, strategyFilter]);

    const winners = useMemo(() => filteredClosedTrades.filter(t => t.pnl >= 0).sort((a, b) => b.timestamp - a.timestamp), [filteredClosedTrades]);
    const losers = useMemo(() => filteredClosedTrades.filter(t => t.pnl < 0).sort((a, b) => b.timestamp - a.timestamp), [filteredClosedTrades]);

    return (
        <div className="trades-tab-container" style={{ display: 'flex', flexDirection: 'column' }}>

            {/* SUB NAVEGAÇÃO */}
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

            {/* ═══ ABA: POSIÇÕES LIVE ═══ */}
            {activeTradeSubTab === 'posicoes' && (
                <div className="trade-sub-content">
                    {livePositions.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#848e9c' }}>Nenhuma posição viva na Corretora.</div>
                    ) : (
                        livePositions.map(pos => {
                            const { tp, sl } = getTpSlForPosition(pos);
                            return (
                                <div className="exchange-card" key={pos.id}>
                                    <div className="exc-header">
                                        <div className="exc-symbol">
                                            <h1>{pos.symbol}</h1>
                                            <span className="exc-badge" style={{ background: pos.side === 'LONG' ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)', color: pos.side === 'LONG' ? '#4ade80' : '#f87171' }}>{pos.side}</span>
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
                                            <span className="val">{(pos.size * pos.entryPrice).toFixed(2)}</span>
                                        </div>
                                        <div className="exc-col">
                                            <span className="label">Margem (USDT)</span>
                                            <span className="val">{((pos.entryPrice * pos.size) / pos.leverage).toFixed(2)}</span>
                                        </div>
                                        <div className="exc-col right">
                                            <span className="label">Alavancagem</span>
                                            <span className="val">{pos.leverage}x</span>
                                        </div>
                                        <div className="exc-col">
                                            <span className="label">Preço de Entrada</span>
                                            <span className="val">{pos.entryPrice?.toFixed(2)}</span>
                                        </div>
                                        <div className="exc-col">
                                            <span className="label">Preço de Referência</span>
                                            <span className="val">{pos.markPrice?.toFixed(2) || '---'}</span>
                                        </div>
                                        <div className="exc-col right">
                                            <span className="label">Preço de Liq. Est.</span>
                                            <span className="val loss">{pos.liqPrice > 0 ? pos.liqPrice.toFixed(2) : '--'}</span>
                                        </div>

                                        {/* TP/SL: puxado das ordens abertas correspondentes */}
                                        <div className="exc-col" style={{ gridColumn: 'span 3', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span className="label" style={{ color: '#eaecef', fontWeight: 'bold' }}>TP / SL (Ordens Ativas)</span>
                                                <span style={{ fontSize: '12px' }}>
                                                    <span className="profit" style={{ fontWeight: 'bold' }}>{tp ? Number(tp).toFixed(2) : '--'}</span>
                                                    <span style={{ color: '#848e9c', margin: '0 6px' }}>/</span>
                                                    <span className="loss" style={{ fontWeight: 'bold' }}>{sl ? Number(sl).toFixed(2) : '--'}</span>
                                                </span>
                                            </div>
                                            {!tp && !sl && (
                                                <span style={{ fontSize: '10px', color: '#848e9c' }}>Nenhuma ordem de TP/SL pendente encontrada na corretora</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* ÚNICO BOTÃO DE FECHAMENTO */}
                                    <div className="exc-actions">
                                        <ConfirmButton
                                            onConfirm={() => handleForceCloseLive(pos)}
                                            className="exc-btn danger"
                                            confirmText="Confirmar Fechar"
                                            disabled={loadingLive}
                                            style={{ width: '100%', padding: '10px', fontSize: '12px', fontWeight: 'bold' }}
                                        >
                                            🚨 Fechar Posição a Mercado
                                        </ConfirmButton>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* ═══ ABA: ORDENS NATIVAS (BROKER) ═══ */}
            {activeTradeSubTab === 'abertas_broker' && (
                <div className="trade-sub-content">
                    {openOrders.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#848e9c' }}>Nenhuma ordem nativa pendente na corretora.</div>
                    ) : (
                        openOrders.map(order => {
                            const ctx = classifyOrder(order, livePositions);
                            const isEditing = editingOrder === order.id;
                            const displayPrice = order.price || order.stopPrice || order.info?.stopPrice;
                            return (
                                <div className="exchange-card" key={order.id}>
                                    <div className="exc-header">
                                        <div className="exc-symbol">
                                            <h1>{(order.symbol || '').replace('/USDT:USDT', 'USDT').replace(':USDT', '')}</h1>
                                            <span className="exc-badge" style={{ background: order.side === 'BUY' ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)', color: order.side === 'BUY' ? '#4ade80' : '#f87171' }}>{order.side}</span>
                                            {/* Badge colorido indicando o propósito da ordem */}
                                            <span className="exc-badge" style={{ background: ctx.badge + '25', color: ctx.badge, border: `1px solid ${ctx.badge}55`, fontWeight: 'bold' }}>
                                                {ctx.label}
                                            </span>
                                        </div>
                                        <div className="exc-pnl">
                                            <span className="label" style={{ fontSize: '10px', color: '#848e9c', textAlign: 'right', display: 'block', lineHeight: '1.4' }}>
                                                {ctx.description}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="exc-grid">
                                        <div className="exc-col">
                                            <span className="label">Tipo</span>
                                            <span className="val" style={{ textTransform: 'uppercase', fontSize: '10px' }}>{order.type}</span>
                                        </div>
                                        <div className="exc-col">
                                            <span className="label">Quantidade</span>
                                            <span className="val">{order.amount}</span>
                                        </div>
                                        <div className="exc-col right">
                                            <span className="label">Status</span>
                                            <span className="val profit">{order.status}</span>
                                        </div>

                                        {/* Campo de preço editável inline */}
                                        <div className="exc-col" style={{ gridColumn: 'span 3', marginTop: '4px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                                            <span className="label" style={{ marginBottom: '6px', display: 'block' }}>Preço da Ordem</span>
                                            {isEditing ? (
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                    <input
                                                        type="number"
                                                        value={editPrice}
                                                        onChange={e => setEditPrice(e.target.value)}
                                                        placeholder="Novo preço"
                                                        style={{ flex: 1, padding: '7px 10px', background: '#0f141d', color: '#eaecef', border: '1px solid rgba(96,165,250,0.6)', borderRadius: '4px', fontSize: '13px' }}
                                                        autoFocus
                                                    />
                                                    <button
                                                        onClick={() => handleEditOrder(order)}
                                                        disabled={savingOrder}
                                                        className="exc-btn"
                                                        style={{ padding: '7px 12px', background: 'rgba(74,222,128,0.15)', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', fontSize: '11px' }}
                                                    >
                                                        {savingOrder ? '...' : '✓'}
                                                    </button>
                                                    <button onClick={() => setEditingOrder(null)} className="exc-btn" style={{ padding: '7px 10px', fontSize: '11px' }}>✕</button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span className="val" style={{ fontSize: '14px', fontWeight: 'bold' }}>
                                                        {displayPrice ? Number(displayPrice).toFixed(2) : 'Market'}
                                                    </span>
                                                    <button
                                                        onClick={() => { setEditingOrder(order.id); setEditPrice(displayPrice || ''); }}
                                                        className="exc-btn"
                                                        style={{ padding: '5px 12px', fontSize: '11px', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' }}
                                                    >
                                                        ✏️ Editar
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="exc-actions">
                                        <ConfirmButton
                                            onConfirm={() => handleCancelOrder(order.id, order.symbol)}
                                            className="exc-btn danger"
                                            confirmText="Confirmar"
                                            style={{ width: '100%', padding: '9px', fontSize: '11px' }}
                                        >
                                            Cancelar Ordem
                                        </ConfirmButton>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* ═══ ABA: LÓGICAS BOT ═══ */}
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
                                        <span className="exc-badge" style={{ background: trade.side === 'LONG' ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)', color: trade.side === 'LONG' ? '#4ade80' : '#f87171' }}>{trade.side}</span>
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
                                    <ConfirmButton
                                        onConfirm={() => handleCloseSingle(trade)}
                                        className="exc-btn danger"
                                        confirmText="Confirmar"
                                        style={{ width: '100%' }}
                                    >
                                        Forçar Encerramento Lógico
                                    </ConfirmButton>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}

            {/* ═══ ABA: HISTÓRICO (BOT) ═══ */}
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
                    <TradeHistoryTable title="Histórico de Ganhos" trades={winners} expandedTradeId={null} handleRowClick={() => {}} />
                    <TradeHistoryTable title="Histórico de Perdas" trades={losers} expandedTradeId={null} handleRowClick={() => {}} />
                </div>
            )}

        </div>
    );
};