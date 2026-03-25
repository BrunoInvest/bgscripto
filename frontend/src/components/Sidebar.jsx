// frontend/src/components/Sidebar.jsx
import React from 'react';

export const Sidebar = ({ activeTab, setActiveTab, isSidebarOpen, setIsSidebarOpen, theme, setTheme }) => {
    
    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    return (
        <aside className={`app-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
            <div className="sidebar-header">
                {isSidebarOpen && <h2 className="sidebar-brand">⚡ HFT Bot</h2>}
                <button className="btn-icon" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                    {isSidebarOpen ? '◀' : '▶'}
                </button>
            </div>
            
            <nav className="sidebar-nav">
                <button className={`sidebar-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                    <span className="icon">📊</span> {isSidebarOpen && 'Dashboard'}
                </button>
                <button className={`sidebar-btn ${activeTab === 'trades' ? 'active' : ''}`} onClick={() => setActiveTab('trades')}>
                    <span className="icon">💼</span> {isSidebarOpen && 'Trades'}
                </button>
                <button className={`sidebar-btn ${activeTab === 'backtest' ? 'active' : ''}`} onClick={() => setActiveTab('backtest')}>
                    <span className="icon">🧪</span> {isSidebarOpen && 'Backtest'}
                </button>
                <button className={`sidebar-btn ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>
                    <span className="icon">⚙️</span> {isSidebarOpen && 'Configurações'}
                </button>
                <button className={`sidebar-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
                    <span className="icon">👤</span> {isSidebarOpen && 'Meu Perfil'}
                </button>
            </nav>

            <div className="sidebar-footer">
                <button className="sidebar-btn theme-toggle" onClick={toggleTheme}>
                    <span className="icon">{theme === 'dark' ? '🌞' : '🌙'}</span> 
                    {isSidebarOpen && (theme === 'dark' ? 'Modo Claro' : 'Modo Escuro')}
                </button>
            </div>
        </aside>
    );
};
