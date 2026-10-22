/*!
 * AI场景诊断 V0.2 · DeepSeek 服务端代理（Node 18+，零依赖）
 * ------------------------------------------------------------
 * 密钥只在服务端环境变量里：DEEPSEEK_API_KEY。绝不写进代码、绝不进 git、绝不发给前端。
 * 可部署到：腾讯云函数 SCF「Web 函数」/ 阿里云 FC / 任何能跑 Node 的服务器。
 *
 * 环境变量：
 *   DEEPSEEK_API_KEY   必填
 *   DEEPSEEK_MODEL     默认 deepseek-chat
 *   ALLOW_ORIGINS      允许跨域的来源，逗号分隔，默认 https://xiangshu3721.github.io,https://raw.githack.com
 *   PORT               默认 9000（SCF Web 函数要求 9000）
 *
 * 接口（POST JSON，入参 {answers}）：
 *   /followup → {need:false} | {need:true,title,options[]}
 *   /report   → 结构化报告 JSON（已按前端同一套规则校验，不合格部分用规则补齐）
 * 前端把本服务地址填到 js/config.js 的 AI_ENDPOINT 即可启用；不填 = 只用本地规则报告。
 */
"use strict";
const http = require("http");
const E = require("./v2-engine.js");

const KEY = process.env.DEEPSEEK_API_KEY || "";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const ORIGINS = (process.env.ALLOW_ORIGINS || "https://xiangshu3721.github.io,https://raw.githack.com").split(",").map(s => s.trim());
const PORT = +process.env.PORT || 9000;

const SYS_REPORT = `你是「AI场景发现顾问」。根据用户的匿名问卷回答，从「减负（少做繁琐的事）/增能（学得更快、想得更清楚）/创造（做出以前做不到的东西）」三个方向，找出 3 个最值得用 AI 的机会。
规则：
1. 用户明确说出的需求（具体想搞定的事、最头疼的事）优先，至少 1 个机会来自用户明说的需求（source="user"）；你主动发现、用户没提到的机会 source="discover"。
2. 不要根据职业臆测用户的工作内容，只依据用户的回答。
3. 用大白话，禁止术语堆砌（不要出现 Agent、RAG、API、Prompt、工作流编排、智能体 等词），禁止任何百分比或倍数的效率数字，禁止虚构收益或收入，禁止承诺「一键完成」复杂系统。
4. 涉及健康、法律、财务、投资、隐私等敏感或高风险的事，写成「AI 出草稿/整理，人来判断把关」的人机协作，并把 sensitive 设为 true。
5. 第一个机会是重点；flow 只针对第一个机会，给出「现在怎么做」和「AI参与后」各 3～5 步，每步不超过 15 个字。
只输出 JSON：{"insight":"一句话洞察，结合用户真实回答，不超过80字","opps":[{"name":"不超过12字","dir":"减负|增能|创造","source":"user|discover","scene":"可用场景编号之一","why":"为什么值得，不超过70字","ai":"AI具体帮做什么，不超过90字","you":"人负责什么，不超过70字"}],"flow":{"title":"","before":["",""],"after":["",""]},"sensitive":false}`;

const SYS_FOLLOW = `你是「AI场景发现顾问」。看用户的匿名问卷回答，判断信息是否足够找出具体的 AI 机会。
足够：只输出 {"need":false}。
不够：只问 1 道最关键的单选追问，用大白话、不用术语，3～5 个选项且最后一个是「不确定 / 其他」：{"need":true,"title":"问题，不超过30字","options":["",""]}`;

async function deepseek(system, user, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
      body: JSON.stringify({ model: MODEL, temperature: 0.4, max_tokens: 1500, response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(user) }] })
    });
    if (!r.ok) throw new Error("deepseek http " + r.status);
    const j = await r.json();
    return JSON.parse(j.choices[0].message.content);
  } finally { clearTimeout(timer); }
}

function sanitizeAnswers(a) {
  a = a && typeof a === "object" ? a : {};
  const s = v => (typeof v === "string" ? v.slice(0, 300) : "");
  const arr = v => (Array.isArray(v) ? v.filter(x => typeof x === "string").slice(0, 10) : []);
  return { status: s(a.status), statusDetail: s(a.statusDetail).slice(0, 40), goals: arr(a.goals), scenes: arr(a.scenes), pains: arr(a.pains),
    painTop: s(a.painTop), freq: s(a.freq), impact: s(a.impact), custom: s(a.custom), month: s(a.month), monthOther: s(a.monthOther).slice(0, 60),
    followUp: a.followUp && typeof a.followUp === "object" ? { title: s(a.followUp.title), answer: s(a.followUp.answer) } : null };
}

const hits = new Map(); // 简单限流：每 IP 每分钟 10 次
function limited(ip) {
  const now = Date.now(), w = (hits.get(ip) || []).filter(t => now - t < 60000);
  w.push(now); hits.set(ip, w); return w.length > 10;
}

async function handle(path, body) {
  const a = sanitizeAnswers(body && body.answers);
  if (!KEY) throw new Error("no key");
  if (path === "/followup") {
    const q = E.validateFollowUp(await deepseek(SYS_FOLLOW, E.promptInput(a), 8000));
    return q ? { need: true, title: q.title, options: q.options } : { need: false };
  }
  if (path === "/report") return E.validateReport(await deepseek(SYS_REPORT, E.promptInput(a), 25000), a);
  return null;
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin || "";
  if (ORIGINS.includes(origin)) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  let path = (req.url || "").split("?")[0];
  // CloudBase HTTP 网关可能保留 /asdx-ai 前缀，统一剥掉
  if (path === "/asdx-ai" || path.startsWith("/asdx-ai/")) path = path.slice("/asdx-ai".length) || "/";
  if (req.method === "GET" && path === "/health") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: true, ai: !!KEY })); }
  if (req.method !== "POST") { res.writeHead(405); return res.end(); }
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0];
  if (limited(ip)) { res.writeHead(429); return res.end(); }
  let raw = "";
  req.on("data", c => { raw += c; if (raw.length > 20000) req.destroy(); });
  req.on("end", async () => {
    let out = null, code = 200;
    try { out = await handle(path, JSON.parse(raw || "{}")); if (!out) code = 404; }
    catch (e) { code = 502; out = { error: "ai_unavailable" }; console.error("[ai-proxy]", path, e.message); } // 不打印作答内容
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(out || {}));
  });
});

if (require.main === module) server.listen(PORT, () => console.log("ai-proxy listening on " + PORT + (KEY ? "" : "（未设置 DEEPSEEK_API_KEY，所有请求会返回 502，前端自动降级）")));
module.exports = { server, handle, sanitizeAnswers };
