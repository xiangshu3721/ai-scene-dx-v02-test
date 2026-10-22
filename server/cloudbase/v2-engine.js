/*!
 * v2-engine.js · V0.2 报告：本地规则生成 + AI 结果校验（纯函数，浏览器/Node/服务端共用）
 */
(function (root) {
  "use strict";
  var D = (typeof module !== "undefined" && module.exports) ? require("./v2-data.js") : root.ASDX_V2_DATA;

  function pick(list, v) { for (var i = 0; i < list.length; i++) if (list[i].v === v) return list[i]; return null; }
  function label(list, v) { var o = pick(list, v); return o ? o.label : ""; }
  function scene(id) { for (var i = 0; i < D.SCENES.length; i++) if (D.SCENES[i].id === id) return D.SCENES[i]; return null; }
  function grpOf(status) { var o = pick(D.STATUS, status); return o ? o.grp : "life"; }
  function statusText(a) { var l = label(D.STATUS, a.status) || "其他"; return a.statusDetail ? l + "（" + a.statusDetail + "）" : l; }

  /** 第4题：根据第3题选的场景，展示相关困难（保持原顺序，始终含“暂时没有明显困难”） */
  function painsFor(sceneIds) {
    var want = {}; (sceneIds || []).forEach(function (id) { var s = scene(id); if (s) s.pains.forEach(function (p) { want[p] = 1; }); });
    if (!Object.keys(want).length || (sceneIds || []).length >= 3) return D.PAINS.slice();
    want.none = 1; want.limited = 1;
    return D.PAINS.filter(function (p) { return want[p.v]; });
  }

  var GOAL_SCENE = { time: "routine", quality: "organize", learn: "learn", think: "think", create: "create", biz: "comm", cost: "routine", life: "manage", explore: "create", unsure: "research" };

  function isSensitive(a) { return !!(D.SENSITIVE_STATUS[a.status] || D.SENSITIVE.test((a.custom || "") + (a.statusDetail || "") + (a.monthOther || ""))); }

  function oppFrom(id, source, a) {
    var s = scene(id); if (!s || !s.opp) return null;
    var o = { scene: id, name: s.opp.name, dir: s.dir, source: source, why: s.opp.why, ai: s.opp.ai, you: s.opp.you };
    if (source === "user" && a && a.painTop && a.painTop !== "none" && s.pains.indexOf(a.painTop) >= 0)
      o.why = "你说最头疼的是「" + label(D.PAINS, a.painTop) + "」，" + s.opp.why;
    return o;
  }

  function shorten(t, n) { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; }

  /** 本地规则报告（AI 不可用时的降级版，也作为 AI 结果的补位） */
  function localReport(a) {
    a = a || {};
    var chosen = (a.scenes || []).filter(function (id) { var s = scene(id); return s && s.opp; });
    var primary = null;
    if (a.painTop) chosen.forEach(function (id) { if (!primary && scene(id).pains.indexOf(a.painTop) >= 0) primary = id; });
    if (!primary) primary = chosen[0] || GOAL_SCENE[(a.goals || [])[0]] || "research";
    var opps = [], used = {};
    function add(id, src) { if (!id || used[id] || opps.length >= 3) return; var o = oppFrom(id, src, a); if (o) { used[id] = 1; opps.push(o); } }
    add(primary, "user");
    if (a.custom) { // 用户明说的事：放进首个机会
      opps[0].why = "你写到想让 AI 帮你：「" + shorten(a.custom, 40) + "」。" + scene(primary).opp.why;
    }
    chosen.forEach(function (id) { add(id, "user"); });
    // 主动发现：从目标出发，找一个用户没选的方向
    var disc = (a.goals || []).map(function (g) { return GOAL_SCENE[g]; }).concat(["think", "learn", "research", "create"]);
    var before = opps.length;
    for (var i = 0; i < disc.length && opps.length < 3; i++) if (!used[disc[i]]) { add(disc[i], "discover"); break; }
    if (opps.length === before && opps.length < 3) for (var j = 0; j < disc.length && opps.length < 3; j++) add(disc[j], "discover");
    for (var m = 0; m < disc.length && opps.length < 3; m++) add(disc[m], "discover");
    // 若已满 3 个且都来自用户，把第 3 个换成主动发现（保证“你可能还没想到”有一项）
    if (opps.length === 3 && before === 3) {
      for (var k = 0; k < disc.length; k++) if (!used[disc[k]]) { var d = oppFrom(disc[k], "discover", a); if (d) { opps[2] = d; break; } }
    }
    var p = scene(primary).opp;
    var flow = { title: p.name, before: p.before.slice(), after: p.after.slice(), note: "这是根据你的回答给出的初步方案，具体怎么做还需要结合你的实际情况核实。" };
    return { v: 2, source: "rules", insight: ruleInsight(a, opps), opps: opps, flow: flow, demo: { type: scene(primary).demo || "plan", scene: primary }, sensitive: isSensitive(a) };
  }

  function ruleInsight(a, opps) {
    var who = label(D.STATUS, a.status) || "你";
    var names = (a.scenes || []).filter(function (id) { return id !== "other"; }).map(function (id) { return "「" + scene(id).name + "」"; }).slice(0, 2).join("和");
    var first = opps[0] ? opps[0].name : "AI助手";
    if (!a.painTop || a.painTop === "none") {
      var g = label(D.GOALS, (a.goals || [])[0]);
      return "作为" + who + "，你眼下没有特别头疼的事——这正好适合把 AI 用在" + (g ? "「" + g + "」" : "增加新能力") + "上，先从「" + first + "」这样的小事试起。";
    }
    var FP = { daily: "几乎每天都会遇到", weekly: "每周都会遇到", sometimes: "偶尔会遇到", idea: "目前还只是个想法" };
    var im = label(D.IMPACT, a.impact);
    return "作为" + who + (names ? "，你经常" + names : "") + "，其中「" + label(D.PAINS, a.painTop) + "」" + (FP[a.freq] || "时常遇到") + (im ? "，" + im : "") + "——最值得先让 AI 帮你的，是「" + first + "」。";
  }

  /* ---------- AI 结果校验 ---------- */
  var BANNED = [/\d+(\.\d+)?\s*[%％]/, /百分之/, /一键/, /\b(RAG|LLM|Agent|API|Prompt|prompt|SaaS|RPA|token)\b/i, /智能体|大模型微调|向量数据库|工作流编排|全自动搭建/, /(提升|节省|增加|提高)\s*\d+\s*倍/, /月入|年入|增收\s*\d|赚\s*\d+\s*万/];
  function clean(s, max) {
    if (typeof s !== "string") return null;
    s = s.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
    if (!s || s.length > max) return null;
    for (var i = 0; i < BANNED.length; i++) if (BANNED[i].test(s)) return null;
    return s;
  }
  function cleanSteps(arr) {
    if (!Array.isArray(arr)) return null;
    var out = arr.map(function (x) { return clean(x, 30); }).filter(Boolean).slice(0, 6);
    return out.length >= 2 ? out : null;
  }
  /**
   * 校验 AI 返回的 JSON；不合格的部分用本地规则补齐。永远返回一份可渲染的报告。
   * 完全不可用时返回本地报告（source: "rules"）。
   */
  function validateReport(obj, a) {
    var base = localReport(a);
    if (!obj || typeof obj !== "object" || !Array.isArray(obj.opps)) return base;
    var opps = [];
    obj.opps.slice(0, 3).forEach(function (o) {
      if (!o || typeof o !== "object") return;
      var x = { name: clean(o.name, 24), why: clean(o.why, 160), ai: clean(o.ai, 200), you: clean(o.you, 160),
        dir: ["减负", "增能", "创造"].indexOf(o.dir) >= 0 ? o.dir : "增能", source: o.source === "discover" ? "discover" : "user", scene: scene(o.scene) ? o.scene : "" };
      if (x.name && x.why && x.ai && x.you) opps.push(x);
    });
    if (!opps.length) return base;
    if (!opps.some(function (o) { return o.source === "user"; })) opps.unshift(base.opps[0]);
    for (var i = 0; opps.length < 3 && i < base.opps.length; i++) if (!opps.some(function (o) { return o.name === base.opps[i].name; })) opps.push(base.opps[i]);
    opps = opps.slice(0, 3);
    var f = obj.flow || {};
    var before = cleanSteps(f.before), after = cleanSteps(f.after);
    var flow = before && after ? { title: clean(f.title, 24) || opps[0].name, before: before, after: after, note: base.flow.note } : base.flow;
    var demoScene = scene(opps[0].scene) && scene(opps[0].scene).demo ? opps[0].scene : base.demo.scene;
    return { v: 2, source: "ai", insight: clean(obj.insight, 120) || base.insight, opps: opps, flow: flow,
      demo: { type: scene(demoScene).demo || "plan", scene: demoScene }, sensitive: base.sensitive || obj.sensitive === true };
  }

  /** 追问题校验：{need:false} 或 {need:true, title, options:[2..5]} */
  function validateFollowUp(obj) {
    if (!obj || obj.need !== true) return null;
    var t = clean(obj.title, 60); if (!t || !Array.isArray(obj.options)) return null;
    var opts = obj.options.map(function (o) { return clean(typeof o === "string" ? o : (o && o.label), 30); }).filter(Boolean).slice(0, 5);
    if (opts.length < 2) return null;
    if (!opts.some(function (o) { return /不清楚|不确定|其他|都不是/.test(o); })) opts.push("不确定 / 其他");
    return { title: t, options: opts };
  }

  /** 发给 AI 的匿名作答（可读文字，不含任何联系方式） */
  function promptInput(a) {
    return {
      身份: statusText(a),
      最希望的改变: (a.goals || []).map(function (v) { return label(D.GOALS, v); }),
      经常做的事: (a.scenes || []).map(function (id) { var s = scene(id); return s ? s.name + "（例：" + s.ex[grpOf(a.status)] + "）" : ""; }),
      困难: (a.pains || []).map(function (v) { return label(D.PAINS, v); }),
      最头疼: label(D.PAINS, a.painTop),
      频率: label(D.FREQ, a.freq), 影响: label(D.IMPACT, a.impact),
      想让AI搞定的具体事: a.custom || "（未填写）",
      一个月内最想改变: a.month === "other" ? (a.monthOther || "其他") : label(D.MONTH, a.month),
      追问: a.followUp && a.followUp.answer ? a.followUp.title + " → " + a.followUp.answer : undefined,
      可用场景编号: D.SCENES.filter(function (s) { return s.opp; }).map(function (s) { return s.id + "=" + s.name; })
    };
  }

  var api = { label: label, pick: pick, scene: scene, grpOf: grpOf, statusText: statusText, painsFor: painsFor, localReport: localReport,
    validateReport: validateReport, validateFollowUp: validateFollowUp, promptInput: promptInput, isSensitive: isSensitive, BANNED: BANNED };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ASDX_V2 = api;
})(typeof window !== "undefined" ? window : this);
