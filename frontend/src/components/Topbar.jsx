// frontend/src/components/Topbar.jsx
import React from 'react';
import { useStore } from '../store';
import { getSocket, disconnectSocket } from '../socket';

export const Topbar = () => {
    const isBotRunning = useStore((state) => state.isBotRunning);
    const activeExchange = useStore((state) => state.activeExchange);
    const settings = useStore((state) => state.settings);
    const setAuth = useStore((state) => state.setAuth);
    
    const tradingMode = settings?.risk?.tradingMode || 'PAPER';

    const handleToggleBot = () => {
        getSocket().emit('toggle_bot');
    };
    
    const handleLogout = () => {
        setAuth(null, null);
        disconnectSocket();
    };

    return (
        <header className="app-topbar">
            <div className="topbar-left">
                {/* Opcional: Migalhas de pão ou título da página atual aqui */}
            </div>
            <div className="topbar-right">
                <span className="exchange-badge" style={{
                    background: activeExchange === 'bingx' ? '#2962ff' : '#f7a600',
                    color: activeExchange === 'bingx' ? '#fff' : '#000',
                    padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold'
                }}>
                    {activeExchange === 'bybit' ? 'Bybit' : 'BingX'}
                </span>
                
                <span className={`mode-badge ${tradingMode === 'LIVE' ? 'live' : 'paper'}`}>
                    {tradingMode === 'LIVE' ? '🔥' : '📄'} <span className="hide-on-mobile">{tradingMode === 'LIVE' ? 'LIVE' : 'PAPER'}</span>
                </span>

                <div className="divider"></div>

                <div className="status-indicator" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span className={`status-dot ${isBotRunning ? 'running' : ''}`}></span>
                    <span className="status-text hide-on-mobile">{isBotRunning ? 'RODANDO' : 'PARADO'}</span>
                </div>
                
                <button onClick={handleToggleBot} className={`header-btn ${isBotRunning ? 'stop-btn' : 'start-btn'}`} style={{ padding: '6px 10px' }}>
                    {isBotRunning ? '⏸️' : '▶️'} <span className="hide-on-mobile">{isBotRunning ? ' Parar' : ' Iniciar'}</span>
                </button>
                
                <button onClick={handleLogout} className="btn-secondary" style={{ padding: '6px 10px' }}>
                    🚪 <span className="hide-on-mobile">Sair</span>
                </button>
            </div>
        </header>
    );
};
