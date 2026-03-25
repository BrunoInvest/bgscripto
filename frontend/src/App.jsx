// frontend/src/App.jsx (CORRIGIDO PARA ATUALIZAÇÃO DE STATUS DO BOT)

import React, { useState, useEffect } from 'react';
import { useStore } from './store';
import { DashboardTab } from './components/DashboardTab';
import { TradesTab } from './components/TradesTab';
import { SettingsTab } from './components/SettingsTab';
import { BacktestTab } from './components/BacktestTab';
import { AuthScreen } from './components/AuthScreen';
import { ProfileTab } from './components/ProfileTab';
import { getSocket, disconnectSocket } from './socket';

import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';

function App() {
    const activeTab = useStore((state) => state.activeTab);
    const setActiveTab = useStore((state) => state.setActiveTab);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
    const token = useStore((state) => state.token);
    
    // --- OTIMIZAÇÃO: Pegamos as ações individualmente via selector ---
    // Isso impede que o componente App inteiro renderize a cada tick de preço,
    // o que estabiliza os listeners do socket.
    const setInitialData = useStore((state) => state.setInitialData);
    const setBotStatus = useStore((state) => state.setBotStatus);
    const addOpenTrade = useStore((state) => state.addOpenTrade);
    const closeTrade = useStore((state) => state.closeTrade);
    const updateOpenTradePnl = useStore((state) => state.updateOpenTradePnl);
    const updateAllTrades = useStore((state) => state.updateAllTrades);
    const updateOpenTradesIndicators = useStore((state) => state.updateOpenTradesIndicators);
    const updateTradeExcursion = useStore((state) => state.updateTradeExcursion);
    const setSettings = useStore((state) => state.setSettings);
    const updateWalletBalance = useStore((state) => state.updateWalletBalance);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    useEffect(() => {
        if (!token) return;
        const socket = getSocket();

        // Handlers definidos dentro do effect ou referenciando as actions estáveis
        
        socket.on('initial_data', (data) => {
            setInitialData(data);
        });

        socket.on('bot_status_changed', (data) => {
            console.log("Status do Bot Alterado:", data); // Debug
            setBotStatus(data);
        });
        
        socket.on('new_trade', addOpenTrade);
        socket.on('trade_closed', closeTrade);
        socket.on('ticker_update', updateOpenTradePnl);
        socket.on('trades_updated', updateAllTrades);
        socket.on('open_trades_indicators_update', updateOpenTradesIndicators);
        socket.on('open_trade_excursion_update', updateTradeExcursion);
        socket.on('wallet_balance_update', updateWalletBalance);
        
        socket.on('settings_updated_from_server', (newSettings) => {
            console.log("Configurações atualizadas recebidas:", newSettings);
            setSettings(newSettings);
        });

        socket.on('action_error', ({ message }) => alert(`Erro no Servidor: ${message}`));

        // Cleanup
        return () => {
            const socket = getSocket();
            socket.off('initial_data');
            socket.off('bot_status_changed');
            socket.off('new_trade');
            socket.off('trade_closed');
            socket.off('ticker_update');
            socket.off('trades_updated');
            socket.off('open_trades_indicators_update');
            socket.off('open_trade_excursion_update');
            socket.off('wallet_balance_update');
            socket.off('settings_updated_from_server');
            socket.off('action_error');
        };
    }, [token]);
    
    if (!token) {
        return <AuthScreen />;
    }

    return (
        <div className="app-layout" style={{ position: 'relative', overflow: 'hidden' }}>


            <Sidebar 
                activeTab={activeTab} 
                setActiveTab={setActiveTab} 
                isSidebarOpen={isSidebarOpen} 
                setIsSidebarOpen={setIsSidebarOpen} 
                theme={theme}
                setTheme={setTheme}
            />
            <div className={`main-content ${isSidebarOpen ? 'expanded' : 'collapsed'}`} style={{ position: 'relative', zIndex: 1 }}>
                <Topbar />
                <main className="tab-pane-container">
                    <div className="tab-pane" style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}><DashboardTab /></div>
                    <div className="tab-pane" style={{ display: activeTab === 'trades' ? 'block' : 'none' }}><TradesTab /></div>
                    <div className="tab-pane" style={{ display: activeTab === 'backtest' ? 'block' : 'none' }}><BacktestTab /></div>
                    <div className="tab-pane" style={{ display: activeTab === 'config' ? 'block' : 'none' }}>
                        <SettingsTab />
                    </div>
                    <div className="tab-pane" style={{ display: activeTab === 'profile' ? 'block' : 'none' }}>
                        <ProfileTab />
                    </div>
                    {/* DOM Physical Spacer to defeat Telegram NavBar Z-Index bugs without relying on padding behaviors */}
                    <div style={{ height: '120px', width: '100%', flexShrink: 0, display: 'block' }}></div>
                </main>
            </div>
        </div>
    );
}

export default App;