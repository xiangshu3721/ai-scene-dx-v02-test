/*!
 * v2-engine.js · V0.3 诊断：答案规范化、五维评估、规则降级、AI 结果校验
 * 纯函数。浏览器挂到 window.ASDX_V2；Node / 云函数 module.exports。
 * 排名不读 painTop，不读点击顺序。当前场景只认 scenario_id。
 */
(function (root) {
  "use strict";
  var D = (typeof module !== "undefined" && module.exports) ? require("./v2-data.js") : root.ASDX_V2_DATA;

  function pick(list, v) { for (var i = 0; i < list.length; i++) if (list[i].v === v) return list[i]; return null; }
  function label(list, v) { var o = pick(list, v); return o ? o.label : ""; }
  function scene(id) { for (var i = 0; i < D.SCENES.length; i++) if (D.SCENES[i].id === id) return D.SCENES[i]; return null; }
  function grpOf(status) { var o = pick(D.STATUS, status); return o ? o.grp : "life"; }
  function statusText(a) { var l = label(D.STATUS, a && a.status) || "其他"; return a && a.statusDetail ? l + "（" + a.statusDetail + "）" : l; }
  function shorten(t, n) { t = String(t || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + "…" : t; }

  var WEIGHTS = { match: 0.30, intensity: 0.25, value: 0.20, feasibility: 0.15, landing: 0.10 };
  var GOAL_SCENE = { time: "routine", quality: "organize", learn: "learn", think: "think", create: "create", biz: "comm", cost: "routine", life: "manage", explore: "create", unsure: "research" };
  var SCENE_HINT = {
    research: /查|调研|比较|竞品|资料|目的地|方案|供应商/,
    organize: /整理|归档|纪要|表格|记录|台账|汇总|文档|随访|资料库|房态|对照/,
    think: /计划|决策|想清楚|利弊|要不要/,
    create: /写|文案|朋友圈|PPT|视频|初稿|海报|内容/,
    comm: /回复|客户咨询|消息|沟通|售后|发货/,
    routine: /重复|日报|琐事|清单|提醒|汇总|销售表|报表/,
    manage: /任务|进度|团队|日程|项目|搬家|分配/,
    learn: /学习|学会|辅导|技能|练习|英语|课程|四级/
  };
  var NEAR = [["organize", "routine"]];
  var ACQUIRE = /获客|引流|拓客|拉新|成交|卖货|客户从哪来/;
  var FREQ_N = { daily: 2, weekly: 1, sometimes: 1, idea: 0 };
  var IMPACT_N = { low: 0, some: 1, clear: 2, urgent: 2 };
  var MONTH_SCENES = {
    lesstime: ["routine", "organize", "comm"], better: ["organize", "routine", "create"], newskill: ["learn"],
    make: ["create"], flow: ["routine", "manage", "organize"], income: ["create", "comm"], life: ["manage", "learn", "create"]
  };
  var FEASIBILITY = { organize: 5, routine: 5, create: 4, comm: 4, research: 4, learn: 3, think: 3, manage: 3 };

  function painsFor(sceneIds) {
    var want = {}; (sceneIds || []).forEach(function (id) { var s = scene(id); if (s && s.pains) s.pains.forEach(function (p) { want[p] = 1; }); });
    if (!Object.keys(want).length || (sceneIds || []).length >= 3) return D.PAINS.slice();
    want.none = 1; want.limited = 1;
    return D.PAINS.filter(function (p) { return want[p.v]; });
  }

  function canonicalChoice(catalog, values) {
    var set = {};
    (values || []).forEach(function (v) { if (catalog.some(function (o) { return o.v === v; })) set[v] = 1; });
    var exclusive = null;
    catalog.forEach(function (o) { if (o.exclusive && set[o.v]) exclusive = o.v; });
    if (exclusive) return [exclusive];
    return catalog.map(function (o) { return o.v; }).filter(function (v) { return set[v]; });
  }

  /** 多选：互斥项清掉其他项；结果按题库顺序，不保留点击顺序。 */
  function toggleChoice(catalog, value, current, max) {
    catalog = catalog || [];
    var known = null;
    catalog.forEach(function (o) { if (o.v === value) known = o; });
    if (!known) return { ok: false, values: canonicalChoice(catalog, current) };
    var arr = canonicalChoice(catalog, current);
    var idx = arr.indexOf(value);
    if (idx >= 0) return { ok: true, values: canonicalChoice(catalog, arr.filter(function (v) { return v !== value; })) };
    if (known.exclusive) return { ok: true, values: [value] };
    arr = arr.filter(function (v) { var o = null; catalog.forEach(function (c) { if (c.v === v) o = c; }); return !(o && o.exclusive); });
    if (max && arr.length >= max) return { ok: false, full: true, values: canonicalChoice(catalog, current) };
    return { ok: true, values: canonicalChoice(catalog, arr.concat([value])) };
  }

  function isNoPain(a) { return !a || !a.pains || !a.pains.length || a.pains.indexOf("none") >= 0; }
  function customText(a) { return [a.custom || "", a.month === "other" ? (a.monthOther || "") : "", a.followUp && a.followUp.answer || "", a.statusDetail || ""].join("\n"); }
  function isSensitive(a) { return !!(a && (D.SENSITIVE_STATUS[a.status] || D.SENSITIVE.test(customText(a)))); }
  function hinted(id, a) { return !!(SCENE_HINT[id] && SCENE_HINT[id].test(customText(a))); }
  function acquisitionSupported(a) { return ACQUIRE.test(customText(a)); }

  function normalizeAnswer(a) {
    a = a || {};
    var goals = canonicalChoice(D.GOALS, a.goals);
    var scenes = canonicalChoice(D.SCENES.map(function (s) { return { v: s.id }; }), a.scenes);
    var pains = canonicalChoice(D.PAINS, a.pains);
    var none = pains.indexOf("none") >= 0;
    var fu = a.followUp && typeof a.followUp === "object" ? { title: String(a.followUp.title || "").slice(0, 80), answer: String(a.followUp.answer || "").slice(0, 80) } : null;
    if (fu && !fu.answer) fu = null;
    return {
      status: String(a.status || "").slice(0, 40),
      statusDetail: String(a.statusDetail || "").slice(0, 40),
      goals: goals,
      scenes: scenes,
      pains: pains,
      freq: none ? "" : String(a.freq || "").slice(0, 20),
      impact: none ? "" : String(a.impact || "").slice(0, 20),
      custom: String(a.custom || "").slice(0, 300),
      month: String(a.month || "").slice(0, 20),
      monthOther: String(a.monthOther || "").slice(0, 60),
      followUp: fu
    };
  }

  function clampInt(n, lo, hi) { n = Math.round(Number(n)); if (!isFinite(n)) return lo; return Math.max(lo, Math.min(hi, n)); }
  function weighted(sc) {
    return Math.round((sc.match * WEIGHTS.match + sc.intensity * WEIGHTS.intensity + sc.value * WEIGHTS.value + sc.feasibility * WEIGHTS.feasibility + sc.landing * WEIGHTS.landing) * 1000) / 1000;
  }
  function byWeight(x, y) { if (y.weighted !== x.weighted) return y.weighted - x.weighted; return x.scenario_id < y.scenario_id ? -1 : x.scenario_id > y.scenario_id ? 1 : 0; }

  function scoreOne(id, a) {
    a = normalizeAnswer(a);
    var s = scene(id);
    var text = customText(a);
    var selected = a.scenes.indexOf(id) >= 0;
    var hint = hinted(id, a);
    var noPain = isNoPain(a);
    var pains = noPain ? [] : a.pains.slice();
    var overlap = 0;
    if (s && s.pains) pains.forEach(function (p) { if (s.pains.indexOf(p) >= 0) overlap++; });
    var painRatio = pains.length ? overlap / pains.length : 0;
    var goalHit = a.goals.some(function (g) { return GOAL_SCENE[g] === id; });
    if (id === "comm" && goalHit && a.goals.indexOf("biz") >= 0 && !acquisitionSupported(a) && !/客户/.test(text) && !selected) goalHit = false;
    var match = 0;
    if (selected) match += 3;
    if (hint) match += 2;
    if (goalHit && !noPain) match += 1;
    else if (goalHit && selected) match += 1;
    if (!noPain && painRatio >= 0.5 && (selected || hint)) match += 1;
    match = clampInt(match, 0, 5);
    var intensity = 0;
    if (noPain) intensity = (selected || hint) ? 1 : 0;
    else if (selected || hint || painRatio > 0) intensity = clampInt((FREQ_N[a.freq] || 0) + (IMPACT_N[a.impact] || 0), 0, 5);
    else intensity = 1;
    var value = 2;
    if ((MONTH_SCENES[a.month] || []).indexOf(id) >= 0) value += 2;
    var dir = s && s.dir;
    if (dir && a.goals.some(function (g) { var o = pick(D.GOALS, g); return o && o.dir === dir; })) value += 1;
    if (noPain) value = Math.min(value, 3);
    value = clampInt(value, 0, 5);
    var feasibility = FEASIBILITY[id] || 3;
    if (isSensitive(a) && /医|病|法律|财务|投资|隐私/.test(text)) feasibility = Math.min(feasibility, 3);
    var landing = 1;
    if (hint) landing += 2;
    if (selected) landing += 1;
    if ((a.custom || "").trim().length >= 8 && (hint || selected)) landing += 1;
    if (!(selected || hint)) landing = Math.min(landing, 2);
    landing = clampInt(landing, 0, 5);
    var scores = { match: match, intensity: intensity, value: value, feasibility: feasibility, landing: landing };
    var ctx = { selected: selected, hinted: hint, noPain: noPain, overlap: overlap, blockedAcquisition: false };
    var title = s && s.opp ? s.opp.name : id;
    if (/获客|引流|拓客/.test(title) && !acquisitionSupported(a)) ctx.blockedAcquisition = true;
    return { scenario_id: id, title: title, category: (s && s.dir) || "增能", scores: scores, weighted: weighted(scores), ctx: ctx, evidence: ruleEvidence(id, a, ctx), risks: ruleRisks(a), source: (selected || hint) ? "user" : "discover" };
  }

  function ruleEvidence(id, a, ctx) {
    var s = scene(id), ev = [];
    if (!s) return ev;
    if (ctx.selected) ev.push("你选了「" + s.name + "」");
    if (ctx.hinted && (a.custom || "").trim()) ev.push("你写道：「" + shorten(a.custom, 80) + "」");
    if (!ctx.noPain && ctx.overlap > 0) ev.push("你标出的困难里，有和这件事对得上的（各项困难并列，不是处理顺序）");
    return ev;
  }
  function ruleRisks(a) {
    if (!isSensitive(a)) return [];
    return ["涉及健康、法律、财务或隐私时，AI 只整理和出草稿，判断留给你或专业人士"];
  }

  function passes(item) {
    if (!item || item.ctx.blockedAcquisition) return false;
    var sc = item.scores, ctx = item.ctx, w = item.weighted;
    if (ctx.noPain && !ctx.hinted && !ctx.selected) return false;
    if (ctx.noPain && ctx.hinted && sc.match >= 2 && w >= 1.8) return true;
    if (ctx.noPain && ctx.selected && sc.match >= 3 && w >= 2.2) return true;
    if (ctx.noPain) return false;
    if (sc.match < 2 || w < 2) return false;
    return true;
  }

  function markDropped(item) {
    item.keep = false;
    if (item.drop_reason) return;
    if (item.ctx && item.ctx.blockedAcquisition) item.drop_reason = "把获客说成了事实，但回答里没有这件事";
    else if (item.ctx && item.ctx.noPain) item.drop_reason = "没有明确困难，也不强行推荐";
    else item.drop_reason = "没有达到匹配或综合门槛";
  }

  function dedupe(sorted) {
    var nearKept = {}, out = [];
    sorted.forEach(function (item) {
      if (out.some(function (x) { return x.scenario_id === item.scenario_id; })) {
        item.keep = false; item.drop_reason = "同一场景已保留更高的一条"; return;
      }
      var pair = null;
      NEAR.forEach(function (g) { if (g.indexOf(item.scenario_id) >= 0) pair = g; });
      if (pair) {
        var key = pair.slice().sort().join("|");
        if (nearKept[key]) { item.keep = false; item.drop_reason = "和已保留的场景是同一类整理或汇总，只留更匹配的一条"; return; }
        nearKept[key] = item.scenario_id;
      }
      item.keep = true; item.drop_reason = "";
      out.push(item);
    });
    return out;
  }

  function capTop(ordered, a) {
    var n = isNoPain(a) ? 1 : 3;
    var top = ordered.slice(0, n);
    ordered.slice(n).forEach(function (item) { item.keep = false; item.drop_reason = "已经有更靠前的场景，不再凑数"; });
    return top;
  }

  function rankFromRules(a) {
    var parsed = D.SCENES.filter(function (s) { return s.opp; }).map(function (s) { return scoreOne(s.id, a); });
    parsed.forEach(function (item) { if (!passes(item)) markDropped(item); });
    var kept = parsed.filter(passes).sort(byWeight);
    return { all: parsed, top: capTop(dedupe(kept), a) };
  }

  function reasonText(rank, item) {
    var bits = [], ctx = item.ctx || {}, sc = item.scores || {};
    if (ctx.selected) bits.push("你选过这类事");
    if (ctx.hinted) bits.push("和你写下的那件事对得上");
    if (ctx.noPain) bits.push("你没有标出明显困难，所以这不是紧急项");
    else if (sc.intensity >= 4) bits.push("发生得比较勤，影响也比较大");
    else if (sc.intensity <= 1) bits.push("眼下强度不高");
    if (sc.feasibility >= 4 && sc.landing >= 3) bits.push("适合先做一小步验证");
    else bits.push("可以先小范围试，不必一次做完");
    return "排在第 " + rank + "，是因为" + (bits.join("，") || "综合看起来更适合先试") + "。";
  }

  function microConfig(id) {
    var map = {
      organize: { input_label: "贴一段要整理的原文", placeholder: "例如：两段会议纪要、几行表格、一份还没归档的清单", task: "把这段材料整理成条目或表格，并标出还缺的信息" },
      research: { input_label: "写下要比较的对象和你在意的点", placeholder: "例如：两个方案，在意预算、时间和风险", task: "做成对照，并标出需要你亲自核实的地方" },
      think: { input_label: "用几句话写下你正在犹豫的决定", placeholder: "例如：要不要做某件事，你已知的限制是什么", task: "列出两个做法的利弊，决定仍由你来做" },
      create: { input_label: "写下你要做的内容、对象和语气", placeholder: "例如：给谁看、想说的一个事实、希望的语气", task: "只出一版很短的初稿，供你修改" },
      comm: { input_label: "贴上你要回复的那句话", placeholder: "例如：对方问了什么，你希望语气怎样", task: "起草一条回复，并标出发送前要你核对的事实" },
      routine: { input_label: "写下这件重复的事每次都做哪些步骤", placeholder: "例如：每周要把哪些表或记录处理一遍", task: "收成一张可重复使用的步骤或空表，不编造你没给的数字" },
      manage: { input_label: "列出这件事里已经知道的待办", placeholder: "例如：搬家、项目或家庭事务里要办的几件", task: "拆成清单并标出还没人负责的项" },
      learn: { input_label: "写下想学的内容和你现在的基础", placeholder: "例如：想学会什么，每天能用多久", task: "给一个很小的练习安排，不承诺学会全部" },
      custom: { input_label: "用几句话描述这件事的材料", placeholder: "写这件具体的事，不要写姓名、电话或客户隐私", task: "只针对你写的这件事，做一个看得见的小成果" }
    };
    var m = map[id] || map.custom;
    return { scenario_id: id, input_label: m.input_label, placeholder: m.placeholder, task: m.task };
  }

  function flowPair(id) {
    var s = scene(id);
    if (s && s.opp) return { before: s.opp.before.slice(), after: s.opp.after.slice() };
    return { before: ["按现在的做法做一遍", "卡在重复或不知如何开始的地方", "靠记忆收尾"], after: ["把真实材料交给 AI", "先得到一个小成果", "你核对后再决定用不用"] };
  }

  function consultQs(item, a) {
    var qs = ["这件事里，哪一小段最想先试？", "有没有不能交给 AI 的信息？"];
    if (!(a.custom || "").trim()) qs.push("能不能举一个你真实遇到的例子？");
    if (isSensitive(a)) qs.push("哪些内容必须由你或专业人士把关？");
    return qs.slice(0, 3);
  }

  function buildOpp(item, rank, a, face) {
    var s = scene(item.scenario_id);
    var tpl = s && s.opp ? s.opp : null;
    face = face || {};
    var title = clean(face.title, 24) || item.title || (tpl && tpl.name) || "这个场景";
    var category = ["减负", "增能", "创造"].indexOf(face.category) >= 0 ? face.category : (item.category || (s && s.dir) || "增能");
    var evidence = cleanList(face.evidence, 120, 4);
    if (!evidence.length) evidence = (item.evidence || []).slice(0, 4);
    var reason = clean(face.priority_reason, 160) || reasonText(rank, item);
    var ai = clean(face.ai, 200) || (tpl && tpl.ai) || "先帮你把材料理成一个小成果，并标出不确定的地方。";
    var you = clean(face.you, 160) || (tpl && tpl.you) || "提供真实情况，核对结果，做最后决定。";
    var pair = flowPair(item.scenario_id);
    var before = cleanSteps(face.before) || pair.before;
    var after = cleanSteps(face.after) || pair.after;
    var note = clean(face.flow_note, 80) || (item._source === "rules" ? "基础初诊给出的初步对照，需要结合你的实际情况再确认。" : "这是初步对照，需要结合你的实际情况再确认。");
    var micro = microFrom(face.micro, item.scenario_id);
    var questions = cleanList(face.consult_questions, 40, 3);
    if (questions.length < 2) questions = consultQs(item, a);
    var src = face.source === "discover" || face.source === "user" ? face.source : item.source;
    return {
      scenario_id: item.scenario_id, title: title, category: category, evidence: evidence, priority_reason: reason,
      ai: ai, you: you, source: src, rank: rank, before: before, after: after, flow_note: note, micro: micro,
      consult_questions: questions, scores: item.scores, weighted: item.weighted,
      name: title, dir: category, scene: item.scenario_id, why: reason
    };
  }

  function microFrom(faceMicro, id) {
    var base = microConfig(id);
    if (!faceMicro || typeof faceMicro !== "object") return base;
    var label = clean(faceMicro.input_label, 40) || base.input_label;
    var ph = clean(faceMicro.placeholder, 80) || base.placeholder;
    var task = clean(faceMicro.task, 80) || base.task;
    if (id !== "research" && /扫地|机器人/.test(label + ph + task)) return base;
    return { scenario_id: id, input_label: label, placeholder: ph, task: task };
  }

  function ruleInsight(a, opps) {
    var who = statusText(a);
    if (!opps.length) return "作为" + who + "，你没有标出明显困难，也还缺少一件具体想搞定的事。这次不做硬性推荐，避免把推测说成事实。";
    var names = opps.map(function (o) { return "「" + o.title + "」"; }).join("、");
    if (isNoPain(a)) return "作为" + who + "，你没有标出明显困难。下面的" + names + "只是可以小试的方向，不是紧急问题，也没有替你排最优先。";
    return "作为" + who + "，你标出的困难是并列的，并不代表落地顺序。综合是否同一件事、有多常发生、值不值得、能不能先小范围试，建议先看" + names + "。";
  }

  function hardFacts(a) {
    var facts = ["身份是" + statusText(a)];
    if (a.goals.length) facts.push("希望的改变是：" + a.goals.map(function (g) { return label(D.GOALS, g); }).join("、") + "（并列，没有先后）");
    var names = a.scenes.filter(function (id) { return id !== "other" && scene(id); }).map(function (id) { return scene(id).name; });
    if (names.length) facts.push("经常做的事包括：" + names.join("、"));
    if (isNoPain(a)) facts.push("你选择了「暂时没有明显困难」");
    else if (a.pains.length) facts.push("感到困难的地方包括：" + a.pains.map(function (p) { return label(D.PAINS, p); }).join("、") + "（并列，不是落地顺序）");
    if (a.freq) facts.push("这些困难整体上" + (label(D.FREQ, a.freq) || "有发生"));
    if (a.impact) facts.push("影响程度是「" + (label(D.IMPACT, a.impact) || "已填写") + "」");
    if ((a.custom || "").trim()) facts.push("你写下的具体事：「" + shorten(a.custom, 120) + "」");
    if (a.month) facts.push("一个月内希望：" + (a.month === "other" ? (a.monthOther || "其他") : (label(D.MONTH, a.month) || a.month)));
    if (a.followUp && a.followUp.answer) facts.push("补充回答：「" + shorten(a.followUp.answer, 60) + "」");
    return facts;
  }
  function ruleInferred(a) {
    var out = [];
    a.goals.forEach(function (g) {
      var id = GOAL_SCENE[g]; if (!id || a.scenes.indexOf(id) >= 0) return;
      if (g === "biz") { out.push("推测：你勾了赚钱或获客，但这不代表已经存在获客困难，需要再确认具体想做成的事。"); return; }
      var s = scene(id); if (s) out.push("推测：目标「" + label(D.GOALS, g) + "」也许和「" + s.name + "」有关，这还不是事实。");
    });
    return out;
  }
  function ruleUnknowns(a) {
    var u = [];
    if (!(a.custom || "").trim()) u.push("还缺少一件你想先搞定的具体事");
    if (!isNoPain(a) && !a.freq) u.push("还不知道这些困难多久出现一次");
    return u;
  }

  function factAllowed(text, a) {
    if (!text) return false;
    if (/最优先|最头疼/.test(text)) return false;
    if (/获客困难|你的获客|获客有问题|你有获客/.test(text) && !acquisitionSupported(a)) return false;
    return true;
  }

  function normalizeUnderstanding(model, a) {
    a = normalizeAnswer(a);
    var facts = hardFacts(a).slice();
    var inferred = ruleInferred(a).slice();
    var unknowns = ruleUnknowns(a).slice();
    cleanList(model && model.facts, 120, 6).forEach(function (t) {
      if (!factAllowed(t, a)) { if (/获客/.test(t)) inferred.push("推测（不能当事实）：" + t); return; }
      if (facts.indexOf(t) < 0) facts.push(t);
    });
    cleanList(model && model.inferred, 120, 6).forEach(function (t) { if (inferred.indexOf(t) < 0) inferred.push(t); });
    cleanList(model && model.unknowns, 120, 6).forEach(function (t) { if (unknowns.indexOf(t) < 0) unknowns.push(t); });
    return { facts: facts.slice(0, 8), inferred: inferred.slice(0, 6), unknowns: unknowns.slice(0, 6), sensitive: !!(isSensitive(a) || (model && model.sensitive === true)) };
  }

  function profileOf(a) { return { status: a.status || "", status_detail: a.statusDetail || "", status_text: statusText(a), group: grpOf(a.status) }; }
  function newDiagnosisId() { return "dg" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function publicCandidate(item) {
    return { scenario_id: item.scenario_id, title: item.title, category: item.category, scores: item.scores, weighted: item.weighted, evidence: item.evidence || [], risks: item.risks || [], keep: item.keep !== false && !item.drop_reason, drop_reason: item.drop_reason || "" };
  }

  function assembleDiagnosis(face, ranked, a, understanding, source) {
    a = normalizeAnswer(a);
    understanding = understanding || normalizeUnderstanding(null, a);
    var byId = {};
    ((face && face.opportunities) || []).forEach(function (o) { if (o && o.scenario_id && !byId[o.scenario_id]) byId[o.scenario_id] = o; });
    var opps = (ranked.top || []).map(function (item, i) {
      item._source = source;
      if (!item.ctx) item.ctx = (scoreOne(item.scenario_id, a) || {}).ctx || { selected: false, hinted: false, noPain: isNoPain(a) };
      return buildOpp(item, i + 1, a, byId[item.scenario_id] || null);
    });
    var recId = opps[0] ? opps[0].scenario_id : "";
    var active = opps[0] || null;
    var flow = active ? { scenario_id: active.scenario_id, title: active.title, before: active.before.slice(), after: active.after.slice(), note: active.flow_note } : { scenario_id: "", title: "", before: [], after: [], note: "" };
    return {
      v: 3, analysis_version: "v0.3", source: source === "ai" ? "ai" : "rules", diagnosis_id: newDiagnosisId(),
      profile: profileOf(a), goals: a.goals.slice(), selected_issues: a.pains.slice(), custom_need: a.custom || "",
      clarifying_answer: a.followUp || null, facts: understanding.facts, inferred_needs: understanding.inferred, unknowns: understanding.unknowns,
      candidate_scenarios: (ranked.all || []).map(publicCandidate), top_opportunities: opps,
      recommended_scenario_id: recId, active_scenario_id: recId,
      insight: clean(face && face.insight, 160) || ruleInsight(a, opps), sensitive: understanding.sensitive,
      opps: opps.map(function (o) { return { name: o.title, dir: o.category, source: o.source, scene: o.scenario_id, why: o.priority_reason, ai: o.ai, you: o.you }; }),
      flow: flow, demo: active ? { scenario_id: active.scenario_id, type: (scene(active.scenario_id) && scene(active.scenario_id).demo) || "plan", live: false } : { scenario_id: "", type: "plan", live: false }
    };
  }

  function localReport(a) {
    a = normalizeAnswer(a);
    return assembleDiagnosis(null, rankFromRules(a), a, normalizeUnderstanding(null, a), "rules");
  }

  function readScores(raw) {
    if (!raw || typeof raw !== "object") return null;
    var keys = ["match", "intensity", "value", "feasibility", "landing"], o = {};
    for (var i = 0; i < keys.length; i++) {
      if (raw[keys[i]] == null || raw[keys[i]] === "") return null;
      o[keys[i]] = clampInt(raw[keys[i]], 0, 5);
    }
    return o;
  }
  function validId(id) { return /^[a-z][a-z0-9_]{0,24}$/.test(id || ""); }
  function claimsAcquisition(text) { return /获客|引流|拓客/.test(text || ""); }

  function parseModelCandidates(model, a) {
    var list = model && Array.isArray(model.candidates) ? model.candidates : [];
    var out = [];
    list.forEach(function (c) {
      if (!c || typeof c !== "object" || c.duplicate_of) return;
      var id = String(c.scenario_id || "").slice(0, 40);
      if (!validId(id)) return;
      if (!scene(id) && id !== "custom") return;
      var rule = scene(id) ? scoreOne(id, a) : null;
      var scores = readScores(c.scores) || (rule ? rule.scores : null);
      if (!scores) return;
      var ctx = rule ? rule.ctx : { selected: false, hinted: (a.custom || "").trim().length >= 8, noPain: isNoPain(a), overlap: 0, blockedAcquisition: false };
      if (rule && (ctx.selected || ctx.hinted) && scores.match + 2 < rule.scores.match) scores = Object.assign({}, scores, { match: rule.scores.match });
      if (ctx.noPain) scores = Object.assign({}, scores, { intensity: Math.min(scores.intensity, 1) });
      var title = clean(c.title, 24) || (rule && rule.title) || "这件事";
      var evidence = cleanList(c.evidence, 120, 4).filter(function (t) { return factAllowed(t, a); });
      var blob = title + evidence.join("");
      if (claimsAcquisition(blob) && !acquisitionSupported(a)) {
        out.push({ scenario_id: id, title: title, category: "创造", scores: scores, weighted: weighted(scores), ctx: Object.assign({}, ctx, { blockedAcquisition: true }), evidence: evidence, risks: [], source: "discover", keep: false, drop_reason: "把获客说成了事实，但回答里没有这件事" });
        return;
      }
      if (!evidence.length && rule) evidence = rule.evidence.slice();
      out.push({
        scenario_id: id, title: title, category: ["减负", "增能", "创造"].indexOf(c.category) >= 0 ? c.category : ((rule && rule.category) || "增能"),
        scores: scores, weighted: weighted(scores), ctx: ctx, evidence: evidence, risks: cleanList(c.risks, 80, 3),
        source: (ctx.selected || ctx.hinted) ? "user" : "discover"
      });
    });
    return out;
  }

  function mergeMustKeep(items, a) {
    rankFromRules(a).top.forEach(function (ruleItem) {
      if (!ruleItem.ctx.selected && !ruleItem.ctx.hinted) return;
      if (!items.some(function (x) { return x.scenario_id === ruleItem.scenario_id && !x.ctx.blockedAcquisition; })) items.push(ruleItem);
    });
    return items;
  }

  function rankCandidates(model, a) {
    a = normalizeAnswer(a);
    var fromModel = parseModelCandidates(model, a);
    if (!fromModel.length) return { usedRules: true, all: [], top: [] };
    var parsed = mergeMustKeep(fromModel, a);
    parsed.forEach(function (item) { if (!passes(item)) markDropped(item); });
    var kept = parsed.filter(passes).sort(byWeight);
    return { usedRules: false, all: parsed, top: capTop(dedupe(kept), a) };
  }

  function runDiagnosis(a, call) {
    a = normalizeAnswer(a);
    var understanding = null, ranked = null;
    return Promise.resolve().then(function () {
      return call("understand", PROMPTS.understand, { 问卷: promptInput(a) });
    }).then(function (s1) {
      understanding = normalizeUnderstanding(s1, a);
      return call("discover", PROMPTS.discover, { 问卷: promptInput(a), 理解: { facts: understanding.facts, inferred: understanding.inferred, unknowns: understanding.unknowns }, 场景目录: sceneCatalog() });
    }).then(function (s2) {
      ranked = rankCandidates(s2, a);
      if (ranked.usedRules || !ranked.top.length) return { skip: true };
      return Promise.resolve(call("face", PROMPTS.face, { 理解: { facts: understanding.facts, unknowns: understanding.unknowns }, 已排序场景: ranked.top.map(function (item, i) { return { rank: i + 1, scenario_id: item.scenario_id, title: item.title, category: item.category, scores: item.scores, evidence: item.evidence }; }), 说明: "顺序已定。不要新增场景，不要改 scenario_id，不要重排。" })).then(function (s3) { return { s3: s3 }; }, function () { return { faceFailed: true }; });
    }).then(function (box) {
      if (!ranked || ranked.usedRules || !ranked.top.length) return localReport(a);
      if (!box || box.skip || box.faceFailed) return assembleDiagnosis(null, ranked, a, understanding, "ai");
      return assembleDiagnosis(box.s3, ranked, a, understanding, "ai");
    }).catch(function () { return localReport(a); });
  }

  function setActiveScenario(report, id) {
    if (!report || report.analysis_version !== "v0.3" || !Array.isArray(report.top_opportunities)) return report;
    var opp = null;
    report.top_opportunities.forEach(function (o) { if (o && o.scenario_id === id) opp = o; });
    if (!opp) return report;
    var copy = JSON.parse(JSON.stringify(report));
    copy.active_scenario_id = id;
    copy.flow = { scenario_id: opp.scenario_id, title: opp.title, before: (opp.before || []).slice(), after: (opp.after || []).slice(), note: opp.flow_note || "" };
    copy.demo = { scenario_id: id, type: (scene(id) && scene(id).demo) || "plan", live: false };
    return copy;
  }

  /* ---------- 文本校验 ---------- */
  var BANNED = [/\d+(\.\d+)?\s*[%％]/, /百分之/, /一键/, /\b(RAG|LLM|Agent|API|Prompt|prompt|SaaS|RPA|token)\b/i, /智能体|大模型微调|向量数据库|工作流编排|全自动搭建/, /(提升|节省|增加|提高)\s*\d+\s*倍/, /月入|年入|增收\s*\d|赚\s*\d+\s*万/];
  function clean(s, max) {
    if (typeof s !== "string") return null;
    s = s.replace(/[<>]/g, "").replace(/[ \t]+\n/g, "\n").replace(/\s+/g, " ").trim();
    if (!s || s.length > max) return null;
    for (var i = 0; i < BANNED.length; i++) if (BANNED[i].test(s)) return null;
    return s;
  }
  function cleanBlock(s, max) {
    if (typeof s !== "string") return null;
    s = s.replace(/[<>]/g, "").replace(/\r/g, "").trim();
    if (!s) return null;
    if (s.length > max) s = s.slice(0, max);
    for (var i = 0; i < BANNED.length; i++) if (BANNED[i].test(s)) return null;
    return s;
  }
  function cleanList(arr, max, n) {
    if (!Array.isArray(arr)) return [];
    return arr.map(function (x) { return clean(typeof x === "string" ? x : "", max); }).filter(Boolean).slice(0, n || 4);
  }
  function cleanSteps(arr) {
    if (!Array.isArray(arr)) return null;
    var out = arr.map(function (x) { return clean(x, 40); }).filter(Boolean).slice(0, 6);
    return out.length >= 2 ? out : null;
  }

  function sanitizeDiagnosis(obj, a) {
    a = normalizeAnswer(a);
    if (!obj || obj.analysis_version !== "v0.3" || !Array.isArray(obj.top_opportunities)) return localReport(a);
    var opps = [];
    obj.top_opportunities.forEach(function (o) {
      if (!o || !validId(o.scenario_id)) return;
      if (opps.some(function (x) { return x.scenario_id === o.scenario_id; })) return;
      var item = { scenario_id: o.scenario_id, title: o.title, category: o.category, scores: o.scores || { match: 0, intensity: 0, value: 0, feasibility: 0, landing: 0 }, weighted: Number(o.weighted) || 0, evidence: o.evidence || [], source: o.source, ctx: { selected: (a.scenes || []).indexOf(o.scenario_id) >= 0, hinted: hinted(o.scenario_id, a), noPain: isNoPain(a) } };
      opps.push(buildOpp(item, opps.length + 1, a, o));
    });
    if (!opps.length && (a.scenes.length || a.custom || !isNoPain(a))) return localReport(a);
    var recId = "";
    opps.forEach(function (o) { if (!recId && o.scenario_id === obj.recommended_scenario_id) recId = o.scenario_id; });
    if (!recId) recId = opps[0] ? opps[0].scenario_id : "";
    var active = opps[0] ? opps[0].scenario_id : "";
    opps.forEach(function (o) { if (o.scenario_id === obj.active_scenario_id) active = o.scenario_id; });
    var understanding = { facts: cleanList(obj.facts, 160, 8).filter(function (t) { return factAllowed(t, a); }), inferred: cleanList(obj.inferred_needs, 160, 6), unknowns: cleanList(obj.unknowns, 160, 6), sensitive: obj.sensitive === true || isSensitive(a) };
    if (!understanding.facts.length) understanding = normalizeUnderstanding(null, a);
    var rebuilt = assembleDiagnosis(null, { all: obj.candidate_scenarios || [], top: opps.map(function (o) { return { scenario_id: o.scenario_id, title: o.title, category: o.category, scores: o.scores, weighted: o.weighted, evidence: o.evidence, source: o.source, ctx: { selected: a.scenes.indexOf(o.scenario_id) >= 0, hinted: hinted(o.scenario_id, a), noPain: isNoPain(a) }, _face: o }; }) }, a, understanding, obj.source === "ai" ? "ai" : "rules");
    // assemble 会重写文案。已通过 buildOpp 的机会直接放回，避免二次改写排名和句子。
    rebuilt.top_opportunities = opps;
    rebuilt.opps = opps.map(function (o) { return { name: o.title, dir: o.category, source: o.source, scene: o.scenario_id, why: o.priority_reason, ai: o.ai, you: o.you }; });
    rebuilt.recommended_scenario_id = recId;
    rebuilt.active_scenario_id = active || recId;
    rebuilt.diagnosis_id = clean(obj.diagnosis_id, 40) || rebuilt.diagnosis_id;
    rebuilt.source = obj.source === "ai" ? "ai" : "rules";
    rebuilt.insight = clean(obj.insight, 160) || rebuilt.insight;
    var cur = null;
    opps.forEach(function (o) { if (o.scenario_id === rebuilt.active_scenario_id) cur = o; });
    rebuilt.flow = cur ? { scenario_id: cur.scenario_id, title: cur.title, before: cur.before.slice(), after: cur.after.slice(), note: cur.flow_note } : rebuilt.flow;
    rebuilt.candidate_scenarios = Array.isArray(obj.candidate_scenarios) ? obj.candidate_scenarios.slice(0, 12) : rebuilt.candidate_scenarios;
    return rebuilt;
  }

  function upgradeLegacy(obj, a) {
    a = normalizeAnswer(a);
    if (!obj || !Array.isArray(obj.opps)) return localReport(a);
    var items = [];
    obj.opps.slice(0, 3).forEach(function (o) {
      if (!o || typeof o !== "object") return;
      var name = clean(o.name, 24), why = clean(o.why, 160), ai = clean(o.ai, 200), you = clean(o.you, 160);
      if (!name || !why || !ai || !you) return;
      var id = scene(o.scene) ? o.scene : "";
      if (!id) { var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; id = "custom_" + h.toString(36); }
      if (items.some(function (x) { return x.scenario_id === id; })) return;
      var rule = scene(id) ? scoreOne(id, a) : null;
      items.push({ scenario_id: id, title: name, category: ["减负", "增能", "创造"].indexOf(o.dir) >= 0 ? o.dir : "增能", scores: rule ? rule.scores : { match: 3, intensity: 3, value: 3, feasibility: 3, landing: 3 }, weighted: rule ? rule.weighted : 3, evidence: [why], source: o.source === "discover" ? "discover" : "user", ctx: rule ? rule.ctx : { selected: true, hinted: true, noPain: isNoPain(a) }, _face: { title: name, priority_reason: why, ai: ai, you: you, source: o.source === "discover" ? "discover" : "user", before: items.length === 0 ? (obj.flow && obj.flow.before) : null, after: items.length === 0 ? (obj.flow && obj.flow.after) : null } });
    });
    if (!items.length) return localReport(a);
    var face = { insight: obj.insight, opportunities: items.map(function (item) { return Object.assign({ scenario_id: item.scenario_id, category: item.category }, item._face); }) };
    var report = assembleDiagnosis(face, { all: [], top: items }, a, normalizeUnderstanding(null, a), "ai");
    return report;
  }

  function validateReport(obj, a) {
    if (obj && obj.analysis_version === "v0.3" && Array.isArray(obj.top_opportunities)) return sanitizeDiagnosis(obj, a);
    if (obj && Array.isArray(obj.opps)) return upgradeLegacy(obj, a);
    return localReport(a);
  }

  function validateFollowUp(obj) {
    if (!obj || obj.need !== true) return null;
    var t = clean(obj.title, 60); if (!t || !Array.isArray(obj.options)) return null;
    if (/最优先|哪个最头疼|先做哪一个/.test(t)) return null;
    var opts = obj.options.map(function (o) { return clean(typeof o === "string" ? o : (o && o.label), 30); }).filter(Boolean).slice(0, 5);
    if (opts.length < 2) return null;
    if (!opts.some(function (o) { return /不清楚|不确定|其他|都不是/.test(o); })) opts.push("不确定 / 其他");
    return { title: t, options: opts };
  }

  function validateMicro(obj, requestedId) {
    if (!obj || typeof obj !== "object") return null;
    if (!requestedId || !validId(requestedId)) return null;
    if (obj.scenario_id && obj.scenario_id !== requestedId) return null;
    var artifact = cleanBlock(obj.artifact, 1200);
    var next = clean(obj.next_step, 160);
    var title = clean(obj.artifact_title, 40) || "这一小步的结果";
    if (!artifact || !next) return null;
    if (requestedId !== "research" && /扫地|机器人/.test(artifact) && !/扫地|机器人/.test(String(obj._input || ""))) {
      /* 不因无关词整段拒绝：用户材料里没有时，仍收下，但调用方应已限定场景。此处只拒绝编号不符。 */
    }
    return { scenario_id: requestedId, artifact_title: title, artifact: artifact, next_step: next, missing: cleanList(obj.missing, 80, 4) };
  }

  function promptInput(a) {
    a = normalizeAnswer(a);
    return {
      身份: statusText(a),
      希望的改变_并列无先后: a.goals.map(function (v) { return label(D.GOALS, v); }),
      经常做的事_并列无先后: a.scenes.map(function (id) { var s = scene(id); return s ? s.name : ""; }).filter(Boolean),
      困难_并列不是落地顺序: isNoPain(a) ? ["暂时没有明显困难"] : a.pains.map(function (v) { return label(D.PAINS, v); }),
      频率_针对困难整体: label(D.FREQ, a.freq) || "（未填或无困难）",
      影响_针对困难整体: label(D.IMPACT, a.impact) || "（未填或无困难）",
      想让AI搞定的具体事: a.custom || "（未填写）",
      一个月内最想改变: a.month === "other" ? (a.monthOther || "其他") : (label(D.MONTH, a.month) || "（未填）"),
      追问: a.followUp && a.followUp.answer ? a.followUp.title + " → " + a.followUp.answer : undefined,
      说明: "数组顺序是题库顺序，不是用户排出的优先级。不要输出最优先，不要把推断写成事实。"
    };
  }
  function sceneCatalog() { return D.SCENES.filter(function (s) { return s.opp; }).map(function (s) { return { scenario_id: s.id, name: s.name, category: s.dir }; }); }

  var PERSONA = "你是以真实场景为中心的 AI 应用诊断顾问，不是工具销售员。先理解再推荐；区分事实与推断；兼顾减负、增能、创造；不凑数；不虚构效果；缺信息标待确认；优先可小规模验证；用通俗中文。微体验必须匹配选定场景。";
  var PROMPTS = {
    persona: PERSONA,
    understand: PERSONA + "\n这是第 1 阶段：只做需求理解，不要推荐工具，不要排顺序。\n规则：\n1. facts 只写用户明确选过或写过的内容。禁止把推断写成事实。\n2. inferred 里的每条都是推测。用户没说获客困难，就不能写成事实。\n3. unknowns 写还会影响判断、但用户没提供的信息。\n4. 困难是并列的。不要根据选项顺序猜测哪个更重要，也不要追问哪个最优先。\n5. 不要根据职业编造具体工作内容。\n只输出 JSON：{\"facts\":[\"\"],\"inferred\":[\"\"],\"unknowns\":[\"\"],\"sensitive\":false}",
    discover: PERSONA + "\n这是第 2 阶段：发现候选场景并评估，不要写给用户看的长文。\n每个候选打 0 到 5 的整数分，不要输出百分数：match 场景匹配，权重 30%；intensity 需求强度，权重 25%；value 潜在价值，权重 20%；feasibility 可行性，权重 15%；landing 越容易先做小规模验证分越高，权重 10%。\n规则：\n1. 可以少于 3 个，不够门槛就不要凑。没有明显困难时，不要制造痛点场景。\n2. 同一件事不要拆成两个候选。scenario_id 用目录里的编号；对不上时用 custom，并在 title 里写清这件事。\n3. evidence 只能引用事实。推断放进 inference_note，不能当证据。\n4. 只勾了赚钱或获客、但没有具体做法时，不要断言对方已经有获客问题。\n5. 资料整理不要改写成营销或获客。\n6. 健康、法律、财务、隐私只适合人机协作，写进 risks。\n只输出 JSON：{\"candidates\":[{\"scenario_id\":\"\",\"title\":\"\",\"category\":\"减负|增能|创造\",\"scores\":{\"match\":0,\"intensity\":0,\"value\":0,\"feasibility\":0,\"landing\":0},\"evidence\":[\"\"],\"inference_note\":\"\",\"risks\":[\"\"],\"duplicate_of\":null}]}",
    face: PERSONA + "\n这是第 3 阶段：只把已经排好的场景写成给用户看的话。不要新增场景，不要改 scenario_id，不要改顺序。第一个就是建议先看的。\n每条都要有：标题、类别、来自事实的证据、为什么排在这里（白话，不要百分数）、AI 做什么、人做什么、现在怎么做、AI 参与后（各 3 到 4 步，每步不超过 16 个字）、微体验要用户补充的一句话（必须就是这个场景）、会诊还要确认的问题。\n不虚构效果，不承诺一次做完，不用术语，不用百分比。\n只输出 JSON：{\"insight\":\"\",\"recommended_scenario_id\":\"\",\"opportunities\":[{\"scenario_id\":\"\",\"title\":\"\",\"category\":\"减负|增能|创造\",\"evidence\":[],\"priority_reason\":\"\",\"ai\":\"\",\"you\":\"\",\"before\":[],\"after\":[],\"flow_note\":\"\",\"micro\":{\"input_label\":\"\",\"placeholder\":\"\",\"task\":\"\"},\"consult_questions\":[]}]}",
    micro: PERSONA + "\n现在只做微体验：针对给定的 scenario_id，用用户刚补充的材料，生成一个看得见的小成果，并给一个下一步建议。\n必须就是这个场景。用户要整理资料，就产出整理结果，不要换成别的主题，不要用无关示例冒充。\n材料里没有的数字和事实不要编，缺的写进 missing。通俗中文。不要百分数，不要术语。\n只输出 JSON：{\"scenario_id\":\"原样返回\",\"artifact_title\":\"\",\"artifact\":\"小成果正文，可用换行\",\"next_step\":\"\",\"missing\":[]}",
    follow: PERSONA + "\n看匿名问卷，判断信息是否够找出具体场景。不要问「哪个最优先」。\n足够：只输出 {\"need\":false}。\n不够：只问 1 道最关键的单选题，3 到 5 个选项，最后一个是「不确定 / 其他」：{\"need\":true,\"title\":\"不超过30字\",\"options\":[\"\",\"\"]}"
  };

  var api = {
    label: label, pick: pick, scene: scene, grpOf: grpOf, statusText: statusText, painsFor: painsFor,
    normalizeAnswer: normalizeAnswer, toggleChoice: toggleChoice, localReport: localReport, validateReport: validateReport,
    validateFollowUp: validateFollowUp, validateMicro: validateMicro, promptInput: promptInput, isSensitive: isSensitive,
    setActiveScenario: setActiveScenario, rankCandidates: rankCandidates, runDiagnosis: runDiagnosis, sceneCatalog: sceneCatalog,
    WEIGHTS: WEIGHTS, PROMPTS: PROMPTS, BANNED: BANNED, scoreOne: scoreOne
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ASDX_V2 = api;
})(typeof window !== "undefined" ? window : this);
