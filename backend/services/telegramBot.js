// backend/services/telegramBot.js
const TelegramBot = require('node-telegram-bot-api');
const chalk = require('chalk');
const db = require('../database.js');
const { decrypt } = require('../utils/cryptoUtils.js');
const { fetchLivePositions, closeLivePosition } = require('./exchangeService.js');

let botInstance = null;

function initTelegramBot() {
    try {
        const user = db.prepare('SELECT telegram_bot_token, telegram_chat_id, telegram_webapp_url FROM users LIMIT 1').get();
        if (!user || !user.telegram_bot_token) {
            console.log(chalk.gray('[TELEGRAM] Token não configurado. Interface via Chat offline.'));
            return;
        }

        const token = decrypt(user.telegram_bot_token);
        const authorizedChatId = user.telegram_chat_id ? decrypt(user.telegram_chat_id) : null;
        const webAppUrl = user.telegram_webapp_url || null;

        if (!token) return;

        if (botInstance) {
            botInstance.stopPolling();
            botInstance = null;
        }

        botInstance = new TelegramBot(token, { polling: true });
        console.log(chalk.blue('[TELEGRAM] Link Estabelecido! Comando via Chat Online.'));

        botInstance.on('polling_error', (error) => {
            console.log(chalk.magenta(`[TELEGRAM] Erro de Polling contornado: ${error.message}`));
        });

        // Middleware Autenticador
        const isAuthorized = (msg) => {
            const chatId = msg.chat.id.toString();
            if (authorizedChatId && chatId !== authorizedChatId) {
                botInstance.sendMessage(chatId, "⛔ Acesso Negado. Seu Chat ID (" + chatId + ") não foi cadastrado no Painel de Risco.");
                console.log(chalk.red(`[TELEGRAM] Invasão bloqueada do ChatID: ${chatId}`));
                return false;
            }
            return true;
        };

        botInstance.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id.toString();
            const isAdmin = authorizedChatId && chatId === authorizedChatId;
            
            let resp = "";
            const opts = { parse_mode: 'Markdown' };

            if (isAdmin) {
                resp = "🤖 *Terminal HFT Premium Conectado*\n\n";
                resp += "Comandos Master Autorizados:\n";
                resp += "🔹 /status - Estado Lógico Global\n";
                resp += "🔹 /posicoes - Rastrear Carteira na Corretora (LIVE)\n";
                resp += "🔹 /fechartudo - Botão de EMERGÊNCIA (Panico)\n";
                resp += "🔹 /app [link] - Configura o Terminal React (Mini-App)\n";
            } else {
                resp = "👋 *Bem-Vindo ao Terminal HFT*\n\nClique no botão abaixo para acessar a plataforma e realizar seu Login Seguro.";
            }
            
            // Se já tem url de webapp registrada, envia o botão gigante de acesso
            if (webAppUrl) {
                opts.reply_markup = {
                    inline_keyboard: [[
                        { text: '📊 Abrir App (Login)', web_app: { url: webAppUrl } }
                    ]]
                };
            }
            
            botInstance.sendMessage(chatId, resp, opts);
        });

        // Novo Comando para injetar um Mini-App
        botInstance.onText(/\/app (.+)/, (msg, match) => {
            if (!isAuthorized(msg)) return;
            const chatId = msg.chat.id;
            const url = match[1].trim();
            
            if (!url.startsWith('https://')) {
                return botInstance.sendMessage(chatId, '❌ A URL deve obrigatoriamente começar com "https://" para o Telegram aceitar encapsular como WebApp.');
            }
            
            try {
                db.prepare('UPDATE users SET telegram_webapp_url = ? WHERE telegram_bot_token IS NOT NULL').run(url);
                
                // Menu Lateral Permanente
                botInstance.setChatMenuButton({
                    chat_id: chatId,
                    menu_button: {
                        type: 'web_app',
                        text: 'TELA DO ROBÔ',
                        web_app: { url: url }
                    }
                });

                botInstance.sendMessage(chatId, `✅ *Mini-App HFT Configurado!*\n\nO Telegram agora está encabeçando a porta:\n\`${url}\`\n\nVocê tem dois caminhos imersivos para entrar:\n1. Clicar no botão Menu (inferior esquerdo do teclado).\n2. Clicar no atalho maciço abaixo. 👇`, {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[ { text: '📲 Iniciar Terminal Web', web_app: { url: url } } ]]
                    }
                });
            } catch(e) {
                botInstance.sendMessage(chatId, "❌ Falha ao mapear App: " + e.message);
            }
        });

        botInstance.onText(/\/status/, (msg) => {
            if (!isAuthorized(msg)) return;
            const openTrades = db.prepare('SELECT COUNT(*) as count FROM open_trades').get().count;
            botInstance.sendMessage(msg.chat.id, `✅ *Status Lógico Restrito*\n\nTrades Presos no Banco Local: ${openTrades}\nVálvulas Socket e Algoritmos de Grade: ON`, { parse_mode: 'Markdown' });
        });

        botInstance.onText(/\/posicoes/, async (msg) => {
            if (!isAuthorized(msg)) return;
            const chatId = msg.chat.id;
            botInstance.sendMessage(chatId, "📡 Contornando base de dados locais... Varrendo servidores diretos da Corretora...");
            
            try {
                const positions = await fetchLivePositions();
                if (positions.length === 0) {
                    botInstance.sendMessage(chatId, "✅ Operação Fantasma! Nenhuma posição real detectada na carteira pública.");
                    return;
                }
                
                let resp = "📊 *POSIÇÕES VIVAS FLAGRADAS NAS LINHAS:*\n\n";
                positions.forEach((p, idx) => {
                    const icon = p.unrealizedPnl >= 0 ? "🟩" : "🟥";
                    resp += `${idx+1}. *${p.symbol}* (${p.side})\n`;
                    resp += `Lote Executivo (Tamanho): ${p.size}\n`;
                    resp += `Status Atual: ${icon} $${p.unrealizedPnl.toFixed(2)}\n\n`;
                });
                
                botInstance.sendMessage(chatId, resp, { parse_mode: 'Markdown' });
            } catch(e) {
                botInstance.sendMessage(chatId, "❌ Link cortado com a exchange: " + e.message);
            }
        });

        botInstance.onText(/\/fechartudo/, async (msg) => {
            if (!isAuthorized(msg)) return;
            const chatId = msg.chat.id;
            
            const opts = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🚨 CONFIRMAR LIQUIDAÇÃO TOTAL 🚨', callback_data: 'CONFIRM_CLOSE_ALL' }],
                        [{ text: 'Abortar', callback_data: 'CANCEL' }]
                    ]
                }
            };
            botInstance.sendMessage(chatId, "⚠️ *OVERRIDE MÁXIMO (Botão de Pânico)*\nAutorização exigida para disparar feixes contínuos à mercado anulando TODA A CARTEIRA de Posições Vivas simultaneamente.", Object.assign({ parse_mode: 'Markdown' }, opts));
        });

        botInstance.on('callback_query', async (query) => {
            const chatId = query.message.chat.id;
            if (authorizedChatId && chatId.toString() !== authorizedChatId) return;

            if (query.data === 'CANCEL') {
                botInstance.answerCallbackQuery(query.id);
                botInstance.sendMessage(chatId, "Ação abortada. Posições mantidas nas linhas.");
            } else if (query.data === 'CONFIRM_CLOSE_ALL') {
                botInstance.answerCallbackQuery(query.id, { text: 'Override Executivo Aceito...' });
                botInstance.sendMessage(chatId, "⚡ Iniciando Disparo Maciço. Fechando pontes...");
                
                try {
                    const positions = await fetchLivePositions();
                    let successCount = 0;
                    for (const p of positions) {
                        try {
                            await closeLivePosition(p.ccxtSymbol, p.side, p.size);
                            successCount++;
                        } catch(er) {}
                    }
                    botInstance.sendMessage(chatId, `✅ ESTRUTURA COLAPSADA. ${successCount} de ${positions.length} posições foram fechadas a mercado irreversivelmente.`);
                } catch(e) {
                    botInstance.sendMessage(chatId, "❌ Falha no disparo terminal: " + e.message);
                }
            }
        });

    } catch (error) {
        console.error(chalk.red('[TELEGRAM] Falha ao injetar API:'), error.message);
    }
}

