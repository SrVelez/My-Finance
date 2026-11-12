// Prepara o Prisma para o banco que estiver configurado:
//   node scripts/prisma-setup.mjs generate   gera o cliente (roda no `postinstall`)
//   node scripts/prisma-setup.mjs push       cria/atualiza as tabelas (roda no deploy da Vercel)
//
// O schema versionado (prisma/schema.prisma) usa SQLite: é o que roda no seu computador, nos testes
// e no e2e. Quando DATABASE_URL é Postgres (Vercel/Neon), este script usa uma cópia com
// `provider = "postgresql"` (prisma/schema.postgres.prisma, gerada e ignorada pelo git), sem mexer
// no arquivo versionado. Assim o mesmo código roda nos dois bancos.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const action = process.argv[2];
if (action !== "generate" && action !== "push") {
  console.error("Uso: node scripts/prisma-setup.mjs generate|push");
  process.exit(1);
}

/** DATABASE_URL do ambiente ou, se não houver, do arquivo .env (desenvolvimento). */
function readEnv(name) {
  if (process.env[name]) return process.env[name];
  const file = path.join(root, ".env");
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, "utf8").split(/\r?\n/).find((l) => l.trim().startsWith(`${name}=`));
  return line?.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

const url = readEnv("DATABASE_URL") ?? "";
const postgres = /^postgres(ql)?:/i.test(url);
const args = [];

if (postgres) {
  const source = readFileSync(path.join(root, "prisma", "schema.prisma"), "utf8");
  const converted = source.replace(/(datasource\s+db\s*\{[^}]*?provider\s*=\s*)"sqlite"/, '$1"postgresql"');
  if (converted === source) throw new Error('Não achei `provider = "sqlite"` no schema para trocar por postgresql.');
  const target = path.join("prisma", "schema.postgres.prisma");
  writeFileSync(path.join(root, target), `// GERADO por scripts/prisma-setup.mjs a partir de schema.prisma. Não edite nem versione.\n${converted}`);
  args.push("--schema", target);
  console.log("[prisma] DATABASE_URL é Postgres: usando provider postgresql.");
} else {
  console.log("[prisma] DATABASE_URL é SQLite (ou não definida): usando o schema padrão.");
}

const env = { ...process.env };
if (action === "push") {
  // Neon e similares: o endereço "pooled" serve ao app, mas criar tabelas pede a conexão direta.
  if (postgres && process.env.DIRECT_URL) env.DATABASE_URL = process.env.DIRECT_URL;
}

const cli = action === "generate" ? ["prisma", "generate", ...args] : ["prisma", "db", "push", "--skip-generate", ...args];
const result = spawnSync("npx", cli, { stdio: "inherit", shell: true, env });
process.exit(result.status ?? 1);
