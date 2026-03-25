const { spawn } = require('child_process');
const chalk = require('chalk');

let tunnelProcess = null;

function startAutoTunnel(onUrlFound) {
    if (tunnelProcess) tunnelProcess.kill();
    console.log(chalk.gray('[TUNNEL MAGIC] Iniciando sub-motor de Túnel reverso Nativo (Local via Cloudflare)...'));

    // Usando .cmd no Windows
    const cmd = /^win/.test(process.platform) ? 'npm.cmd' : 'npm';
    // Em Windows, usar 127.0.0.1 é fundamental para evitar a resolução instável de IPv6 que causa 502 Bad Gateway!
    tunnelProcess = spawn(cmd, ['exec', '--', 'cloudflared', 'tunnel', '--url', 'http://127.0.0.1:5173'], { shell: true });

    let found = false;

    tunnelProcess.stderr.on('data', (d) => {
        const str = d.toString();
        // A cloudflare deita a URL livre no console.
        const match = str.match(/(https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com)/);
        if (match && !found) {
            found = true;
            console.log(chalk.green(`[TUNNEL MAGIC] Nova Rota Pública Encapsulada Gerada: ${match[1]}`));
            if (onUrlFound) onUrlFound(match[1]);
        }
    });

    tunnelProcess.on('close', () => {
        if (found) console.log(chalk.yellow('[TUNNEL MAGIC] A Ponte com o Telegram foi encerrada.'));
        found = false;
    });
}

function stopAutoTunnel() {
    if (tunnelProcess) tunnelProcess.kill();
}

module.exports = { startAutoTunnel, stopAutoTunnel };
