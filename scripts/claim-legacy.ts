import { claimLegacyData } from "../lib/services/legacy";
import { db } from "../lib/db";

/**
 * Uso: npm run claim-legacy -- --email meu@email.com
 * Transfere os dados de antes do login para a sua conta (depois de entrar pelo app uma vez).
 */
async function main() {
  const i = process.argv.indexOf("--email");
  const email = i >= 0 ? process.argv[i + 1] : undefined;
  if (!email || email.startsWith("--")) {
    console.error("Informe o e-mail da sua conta: npm run claim-legacy -- --email meu@email.com");
    process.exitCode = 1;
    return;
  }
  const result = await claimLegacyData(email);
  if (!result.ok) {
    console.error(result.error);
    process.exitCode = 1;
    return;
  }
  console.log(`Transferido para ${email}: ${result.bills} contas, ${result.goals} metas, ${result.transactions} transações. Usuário legado apagado.`);
}

main().finally(() => db.$disconnect());
