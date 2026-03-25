// frontend/src/components/SettingsTab.jsx

import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { ConfirmButton } from './ConfirmButton';
import { getSocket } from '../socket';

export const SettingsTab = () => {
    const socket = getSocket();
    const initialSettings = useStore((state) => state.settings);
    const strategies = useStore((state) => state.strategies);
    const setSettingsInStore = useStore((state) => state.setSettings);
    const activeExchange = useStore((state) => state.activeExchange);
    const selectedTradeContext = useStore((state) => state.selectedTradeContext);

    const [settings, setSettings] = useState(initialSettings);
    const [activeTab, setActiveTab] = useState('market'); 
    const [selectedStrategy, setSelectedStrategy] = useState('');
    const [symbolSearch, setSymbolSearch] = useState('');

    const [manualEntry, setManualEntry] = useState({
        symbol: '',
        interval: '5',
        strategy: ''
    });

    useEffect(() => { setSettings(initialSettings); }, [initialSettings]);
    
    useEffect(() => {
        if (selectedTradeContext && selectedTradeContext.symbol) {
            setSymbolSearch(selectedTradeContext.symbol);
            setManualEntry(prev => ({ ...prev, symbol: selectedTradeContext.symbol }));
            if (activeTab !== 'market') setActiveTab('market');
        }
    }, [selectedTradeContext]);

    const filteredStrategies = activeExchange === 'bingx' 
        ? strategies.filter(s => s.name === 'grid_trading_bingx')
        : strategies.filter(s => s.name !== 'grid_trading_bingx');
        
    const filteredSymbols = activeExchange === 'bingx' 
        ? ['BTCUSDT'] 
        : (settings?.allSymbols || []);

    useEffect(() => { 
        if (filteredStrategies.length > 0) {
            if (!selectedStrategy || !filteredStrategies.find(s => s.name === selectedStrategy)) {
                setSelectedStrategy(filteredStrategies[0].name);
            }
            if (!manualEntry.strategy || !filteredStrategies.find(s => s.name === manualEntry.strategy)) {
                setManualEntry(prev => ({ ...prev, strategy: filteredStrategies[0].name }));
            }
        } 
    }, [filteredStrategies, selectedStrategy, manualEntry.strategy]);

    useEffect(() => {
        if (filteredSymbols.length > 0 && (!manualEntry.symbol || !filteredSymbols.includes(manualEntry.symbol))) {
            setManualEntry(prev => ({ ...prev, symbol: filteredSymbols[0] }));
        }
    }, [filteredSymbols, manualEntry.symbol]);

    if (!settings || !strategies.length) { return <div className="card">Carregando configurações...</div>; }

    const handleSaveSettings = (newSettings) => { 
        // Atualiza a Store Global
        setSettingsInStore(newSettings); 
        // Atualiza o Estado Local
        setSettings(newSettings);
        // Envia para o Backend
        socket.emit('update_settings', newSettings); 
        // Feedback visual
        // (Opcional: alert('Configurações salvas e aplicadas!')); 
    };

    const handleClearAllData = () => { 
        socket.emit('clear_trade_history'); 
    };
    
    // --- HANDLERS ---
    const handleRiskChange = (e) => {
        const { name, value, dataset, type } = e.target;
        let finalValue = value;
        if (dataset.type === 'boolean') finalValue = value === 'true';
        else if (type === 'number') finalValue = parseFloat(value) || 0;
        
        const newSettings = { ...settings, risk: { ...settings.risk, [name]: finalValue } };
        setSettings(newSettings);
        handleSaveSettings(newSettings);
    };

    const handleSymbolsChange = (e) => { 
        const { value, checked } = e.target; 
        const currentSymbols = settings.risk.symbolsToMonitor; 
        const newSymbols = checked ? [...currentSymbols, value] : currentSymbols.filter(symbol => symbol !== value); 
        
        const newSettings = { ...settings, risk: { ...settings.risk, symbolsToMonitor: newSymbols } };
        setSettings(newSettings); 
        handleSaveSettings(newSettings);
    };

    const handleTimeframeChange = (e) => { 
        const { value, checked, dataset } = e.target; 
        const { strategyName } = dataset; 
        const currentTfs = settings.enabledStrategies[strategyName] || []; 
        const newTfs = checked ? [...currentTfs, value] : currentTfs.filter(tf => tf !== value); 
        
        const newSettings = { ...settings, enabledStrategies: { ...settings.enabledStrategies, [strategyName]: newTfs } };
        setSettings(newSettings); 
        handleSaveSettings(newSettings);
    };

    const handleStrategyParamChange = (e) => { 
        const { name, value, dataset } = e.target; 
        const { strategyName, type } = dataset; 
        let finalValue = value; 
        if (type === 'number') finalValue = parseFloat(value); 
        if (type === 'boolean') finalValue = value === 'true'; 
        
        const newSettings = { 
            ...settings, 
            strategyConfigs: { 
                ...settings.strategyConfigs, 
                [strategyName]: { 
                    ...(settings.strategyConfigs[strategyName] || {}), 
                    [name]: finalValue 
                } 
            } 
        };
        setSettings(newSettings); 
        handleSaveSettings(newSettings);
    };

    const handleAddManualPair = () => {
        if (!manualEntry.symbol || !manualEntry.interval || !manualEntry.strategy) return;
        
        const activePairs = settings.activePairs || [];
        const exists = activePairs.some(p => 
            p.symbol === manualEntry.symbol && 
            p.interval === manualEntry.interval && 
            p.strategy === manualEntry.strategy
        );

        if (exists) { 
            alert("Esta configuração já existe na lista."); 
            return; 
        }

        const newPairs = [manualEntry, ...activePairs];
        const newSettings = { ...settings, activePairs: newPairs };
        setSettings(newSettings);
        handleSaveSettings(newSettings);
    };

    const handleRemoveOptimizedPair = (index) => {
        const newPairs = [...(settings.activePairs || [])];
        newPairs.splice(index, 1);
        const newSettings = { ...settings, activePairs: newPairs };
        setSettings(newSettings);
        handleSaveSettings(newSettings);
    };

    const handleClearOptimizedMode = () => {
        const newSettings = { ...settings, activePairs: [] };
        handleSaveSettings(newSettings);
    };

    const handleSyncTopSymbols = () => {
        const newSettings = { ...settings, risk: { ...settings.risk, symbolsToMonitor: [...filteredSymbols] } };
        setSettings(newSettings);
        handleSaveSettings(newSettings);
    };

    // --- VARIÁVEIS AUXILIARES ---
    const strategyForParams = filteredStrategies.find(s => s.name === selectedStrategy);
    const timeframes = ['1', '3', '5', '15', '30', '60'];
    const isOptimizedMode = settings.activePairs && settings.activePairs.length > 0;

    return (
        <div className="settings-dashboard" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0f141d', padding: '8px 12px', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.03)', boxShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>⚙️</span>
                    <div>
                        <h1 style={{ fontSize: '13px', margin: 0, color: '#eaecef', lineHeight: 1.1 }}>Centro de Comando</h1>
                        <span style={{ fontSize: '10px', color: '#848e9c' }}>Parâmetros globais</span>
                    </div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', paddingLeft: '10px', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                    <span style={{ fontSize: '9px', color: '#848e9c', textTransform: 'uppercase' }}>Ambiente</span>
                    <span style={{ fontSize: '11px', fontWeight: 'bold' }} className={settings.risk.tradingMode === 'LIVE' ? 'loss pulse-text' : 'profit'}>
                        {settings.risk.tradingMode === 'LIVE' ? '🔥 LIVE' : '🧪 PAPER'}
                    </span>
                </div>
            </div>

            <div className="settings-form" style={{ marginTop: '0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="settings-tabs" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', background: 'var(--bg-panel)', padding: '6px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <button type="button" className={`tab-link ${activeTab === 'market' ? 'active' : ''}`} onClick={() => setActiveTab('market')} style={{ padding: '6px', fontSize: '11px', borderRadius: '4px', textAlign: 'center' }}>Mercado / Motor</button>
                    <button type="button" className={`tab-link ${activeTab === 'risk' ? 'active' : ''}`} onClick={() => setActiveTab('risk')} style={{ padding: '6px', fontSize: '11px', borderRadius: '4px', textAlign: 'center' }}>Gestão de Risco</button>
                    <button type="button" className={`tab-link ${activeTab === 'params' ? 'active' : ''}`} onClick={() => setActiveTab('params')} style={{ padding: '6px', fontSize: '11px', borderRadius: '4px', textAlign: 'center' }}>Parâmetros Fin.</button>
                    <button type="button" className={`tab-link ${activeTab === 'system' ? 'active' : ''}`} onClick={() => setActiveTab('system')} style={{ padding: '6px', fontSize: '11px', borderRadius: '4px', textAlign: 'center' }}>Logs do Sistema</button>
                </div>

            {/* --- ABA UNIFICADA: MERCADO & ESTRATÉGIA --- */}
            <div className="tab-pane" style={{ display: activeTab === 'market' ? 'block' : 'none', padding: '0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    
                    {/* 1. SEÇÃO DE PARES ESPECÍFICOS (PRIORIDADE) */}
                    <div className="exchange-card" style={{ padding: '10px', borderLeft: isOptimizedMode ? '4px solid var(--accent-blue)' : '1px solid var(--border-color)', gap: '8px' }}>
                        <div className="exc-header" style={{ borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: '6px' }}>
                            <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
                                <h2 style={{ fontSize: '13px', margin: 0, color: '#eaecef' }}>🎯 Pares Otimizados</h2>
                                {isOptimizedMode ? <span className="status-badge active pulse-text" style={{ padding: '2px 6px', fontSize: '9px' }}>Ativo</span> : <span className="status-badge inactive" style={{ padding: '2px 6px', fontSize: '9px' }}>Inativo</span>}
                            </div>
                            {isOptimizedMode && (
                                <ConfirmButton 
                                    onConfirm={handleClearOptimizedMode} 
                                    className="btn-danger-full"
                                    style={{ padding: '2px 8px', fontSize: '9px', width: 'auto' }}
                                    confirmText="Apagar Tudo?"
                                >
                                    Limpar Otimizações
                                </ConfirmButton>
                            )}
                        </div>
                        <div style={{ padding: '0' }}>
                            <p style={{ fontSize: '10px', color: '#848e9c', marginBottom: '8px' }}>Pares forçados aqui <strong>sobrescrevem</strong> as regras globais de mercado. Ideal para alocação via AI Backtest.</p>

                            {/* Barra de Adição Rápida */}
                            <div className="manual-add-bar" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', alignItems: 'end', background: 'var(--bg-primary)', padding: '6px', borderRadius: '6px', border: '1px solid var(--border-color)', marginBottom: '10px' }}>
                                <div className="manual-add-group" style={{ margin: 0 }}>
                                    <label style={{ fontSize: '10px' }}>Símbolo</label>
                                    <select value={manualEntry.symbol} onChange={(e) => setManualEntry({...manualEntry, symbol: e.target.value})} className="form-control">
                                        {filteredSymbols.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div className="manual-add-group" style={{ margin: 0 }}>
                                    <label style={{ fontSize: '10px' }}>TF</label>
                                    <select value={manualEntry.interval} onChange={(e) => setManualEntry({...manualEntry, interval: e.target.value})} className="form-control">
                                        {timeframes.map(t => <option key={t} value={t}>{t}m</option>)}
                                    </select>
                                </div>
                                <div className="manual-add-group" style={{ gridColumn: '1 / -1', margin: 0 }}>
                                    <label style={{ fontSize: '10px' }}>Motor Escalonador</label>
                                    <select value={manualEntry.strategy} onChange={(e) => setManualEntry({...manualEntry, strategy: e.target.value})} className="form-control">
                                        {filteredStrategies.map(s => <option key={s.name} value={s.name}>{s.label}</option>)}
                                    </select>
                                </div>
                                <button type="button" className="btn-success-large" onClick={handleAddManualPair} style={{ gridColumn: '1 / -1', padding: '6px', fontSize: '11px', borderRadius: '4px' }}>+ Forçar Ativo</button>
                            </div>

                             {/* Lista de Pares Ativos */}
                            {isOptimizedMode && (
                                <div className="history-list">
                                    {settings.activePairs.map((pair, idx) => (
                                        <div key={idx} className="exchange-card">
                                            <div className="exc-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                                                <div className="exc-symbol">
                                                    <h1>{pair.symbol}</h1>
                                                    <span className="exc-badge">{pair.interval}m</span>
                                                    <span className="exc-badge" style={{color: 'var(--accent-blue)'}}>
                                                        {filteredStrategies.find(s => s.name === pair.strategy)?.label || pair.strategy}
                                                    </span>
                                                </div>
                                                <div className="exc-actions" style={{ justifyContent: 'flex-end', marginTop: 0 }}>
                                                     <button type="button" onClick={() => handleRemoveOptimizedPair(idx)} className="exc-btn danger" style={{ padding: '4px 8px' }}>
                                                         Excluir Override
                                                     </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 2. SEÇÃO GLOBAL (FALLBACK) */}
                    <div className="exchange-card" style={{ padding: '10px', opacity: isOptimizedMode ? 0.4 : 1, transition: 'opacity 0.3s', gap: '8px' }}>
                        <div className="exc-header" style={{ borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: '6px' }}>
                            <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
                                <h2 style={{ fontSize: '13px', margin: 0, color: '#eaecef' }}>🌍 Fallback Global</h2>
                                {isOptimizedMode && <span className="status-badge warning" style={{ padding: '2px 6px', fontSize: '9px' }}>Sobreposto</span>}
                            </div>
                        </div>
                        <div style={{ padding: '0' }}>
                            <p style={{ fontSize: '10px', color: '#848e9c', marginBottom: '8px' }}>Atua nas Moedas de Filtro apenas se os Motores Isolados definidos acima não existirem ou estiverem inativos.</p>

                            <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '8px' }}>
                                {/* Coluna Esquerda: Estratégias */}
                                <div className="form-group" style={{ background: 'var(--bg-primary)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', margin: 0 }}>
                                    <h4 style={{ fontSize: '12px', margin: '0 0 8px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px', color: '#eaecef' }}>Motores & Timeframes</h4>
                                    {filteredStrategies.map(strategy => (
                                        <div className="strategy-check-group" key={strategy.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <span className="strat-name" style={{ fontSize: '11px', fontWeight: 'bold' }}>{strategy.label.replace(' (Exclusivo BingX)', '')}</span>
                                            <div className="tf-checkboxes" style={{ gap: '4px', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                {timeframes.map(tf => (
                                                    <label key={tf} className={`check-btn ${settings.enabledStrategies[strategy.name]?.includes(tf) ? 'active' : ''}`} style={{ padding: '4px', fontSize: '10px' }}>
                                                        <input type="checkbox" style={{display:'none'}} data-strategy-name={strategy.name} value={tf} checked={settings.enabledStrategies[strategy.name]?.includes(tf) || false} onChange={handleTimeframeChange} disabled={isOptimizedMode} /> 
                                                        {tf}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Coluna Direita: Símbolos */}
                                <div className="form-group" style={{ background: 'var(--bg-primary)', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', margin: 0 }}>
                                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: '8px'}}>
                                        <h4 style={{ margin: 0, fontSize: '12px', color: '#eaecef' }}>Cluster de Filtros</h4>
                                        <span onClick={handleSyncTopSymbols} style={{ color: '#fcd535', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold', display: isOptimizedMode ? 'none' : 'block' }}>
                                            Injetar Top 30
                                        </span>
                                    </div>
                                    <input type="text" className="form-control" placeholder="Localizar paridade..." value={symbolSearch} onChange={(e) => setSymbolSearch(e.target.value)} disabled={isOptimizedMode} style={{ marginBottom: '8px', height: '24px', fontSize: '11px', padding: '2px 6px' }} />
                                    <div className="symbol-grid-box" style={{ flexGrow: 1, minHeight: '60px', maxHeight: '100px', background: 'var(--bg-panel)', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '4px', overflowY: 'auto' }}>
                                        {filteredSymbols.filter(s => s.toUpperCase().includes(symbolSearch.toUpperCase())).map(symbol => (
                                            <label key={symbol} className="symbol-check" style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '10px' }}>
                                                <input type="checkbox" value={symbol} checked={settings.risk.symbolsToMonitor.includes(symbol)} onChange={handleSymbolsChange} disabled={isOptimizedMode} style={{ width: '12px', height: '12px', margin: 0 }} /> 
                                                {symbol.replace('USDT','')}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- ABA DE RISCO --- */}
            <div className="tab-pane" style={{ display: activeTab === 'risk' ? 'block' : 'none', padding: '0' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div className="exchange-card" style={{ padding: '10px', gap: '8px' }}>
                        <div className="exc-header" style={{ borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: '6px' }}>
                            <h2 style={{ fontSize: '13px', margin: 0, color: '#eaecef' }}>🛡️ Regras de Exposição de Capital</h2>
                        </div>
                        <div className="dashboard-grid-4col" style={{ gap: '8px' }}>
                            <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: '10px' }}>Modo de Operação</label><select name="tradingMode" value={settings.risk.tradingMode || 'PAPER'} onChange={handleRiskChange}><option value="PAPER">Simulação Virtual</option><option value="LIVE">Conta Real</option></select></div>
                            <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: '10px' }}>Ordem por Entrada (USDT)</label><input type="number" name="entryValueUSDT" value={settings.risk.entryValueUSDT} onChange={handleRiskChange} /></div>
                            <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: '10px' }}>Alavancagem Fixa Cruzada</label><input type="number" name="leverage" value={settings.risk.leverage} onChange={handleRiskChange} /></div>
                            <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: '10px' }}>Teto de Ordens Simultâneas</label><input type="number" name="maxTradesPerStrategy" value={settings.risk.maxTradesPerStrategy} onChange={handleRiskChange} /></div>
                            <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: '10px' }}>Refriamento Temporal (m)</label><input type="number" name="cooldownMinutes" value={settings.risk.cooldownMinutes} onChange={handleRiskChange} /></div>
                            <div className="form-group" style={{ margin: 0 }}><label style={{ fontSize: '10px' }}>Sistema de Depuração L2</label><select name="debugMode" value={settings.risk.debugMode || false} data-type="boolean" onChange={handleRiskChange}><option value={false}>Desligado</option><option value={true}>Transparente</option></select></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- ABA DE PARÂMETROS --- */}
            <div className="tab-pane" style={{ display: activeTab === 'params' ? 'block' : 'none', padding: '0' }}>
                <div className="form-group" style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '11px', color: '#848e9c', marginBottom: '4px' }}>Motor Dinâmico Selecionado:</label>
                    <select value={selectedStrategy} onChange={(e) => setSelectedStrategy(e.target.value)} className="form-control" style={{ fontSize: '12px' }}>
                        {filteredStrategies.map(s => <option key={s.name} value={s.name}>{s.label}</option>)}
                    </select>
                </div>
                
                {strategyForParams && (
                    <div className="exchange-card" style={{ padding: '10px', gap: '8px' }}>
                        <div className="exc-header" style={{ borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: '6px' }}>
                            <div className="strategy-description" dangerouslySetInnerHTML={{ __html: strategyForParams.description }} style={{ color: '#848e9c', fontSize: '10px' }}></div>
                        </div>
                        <div className="dashboard-grid-4col" style={{ gap: '8px' }}>
                            {Object.entries(strategyForParams.parameterLabels).map(([key, paramInfo]) => { 
                                const strategyConfig = settings.strategyConfigs[strategyForParams.name] || {};
                                const currentValue = strategyConfig[key];
                                const defaultValue = strategyForParams.config[key];
                                const val = currentValue !== undefined ? currentValue : defaultValue;

                                if (key === 'operationMode') { 
                                    return (
                                        <div className="form-group" style={{ margin: 0 }} key={key}>
                                            <label title={paramInfo.tooltip} style={{ fontSize: '10px' }}>{paramInfo.label}</label>
                                            <select name={key} data-strategy-name={strategyForParams.name} value={val} onChange={handleStrategyParamChange}>
                                                <option value="BOTH">Variável Long & Short</option>
                                                <option value="LONG">Apenas Long (Compra)</option>
                                                <option value="SHORT">Apenas Short (Venda)</option>
                                            </select>
                                        </div>
                                    ); 
                                } 
                                if (typeof defaultValue === 'boolean') { 
                                    return (
                                        <div className="form-group" style={{ margin: 0 }} key={key}>
                                            <label title={paramInfo.tooltip} style={{ fontSize: '10px' }}>{paramInfo.label}</label>
                                            <select name={key} data-strategy-name={strategyForParams.name} data-type="boolean" value={val} onChange={handleStrategyParamChange}>
                                                <option value={true}>Ativado</option>
                                                <option value={false}>Desativado</option>
                                            </select>
                                        </div>
                                    ); 
                                } 
                                return (
                                    <div className="form-group" style={{ margin: 0 }} key={key}>
                                        <label title={paramInfo.tooltip} style={{ fontSize: '10px' }}>{paramInfo.label}</label>
                                        <input type="number" step="any" name={key} data-strategy-name={strategyForParams.name} data-type="number" value={val} onChange={handleStrategyParamChange} />
                                    </div>
                                ); 
                            })}
                        </div>
                    </div>
                )}
            </div>
            
            {/* --- ABA DE SISTEMA --- */}
            <div className="tab-pane" style={{ display: activeTab === 'system' ? 'block' : 'none', padding: '0' }}>
                 <div className="exchange-card danger-zone" style={{ background: 'rgba(248, 113, 113, 0.05)', border: '1px solid rgba(248, 113, 113, 0.2)', padding: '12px', gap: '8px' }}>
                    <h4 style={{ color: 'var(--loss)', fontSize: '13px', margin: 0, paddingBottom: '4px', borderBottom: '1px dashed rgba(248, 113, 113, 0.2)' }}>⚠️ Área de Descontaminação Risco-0</h4>
                    <p className="danger-zone-description" style={{ color: '#848e9c', fontSize: '10px', margin: '4px 0' }}>A execução deste protocolo oblitera todos os dados locais operacionais e força o motor central a ignorar todos os estados de roteamento salvos na CCXT.</p>
                    <ConfirmButton 
                        onConfirm={handleClearAllData} 
                        className="btn-danger-full"
                        style={{ padding: '8px', fontSize: '11px', fontWeight: 'bold' }}
                        confirmText="Apagar Tudo?"
                    >
                        🗑️ Purgar Data Lake da CCXT
                    </ConfirmButton>
                </div>
            </div>
            
            </div>
        </div>
    );
};