// frontend/src/utils/csvExporter.js (Now Native Excel Exporter)
import * as XLSX from 'xlsx';

// Função auxiliar para formatar duração de ms para HH:mm:ss
const formatDurationToHMS = (ms) => {
    if (typeof ms !== 'number' || ms < 0) return '00:00:00';
    
    let seconds = Math.floor(ms / 1000);
    let minutes = Math.floor(seconds / 60);
    let hours = Math.floor(minutes / 60);

    seconds = seconds % 60;
    minutes = minutes % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

// Função para converter um objeto de trade complexo em um objeto plano
const flattenTradeObject = (trade) => {
    const exitDate = new Date(trade.timestamp);
    const entryDate = new Date(exitDate.getTime() - trade.durationMs);

    const flatTrade = {
        "ID Único": trade.uniqueId,
        "Ordem ID": trade.orderId || 'N/A (Simulação)',
        "Par de Moeda": trade.symbol,
        "Lado (Direção)": trade.side,
        "Estratégia": trade.strategyLabel,
        "Timeframe": `${trade.interval}m`,
        "Status de Saída": trade.outcome,
        "Motivo da Saída": trade.exitReason,
        "P/L Líquido (%)": trade.pnl ? Number(trade.pnl.toFixed(4)) : 0,
        "P/L Líquido (USDT)": trade.pnlUsdt ? Number(trade.pnlUsdt.toFixed(4)) : 0,
        "Lucro Máximo MFE (%)": trade.maxPnl ? Number(trade.maxPnl.toFixed(4)) : 'N/A',
        "Perda Máxima MAE (%)": trade.minPnl ? Number(trade.minPnl.toFixed(4)) : 'N/A',
        "Data de Entrada": entryDate.toLocaleString('pt-BR'),
        "Data de Saída": exitDate.toLocaleString('pt-BR'),
        "Duração Total": formatDurationToHMS(trade.durationMs),
        "Preço de Entrada": trade.entryPrice,
        "Preço de Saída": trade.exitPrice,
        "Preço Máximo Atingido": trade.peakPrice,
        "Preço Mínimo Atingido": trade.nadirPrice,
        "Alavancagem": trade.leverage,
        "Margem Alocada (USDT)": trade.entryValue,
    };

    // Adiciona os parâmetros da estratégia com prefixo '[Config]'
    if (trade.configsUsed) {
        for (const key in trade.configsUsed) {
            flatTrade[`[Config] ${key}`] = trade.configsUsed[key];
        }
    }

    // Adiciona os indicadores de entrada com prefixo '[Setup de Entrada]'
    if (trade.entryIndicators) {
        for (const key in trade.entryIndicators) {
            flatTrade[`[Setup de Entrada] ${key}`] = trade.entryIndicators[key];
        }
    }
    
    // Adiciona os indicadores de saída com prefixo '[Fator de Saída]'
    if (trade.exitIndicators) {
        for (const key in trade.exitIndicators) {
            flatTrade[`[Fator de Saída] ${key}`] = trade.exitIndicators[key];
        }
    }

    return flatTrade;
};

// Função principal de exportação nativa Excel
export const exportToCsv = (filename, trades) => {
    if (!trades || trades.length === 0) {
        alert("Não há trades para exportar.");
        return;
    }

    const flatTrades = trades.map(flattenTradeObject);
    
    // Cria uma nova pasta de trabalho (workbook) do Excel
    const wb = XLSX.utils.book_new();
    
    // Converte o array de objetos JSON para uma planilha (worksheet)
    const ws = XLSX.utils.json_to_sheet(flatTrades);
    
    // Ajusta a largura das colunas baseada nos cabeçalhos
    const colWidths = Object.keys(flatTrades[0] || {}).map(key => ({ wch: Math.max(20, key.length + 5) }));
    ws['!cols'] = colWidths;
    
    // Adiciona a planilha à pasta de trabalho
    XLSX.utils.book_append_sheet(wb, ws, "Histórico de Trades");
    
    // Garante que a extensão seja .xlsx para que o Excel abra nativamente sem engasgos
    const cleanFilename = filename.replace(/\.csv$/, '.xlsx');
    
    // Força o download nativo do arquivo Excel compilado
    XLSX.writeFile(wb, cleanFilename);
};