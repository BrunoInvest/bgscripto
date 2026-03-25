// backend/utils/cryptoUtils.js
const crypto = require('crypto');
require('dotenv').config();

// Precisamos de uma chave de 32 bytes em formato HEX (64 caracteres)
// Se o usuário não definiu, geramos uma temporária para não quebrar a aplicação,
// mas ela deve ser salva no .env para persistência.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'); 
const ALGORITHM = 'aes-256-gcm';

if (!process.env.ENCRYPTION_KEY) {
    console.warn('\x1b[33m[SECURITY] ATENÇÃO: ENCRYPTION_KEY não encontrada no .env. Chaves de API serão perdidas ao reiniciar. Adicione: ENCRYPTION_KEY=' + ENCRYPTION_KEY + '\x1b[0m');
}

// Garante que a chave é um Buffer de 32 bytes
let keyBuffer;
try {
    keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
    if (keyBuffer.length !== 32) throw new Error('Tamanho inválido');
} catch (e) {
    console.error('\x1b[31m[CRITICAL] ENCRYPTION_KEY no .env é inválida. Deve ser um HEX de 64 caracteres.\x1b[0m');
    keyBuffer = crypto.randomBytes(32);
}

function encrypt(text) {
    if (!text) return text;
    try {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
        let encrypted = cipher.update(String(text), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return `${iv.toString('hex')}:${encrypted}:${authTag}`;
    } catch (e) {
        console.error('[CRYPTO ERROR] Encrypt falhou:', e.message);
        return null;
    }
}

function decrypt(encryptedText) {
    if (!encryptedText || !encryptedText.includes(':')) return encryptedText; // Retorna original se não for criptografado
    try {
        const parts = encryptedText.split(':');
        if (parts.length !== 3) return encryptedText;
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const authTag = Buffer.from(parts[2], 'hex');
        
        const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error('[CRYPTO ERROR] Falha ao descriptografar:', e.message);
        return null; 
    }
}

module.exports = { encrypt, decrypt };
