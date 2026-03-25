// frontend/src/components/AuthScreen.jsx
import React, { useState } from 'react';
import { useStore } from '../store';

export const AuthScreen = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [bybitApiKey, setBybitApiKey] = useState('');
    const [bybitApiSecret, setBybitApiSecret] = useState('');
    
    // Toggles visibility
    const [showPassword, setShowPassword] = useState(false);
    const [showSecret, setShowSecret] = useState(false);

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const setAuth = useStore((state) => state.setAuth);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
        const body = isLogin 
            ? { username, password } 
            : { username, password, bybitApiKey, bybitApiSecret };

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Erro na requisição');
            }

            setAuth(data.token, data.user);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ 
            display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', 
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            position: 'relative', overflow: 'hidden'
        }}>
            {/* Background Orbs for Glassmorphism */}
            <div style={{ position: 'absolute', width: '400px', height: '400px', background: 'rgba(56, 189, 248, 0.12)', borderRadius: '50%', filter: 'blur(90px)', top: '-10%', left: '-10%' }}></div>
            <div style={{ position: 'absolute', width: '350px', height: '350px', background: 'rgba(168, 85, 247, 0.10)', borderRadius: '50%', filter: 'blur(90px)', bottom: '-10%', right: '-10%' }}></div>

            <div style={{ 
                width: '100%', maxWidth: '440px', padding: '40px', margin: '20px',
                background: 'rgba(30, 41, 59, 0.7)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '24px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                position: 'relative', zIndex: 1
            }}>
                <h2 style={{ textAlign: 'center', marginBottom: '30px', color: '#fff', fontSize: '2em', fontWeight: 'bold', letterSpacing: '-1px' }}>
                    <span style={{ color: 'var(--accent-blue)' }}>HFT</span> Terminal
                </h2>
                
                <div style={{ display: 'flex', gap: '8px', marginBottom: '30px', backgroundColor: 'rgba(0,0,0,0.25)', padding: '6px', borderRadius: '12px' }}>
                    <button type="button" 
                        style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: isLogin ? 'var(--accent-blue)' : 'transparent', color: isLogin ? '#fff' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s' }}
                        onClick={() => { setIsLogin(true); setError(''); }}>
                        Acessar Conta
                    </button>
                    <button type="button" 
                        style={{ flex: 1, padding: '12px', borderRadius: '8px', border: 'none', background: !isLogin ? 'var(--accent-blue)' : 'transparent', color: !isLogin ? '#fff' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.3s' }}
                        onClick={() => { setIsLogin(false); setError(''); }}>
                        Criar Cadastro
                    </button>
                </div>

                {error && <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', padding: '14px', borderRadius: '10px', marginBottom: '25px', fontSize: '0.9em', textAlign: 'center', fontWeight: '500' }}>{error}</div>}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                    
                    {!isLogin && (
                        <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px solid rgba(56, 189, 248, 0.2)', padding: '16px', borderRadius: '12px', fontSize: '0.85em', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                            <strong style={{ color: 'var(--accent-blue)', display: 'block', marginBottom: '4px' }}>🛡️ Arquitetura Multi-Tenant Isolada</strong>
                            Cada usuário cadastrado possui um <b>Cofre Criptografado</b>. Suas estratégias, capital e chaves API operam em um simulador completamente isolado dos demais usuários do servidor.
                        </div>
                    )}

                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9em', color: 'var(--text-secondary)', fontWeight: '500' }}>
                           {isLogin ? 'Usuário de Acesso' : 'Crie um Nome de Usuário'}
                        </label>
                        <input type="text" value={username} onChange={e => setUsername(e.target.value)} required 
                            placeholder={isLogin ? "Digite seu usuário..." : "Ex: trader_pro"}
                            style={{ width: '100%', padding: '14px 16px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '12px', outline: 'none', transition: 'border 0.3s', fontSize: '0.95em' }}
                            onFocus={e => e.target.style.borderColor = 'var(--accent-blue)'}
                            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                        />
                        {!isLogin && <small style={{ display: 'block', marginTop: '6px', color: 'var(--text-muted)', fontSize: '0.75em' }}>O nome que você usará para entrar no terminal.</small>}
                    </div>
                    
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9em', color: 'var(--text-secondary)', fontWeight: '500' }}>
                            {isLogin ? 'Sua Senha Mestra' : 'Crie uma Senha Forte'}
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required 
                                placeholder="••••••••••••"
                                style={{ width: '100%', padding: '14px 16px', paddingRight: '50px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '12px', outline: 'none', transition: 'border 0.3s', fontSize: '1em', letterSpacing: showPassword ? 'normal' : '2px' }}
                                onFocus={e => e.target.style.borderColor = 'var(--accent-blue)'}
                                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)}
                                style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2em', padding: '5px' }}>
                                {showPassword ? '🫣' : '👁️'}
                            </button>
                        </div>
                    </div>

                    {!isLogin && (
                        <div style={{ marginTop: '5px', paddingTop: '25px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <h4 style={{ color: '#fff', marginBottom: '15px', fontSize: '1em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                🔗 Conexão de Corretora <span style={{ fontSize: '0.7em', padding: '2px 8px', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', color: 'var(--text-secondary)' }}>Opcional</span>
                            </h4>
                            <p style={{ fontSize: '0.8em', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: '1.5' }}>
                                Você pode pular esta etapa agora e adicionar as chaves da <b>Bybit</b> ou <b>BingX</b> posteriormente na aba "Meu Perfil" dentro do Terminal.
                            </p>
                            
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9em', color: 'var(--text-secondary)' }}>Bybit API Key <small>(Permissão de Leitura/Trade)</small></label>
                                <input type="text" value={bybitApiKey} onChange={e => setBybitApiKey(e.target.value)} 
                                    placeholder="Ex: 8xK9Lm..."
                                    style={{ width: '100%', padding: '14px 16px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '12px', outline: 'none', fontSize: '0.95em' }}
                                    onFocus={e => e.target.style.borderColor = 'var(--accent-blue)'}
                                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9em', color: 'var(--text-secondary)' }}>Bybit API Secret</label>
                                <div style={{ position: 'relative' }}>
                                    <input type={showSecret ? "text" : "password"} value={bybitApiSecret} onChange={e => setBybitApiSecret(e.target.value)} 
                                        placeholder="Nunca compartilhe essa chave..."
                                        style={{ width: '100%', padding: '14px 16px', paddingRight: '50px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '12px', outline: 'none', fontSize: '0.95em', letterSpacing: showSecret ? 'normal' : '1px' }}
                                        onFocus={e => e.target.style.borderColor = 'var(--accent-blue)'}
                                        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                    />
                                    <button type="button" onClick={() => setShowSecret(!showSecret)}
                                        style={{ position: 'absolute', right: '15px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2em', padding: '5px' }}>
                                        {showSecret ? '🫣' : '👁️'}
                                    </button>
                                </div>
                            </div>
                            
                            <div style={{ background: 'rgba(74, 222, 128, 0.05)', border: '1px solid rgba(74, 222, 128, 0.2)', padding: '12px', borderRadius: '10px', marginTop: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                <span style={{ fontSize: '1.2em' }}>🔒</span>
                                <p style={{ fontSize: '0.75em', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
                                    Suas chaves são instantaneamente fragmentadas e seladas em nosso banco de dados utilizando criptografia de ponta <b>AES-256-GCM</b> inviolável.
                                </p>
                            </div>
                        </div>
                    )}

                    <button type="submit" disabled={loading}
                        style={{ 
                            marginTop: '15px', 
                            padding: '16px', 
                            borderRadius: '12px', 
                            border: 'none', 
                            background: loading ? 'var(--bg-panel)' : 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)', 
                            color: loading ? 'var(--text-secondary)' : '#fff', 
                            fontWeight: 'bold', 
                            fontSize: '1em',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            boxShadow: loading ? 'none' : '0 10px 25px -5px rgba(37, 99, 235, 0.5)',
                            transition: 'all 0.3s',
                            letterSpacing: '0.5px'
                        }}>
                        {loading ? 'Processando Autenticação...' : (isLogin ? 'Desbloquear Terminal' : 'Criar Cofre de Acesso')}
                    </button>
                    {isLogin && (
                        <p style={{ textAlign: 'center', fontSize: '0.85em', color: 'var(--text-muted)', margin: 0 }}>
                            Sua conexão com o servidor e corretora é ponto-a-ponto.
                        </p>
                    )}
                </form>
            </div>
        </div>
    );
};
