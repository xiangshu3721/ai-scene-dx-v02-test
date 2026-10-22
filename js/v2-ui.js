/*!
 * v2-ui.js · V0.3 用户端：问卷（困难并列）→ 报告（可切换场景）→ 微体验 → 微信会诊
 * 旧版 V0.2 报告（没有 analysis_version=v0.3）仍按原来的四段渲染。
 */
(function (root) {
  "use strict";
  var D = root.ASDX_V2_DATA, E = root.ASDX_V2, U = root.ASDX_COMMON, CFG = root.ASDX_CONFIG || {};
  var esc = U.esc;
  var TRACK = root.ASDX_TRACK || function () {};
  var STEPS = ["status", "goals", "scenes", "pains", "impact", "custom", "month"];
  var microSeq = {};

  function consultCfg() {
    var c = root.ASDX_CONSULT || {};
    return { name: c.ADVISOR_NAME || "翔叔", wx: String(c.WECHAT_ID || "").trim(), qr: String(c.QR_IMAGE || "").trim(), remark: c.REMARK || "AI场景诊断", note: c.CONTACT_NOTE || "" };
  }
  function newCode() { var s = (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase(); return "DX" + s.slice(-6); }
  function bookingText(code) { return "你好，我刚完成AI场景诊断，想预约一次免费45分钟的AI场景会诊。我的报告编号是：" + (code || "（暂无）") + "。"; }
  function nl(s) { return esc(s || "").replace(/\n/g, "<br>"); }

  function postJSON(path, body, ms) {
    var base = String(CFG.AI_ENDPOINT || "").trim().replace(/\/$/, "");
    if (!base || !root.fetch) return Promise.reject(new Error("no endpoint"));
    var ctrl = root.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
    return root.fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error("http " + r.status); return r.json(); }, function (e) { clearTimeout(timer); throw e; });
  }
  function anon(a) { return E.normalizeAnswer(a); }

  root.ASDX_V2_UI = function (api) {
    var V = {}, A = {};
    function S() { return api.state(); }
    function a() { return S().a; }
    function grp() { return E.grpOf(a().status); }
    function noPain(x) { x = x || a(); return (x.pains || []).indexOf("none") >= 0 || !(x.pains || []).length; }

    function steps() { return STEPS.filter(function (k) { return !(k === "impact" && noPain()); }); }
    function stepKey() { return steps()[S().qi] || "status"; }
    function prog() {
      var n = steps().length, pct = Math.round(S().qi / n * 100);
      return '<div class="progress" role="progressbar" aria-label="整体进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>';
    }
    function head(t) { return api.brandBar('<span class="step-label">第 ' + (S().qi + 1) + " / " + steps().length + " 题</span>") + prog() + '<main class="wrap q-screen v2"><h2 class="q-title" data-focus id="qT">' + esc(t) + "</h2>"; }
    function optBtn(act, v, lbl, on, role, hint) {
      return '<button type="button" class="opt' + (on ? " on" : "") + '" role="' + role + '" aria-checked="' + !!on + '" data-act="' + act + '" data-v="' + esc(v) + '"><span>' + esc(lbl) + "</span>" + (hint ? "<small>" + esc(hint) + "</small>" : "") + "</button>";
    }
    function nextBar(ok, txt) {
      return '<div class="q-next"><button type="button" class="btn btn-primary" data-act="v2Next"' + (ok ? "" : " disabled") + ">" + (txt || "下一步") + '</button></div><nav class="q-nav"><button type="button" class="btn-link" data-act="v2Back">← 上一题</button></nav></main>';
    }
    function canNext() {
      var x = a(), k = stepKey();
      if (k === "status") return !!x.status;
      if (k === "goals") return (x.goals || []).length > 0;
      if (k === "scenes") return (x.scenes || []).length > 0;
      if (k === "pains") return (x.pains || []).length > 0;
      if (k === "impact") return !!x.freq && !!x.impact;
      if (k === "custom") return true;
      if (k === "month") return !!x.month && (x.month !== "other" || !!(x.monthOther || "").trim());
      return false;
    }
    function catalog(list, idKey) { return list.map(function (o) { return { v: o[idKey || "v"], exclusive: !!o.exclusive }; }); }
    function toggle(key, v, max, list, idKey) {
      var res = E.toggleChoice(catalog(list, idKey), v, a()[key], max);
      if (!res.ok) { if (res.full) api.flash("最多选 " + max + " 项，先取消一个再选"); return null; }
      a()[key] = res.values;
      a().painTop = "";
      return res.values;
    }

    V.q = function () {
      var x = a(), k = stepKey(), h;
      if (k === "status") {
        h = head("你目前主要是哪种状态？") + '<p class="q-sub">选最接近的一项就行。</p><div class="opts" role="radiogroup" aria-labelledby="qT">';
        D.STATUS.forEach(function (o) { h += optBtn("v2Status", o.v, o.label, x.status === o.v, "radio", o.hint); });
        h += '</div><label class="v2-field"><span>具体职业（选填）</span><input type="text" maxlength="30" data-in="statusDetail" value="' + esc(x.statusDetail || "") + '" placeholder="如：小学老师、民宿主理人、财务"></label>';
        return h + nextBar(canNext());
      }
      if (k === "goals") {
        h = head("你最希望 AI 给你带来什么改变？") + '<p class="q-sub">最多选 3 项。这几项并列，不用分先后。</p><div class="opts" role="group" aria-labelledby="qT">';
        D.GOALS.forEach(function (o) { h += optBtn("v2Goal", o.v, o.label, (x.goals || []).indexOf(o.v) >= 0, "checkbox"); });
        return h + '</div><p class="q-count" aria-live="polite">已选 ' + (x.goals || []).length + " / 3</p>" + nextBar(canNext());
      }
      if (k === "scenes") {
        h = head("你平时经常需要做哪些事情？") + '<p class="q-sub">最多选 4 项，并列就好。每张卡下面是举例，不用完全一样。</p><div class="opts v2-cards" role="group" aria-labelledby="qT">';
        D.SCENES.forEach(function (s) { h += optBtn("v2Scene", s.id, s.name, (x.scenes || []).indexOf(s.id) >= 0, "checkbox", "比如：" + s.ex[grp()]); });
        return h + '</div><p class="q-count" aria-live="polite">已选 ' + (x.scenes || []).length + " / 4</p>" + nextBar(canNext());
      }
      if (k === "pains") {
        var list = E.painsFor(x.scenes), sel = x.pains || [];
        h = head("这些事里，哪些让你觉得困难？") + '<p class="q-sub">可以多选，几项同等重要，不用分先后。选困难不等于 AI 建议的落地顺序。</p><div class="opts" role="group" aria-labelledby="qT">';
        list.forEach(function (o) { h += optBtn("v2Pain", o.v, o.label, sel.indexOf(o.v) >= 0, "checkbox"); });
        return h + "</div>" + nextBar(canNext());
      }
      if (k === "impact") {
        var pains = (x.pains || []).filter(function (p) { return p !== "none"; });
        var title = pains.length === 1 ? "「" + E.label(D.PAINS, pains[0]) + "」这件事，整体上影响有多大？" : "这些困难是并列的。它们整体上影响有多大？";
        h = head(title) + '<p class="dim-t" id="fT">多久遇到一次？</p><div class="chips v2-chips" role="radiogroup" aria-labelledby="fT">';
        D.FREQ.forEach(function (o) { h += '<button type="button" class="chip' + (x.freq === o.v ? " on" : "") + '" role="radio" aria-checked="' + (x.freq === o.v) + '" data-act="v2Freq" data-v="' + o.v + '">' + esc(o.label) + "</button>"; });
        h += '</div><p class="dim-t" id="iT">影响程度？</p><div class="chips v2-chips" role="radiogroup" aria-labelledby="iT">';
        D.IMPACT.forEach(function (o) { h += '<button type="button" class="chip' + (x.impact === o.v ? " on" : "") + '" role="radio" aria-checked="' + (x.impact === o.v) + '" data-act="v2Impact" data-v="' + o.v + '">' + esc(o.label) + "</button>"; });
        return h + "</div>" + nextBar(canNext());
      }
      if (k === "custom") {
        h = head("有没有一件具体的事，特别希望 AI 帮你搞定？") + '<p class="q-sub">用一两句话说说就好：是什么事、现在怎么做、哪里麻烦。没有可以直接跳过。</p>';
        h += '<ul class="v2-examples">' + D.Q6_EXAMPLES.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
        h += '<label class="v2-field"><span class="sr">想让 AI 搞定的事</span><textarea rows="4" maxlength="' + D.Q6_MAX + '" data-in="custom" placeholder="例如：每周要把几张表汇总成一份报告……">' + esc(x.custom || "") + "</textarea></label>";
        h += '<p class="v2-privacy" role="note">🔒 请不要填写姓名、电话、客户资料或公司机密。这段内容会发给 AI 做分析。</p>';
        return h + nextBar(true, (x.custom || "").trim() ? "下一步" : "跳过，下一步");
      }
      if (k === "month") {
        h = head("如果接下来一个月 AI 能帮你改变一件事，你最希望是什么？") + '<div class="opts" role="radiogroup" aria-labelledby="qT">';
        D.MONTH.forEach(function (o) { h += optBtn("v2Month", o.v, o.label, x.month === o.v, "radio"); });
        h += "</div>";
        if (x.month === "other") h += '<label class="v2-field"><span>写下你最希望的改变</span><input type="text" maxlength="60" data-in="monthOther" value="' + esc(x.monthOther || "") + '"></label>';
        return h + nextBar(canNext(), "生成我的报告");
      }
    };

    V.fu = function () {
      var q = S().fuQ, x = a(), cur = x.followUp && x.followUp.answer;
      var h = api.brandBar('<span class="step-label">最后一个问题</span>') + '<div class="progress"><i style="width:96%"></i></div><main class="wrap q-screen v2"><p class="q-no">AI 想再确认一下（可跳过）</p><h2 class="q-title" data-focus id="qT">' + esc(q.title) + '</h2><div class="opts" role="radiogroup" aria-labelledby="qT">';
      q.options.forEach(function (o) { h += optBtn("v2Fu", o, o, cur === o, "radio"); });
      return h + '</div><div class="q-next"><button type="button" class="btn btn-ghost" data-act="v2FuSkip">跳过，直接看报告</button></div></main>';
    };

    V.v2gen = function () {
      return api.brandBar() + '<main class="wrap center-screen"><div class="loader" role="status" aria-live="polite"><i></i><p>' + esc(S().genMsg || "正在理解你的回答，再找出值得试的场景…") + "</p></div></main>";
    };

    function isV3(r) { return !!(r && r.analysis_version === "v0.3" && Array.isArray(r.top_opportunities)); }
    function reportOf(rec) {
      var r = rec && rec.report;
      if (isV3(r)) return r;
      if (r && Array.isArray(r.opps) && r.opps.length && r.flow) return r;
      try { return E.localReport((rec && rec.a) || {}); } catch (e) { return E.localReport({}); }
    }
    function oppById(r, id) {
      var list = (r && r.top_opportunities) || [];
      for (var i = 0; i < list.length; i++) if (list[i] && list[i].scenario_id === id) return list[i];
      return null;
    }
    var DIR_C = { "减负": "t-C", "增能": "t-B", "创造": "t-A" };

    function renderV3(rec, r) {
      var cur = oppById(r, r.active_scenario_id) || oppById(r, r.recommended_scenario_id) || r.top_opportunities[0] || null;
      var h = api.brandBar('<span class="step-label">' + esc(U.fmtDate(rec.t)) + "</span>");
      h += '<main class="wrap report v2" id="report">';
      h += '<section class="r-first"><p class="kicker">你的AI场景诊断报告 · 编号 ' + esc(rec.code) + "</p>";
      h += '<h1 class="r-h1 v2-insight" data-focus>' + esc(r.insight || "") + "</h1>";
      if (r.source !== "ai") h += '<p class="note v2-src">基础初诊：这次没能完成智能诊断，下面是规则库的简化结果。</p>';
      if (r.facts && r.facts.length) h += '<ul class="v2-facts">' + r.facts.slice(0, 4).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>";
      if (r.inferred_needs && r.inferred_needs.length) h += '<p class="note v2-src">有些想法还只是推测，没有当成已经发生的事。</p>';
      if (r.unknowns && r.unknowns.length) h += '<p class="note v2-src">还要确认：' + esc(r.unknowns.slice(0, 2).join("；")) + "</p>";
      h += '<p class="v2-saveimg-top"><button type="button" class="btn-link" data-act="v2SaveImg">保存报告长图 ↓</button></p></section>';
      h += '<section class="r-sec" aria-labelledby="oT"><h2 id="oT">' + (r.top_opportunities.length ? "值得先看的场景" : "这次没有足够把握的场景") + "</h2>";
      h += '<p class="sec-sub">' + (r.top_opportunities.length ? "点一张卡，只切换正在看的场景，不改变建议顺序。" : "信息不够时不强行推荐。可以补充一件具体的事，或直接预约会诊。") + "</p>";
      r.top_opportunities.forEach(function (o) {
        var on = cur && cur.scenario_id === o.scenario_id;
        var reced = o.scenario_id === r.recommended_scenario_id;
        h += '<article class="opp ' + (DIR_C[o.category] || DIR_C[o.dir] || "t-B") + (reced ? " v2-main" : "") + (on ? " is-active" : "") + '" data-scenario="' + esc(o.scenario_id) + '" data-rank="' + o.rank + '" role="button" tabindex="0" data-act="v2PickScenario" aria-pressed="' + !!on + '">';
        h += '<header><span class="rank">' + esc(o.rank || "") + "</span><h3>" + esc(o.title || o.name) + '</h3><span class="tag">' + esc(o.category || o.dir || "") + "</span></header>";
        if (reced) h += '<p class="v2-badge v2-badge-main">建议先做</p>';
        if (on && !reced) h += '<p class="v2-badge">当前查看</p>';
        if (o.source === "discover") h += '<p class="v2-badge">你可能还没想到</p>';
        h += "<dl><dt>为什么排这里</dt><dd>" + esc(o.priority_reason || o.why || "") + "</dd></dl>";
        if (o.evidence && o.evidence.length) h += "<dl><dt>依据</dt><dd>" + esc(o.evidence.slice(0, 2).join("；")) + "</dd></dl>";
        h += '<div class="split"><div><b>AI 帮你做</b><p>' + esc(o.ai) + '</p></div><div><b>你负责</b><p>' + esc(o.you) + "</p></div></div></article>";
      });
      if (r.sensitive) h += '<p class="v2-safe">涉及健康、法律、财务或隐私的内容，AI 只负责整理和出草稿，结论请由你或专业人士把关。</p>';
      h += "</section>";
      if (cur) h += flowHtml(cur) + microHtml(rec, cur);
      h += consultHtml(rec.code, cur && cur.consult_questions);
      h += endHtml();
      h += qrModal();
      return h;
    }

    function flowHtml(cur) {
      var before = cur.before || [], after = cur.after || [];
      var h = '<section class="r-sec" id="flowBox" data-scenario="' + esc(cur.scenario_id) + '" aria-labelledby="fT2"><h2 id="fT2">当前场景：' + esc(cur.title || cur.name) + "</h2>";
      if (before.length < 2 || after.length < 2) return h + '<p class="note">这个场景还没有前后对照。</p></section>';
      h += '<div class="v2-flow"><div class="v2-col v2-before"><b>现在怎么做</b><ol>' + before.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + '</ol></div><div class="v2-arrow" aria-hidden="true">→</div><div class="v2-col v2-after"><b>AI 参与后</b><ol>' + after.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ol></div></div>";
      h += '<p class="note">' + esc(cur.flow_note || "这是初步对照，需结合实际情况核实。") + "</p></section>";
      return h;
    }

    function microHtml(rec, cur) {
      var id = cur.scenario_id;
      var slot = (rec.microByScenario && rec.microByScenario[id]) || {};
      var micro = cur.micro || {};
      var sample = (E.scene(id) || {}).sample;
      var h = '<section class="r-sec v2-micro" id="microBox" data-scenario="' + esc(id) + '" data-micro-status="' + esc(slot.status || "idle") + '" aria-labelledby="dT">';
      h += '<h2 id="dT">微体验 · ' + esc(cur.title || cur.name) + "</h2>";
      h += '<p class="sec-sub">' + esc(micro.task || "用你自己的一小段材料，看这个场景能交出什么。") + "</p>";
      h += '<label class="v2-field"><span>' + esc(micro.input_label || "补充一两句这个场景里的材料") + '</span><textarea rows="4" maxlength="800" data-micro-input="1" placeholder="' + esc(micro.placeholder || "不要填写姓名、电话或客户隐私") + '">' + esc(slot.input || "") + "</textarea></label>";
      var busy = slot.status === "loading";
      h += '<div class="q-next"><button type="button" class="btn btn-primary" data-act="v2Micro"' + (busy ? " disabled" : "") + ">" + (slot.status === "err" ? "重试" : busy ? "正在生成…" : "生成这一小步") + "</button></div>";
      h += '<div class="v2-micro-result" data-scenario="' + esc(id) + '">';
      if (slot.status === "loading") h += '<p class="note">正在按这个场景生成，不会借用别的场景的结果。</p>';
      else if (slot.status === "ok" && slot.result && slot.result.scenario_id === id) {
        h += '<div class="v2-ai"><span>这一小步的结果</span><p><b>' + esc(slot.result.artifact_title || "") + "</b></p><p>" + nl(slot.result.artifact) + "</p>";
        if (slot.result.missing && slot.result.missing.length) h += "<p>还缺：" + esc(slot.result.missing.join("；")) + "</p>";
        h += "<p>下一步：" + esc(slot.result.next_step) + "</p></div>";
      } else if (slot.status === "err") h += '<p class="v2-micro-err" role="alert">' + esc(slot.message || "这次没有生成成功，可以重试。不会用别的场景的结果来顶替。") + "</p>";
      else h += '<p class="note">生成后，这里只会出现「' + esc(cur.title || "当前场景") + '」的小成果。</p>';
      h += "</div>";
      if (sample) {
        h += '<aside class="v2-sample" data-sample="1"><p><span class="v2-demo-tag">示例</span> 不是你的实时结果</p><p class="v2-me"><span>假如输入</span>' + esc(sample.input) + '</p><div class="v2-ai"><span>示例输出</span><p>' + nl(sample.output) + "</p><p>" + esc(sample.next || "") + "</p></div></aside>";
      }
      return h + "</section>";
    }

    V.report2 = function () {
      var rec = S().rec, r = reportOf(rec);
      if (isV3(r)) return renderV3(rec, r);
      return renderLegacy(rec, r);
    };

    var DEMOS = {
      table: { t: "把零散信息变成一张对比表", inp: "帮我比较 3 款扫地机器人，按价格、噪音、售后列一张表", out: '<table class="v2-demo-t"><tr><th></th><th>甲款</th><th>乙款</th><th>丙款</th></tr><tr><td>价格</td><td>较低</td><td>中等</td><td>较高</td></tr><tr><td>噪音</td><td>偏大</td><td>适中</td><td>安静</td></tr><tr><td>售后</td><td>1 年</td><td>2 年</td><td>2 年</td></tr></table><p>需要你核实：各款最新价格与售后条款</p>' },
      plan: { t: "把一件事拆成可执行的计划", inp: "我想用一个月学会用 AI 做 PPT，每天能抽 30 分钟", out: "<ol><li>第 1 周：每天让 AI 帮你把一段文字改成提纲</li><li>第 2 周：用 AI 生成 3 页草稿，自己调整</li><li>第 3 周：拿一个真实汇报试做</li><li>第 4 周：总结出自己的固定做法</li></ol>" },
      draft: { t: "给你一个初稿，你只需要改", inp: "帮我写一段小店新品上架的朋友圈，语气亲切，60 字以内", out: "<p>新朋友到店啦～这周上了两款手作新品，量不多，喜欢的朋友可以来店里看看实物，有问题随时问我。</p>" },
      reply: { t: "帮你起草回复，你确认后再发", inp: "客户问：东西什么时候能到？能不能便宜点？", out: "<p>您好，订单已经安排，预计 2～3 天送到，发货后我第一时间把单号发您。价格这边已经是活动价了。</p><p>发送前请你核对实际发货时间</p>" }
    };
    function renderLegacy(rec, r) {
      var h = api.brandBar('<span class="step-label">' + esc(U.fmtDate(rec.t)) + "</span>");
      h += '<main class="wrap report v2" id="report"><section class="r-first"><p class="kicker">你的AI场景诊断报告 · 编号 ' + esc(rec.code) + "</p>";
      h += '<h1 class="r-h1 v2-insight" data-focus>' + esc(r.insight || "") + "</h1>";
      if (r.source !== "ai") h += '<p class="note v2-src">本报告由本地规则生成（简化版）。</p>';
      h += '<p class="v2-saveimg-top"><button type="button" class="btn-link" data-act="v2SaveImg">保存报告长图 ↓</button></p></section>';
      h += '<section class="r-sec" aria-labelledby="oT"><h2 id="oT">你的 3 个 AI 机会</h2><p class="sec-sub">这是较早版本的报告，按当时保存的顺序展示。</p>';
      (r.opps || []).forEach(function (o, i) {
        h += '<article class="opp ' + (DIR_C[o.dir] || "t-B") + (i === 0 ? " v2-main" : "") + '"><header><span class="rank">' + (i + 1) + "</span><h3>" + esc(o.name) + '</h3><span class="tag">' + esc(o.dir) + "</span></header>" +
          (i === 0 ? '<p class="v2-badge v2-badge-main">重点推荐</p>' : "") + (o.source === "discover" ? '<p class="v2-badge">你可能还没想到</p>' : "") +
          "<dl><dt>为什么值得</dt><dd>" + esc(o.why) + "</dd></dl>" +
          '<div class="split"><div><b>AI 帮你做</b><p>' + esc(o.ai) + '</p></div><div><b>你负责</b><p>' + esc(o.you) + "</p></div></div></article>";
      });
      if (r.sensitive) h += '<p class="v2-safe">涉及健康、法律、财务或隐私的内容，AI 只负责整理和出草稿，结论请由你或专业人士把关。</p>';
      h += "</section>";
      var f = r.flow || { before: [], after: [], title: "" };
      h += '<section class="r-sec" aria-labelledby="fT2"><h2 id="fT2">头号场景：' + esc(f.title || "") + '</h2><div class="v2-flow"><div class="v2-col v2-before"><b>现在怎么做</b><ol>' +
        (f.before || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + '</ol></div><div class="v2-arrow" aria-hidden="true">→</div><div class="v2-col v2-after"><b>AI 参与后</b><ol>' +
        (f.after || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ol></div></div><p class=\"note\">" + esc(f.note || "这是初步方案，需结合实际情况核实。") + "</p></section>";
      var d = DEMOS[(r.demo && r.demo.type) || "plan"] || DEMOS.plan;
      h += '<section class="r-sec v2-demo"><h2>AI 微体验 <span class="v2-demo-tag">演示</span></h2><p class="sec-sub">' + esc(d.t) + "。这是当时保存的模拟演示，不是新的实时结果。</p>" +
        '<div class="v2-chat"><p class="v2-me"><span>你</span>' + esc(d.inp) + '</p><div class="v2-ai"><span>AI（演示）</span>' + d.out + "</div></div></section>";
      h += consultHtml(rec.code);
      h += endHtml();
      h += qrModal();
      return h;
    }

    function endHtml() {
      return '<section class="r-end"><button type="button" class="btn btn-primary btn-lg" data-act="v2SaveImg">保存报告长图</button><p class="note" id="v2ImgMsg" aria-live="polite"></p><div class="r-actions"><button type="button" class="btn btn-ghost" data-act="restart">重新测试</button><button type="button" class="btn btn-ghost" data-act="home">回到首页</button></div>' +
        '<p class="note">' + (S().saveOk === false ? "这台设备的浏览器不让存数据，报告关掉就没了，建议先截图。" : "报告已保存在这台设备上。再次打开不会重新抽一次排名。") + "</p></section></main>";
    }

    function consultHtml(code, questions) {
      var c = consultCfg(), has = c.wx || c.qr;
      var h = '<section class="r-sec v2-consult" id="consult" aria-labelledby="cT"><p class="kicker">免费45分钟 · AI场景会诊</p><h2 id="cT">你的这些AI机会，到底该怎么真正实现？</h2>';
      h += "<p>报告帮你看到方向。哪个先做、具体怎么落地，还要结合你的真实情况聊清楚。</p>";
      h += "<p><b>免费45分钟微信会诊</b>：和" + esc(c.name) + "把报告里的机会落到实处。</p>";
      h += '<h3>我们会聊什么</h3><ol class="v2-four"><li>厘清你的真实需求</li><li>找到最值得 AI 化的场景</li><li>讨论具体怎么实现</li><li>确定下一步行动</li></ol>';
      h += '<h3>你会带走一张《AI行动建议卡》</h3><ul class="v2-card-list"><li>核心 AI 机会（3 项以内）</li><li>优先做的 1 个项目</li><li>初步实现思路及工具方向</li><li>下一步行动建议</li></ul>';
      if (questions && questions.length) h += "<h3>会诊时可以先确认</h3><ul class=\"v2-card-list\">" + questions.map(function (q) { return "<li>" + esc(q) + "</li>"; }).join("") + "</ul>";
      h += '<p class="note">说明：免费45分钟用来理清方向和方案，不承诺在会诊中完成开发或搭建。</p>';
      if (has) {
        h += '<button type="button" class="btn btn-primary btn-lg" data-act="v2Contact">添加' + esc(c.name) + "微信，预约免费45分钟会诊</button>";
        if (c.wx) h += '<p class="v2-wx">微信号：<b>' + esc(c.wx) + '</b> <button type="button" class="btn-link" data-act="v2CopyWx">复制微信号</button></p>';
        h += '<p class="note">添加时请备注「' + esc(c.remark) + "」" + (c.note ? "。" + esc(c.note) : "") + "</p>";
      } else h += '<p class="v2-pending" role="note">联系方式待配置，请稍后再来看看。</p>';
      h += '<div class="v2-booktext"><p>' + esc(bookingText(code)) + '</p><button type="button" class="btn btn-ghost" data-act="v2CopyBook" data-code="' + esc(code || "") + '">复制预约说明</button><p class="note" id="v2CopyMsg" aria-live="polite"></p></div></section>';
      return h;
    }
    function qrModal() {
      var c = consultCfg();
      if (!c.wx && !c.qr) return "";
      var h = '<div class="v2-modal" id="v2Modal" hidden role="dialog" aria-modal="true" aria-labelledby="mT"><div class="v2-modal-box"><h3 id="mT">添加' + esc(c.name) + "微信</h3>";
      if (c.qr) h += '<img src="' + esc(c.qr) + '" alt="' + esc(c.name) + '的微信二维码" class="v2-qr"><p class="note">长按图片可保存或识别二维码</p><a class="btn-link" href="' + esc(c.qr) + '" download="翔叔微信二维码" data-act="v2SaveQr">保存二维码</a>';
      if (c.wx) h += '<p class="v2-wx">微信号：<b>' + esc(c.wx) + '</b></p><button type="button" class="btn btn-primary" data-act="v2CopyWx">一键复制微信号</button>';
      h += '<p class="note">添加时请备注「' + esc(c.remark) + '」</p><button type="button" class="btn btn-ghost" data-act="v2CloseModal">关闭</button></div></div>';
      return h;
    }

    V.consult = function () {
      var rec = S().rec;
      var r = rec && reportOf(rec);
      var cur = r && isV3(r) ? (oppById(r, r.active_scenario_id) || r.top_opportunities[0]) : null;
      return api.brandBar() + '<main class="wrap report v2">' + consultHtml(rec && rec.code, cur && cur.consult_questions) + '<div class="r-actions"><button type="button" class="btn btn-ghost" data-act="home">回到首页</button></div></main>' + qrModal();
    };

    function next() {
      if (!canNext()) return;
      var s = S();
      if (s.qi < steps().length - 1) { s.qi++; api.go("q"); return; }
      afterQuestions();
    }
    function back() {
      var s = S();
      if (s.view === "fu") { s.qi = steps().length - 1; api.go("q"); return; }
      if (s.qi > 0) { s.qi--; api.go("q"); } else api.home();
    }
    function afterQuestions() {
      var s = S();
      s.a = E.normalizeAnswer(s.a);
      if (!String(CFG.AI_ENDPOINT || "").trim()) return generate();
      s.genMsg = "先看看还缺不缺一个关键事实…"; api.go("v2gen");
      postJSON("/followup", { answers: anon(s.a) }, 8000).then(function (j) {
        var q = E.validateFollowUp(j);
        if (S().view !== "v2gen") return;
        if (q) { S().fuQ = q; api.go("fu"); } else generate();
      }, function () { if (S().view === "v2gen") generate(); });
    }
    function generate() {
      var s = S(); s.a = E.normalizeAnswer(s.a); s.genMsg = "正在理解你的回答，再评估值得试的场景…"; api.go("v2gen");
      var x = s.a;
      var ms = CFG.AI_TIMEOUT_MS && CFG.AI_TIMEOUT_MS >= 52000 ? CFG.AI_TIMEOUT_MS : 52000;
      var p = String(CFG.AI_ENDPOINT || "").trim() ? postJSON("/report", { answers: anon(x) }, ms) : Promise.reject(new Error("no endpoint"));
      p.then(function (j) { return E.validateReport(j, x); }, function () { return E.localReport(x); })
        .then(function (rep) { save(x, rep); }, function () { save(x, E.localReport(x)); });
    }
    function save(x, rep) {
      x = E.normalizeAnswer(x);
      var primary = (rep.top_opportunities && rep.top_opportunities[0]) || (rep.opps && rep.opps[0]) || {};
      var rec = { v: rep.analysis_version === "v0.3" ? 3 : 2, id: "r" + Date.now().toString(36), code: newCode(), t: Date.now(), a: x, report: rep, microByScenario: {},
        meta: { identity: E.statusText(x), goals: (x.goals || []).map(function (v) { return E.label(D.GOALS, v); }), scenes: (x.scenes || []).map(function (id) { var sc = E.scene(id); return sc ? sc.name : ""; }).filter(Boolean),
          pains: (x.pains || []).map(function (v) { return E.label(D.PAINS, v); }), custom: x.custom || "",
          aiScenes: (rep.top_opportunities || rep.opps || []).map(function (o) { return o.title || o.name; }), primary: primary.title || primary.name || "", source: rep.source, analysis_version: rep.analysis_version || "" },
        consult: { intent: false, booked: null, paid: null, note: "" } };
      rec.summary = "建议先看：" + (rec.meta.primary || "先不硬推场景") + " · 编号 " + rec.code;
      var ok = api.saveReport(rec);
      api.clearProg();
      TRACK("test_complete", { code: rec.code, source: rep.source });
      api.openRec(rec, ok);
    }

    var DIR_T = { "减负": "C", "增能": "B", "创造": "A" };
    var DEMO_TXT = {
      table: ["你：帮我比较 3 款扫地机器人", "AI（演示）：甲款价格较低；乙款适中；丙款较安静。需要你核实。"],
      plan: ["你：用一个月学做 PPT", "AI（演示）：四周各做一个很小的练习。"],
      draft: ["你：写一条新品朋友圈", "AI（演示）：一条很短的初稿，供你改口吻。"],
      reply: ["你：客户问什么时候到", "AI（演示）：一条待你核对发货时间的回复。"]
    };
    function imgBlocks(rec) {
      var r = reportOf(rec), C = root.Sheet.colors, c = consultCfg(), nick = api.nickname ? api.nickname() : "";
      var opps = isV3(r) ? r.top_opportunities : (r.opps || []);
      var cur = isV3(r) ? (oppById(r, r.active_scenario_id) || opps[0]) : null;
      var b = [{ t: "brand", text: "AI场景诊断 · 报告", right: U.fmtDate(rec.t) }, { t: "gap", h: 26 },
        { t: "p", text: "报告编号 " + rec.code + (nick ? "　·　" + nick + " 的报告" : ""), size: 15, color: C.red }, { t: "gap", h: 10 },
        { t: "title", text: r.insight || "", size: 27 }, { t: "gap", h: 8 }];
      if (r.source !== "ai") b.push({ t: "p", text: isV3(r) ? "基础初诊：规则库简化结果。" : "本报告由本地规则生成（简化版）。", size: 14, color: C.muted });
      b.push({ t: "gap", h: 22 }, { t: "h", text: opps.length ? "值得先看的场景" : "这次没有足够把握的场景" }, { t: "gap", h: 12 });
      opps.forEach(function (o, i) {
        var title = o.title || o.name, dir = o.category || o.dir, rank = o.rank || (i + 1);
        var ls = [["为什么排这里　", o.priority_reason || o.why || ""], ["AI 帮你做　", o.ai || ""], ["你负责　　　", o.you || ""]], marks = [];
        if ((o.scenario_id && o.scenario_id === r.recommended_scenario_id) || (!isV3(r) && i === 0)) marks.push("建议先做");
        if (o.source === "discover") marks.push("你可能还没想到");
        if (marks.length) ls.unshift(["", "【" + marks.join(" · ") + "】"]);
        b.push({ t: "card", rank: rank, title: title, tag: dir, type: DIR_T[dir] || "B", lines: ls }, { t: "gap", h: 12 });
      });
      if (r.sensitive) b.push({ t: "box", lines: ["涉及健康、法律、财务或隐私的内容，AI 只负责整理和出草稿，结论请由你或专业人士把关。"] }, { t: "gap", h: 12 });
      var flow = cur ? { title: cur.title, before: cur.before, after: cur.after, note: cur.flow_note } : (r.flow || {});
      if (flow.before && flow.before.length) {
        b.push({ t: "gap", h: 12 }, { t: "h", text: "当前场景：" + (flow.title || "") }, { t: "gap", h: 12 }, { t: "flow", before: flow.before, after: flow.after },
          { t: "gap", h: 8 }, { t: "p", text: flow.note || "这是初步对照，需结合实际情况核实。", size: 14, color: C.muted }, { t: "gap", h: 24 });
      }
      if (isV3(r) && cur) {
        var slot = rec.microByScenario && rec.microByScenario[cur.scenario_id];
        var sample = (E.scene(cur.scenario_id) || {}).sample;
        if (slot && slot.status === "ok" && slot.result && slot.result.scenario_id === cur.scenario_id) {
          b.push({ t: "h", text: "微体验结果" }, { t: "gap", h: 10 }, { t: "box", title: slot.result.artifact_title || "这一小步", lines: [slot.result.artifact, "下一步：" + slot.result.next_step], bg: C.greenBg }, { t: "gap", h: 24 });
        } else if (sample) b.push({ t: "h", text: "微体验示例" }, { t: "gap", h: 10 }, { t: "box", title: "示例，不是你的实时结果", lines: ["输入：" + sample.input, sample.output], bg: C.greenBg }, { t: "gap", h: 24 });
      } else {
        var dm = DEMO_TXT[(r.demo && r.demo.type) || "plan"] || DEMO_TXT.plan;
        b.push({ t: "h", text: "AI 微体验【演示】" }, { t: "gap", h: 10 }, { t: "box", title: "模拟演示，不是实时结果", lines: dm, bg: C.greenBg }, { t: "gap", h: 24 });
      }
      b.push({ t: "h", text: "免费45分钟，把机会落到实处" }, { t: "gap", h: 10 },
        { t: "p", text: "免费45分钟微信会诊，和" + c.name + "一起厘清先做哪一件、怎么做。", size: 16 }, { t: "gap", h: 10 },
        { t: "box", title: "你会带走一张《AI行动建议卡》", lines: ["核心 AI 机会（3 项以内）· 优先做的 1 个项目", "初步实现思路及工具方向 · 下一步行动建议"], bg: C.goldBg }, { t: "gap", h: 10 },
        { t: "p", text: "说明：免费45分钟用来理清方向，不承诺在会诊里完成开发。", size: 14, color: C.muted }, { t: "gap", h: 14 });
      if (c.wx) b.push({ t: "quote", text: "添加" + c.name + "微信：" + c.wx + "\n备注「" + c.remark + "」，报告编号 " + rec.code });
      else b.push({ t: "quote", text: "预约时请告诉" + c.name + "你的报告编号：" + rec.code });
      b.push({ t: "gap", h: 18 }, { t: "foot", text: "AI场景诊断 · " + (CFG.SITE_URL || "") });
      return b;
    }
    A.v2SaveImg = function () {
      if (S().imgBusy) return;
      var rec = S().rec, btns = document.querySelectorAll('[data-act="v2SaveImg"]'), msg = document.getElementById("v2ImgMsg");
      function busy(on) { S().imgBusy = on; for (var i = 0; i < btns.length; i++) { btns[i].disabled = on; btns[i].textContent = on ? "正在生成长图…" : (btns[i].classList.contains("btn-link") ? "保存报告长图 ↓" : "保存报告长图"); } }
      busy(true); if (msg) msg.textContent = "正在生成长图，请稍等…";
      setTimeout(function () {
        var p;
        try { p = root.Sheet.save(root.Sheet.render(imgBlocks(rec), { scale: 2 }), "AI场景诊断报告-" + rec.code, "AI场景诊断报告", { mime: "image/jpeg", quality: 0.9 }); }
        catch (e) { p = Promise.resolve("fail"); }
        p.then(function (mode) {
          busy(false);
          TRACK("report_save_image", { code: rec.code, mode: mode });
          if (msg) msg.textContent = mode === "download" ? "长图已开始下载，可在手机相册或「下载」里找到。" : mode === "preview" ? "已生成，长按图片保存。" : "生成失败了，可以直接截屏保存。";
          if (mode === "fail") api.flash("生成长图失败，可以直接截屏保存");
        });
      }, 60);
    };

    function copy(text, okMsg) { return U.copyText(text).then(function (ok) { api.flash(ok ? okMsg : "这台设备不让自动复制，请长按文字手动复制"); return ok; }); }
    function failMicro(id, input) {
      var rec = S().rec;
      rec.microByScenario = rec.microByScenario || {};
      rec.microByScenario[id] = { status: "err", input: input, message: "这次没有生成成功，可以重试。不会用别的场景的结果来顶替。" };
      if (api.persistRec) api.persistRec();
      var active = rec.report && (rec.report.active_scenario_id || rec.report.recommended_scenario_id);
      if (active === id) api.rerender();
    }

    A.v2Status = function (el) { a().status = el.getAttribute("data-v"); api.save(); api.rerender(); };
    A.v2Goal = function (el) { if (toggle("goals", el.getAttribute("data-v"), D.MAX_GOALS, D.GOALS)) { api.save(); api.rerender(); } };
    A.v2Scene = function (el) {
      if (!toggle("scenes", el.getAttribute("data-v"), D.MAX_SCENES, D.SCENES, "id")) return;
      var allowed = E.painsFor(a().scenes).map(function (p) { return p.v; });
      a().pains = E.normalizeAnswer({ pains: (a().pains || []).filter(function (p) { return allowed.indexOf(p) >= 0; }) }).pains;
      a().painTop = "";
      api.save(); api.rerender();
    };
    A.v2Pain = function (el) { if (toggle("pains", el.getAttribute("data-v"), 0, D.PAINS)) { a().painTop = ""; api.save(); api.rerender(); } };
    A.v2Freq = function (el) { a().freq = el.getAttribute("data-v"); api.save(); api.rerender(); };
    A.v2Impact = function (el) { a().impact = el.getAttribute("data-v"); api.save(); api.rerender(); };
    A.v2Month = function (el) { a().month = el.getAttribute("data-v"); if (a().month !== "other") a().monthOther = ""; api.save(); api.rerender(); };
    A.v2Next = next; A.v2Back = back;
    A.v2Fu = function (el) { var q = S().fuQ; a().followUp = { title: q.title, answer: el.getAttribute("data-v") }; generate(); };
    A.v2FuSkip = function () { a().followUp = null; generate(); };
    A.v2PickScenario = function (el) {
      var id = el.getAttribute("data-scenario");
      var rec = S().rec;
      if (!rec || !rec.report) return;
      var nextRep = E.setActiveScenario(rec.report, id);
      if (!nextRep || nextRep.active_scenario_id === rec.report.active_scenario_id) return;
      rec.report = nextRep;
      if (api.persistRec) api.persistRec();
      api.rerender();
      var box = document.getElementById("flowBox");
      if (box && box.scrollIntoView) box.scrollIntoView({ block: "nearest" });
    };
    A.v2Micro = function () {
      var rec = S().rec, r = reportOf(rec);
      if (!isV3(r)) return;
      var cur = oppById(r, r.active_scenario_id) || oppById(r, r.recommended_scenario_id);
      if (!cur) return;
      var id = cur.scenario_id;
      var box = document.querySelector('#microBox[data-scenario="' + id + '"] textarea');
      var text = box ? String(box.value || "").trim() : ((rec.microByScenario && rec.microByScenario[id] && rec.microByScenario[id].input) || "");
      rec.microByScenario = rec.microByScenario || {};
      if (text.length < 2) { rec.microByScenario[id] = { status: "err", input: text, message: "先写一两句这个场景里的真实材料。" }; if (api.persistRec) api.persistRec(); api.rerender(); return; }
      if (!String(CFG.AI_ENDPOINT || "").trim()) { rec.microByScenario[id] = { status: "err", input: text, message: "现在连不上诊断服务，不能生成实时结果。下面的示例不是你的结果。" }; if (api.persistRec) api.persistRec(); api.rerender(); return; }
      var seq = (microSeq[id] || 0) + 1; microSeq[id] = seq;
      rec.microByScenario[id] = { status: "loading", input: text };
      if (api.persistRec) api.persistRec();
      api.rerender();
      postJSON("/micro", { scenario_id: id, title: cur.title || cur.name, category: cur.category || cur.dir, task: cur.micro && cur.micro.task, user_input: text }, 22000).then(function (j) {
        if (microSeq[id] !== seq) return;
        if (!j || j.error || (j.scenario_id && j.scenario_id !== id)) return failMicro(id, text);
        var v = E.validateMicro(j, id);
        if (!v) return failMicro(id, text);
        rec.microByScenario[id] = { status: "ok", input: text, result: v };
        if (api.persistRec) api.persistRec();
        var active = rec.report && rec.report.active_scenario_id;
        if (active === id) api.rerender();
      }, function () { if (microSeq[id] === seq) failMicro(id, text); });
    };
    A.v2Contact = function () {
      var m = document.getElementById("v2Modal"); if (m) { m.hidden = false; document.body.classList.add("no-scroll"); }
      TRACK("contact_qr_open", { code: S().rec && S().rec.code }); api.markIntent();
    };
    A.v2CloseModal = function () { var m = document.getElementById("v2Modal"); if (m) m.hidden = true; document.body.classList.remove("no-scroll"); };
    A.v2CopyWx = function () { copy(consultCfg().wx, "微信号已复制，打开微信添加好友，备注「" + consultCfg().remark + "」"); TRACK("contact_copy_wechat", { code: S().rec && S().rec.code }); api.markIntent(); };
    A.v2SaveQr = function () { TRACK("contact_save_qr", { code: S().rec && S().rec.code }); api.markIntent(); return true; };
    A.v2CopyBook = function (el) {
      var code = el.getAttribute("data-code");
      U.copyText(bookingText(code)).then(function (ok) { var m = document.getElementById("v2CopyMsg"); if (m) m.textContent = ok ? "已复制，添加微信后粘贴发送就行。" : "这台设备不让自动复制，请长按上面的文字手动复制。"; });
      TRACK("contact_copy_booking", { code: code }); api.markIntent();
    };

    function onInput(e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute("data-micro-input") && S().rec && S().rec.report) {
        var id = S().rec.report.active_scenario_id;
        S().rec.microByScenario = S().rec.microByScenario || {};
        var slot = S().rec.microByScenario[id] || { status: "idle" };
        slot.input = String(t.value || "").slice(0, 800);
        S().rec.microByScenario[id] = slot;
        return true;
      }
      var k = t && t.getAttribute && t.getAttribute("data-in"); if (!k || !S().a) return false;
      a()[k] = String(t.value || "").slice(0, k === "custom" ? D.Q6_MAX : 60);
      api.save();
      var btn = document.querySelector('[data-act="v2Next"]');
      if (btn) { btn.disabled = !canNext(); if (k === "custom") btn.textContent = a().custom.trim() ? "下一步" : "跳过，下一步"; }
      return true;
    }

    return { views: V, actions: A, onInput: onInput, imgBlocks: imgBlocks, reportOf: reportOf, consultHtml: consultHtml, bookingText: bookingText };
  };
})(window);
