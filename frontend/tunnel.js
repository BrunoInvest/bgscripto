import localtunnel from 'localtunnel';

console.log("-------------------------------------------------------");
console.log("Iniciando gerador de Links 5G segurados via LocalTunnel...");
console.log("-------------------------------------------------------");

(async function() {
    try {
        const tunnel = await localtunnel({ port: 5173 });

        console.log("\n=======================================================");
        console.log("🌍 SEU LINK DE ACESSO REMOTO GERADO:");
        console.log(`=>  ${tunnel.url}  <=`);
        console.log("=======================================================\n");

        console.log("🔐 COMO PASSAR DA TELA DE 'TUNNEL PASSWORD':");
        console.log("Essa senha de segurança exige sempre o IP da rede DO APARELHO QUE ESTÁ ACESSANDO.");
        console.log("Como você está usando a rede do seu celular 5G, a senha não é o IP do seu PC.");
        console.log("\nSiga estes 2 passos no seu celular:");
        console.log("1. Abra do celular este link:  https://api.ipify.org");
        console.log("2. Ele vai mostrar o número de IP do seu 5G. Aquela ali é a sua Senha! Basta colocar no robô.");
        console.log("=======================================================\n");
        
        console.log("Deixe esta janela preta (terminal) ABERTA para o link continuar funcionando.");

        tunnel.on('close', () => {
            console.log("Conexão com o túnel encerrada.");
        });

    } catch (error) {
        console.error("Erro ao gerar o túnel:", error.message);
    }
})();
