/*!
 * AI场景诊断 V0.3 · DeepSeek 服务端代理（Node 18+，零依赖）
 * ------------------------------------------------------------
 * 密钥只在环境变量 DEEPSEEK_API_KEY。不写进代码、不进 git、不回给前端。
 * 部署目录就是本文件夹（腾讯云函数 asdxAiProxy）。
 *
 * POST /followup  最多 1 道澄清题（不问最优先）
 * POST /report    同一模型分三次：理解 → 评估 → 写成报告；失败则基础初诊
 * POST /micro     按 scenario_id + 用户补充材料生成小成果
 * GET  /health    { ok, ai, version }，ai 只表示是否配置了密钥
 */
"use strict";
const http = require("http");
const E = require("./v2-engine.js");

const KEY = process.env.DEEPSEEK_API_KEY || "";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const ORIGINS = (process.env.ALLOW_ORIGINS || "https://xiangshu3721.github.io,https://raw.githack.com").split(",").map((s) => s.trim()).filter(Boolean);
const PORT = +process.env.PORT || 9000;

async function deepseek(system, user, timeoutMs, maxTokens) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
      body: JSON.stringify({
        model: MODEL, temperature: 0.3, max_tokens: maxTokens || 1500,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(user) }]
      })
    });
    if (!r.ok) throw new Error("deepseek http " + r.status);
    const j = await r.json();
    const content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!content) throw new Error("deepseek empty");
    return JSON.parse(content);
  } finally { clearTimeout(timer); }
}

function sanitizeAnswers(raw) {
  const a = raw && typeof raw === "object" ? raw : {};
  const s = (v, n) => (typeof v === "string" ? v.slice(0, n || 300) : "");
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 10) : []);
  return E.normalizeAnswer({
    status: s(a.status, 40), statusDetail: s(a.statusDetail, 40), goals: arr(a.goals), scenes: arr(a.scenes), pains: arr(a.pains),
    freq: s(a.freq, 20), impact: s(a.impact, 20), custom: s(a.custom, 300), month: s(a.month, 20), monthOther: s(a.monthOther, 60),
    followUp: a.followUp && typeof a.followUp === "object" ? { title: s(a.followUp.title, 80), answer: s(a.followUp.answer, 80) } : null
  });
}

const hits = new Map();
function limited(ip) {
  const now = Date.now(), w = (hits.get(ip) || []).filter((t) => now - t < 60000);
  w.push(now); hits.set(ip, w); return w.length > 24;
}

async function handle(path, body) {
  if (!KEY) throw new Error("no key");
  if (path === "/followup") {
    const a = sanitizeAnswers(body && body.answers);
    const q = E.validateFollowUp(await deepseek(E.PROMPTS.follow, E.promptInput(a), 8000, 400));
    return q ? { need: true, title: q.title, options: q.options } : { need: false };
  }
  if (path === "/report") {
    const a = sanitizeAnswers(body && body.answers);
    const limits = { understand: [12000, 800], discover: [16000, 1800], face: [18000, 2200] };
    return E.runDiagnosis(a, (stage, system, user) => {
      const pair = limits[stage] || [15000, 1200];
      return deepseek(system, user, pair[0], pair[1]);
    });
  }
  if (path === "/micro") {
    const scenarioId = String((body && body.scenario_id) || "").slice(0, 40);
    const userInput = String((body && body.user_input) || "").slice(0, 800);
    const title = String((body && body.title) || "").slice(0, 40);
    const task = String((body && body.task) || "").slice(0, 120);
    const category = String((body && body.category) || "").slice(0, 8);
    if (!/^[a-z][a-z0-9_]{0,24}$/.test(scenarioId) || userInput.trim().length < 2) return { error: "need_input", scenario_id: scenarioId };
    const raw = await deepseek(E.PROMPTS.micro, { scenario_id: scenarioId, title: title, category: category, task: task, user_input: userInput }, 20000, 900);
    const v = E.validateMicro(raw, scenarioId);
    if (!v) throw new Error("bad micro");
    return v;
  }
  return null;
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || "";
  if (ORIGINS.includes(origin)) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  let path = (req.url || "").split("?")[0];
  if (path === "/asdx-ai" || path.startsWith("/asdx-ai/")) path = path.slice("/asdx-ai".length) || "/";
  if (req.method === "GET" && path === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, ai: !!KEY, version: "v0.3" }));
  }
  if (req.method !== "POST") { res.writeHead(405); return res.end(); }
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0];
  if (limited(ip)) { res.writeHead(429); return res.end(); }
  let raw = "";
  req.on("data", (c) => { raw += c; if (raw.length > 30000) req.destroy(); });
  req.on("end", async () => {
    let out = null, code = 200, scenarioId = "";
    try {
      const body = JSON.parse(raw || "{}");
      scenarioId = String((body && body.scenario_id) || "").slice(0, 40);
      out = await handle(path, body);
      if (!out) code = 404;
    } catch (e) {
      code = 502;
      out = path === "/micro" ? { error: "ai_unavailable", scenario_id: scenarioId } : { error: "ai_unavailable" };
      const msg = String((e && e.message) || "error").replace(/sk-[A-Za-z0-9]+/g, "[redacted]");
      console.error("[ai-proxy]", path, msg);
    }
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(out || {}));
  });
});

if (require.main === module) server.listen(PORT, () => console.log("ai-proxy listening on " + PORT + (KEY ? "" : "（未设置 DEEPSEEK_API_KEY，请求会失败，前端改走基础初诊）")));
module.exports = { server, handle, sanitizeAnswers };