// Injeção Automática (Tunnel Dinâmico Invisível)
function registerDynamicTunnelUrl(url) {
    if (!botInstance) return;
    try {
        const u = db.prepare('SELECT telegram_chat_id FROM users WHERE telegram_chat_id IS NOT NULL LIMIT 1').get();
        if(!u) return; // Nenhum admin configurado ainda
        
        db.prepare('UPDATE users SET telegram_webapp_url = ?').run(url);
        
        const chatId = decrypt(u.telegram_chat_id);

        botInstance.setChatMenuButton({
            chat_id: chatId,
            menu_button: {
                type: 'web_app',
                text: 'TELA DO ROBÔ',
                web_app: { url: url }
            }
        });

        // Disparo Automático Pró-Ativo do App para o Cliente!
        botInstance.sendMessage(chatId, `✅ *Túnel Inteligente Estabelecido!*\n\nO servidor interceptou sua URL pública gerada de forma automática.\n\`${url}\`\n\nClique no botão gigantesco abaixo ou no canto do teclado para abrir a interface agora mesmo:`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[ { text: '📱 Abrir Terminal HFT', web_app: { url: url } } ]]
            }
        });

        console.log(chalk.magenta(`[TELEGRAM] Túnel Auto-Mapeado: Enviado botão do App automaticamente para o Chat!`));
    } catch(e) {
        console.error(chalk.red('[TELEGRAM] Erro ao parear Tunnel invisível e enviar mensagem:'), e.message);
    }
}

function reloadTelegramBot() {
    initTelegramBot();
}

module.exports = {
    initTelegramBot,
    reloadTelegramBot,
    registerDynamicTunnelUrl
};
