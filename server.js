"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const mysql = require("mysql2/promise");

const ROOT = __dirname;
function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !Object.hasOwn(process.env, match[1])) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
loadEnv();

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
let dbPool;
let dbReady;
function database() {
  if (!dbPool) {
    const { TIDB_HOST, TIDB_USER, TIDB_PASSWORD, TIDB_DATABASE, TIDB_CA_PATH } = process.env;
    if (!TIDB_HOST || !TIDB_USER || !TIDB_PASSWORD || TIDB_PASSWORD === "coloque_sua_senha_aqui" || !TIDB_DATABASE) throw new Error("Configure o TiDB no arquivo .env.");
    const ssl = { rejectUnauthorized: true, minVersion: "TLSv1.2" };
    if (TIDB_CA_PATH) ssl.ca = fs.readFileSync(path.resolve(ROOT, TIDB_CA_PATH));
    dbPool = mysql.createPool({ host: TIDB_HOST, port: Number(process.env.TIDB_PORT || 4000), user: TIDB_USER, password: TIDB_PASSWORD, database: TIDB_DATABASE, ssl, connectTimeout: 10000, connectionLimit: 5 });
  }
  return dbPool;
}
async function readyDatabase() {
  const pool = database();
  if (!dbReady) dbReady = pool.query(`CREATE TABLE IF NOT EXISTS divai_projects (
    id VARCHAR(36) PRIMARY KEY,
    prompt TEXT NOT NULL,
    html MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  )`).catch(err => { dbReady = null; throw err; });
  await dbReady;
  return pool;
}
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon" };

function send(res, status, data, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin" });
  res.end(type.startsWith("application/json") ? JSON.stringify(data) : data);
}
function readBody(req, maxBytes = 2_000_000) {
  return new Promise((resolve, reject) => {
    let body = "", size = 0;
    req.on("data", chunk => { size += chunk.length; if (size > maxBytes) { reject(Object.assign(new Error("Corpo da solicitação muito grande."), { status: 413 })); req.destroy(); } else body += chunk; });
    req.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch { reject(Object.assign(new Error("JSON inválido."), { status: 400 })); } });
    req.on("error", reject);
  });
}

const BASE_INSTRUCTIONS = `Você é um engenheiro de software sênior. Gere aplicações web completas, funcionais e visualmente profissionais. Responda SOMENTE com um documento HTML completo, começando em <!DOCTYPE html>. Inclua CSS e JavaScript dentro do próprio HTML para que funcione sozinho ao abrir no navegador. Não use Markdown, cercas de código, explicações ou texto antes/depois do HTML. Todos os botões, formulários, filtros e interações solicitados devem funcionar de verdade. Use dados demonstrativos quando não houver backend de negócio solicitado e, quando apropriado, persista dados no localStorage. Faça layout responsivo e acessível. Nunca finja que uma integração externa existe: sinalize no próprio app quando credenciais ou serviços externos forem necessários.`;

function extractHTML(text) {
  if (typeof text !== "string") return "";
  let html = text.trim().replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = html.toLowerCase().indexOf("<!doctype html");
  if (start >= 0) html = html.slice(start);
  else { const htmlStart = html.toLowerCase().indexOf("<html"); if (htmlStart >= 0) html = html.slice(htmlStart); }
  return /<html[\s>]/i.test(html) && /<\/html>/i.test(html) ? html : "";
}

async function callGroq(instructions, input) {
  const key = process.env.GROQ_API_KEY;
  if (!key || key === "coloque_sua_chave_aqui") {
    throw Object.assign(new Error("A chave gratuita GROQ_API_KEY não foi configurada. Crie uma chave em https://console.groq.com/keys e coloque-a no arquivo .env."), { status: 503 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  let response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: input }
        ],
        max_completion_tokens: 7000,
        reasoning_effort: "low",
        temperature: 0.2
      }),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === "AbortError") throw Object.assign(new Error("A geração demorou demais. Tente novamente."), { status: 504 });
    throw Object.assign(new Error("Não foi possível conectar à IA gratuita Groq."), { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || `A Groq retornou erro ${response.status}.`;
    if (response.status === 429) {
      throw Object.assign(new Error("O limite gratuito da Groq foi atingido. Aguarde alguns minutos e tente novamente. Detalhe: " + message), { status: 429 });
    }
    if (response.status === 401 || response.status === 403) {
      throw Object.assign(new Error("A chave GROQ_API_KEY é inválida ou não tem permissão. Confira a chave no arquivo .env."), { status: 502 });
    }
    throw Object.assign(new Error(message), { status: 502 });
  }

  const outputText = data.choices?.[0]?.message?.content || "";
  const html = extractHTML(outputText);
  if (!html) throw Object.assign(new Error("A IA não retornou um documento HTML completo. Tente detalhar melhor o pedido ou simplificar o projeto."), { status: 502 });
  return html;
}

