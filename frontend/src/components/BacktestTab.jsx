// frontend/src/components/BacktestTab.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';

// --- COMPONENTE DE GRÁFICO INTERATIVO (EQUITY CURVE) ---
const InteractiveChart = ({ data, initialCapital }) => {
    const [hoverData, setHoverData] = useState(null);
    const containerRef = useRef(null);

    if (!data || data.length < 2) return <div className="chart-placeholder">Sem dados suficientes para gerar o gráfico.</div>;

    const balances = data.map(d => d.balance);
    // Margem de 1% para o gráfico não colar nas bordas
    const minVal = Math.min(...balances, initialCapital) * 0.99; 
    const maxVal = Math.max(...balances, initialCapital) * 1.01;
    const range = maxVal - minVal || 1;

    // Conversores de Coordenadas (Dados -> SVG %)
    const getY = (val) => 100 - ((val - minVal) / range) * 100;
    const getX = (index) => (index / (data.length - 1)) * 100;

    // Caminho da Linha (Polyline)
    const points = data.map((d, i) => `${getX(i)},${getY(d.balance)}`).join(' ');
    
    // Cores baseadas no resultado final vs inicial
    const isProfit = balances[balances.length - 1] >= initialCapital;
    const strokeColor = isProfit ? '#4ade80' : '#f87171';
    const areaColor = isProfit ? 'rgba(74, 222, 128, 0.15)' : 'rgba(248, 113, 113, 0.15)';

    // Posição Y do Capital Inicial (Linha de Breakeven)
    const zeroY = getY(initialCapital);

    // Lógica de Mouse Hover
    const handleMouseMove = (e) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left; // Posição X do mouse dentro do elemento
        const width = rect.width;
        
        // Encontra o índice do array mais próximo da posição do mouse
        const index = Math.round((x / width) * (data.length - 1));
        
        // Proteção de índice
        if (data[index]) {
            setHoverData({
                xPct: (index / (data.length - 1)) * 100, // Posição % para o SVG
                yPct: getY(data[index].balance),
                ...data[index]
            });
        }
    };

    const handleMouseLeave = () => setHoverData(null);

    return (
        <div className="chart-wrapper" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} ref={containerRef}>
            {/* Tooltip Flutuante */}
            {hoverData && (
                <div className="chart-tooltip" style={{ left: `${hoverData.xPct}%`, top: '0%' }}>
                    <div className="tooltip-date">{new Date(hoverData.time).toLocaleString()}</div>
                    <div className="tooltip-value" style={{color: hoverData.balance >= initialCapital ? '#4ade80' : '#f87171'}}>
                        ${hoverData.balance.toFixed(2)}
                    </div>
                </div>
            )}

            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="chart-svg">
                {/* Linha de Referência (Capital Inicial) */}
                <line x1="0" y1={zeroY} x2="100" y2={zeroY} stroke="#94a3b8" strokeWidth="0.5" strokeDasharray="3" opacity="0.6" />
                
                {/* Área Preenchida */}
                <polygon points={`0,100 ${points} 100,100`} fill={areaColor} />
                
                {/* Linha Principal do Patrimônio */}
                <polyline points={points} fill="none" stroke={strokeColor} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />

                {/* Elementos de Hover (Linha vertical e Bolinha) */}
                {hoverData && (
                    <>
                        <line 
                            x1={hoverData.xPct} y1="0" x2={hoverData.xPct} y2="100" 
                            stroke="#fff" strokeWidth="1" strokeDasharray="2" opacity="0.4" 
                            vectorEffect="non-scaling-stroke" 
                        />
                        <circle cx={hoverData.xPct} cy={hoverData.yPct} r="3" fill="#1e293b" stroke={strokeColor} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                    </>
                )}
            </svg>

            {/* Eixos Y (Valores Laterais) */}
            <div className="chart-y-labels">
                <span>${maxVal.toFixed(0)}</span>
                <span style={{
                    position: 'absolute', 
                    top: `${zeroY}%`, 
                    right: 0, 
                    transform: 'translateY(-50%)', 
                    color: '#94a3b8', 
                    fontSize: '0.7em',
                    backgroundColor: 'rgba(30, 41, 59, 0.8)',
                    padding: '0 4px',
                    borderRadius: '4px'
                }}>
                    Inicial
                </span>
                <span>${minVal.toFixed(0)}</span>
            </div>
        </div>
    );
};

