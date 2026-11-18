"use strict";
const fs = require("node:fs");
const path = require("node:path");
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !Object.hasOwn(process.env, match[1])) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
async function main() {
  const { TIDB_HOST, TIDB_USER, TIDB_PASSWORD, TIDB_DATABASE, TIDB_CA_PATH } = process.env;
  if (!TIDB_HOST || !TIDB_USER || !TIDB_PASSWORD || TIDB_PASSWORD === "coloque_sua_senha_aqui" || !TIDB_DATABASE) throw new Error("Preencha TIDB_HOST, TIDB_USER, TIDB_PASSWORD e TIDB_DATABASE no arquivo .env.");
  const ssl = { rejectUnauthorized: true, minVersion: "TLSv1.2" };
  if (TIDB_CA_PATH) ssl.ca = fs.readFileSync(path.resolve(__dirname, TIDB_CA_PATH));
  const mysql = require("mysql2/promise");
  const connection = await mysql.createConnection({ host: TIDB_HOST, port: Number(process.env.TIDB_PORT || 4000), user: TIDB_USER, password: TIDB_PASSWORD, database: TIDB_DATABASE, ssl, connectTimeout: 10000 });
  try {
    const [rows] = await connection.query("SELECT DATABASE() AS banco, VERSION() AS versao");
    console.log("Conexão TLS com TiDB estabelecida:", rows[0]);
  } finally { await connection.end(); }
}
main().catch(err => { console.error("Falha ao conectar ao TiDB:", err.code || err.message); process.exitCode = 1; });