async function handleAPI(req, res, pathname) {
  const projectMatch = pathname.match(/^\/api\/projects(?:\/([0-9a-f-]{36}))?$/i);
  if (projectMatch) {
    const id = projectMatch[1];
    if ((!id && !["GET", "POST", "DELETE"].includes(req.method)) || (id && req.method !== "DELETE")) return send(res, 405, { error: "Método não permitido." });
    try {
      let body;
      if (req.method === "POST") {
        body = await readBody(req);
        if (typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > 4105 || typeof body.html !== "string" || !body.html || body.html.length > 1500000) return send(res, 400, { error: "Projeto inválido ou grande demais." });
      }
      const pool = await readyDatabase();
      if (req.method === "GET") {
        const [rows] = await pool.query("SELECT id, prompt, html, created_at AS date FROM divai_projects ORDER BY created_at DESC, id DESC LIMIT 30");
        return send(res, 200, { projects: rows });
      }
      if (req.method === "POST") {
        const projectId = crypto.randomUUID();
        await pool.execute("INSERT INTO divai_projects (id, prompt, html) VALUES (?, ?, ?)", [projectId, body.prompt.trim(), body.html]);
        return send(res, 201, { id: projectId });
      }
      if (id) await pool.execute("DELETE FROM divai_projects WHERE id = ?", [id]);
      else await pool.query("DELETE FROM divai_projects");
      return send(res, 200, { ok: true });
    } catch (err) {
      if (err.status) return send(res, err.status, { error: err.message });
      console.error("Erro no banco:", err.code || err.message);
      return send(res, 503, { error: "Não foi possível acessar o histórico no TiDB. Confira a conexão e as permissões do banco." });
    }
  }
  if (pathname === "/api/health" && req.method === "GET") return send(res, 200, { status: "ok", configured: Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== "coloque_sua_chave_aqui"), model: MODEL });
  if (!["/api/generate", "/api/modify"].includes(pathname)) return send(res, 404, { error: "Rota não encontrada." });
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: `Método ${req.method} não permitido nesta rota. Envie uma requisição POST.` });
  }
  let body;
  try { body = await readBody(req); } catch (err) { return send(res, err.status || 400, { error: err.message }); }
  try {
    let html;
    if (pathname === "/api/generate") {
      const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
      if (!prompt) return send(res, 400, { error: "Informe uma descrição para o projeto." });
      if (prompt.length > 2000) return send(res, 400, { error: "O prompt ultrapassa o limite de 2000 caracteres." });
      html = await callGroq(BASE_INSTRUCTIONS, `Crie um projeto web com os seguintes requisitos. Implemente todas as funcionalidades descritas:\n\n${prompt}`);
    } else {
      const currentHTML = typeof body.html === "string" ? body.html : "";
      const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
      if (!currentHTML || !instruction) return send(res, 400, { error: "Envie o HTML atual e descreva a alteração desejada." });
      if (currentHTML.length > 1_500_000) return send(res, 413, { error: "O projeto é muito grande para ser enviado para alteração." });
      if (instruction.length > 2000) return send(res, 400, { error: "A instrução ultrapassa o limite de 2000 caracteres." });
      const instructions = `${BASE_INSTRUCTIONS}\n\nVocê receberá um HTML existente. Faça somente as alterações solicitadas, preserve o que já funciona e devolva o documento HTML completo atualizado.`;
      html = await callGroq(instructions, `HTML atual:\n\n${currentHTML}\n\nAlterações solicitadas:\n${instruction}`);
    }
    return send(res, 200, { html });
  } catch (err) {
    console.error(`Erro ${pathname}:`, err.message);
    return send(res, err.status || 500, { error: err.message || "Erro interno no servidor." });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) return handleAPI(req, res, url.pathname);
  if (req.method !== "GET" && req.method !== "HEAD") { res.setHeader("Allow", "GET, HEAD"); return send(res, 405, { error: "Método não permitido para arquivos estáticos. Acesse o backend com npm start." }); }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  if (!["/index.html", "/styles.css", "/script.js"].includes(pathname)) return send(res, 404, { error: "Arquivo não encontrado." });
  const filePath = path.resolve(ROOT, `.${pathname}`);
  if (!filePath.startsWith(ROOT + path.sep)) return send(res, 403, { error: "Acesso negado." });
  fs.readFile(filePath, (err, content) => {
    if (err) return send(res, 404, { error: "Arquivo não encontrado." });
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream", "X-Content-Type-Options": "nosniff" });
    res.end(req.method === "HEAD" ? undefined : content);
  });
});
server.listen(PORT, () => console.log(`Divai disponível em http://localhost:${PORT}`));
