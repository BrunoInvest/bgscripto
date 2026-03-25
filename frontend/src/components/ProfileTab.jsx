// frontend/src/components/ProfileTab.jsx
import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { getSocket } from '../socket';

export const ProfileTab = () => {
    const token = useStore((state) => state.token);
    const setGlobalExchange = useStore((state) => state.setActiveExchange);
    const globalExchange = useStore((state) => state.activeExchange);
    
    const [profile, setProfile] = useState({
        username: '',
        activeExchange: 'bybit',
        hasBybitKeys: false,
        hasBingxKeys: false,
        hasTelegramToken: false,
        hasTelegramChatId: false
    });

    const [keysForm, setKeysForm] = useState({
        activeExchange: 'bybit',
        bybitApiKey: '',
        bybitApiSecret: '',
        bingxApiKey: '',
        bingxApiSecret: ''
    });

    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const res = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (res.ok) {
                setProfile(data);
                setKeysForm(prev => ({ ...prev, activeExchange: data.activeExchange }));
                setGlobalExchange(data.activeExchange);
            }
        } catch (e) {
            console.error('Failed to fetch profile', e);
        }
    };

    const handleQuickExchangeSwitch = async (exchange) => {
        setKeysForm({...keysForm, activeExchange: exchange});
        setGlobalExchange(exchange); // Atualiza UI instantaneamente no Header
        
        try {
            const res = await fetch('/api/auth/profile', {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ activeExchange: exchange })
            });
            if (res.ok) {
                fetchProfile(); // Recarrega status
                const socket = getSocket();
                if (socket) socket.emit('exchange_switched', exchange);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');
        try {
            // Só envia as chaves que foram preenchidas
            const payload = { activeExchange: keysForm.activeExchange };
            if (keysForm.bybitApiKey) payload.bybitApiKey = keysForm.bybitApiKey;
            if (keysForm.bybitApiSecret) payload.bybitApiSecret = keysForm.bybitApiSecret;
            if (keysForm.bingxApiKey) payload.bingxApiKey = keysForm.bingxApiKey;
            if (keysForm.bingxApiSecret) payload.bingxApiSecret = keysForm.bingxApiSecret;

            const res = await fetch('/api/auth/profile', {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (res.ok) {
                setMessage('✅ Perfil e Chaves atualizados com sucesso!');
                setKeysForm({ activeExchange: keysForm.activeExchange, bybitApiKey: '', bybitApiSecret: '', bingxApiKey: '', bingxApiSecret: '' }); // limpa o form
                fetchProfile(); // Recarrega os status atualizados
            } else {
                setMessage('❌ Erro: ' + data.error);
            }
        } catch (e) {
            setMessage('❌ Falha na conexão com o servidor.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="profile-dashboard" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* --- BANNER PRINCIPAL --- */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f141d', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.03)', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>💼</span>
                    <div>
                        <h1 style={{ fontSize: '13px', margin: 0, color: '#eaecef', lineHeight: 1.1 }}>Perfil Institucional</h1>
                        <span style={{ fontSize: '10px', color: '#848e9c' }}>Admin: <strong style={{color:'var(--accent-blue)'}}>{profile.username}</strong></span>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div className="exchange-card" style={{ padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '9px', color: '#848e9c', textTransform: 'uppercase', marginBottom: '4px', textAlign: 'center' }}>Bybit API</span>
                    <span style={{ fontSize: '11px', fontWeight: 'bold' }} className={profile.hasBybitKeys ? 'profit' : 'loss'}>{profile.hasBybitKeys ? '🟢 OK' : '🔴 Erro'}</span>
                </div>
                <div className="exchange-card" style={{ padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '9px', color: '#848e9c', textTransform: 'uppercase', marginBottom: '4px', textAlign: 'center' }}>BingX API</span>
                    <span style={{ fontSize: '11px', fontWeight: 'bold' }} className={profile.hasBingxKeys ? 'profit' : 'loss'}>{profile.hasBingxKeys ? '🟢 OK' : '🔴 Erro'}</span>
                </div>
            </div>

            <div className="dashboard-grid" style={{ gap: '8px' }}>
                {/* --- MÓDULO: SELEÇÃO DE CORRETORA ATIVA --- */}
                <div className="exchange-card" style={{ alignSelf: 'start', padding: '10px', gap: '8px' }}>
                    <div className="exc-header" style={{ borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: '6px' }}>
                        <h2 style={{ fontSize: '13px', margin: 0, color: '#eaecef' }}>🔌 Motor de Roteamento (Routing)</h2>
                    </div>
                    <div>
                        <p style={{ color: '#848e9c', fontSize: '10px', margin: '0 0 8px 0' }}>Define o servidor físico destino. As execuções e cálculos de PNL obedecerão via API à exchange escolhida abaixo.</p>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <button 
                                type="button" 
                                onClick={() => handleQuickExchangeSwitch('bybit')}
                                style={{ 
                                    padding: '8px', cursor: 'pointer', borderRadius: '4px', border: '1px solid', fontWeight: 'bold', fontSize: '11px',
                                    background: globalExchange === 'bybit' ? 'rgba(247, 166, 0, 0.1)' : 'var(--bg-panel)',
                                    borderColor: globalExchange === 'bybit' ? '#f7a600' : 'var(--border-color)',
                                    color: globalExchange === 'bybit' ? '#f7a600' : 'var(--text-primary)',
                                    transition: 'all 0.3s'
                                }}
                            >
                                {globalExchange === 'bybit' ? '✅ Bybit Routing' : 'Mudar > Bybit'}
                            </button>
                            
                            <button 
                                type="button" 
                                onClick={() => handleQuickExchangeSwitch('bingx')}
                                style={{ 
                                    padding: '8px', cursor: 'pointer', borderRadius: '4px', border: '1px solid', fontWeight: 'bold', fontSize: '11px',
                                    background: globalExchange === 'bingx' ? 'rgba(41, 98, 255, 0.1)' : 'var(--bg-panel)',
                                    borderColor: globalExchange === 'bingx' ? '#2962ff' : 'var(--border-color)',
                                    color: globalExchange === 'bingx' ? '#2962ff' : 'var(--text-primary)',
                                    transition: 'all 0.3s'
                                }}
                            >
                                {globalExchange === 'bingx' ? '✅ BingX Routing' : 'Mudar > BingX'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* --- MÓDULO: CREDENCIAIS DA API --- */}
                <div className="exchange-card" style={{ padding: '10px', gap: '8px' }}>
                    <div className="exc-header" style={{ borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: '6px' }}>
                        <h2 style={{ fontSize: '13px', margin: 0, color: '#eaecef' }}>🔑 Cofre de Conexões API</h2>
                    </div>
                    <div style={{ padding: '0' }}>
                        <form onSubmit={handleSaveProfile}>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                                <div style={{ background: 'var(--bg-panel)', padding: '10px', borderRadius: '6px', borderLeft: '3px solid #f7a600' }}>
                                    <h3 style={{ margin: '0 0 8px 0', color: '#f7a600', fontSize: '12px' }}>Terminal Bybit V5</h3>
                                    <div className="form-group" style={{ margin: '0 0 6px 0' }}>
                                        <label style={{ fontSize: '10px', marginBottom: '4px' }}>API Key (Bybit):</label>
                                        <input type="password" placeholder="••••••••••••" value={keysForm.bybitApiKey} onChange={(e) => setKeysForm({...keysForm, bybitApiKey: e.target.value})} className="form-control" style={{ height: '26px', fontSize: '11px', padding: '2px 6px' }} />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label style={{ fontSize: '10px', marginBottom: '4px' }}>API Secret (Bybit):</label>
                                        <input type="password" placeholder="••••••••••••" value={keysForm.bybitApiSecret} onChange={(e) => setKeysForm({...keysForm, bybitApiSecret: e.target.value})} className="form-control" style={{ height: '26px', fontSize: '11px', padding: '2px 6px' }} />
                                    </div>
                                </div>

                                <div style={{ background: 'var(--bg-panel)', padding: '10px', borderRadius: '6px', borderLeft: '3px solid #2962ff' }}>
                                    <h3 style={{ margin: '0 0 8px 0', color: '#2962ff', fontSize: '12px' }}>Terminal BingX</h3>
                                    <div className="form-group" style={{ margin: '0 0 6px 0' }}>
                                        <label style={{ fontSize: '10px', marginBottom: '4px' }}>API Key (BingX):</label>
                                        <input type="password" placeholder="••••••••••••" value={keysForm.bingxApiKey} onChange={(e) => setKeysForm({...keysForm, bingxApiKey: e.target.value})} className="form-control" style={{ height: '26px', fontSize: '11px', padding: '2px 6px' }} />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label style={{ fontSize: '10px', marginBottom: '4px' }}>API Secret (BingX):</label>
                                        <input type="password" placeholder="••••••••••••" value={keysForm.bingxApiSecret} onChange={(e) => setKeysForm({...keysForm, bingxApiSecret: e.target.value})} className="form-control" style={{ height: '26px', fontSize: '11px', padding: '2px 6px' }} />
                                    </div>
                                </div>
                            </div>

                            {message && (
                                <div style={{ 
                                    padding: '6px', marginBottom: '8px', borderRadius: '4px', textAlign: 'center', fontWeight: 'bold', fontSize: '11px',
                                    background: message.startsWith('✅') ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                                    color: message.startsWith('✅') ? '#4ade80' : '#f87171',
                                    border: `1px solid ${message.startsWith('✅') ? '#4ade80' : '#f87171'}`
                                }}>
                                    {message}
                                </div>
                            )}

                            <div>
                                <button type="submit" className="btn-primary-large" disabled={loading} style={{ width: '100%', padding: '8px', fontSize: '12px', borderRadius: '6px' }}>
                                    {loading ? 'Criptografando...' : '💾 Atualizar Cofre de APIs'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};