export const BacktestTab = () => {
    const strategies = useStore((state) => state.strategies);
    const settings = useStore((state) => state.settings);
    const activeExchange = useStore((state) => state.activeExchange);
    
    const filteredStrategies = activeExchange === 'bingx' 
        ? strategies.filter(s => s.name === 'grid_trading_bingx')
        : strategies.filter(s => s.name !== 'grid_trading_bingx');
        
    const allSymbols = activeExchange === 'bingx' 
        ? ['BTCUSDT'] 
        : (settings?.allSymbols || []);
    const riskSettings = settings?.risk || {};

    // --- ESTADOS DE SELEÇÃO ---
    const [selectedStrategies, setSelectedStrategies] = useState([]);
    const [selectedSymbols, setSelectedSymbols] = useState(['BTCUSDT']);
    const [selectedIntervals, setSelectedIntervals] = useState(['5']);
    
    // --- PARÂMETROS NUMÉRICOS ---
    const [numericParams, setNumericParams] = useState({
        days: 7,
        initialCapital: 150,
        entryValue: 10,
        leverage: 10,
        maxTrades: 5
    });

    // --- ESTADOS DO BACKTEST ---
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    
    // --- FLAGS DE CONTROLE ---
    const [runWithSavedConfigs, setRunWithSavedConfigs] = useState(false); // Modo Validação
    const [useAiSuggestions, setUseAiSuggestions] = useState(false); // Modo Aplicação IA

    // Carrega padrões ao iniciar
    useEffect(() => {
        if (filteredStrategies.length > 0 && selectedStrategies.length === 0) {
            setSelectedStrategies([filteredStrategies[0].name]);
            setNumericParams(prev => ({
                ...prev,
                entryValue: riskSettings.entryValueUSDT || 10,
                leverage: riskSettings.leverage || 10,
                maxTrades: riskSettings.maxTradesPerStrategy || 5
            }));
        }
    }, [filteredStrategies, riskSettings]);

    const handleNumericChange = (e) => setNumericParams({ ...numericParams, [e.target.name]: e.target.value });

    // Toggles de Seleção
    const toggleStrategy = (stratName) => {
        setSelectedStrategies(prev => 
            prev.includes(stratName) ? prev.filter(s => s !== stratName) : [...prev, stratName]
        );
    };

    const toggleSymbol = (symbol) => {
        setSelectedSymbols(prev => prev.includes(symbol) ? prev.filter(s => s !== symbol) : [...prev, symbol]);
    };

    const toggleInterval = (interval) => {
        setSelectedIntervals(prev => prev.includes(interval) ? prev.filter(i => i !== interval) : [...prev, interval]);
    };

    const toggleSelectAllSymbols = () => {
        if (selectedSymbols.length === allSymbols.length) setSelectedSymbols([]);
        else setSelectedSymbols(allSymbols);
    };

    // --- FUNÇÃO DE EXECUÇÃO DO BACKTEST ---
    const runBatchBacktest = async (e) => {
        e.preventDefault();
        
        // Validações básicas
        if (selectedStrategies.length === 0) { alert("Selecione pelo menos 1 Estratégia."); return; }
        if (selectedSymbols.length === 0 && !runWithSavedConfigs) { alert("Selecione pelo menos 1 Símbolo."); return; }
        if (selectedIntervals.length === 0) { alert("Selecione pelo menos 1 Timeframe."); return; }
        
        setLoading(true);
        setError(null);
        setResults(null);
        // Reseta o checkbox da IA ao rodar novo teste para evitar confusão
        setUseAiSuggestions(false); 

        try {
            const token = useStore.getState().token;
            const response = await fetch('/api/backtest', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    strategyNames: selectedStrategies, 
                    symbols: selectedSymbols,
                    intervals: selectedIntervals,
                    ...numericParams,
                    useSavedConfigs: runWithSavedConfigs // Envia o flag de validação
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Erro no backtest');
            setResults(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // --- FUNÇÃO PARA APLICAR CONFIGURAÇÕES ---
    const handleApplyBestConfig = async () => {
        if (!results || !results.detailedResults) return;

        const bestMap = {};
        
        // 1. Filtra apenas os pares que deram lucro e não quebraram a banca
        results.detailedResults.forEach(res => {
            const pnl = parseFloat(res.stats.totalPnl);
            if (pnl > 0 && !res.stats.isBankrupt) {
                // Chave única composta por Par + Estratégia + Timeframe
                const key = `${res.symbol}-${res.strategyName}-${res.interval}`;
                bestMap[key] = res;
            }
        });

        // 2. Transforma em lista de objetos para salvar
        const bestPairs = Object.values(bestMap).map(item => {
            const baseConfig = {
                symbol: item.symbol,
                interval: item.interval,
                strategy: item.strategyName
            };

            // SE A CHECKBOX DA IA ESTIVER MARCADA, APLICA OS OVERRIDES
            if (useAiSuggestions && item.optimization) {
                baseConfig.overrides = {
                    takeProfitPercent: parseFloat(item.optimization.suggestedTpPercent),
                    stopLossPercent: parseFloat(item.optimization.suggestedSlPercent)
                };
            }
            return baseConfig;
        });

        if (bestPairs.length === 0) {
            alert("Nenhum par obteve lucro positivo na simulação.");
            return;
        }

        const msgType = useAiSuggestions 
            ? "TP/SL OTIMIZADOS PELA IA (Overrides Específicos)" 
            : "PADRÃO (Valores globais da estratégia)";

        if (!window.confirm(`Isso irá ADICIONAR ou ATUALIZAR estes ${bestPairs.length} pares otimizados nas configurações do Bot.\n\nModo: ${msgType}\n\nPares de outras estratégias não testadas agora serão mantidos.\n\nDeseja continuar?`)) return;

        try {
            const token = useStore.getState().token;
            const response = await fetch('/api/save-best-pairs', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}` 
                },
                body: JSON.stringify({ bestPairs })
            });
            const data = await response.json();
            if (response.ok) alert(`Sucesso! ${data.message}`);
            else throw new Error(data.error);
        } catch (err) {
            alert("Erro ao salvar: " + err.message);
        }
    };

    // --- CÁLCULO DE ESTATÍSTICAS AGREGADAS DA IA ---
    const getStrategyAggregations = () => {
        if (!results || !results.detailedResults) return [];
        const aggs = {};

        results.detailedResults.forEach(res => {
            if (!res.optimization) return;
            if (!aggs[res.strategyName]) {
                aggs[res.strategyName] = { tpSum: 0, slSum: 0, count: 0 };
            }
            aggs[res.strategyName].tpSum += parseFloat(res.optimization.suggestedTpPercent);
            aggs[res.strategyName].slSum += parseFloat(res.optimization.suggestedSlPercent);
            aggs[res.strategyName].count++;
        });

        return Object.entries(aggs).map(([name, data]) => ({
            name,
            avgTp: (data.tpSum / data.count).toFixed(2),
            avgSl: (data.slSum / data.count).toFixed(2),
            count: data.count
        }));
    };

    const strategyStats = getStrategyAggregations();

    return (
        <div className="backtest-dashboard" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f141d', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.03)', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>⚡</span>
                    <div>
                        <h1 style={{ fontSize: '13px', margin: 0, color: '#eaecef', lineHeight: 1.1 }}>Simulador Quant</h1>
                        <span style={{ fontSize: '10px', color: '#848e9c' }}>Validação histórica de dados</span>
                    </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', paddingLeft: '10px', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ fontSize: '9px', color: '#848e9c', textTransform: 'uppercase' }}>Computação</span>
                    <span style={{ fontSize: '11px', color: '#2ecc71', fontWeight: 'bold' }}>MAX</span>
                </div>
            </div>

            <form onSubmit={runBatchBacktest} className="backtest-form" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                
                {/* 1. SECTION: PARÂMETROS FINANCEIROS */}
                <div className="exchange-card" style={{ padding: '12px', gap: '10px' }}>
                    <div className="exc-header" style={{ paddingBottom: '6px', borderBottom: '1px dashed rgba(255, 255, 255, 0.1)' }}>
                        <h2 style={{ fontSize: '14px', margin: 0, color: '#eaecef' }}>Parâmetros Financeiros</h2>
                    </div>
                    <div className="dashboard-grid-4col" style={{ gap: '8px' }}>
                        <div className="form-group">
                            <label style={{ fontSize: '11px', color: '#848e9c' }}>Dias (Lookback)</label>
                            <input type="number" name="days" value={numericParams.days} onChange={handleNumericChange} min="1" max="60" />
                        </div>
                        <div className="form-group">
                            <label style={{ fontSize: '11px', color: '#848e9c' }}>Banca USDT</label>
                            <input type="number" name="initialCapital" value={numericParams.initialCapital} onChange={handleNumericChange} />
                        </div>
                        <div className="form-group">
                            <label style={{ fontSize: '11px', color: '#848e9c' }}>Ordem USDT</label>
                            <input type="number" name="entryValue" value={numericParams.entryValue} onChange={handleNumericChange} />
                        </div>
                        <div className="form-group">
                            <label style={{ fontSize: '11px', color: '#848e9c' }}>Alavancagem Fixa</label>
                            <input type="number" name="leverage" value={numericParams.leverage} onChange={handleNumericChange} />
                        </div>
                        <div className="form-group">
                            <label title="Simula o limite de trades da conta real" style={{ fontSize: '11px', color: '#848e9c' }}>Max Trades Simultâneos</label>
                            <input type="number" name="maxTrades" value={numericParams.maxTrades} onChange={handleNumericChange} placeholder="Ex: 5" />
                        </div>
                    </div>
                </div>

                {/* 2. SECTION: SELEÇÃO DE ATIVOS E OTIMIZADORES */}
                <div className="exchange-card" style={{ padding: '12px', gap: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f141d', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.03)', boxShadow: '0 2px 4px rgba(0,0,0,0.5)', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '20px' }}>🎯</span>
                            <div>
                                <h1 style={{ fontSize: '13px', margin: 0, color: '#eaecef', lineHeight: 1.1 }}>Ativos & Otimização</h1>
                                <span style={{ fontSize: '10px', color: '#848e9c' }}>Filtros de execução isolados</span>
                            </div>
                        </div>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {/* Box 1: Estratégias */}
                        <div className="form-group" style={{ margin: 0 }}>
                            <label style={{color: '#848e9c', marginBottom: '4px', fontSize: '11px'}}>Estratégias</label>
                            <div className="checkbox-row" style={{background: 'var(--bg-primary)', padding: '4px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: '1fr', gap: '4px'}}>
                                {filteredStrategies.map(s => (
                                    <label key={s.name} className={`check-btn ${selectedStrategies.includes(s.name) ? 'active' : ''}`} style={{ padding: '4px', fontSize: '10px', textAlign: 'center' }}>
                                        <input type="checkbox" checked={selectedStrategies.includes(s.name)} onChange={() => toggleStrategy(s.name)} style={{display:'none'}} />
                                        {s.label.replace(' (Exclusivo BingX)', '')}
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Box 2: Timeframes */}
                        <div className="selection-group" style={{ margin: 0 }}>
                            <label style={{marginBottom: '4px', display: 'block', color: '#848e9c', fontSize: '11px'}}>Timeframes</label>
                            <div className="checkbox-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', background: 'var(--bg-primary)', padding: '4px', borderRadius: '4px', border: '1px solid var(--border-color)', gap: '4px' }}>
                                {['1', '3', '5', '15', '30', '60'].map(tf => (
                                    <label key={tf} className={`check-btn ${selectedIntervals.includes(tf) ? 'active' : ''}`} style={{ padding: '4px', fontSize: '10px', textAlign: 'center' }}>
                                        <input type="checkbox" checked={selectedIntervals.includes(tf)} onChange={() => toggleInterval(tf)} style={{display:'none'}} />
                                        {tf}m
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Box 3: Validação de Overrides */}
                        <div style={{background: 'var(--bg-panel)', padding: '6px', borderRadius: '4px', borderLeft: '3px solid var(--accent-blue)', height: 'fit-content', gridColumn: '1 / -1'}}>
                            <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontWeight:'bold', fontSize: '11px', color: '#eaecef'}}>
                                <input type="checkbox" checked={runWithSavedConfigs} onChange={(e) => setRunWithSavedConfigs(e.target.checked)} style={{transform: 'scale(1.1)'}} />
                                📥 Validar Overrides Salvos
                            </label>
                            <div style={{fontSize: '9px', color: '#848e9c', marginTop: '2px', marginLeft: '22px'}}>
                                Usa os alvos de TP/SL isolados salvos no Perfil.
                            </div>
                        </div>
                    </div>

                    <div className="selection-group" style={{ marginTop: '4px', display: 'flex', flexDirection: 'column' }}>
                            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'4px'}}>
                                <label style={{color: '#848e9c', fontSize: '11px'}}>Cluster Otimizado ({selectedSymbols.length})</label>
                                <span onClick={toggleSelectAllSymbols} style={{ color: '#fcd535', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>
                                    {selectedSymbols.length === allSymbols.length ? 'Desmarcar Todas' : 'Marcar Todas'}
                                </span>
                            </div>
                            <div className="symbol-grid-box" style={{ flexGrow: 1, minHeight: '60px', maxHeight: '120px', background: 'var(--bg-primary)', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '4px', overflowY: 'auto' }}>
                                {allSymbols.map(sym => (
                                    <label key={sym} className="symbol-check" style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '11px' }}>
                                        <input type="checkbox" checked={selectedSymbols.includes(sym)} onChange={() => toggleSymbol(sym)} style={{ width: '12px', height: '12px', margin: 0 }} />
                                        {sym.replace('USDT', '')}
                                    </label>
                                ))}
                            </div>
                    </div>

                    <button type="submit" className="btn-primary-large" disabled={loading} style={{ marginTop: '20px', padding: '15px', fontSize: '1.1em' }}>
                        {loading ? 'Processando Múltiplas Simulações em Massa...' : `▶ Rodar Simulação ${runWithSavedConfigs ? '(Validando Configs Salvas)' : '(Benchmark Virgem)'}`}
                    </button>
                </div>
            </form>

            {error && <div className="error-banner">{error}</div>}

            {results && (
                <div className="results-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '10px' }}>
                    
                    {/* --- DESTAQUE DE SALDO FINAL --- */}
                    <div className="dashboard-header-banner" style={{ border: '1px solid var(--accent-blue)' }}>
                        <div className="banner-content">
                            <h1>Saldo Final Projetado</h1>
                            <p>Evolução hipotética do capital após a execução simulada dos motores.</p>
                            <div className="balance-sub" style={{ marginTop: '10px', fontSize: '0.9em', color: 'var(--text-secondary)' }}>
                                Capital Inicial: ${parseFloat(numericParams.initialCapital).toFixed(2)} | P/L Projetado: {parseFloat(results.globalStats.totalPnl) >= 0 ? '+' : ''}${results.globalStats.totalPnl} ({((parseFloat(results.globalStats.totalPnl) / parseFloat(numericParams.initialCapital)) * 100).toFixed(2)}%)
                            </div>
                        </div>
                        <div className="banner-stats">
                            <div className="b-stat">
                                <span>Caixa Total (USDT)</span>
                                <h3 className={parseFloat(results.globalStats.totalPnl) >= 0 ? 'profit pulse-text' : 'loss'}>
                                    ${results.globalStats.finalBalance}
                                </h3>
                            </div>
                        </div>
                    </div>

                    {/* --- GRÁFICO INTERATIVO --- */}
                    <div className="card">
                        <div className="card-header">
                            <h2>Curva Vetorial de Patrimônio (Equity Curve)</h2>
                        </div>
                        <InteractiveChart data={results.globalStats.equityCurve} initialCapital={parseFloat(numericParams.initialCapital)} />
                    </div>

                    {/* --- CARDS DE ESTATÍSTICA --- */}
                    <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                        <div className="stat-card">
                            <h3>Lucro Líquido</h3>
                            <span className={parseFloat(results.globalStats.totalPnl) >= 0 ? 'profit' : 'loss'}>
                                ${results.globalStats.totalPnl}
                            </span>
                        </div>
                        <div className="stat-card">
                            <h3>Win Rate Médio</h3>
                            <span className="profit">{results.globalStats.avgWinRate}%</span>
                        </div>
                        <div className="stat-card">
                            <h3>Max Drawdown</h3>
                            <span style={{color: 'var(--loss)'}}>{results.globalStats.maxDrawdown}%</span>
                        </div>
                        <div className="stat-card">
                            <h3>Taxas Pagas</h3>
                            <span style={{color: '#fbbf24'}}>${results.globalStats.totalFeesPaid}</span>
                        </div>
                        <div className="stat-card">
                            <h3>Pico de Trades Simultâneos</h3>
                            <span>{results.globalStats.maxConcurrentReached} <span style={{fontSize:'0.6em', color:'#888'}}>/ {numericParams.maxTrades}</span></span>
                        </div>
                        {results.globalStats.bankruptcies > 0 && (
                            <div className="stat-card" style={{borderColor: 'var(--loss)', backgroundColor: 'rgba(248,113,113,0.1)'}}>
                                <h3 style={{color: 'var(--loss)'}}>Falências</h3>
                                <span style={{color: 'var(--loss)'}}>{results.globalStats.bankruptcies}</span>
                            </div>
                        )}
                    </div>

                    {/* --- NOVO: SUGESTÃO GERAL DA IA POR ESTRATÉGIA --- */}
                    {strategyStats.length > 0 && (
                        <div className="card" style={{borderColor: 'var(--accent-blue)', background: 'linear-gradient(to right, var(--bg-secondary), var(--bg-primary))'}}>
                            <div className="card-header">
                                <h3 style={{color: 'var(--accent-blue)', display:'flex', alignItems:'center', gap:'10px'}}>
                                    🤖 Sugestão Geral da IA (Média)
                                </h3>
                            </div>
                            <div className="stats-cards-container" style={{marginTop: '10px'}}>
                                {strategyStats.map(stat => (
                                    <div key={stat.name} className="stat-card" style={{border: '1px solid var(--border-color)'}}>
                                        <h4 style={{fontSize:'0.8em', color:'var(--text-secondary)', marginBottom:'5px'}}>{stat.name}</h4>
                                        <div style={{display:'flex', justifyContent:'space-around', alignItems:'center', marginTop:'10px'}}>
                                            <div style={{textAlign:'center'}}>
                                                <div style={{fontSize:'0.7em', color:'#aaa'}}>Take Profit</div>
                                                <div style={{color: '#4ade80', fontWeight:'bold', fontSize:'1.2em'}}>{stat.avgTp}%</div>
                                            </div>
                                            <div style={{width:'1px', height:'30px', background:'var(--border-color)'}}></div>
                                            <div style={{textAlign:'center'}}>
                                                <div style={{fontSize:'0.7em', color:'#aaa'}}>Stop Loss</div>
                                                <div style={{color: '#f87171', fontWeight:'bold', fontSize:'1.2em'}}>{stat.avgSl}%</div>
                                            </div>
                                        </div>
                                        <div style={{fontSize:'0.7em', color:'#666', marginTop:'10px'}}>Baseado em {stat.count} pares otimizados</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* --- ACTION BAR (SALVAR E IA TOGGLE) --- */}
                    <div className="action-bar" style={{marginBottom: '20px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '15px'}}>
                        <label className="checkbox-ai" style={{cursor:'pointer', display:'flex', alignItems:'center', gap:'10px', background:'var(--bg-panel)', padding:'10px', borderRadius:'6px', border: '1px solid var(--accent-blue)'}}>
                            <input type="checkbox" checked={useAiSuggestions} onChange={(e) => setUseAiSuggestions(e.target.checked)} />
                            <span>🤖 Usar <strong>TP/SL Otimizados pela IA</strong> ao salvar</span>
                        </label>
                        <button onClick={handleApplyBestConfig} className="btn-success-large">
                            💾 Aplicar Melhores Configurações ao Bot
                        </button>
                    </div>

                    <div className="card">
                        <div className="card-header">
                            <h2>Detalhamento por Par, Estratégia e Timeframe</h2>
                        </div>
                        <div className="history-list" style={{ marginTop: '15px' }}>
                            {results.detailedResults.length > 0 ? (
                                results.detailedResults
                                .sort((a,b) => parseFloat(b.stats.totalPnl) - parseFloat(a.stats.totalPnl))
                                .map((res, idx) => (
                                    <div className="exchange-card" key={idx}>
                                        <div className="exc-header">
                                            <div className="exc-symbol">
                                                <h1>{res.symbol}</h1>
                                                <span className="exc-badge" style={{color: 'var(--accent-blue)'}}>{res.strategyName}</span>
                                                <span className="exc-badge">{res.interval}m</span>
                                            </div>
                                            <div className="exc-pnl">
                                                <span className="label">Lucro Líquido ($)</span>
                                                <span className={`val ${parseFloat(res.stats.totalPnl) >= 0 ? 'profit' : 'loss'}`}>
                                                    {parseFloat(res.stats.totalPnl) >= 0 ? '+' : ''}{res.stats.totalPnl}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="exc-grid">
                                            <div className="exc-col">
                                                <span className="label">Total de Trades</span>
                                                <span className="val">{res.stats.totalTrades}</span>
                                            </div>
                                            <div className="exc-col">
                                                <span className="label">Win Rate</span>
                                                <span className="val">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                        <div style={{ width: '40px', height: '4px', background: '#334155', borderRadius: '2px', overflow: 'hidden' }}>
                                                            <div style={{ width: `${res.stats.winRate}%`, height: '100%', background: '#4ade80' }}></div>
                                                        </div>
                                                        <span style={{ fontSize: '11px' }}>{res.stats.winRate}%</span>
                                                    </div>
                                                </span>
                                            </div>
                                            <div className="exc-col right">
                                                <span className="label">Status</span>
                                                <span className="val" style={{fontSize: '14px'}}>
                                                    {res.stats.isBankrupt ? '❌ QUEBROU' : parseFloat(res.stats.totalPnl) > 0 ? '🚀' : '🔻'}
                                                </span>
                                            </div>
                                            <div className="exc-col div-2-span">
                                                <span className="label">Sugestão de Otimização (TP / SL)</span>
                                                <span className="val">
                                                    {res.optimization ? (
                                                        <span style={{fontSize: '11px'}}>
                                                            <span style={{color: '#4ade80', marginRight:'8px'}}>▲ {res.optimization.suggestedTpPercent}%</span> 
                                                            <span style={{color: '#f87171'}}>▼ {res.optimization.suggestedSlPercent}%</span>
                                                        </span>
                                                    ) : <span style={{color:'#666'}}>---</span>}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#848e9c', background: '#0f141d', borderRadius: '8px' }}>
                                    Nenhum trade realizado nesta simulação.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};