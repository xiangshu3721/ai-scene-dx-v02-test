/*!
 * app.js · 用户端（P1 首页 → P2 画像 → P3 扫描 → P4 追问 → P5 报告 → P6 预约）
 */
(function () {
  "use strict";
  var D = window.ASDX_DATA, E = window.ASDX_ENGINE, U = window.ASDX_COMMON, CFG = window.ASDX_CONFIG || {};
  var esc = U.esc, store = U.store;
  var app = document.getElementById("app");
  var K = { prog: "asdx.progress.v2", reports: "asdx.reports.v1", bookings: "asdx.bookings.v1", queue: "asdx.queue.v1", contact: "asdx.contact.v1" };
  var ADV = CFG.ADVISOR_NAME || "翔叔";
  var S = fresh();
  var advanceTimer = null;

  function fresh() { return { view: "home", profile: { goals: [] }, pi: 0, answers: {}, si: 0, followQs: null, fu: {}, fi: 0 }; }
  function saveProg() { var keep = ["profile", "scanIntro", "scan", "follow", "q", "fu"]; if (keep.indexOf(S.view) >= 0) store.set(K.prog, S); }
  function idt() { return E.identityOf(S.profile); }
  function scenes() { return E.scenesFor(idt()); }
  function stars(n) { var s = ""; for (var i = 0; i < 5; i++) s += i < n ? "★" : "☆"; return s; }
  function reports() { var r = store.get(K.reports, []); return Array.isArray(r) ? r.filter(function (x) { return x && x.id && ((x.v === 2 || x.v === 3) ? !!x.a : (x.profile && x.answers)); }) : []; }

  /* ---------- 渲染入口 ---------- */
  function go(view) { S.view = view; saveProg(); render(); }
  function render() {
    clearTimeout(advanceTimer);
    var fn = VIEWS[S.view] || VIEWS.home;
    app.innerHTML = fn();
    app.setAttribute("data-view", S.view);
    window.scrollTo(0, 0);
    var h = app.querySelector("[data-focus]");
    if (h) { h.setAttribute("tabindex", "-1"); try { h.focus({ preventScroll: true }); } catch (e) {} }
    if (S.view === "follow" && !S.followQs) loadFollowUps();
  }

  function brandBar(right) {
    return '<header class="topbar"><button type="button" class="brand" data-act="home" aria-label="回到首页"><span class="seal" aria-hidden="true">诊</span><span>AI场景诊断</span></button>' + (right || "") + "</header>";
  }

  function progress() {
    var n = scenes().length, fq = S.followQs ? S.followQs.length : 4;
    var total = D.PROFILE.length + n + fq, done = 0;
    if (S.view === "profile") done = S.pi;
    else if (S.view === "scanIntro") done = D.PROFILE.length;
    else if (S.view === "scan") done = D.PROFILE.length + S.si;
    else if (S.view === "follow") done = D.PROFILE.length + n + S.fi;
    var pct = Math.round(done / total * 100);
    return '<div class="progress" role="progressbar" aria-label="整体进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>';
  }

  var VIEWS = {};
  var TRACK = window.ASDX_TRACK || function () {};

  /* ---------- V0.2：问卷、报告、会诊（见 v2-ui.js） ---------- */
  function openRec(rec, ok) {
    S = fresh(); S.rec = rec; if (ok != null) S.saveOk = ok;
    TRACK("report_view", { code: rec.code || rec.id, v: rec.v || 1 });
    go(rec.v === 2 || rec.v === 3 ? "report2" : "report");
  }
  var V2 = window.ASDX_V2_UI({
    state: function () { return S; },
    go: go, rerender: function () { var y = window.scrollY; render(); window.scrollTo(0, y); },
    save: saveProg, brandBar: function (r) { return brandBar(r); }, flash: function (m) { flash(m); },
    home: function () { S = fresh(); render(); },
    clearProg: function () { store.del(K.prog); },
    saveReport: function (rec) { return store.set(K.reports, [rec].concat(reports()).slice(0, 20)); },
    persistRec: function () {
      if (!S.rec || !S.rec.id) return false;
      var l = store.get(K.reports, []); if (!Array.isArray(l)) l = [];
      var found = false;
      l = l.map(function (r) { if (r && r.id === S.rec.id) { found = true; return S.rec; } return r; });
      if (!found) l = [S.rec].concat(l);
      return store.set(K.reports, l.slice(0, 20));
    },
    openRec: openRec,
    nickname: function () { var c = store.get(K.contact, {}) || {}; return String(c.name || "").trim().slice(0, 20); },
    markIntent: function () { // 点联系方式 = 意向（不等于预约）
      if (!S.rec || !S.rec.id) return;
      var l = store.get(K.reports, []); if (!Array.isArray(l)) return;
      S.rec.consult = S.rec.consult || {}; S.rec.consult.intent = true; S.rec.consult.intentAt = S.rec.consult.intentAt || Date.now();
      l.forEach(function (r) { if (r && r.id === S.rec.id) r.consult = S.rec.consult; });
      store.set(K.reports, l);
    }
  });
  Object.keys(V2.views).forEach(function (k) { VIEWS[k] = V2.views[k]; });

  /* ---------- P1 首页 ---------- */
  VIEWS.home = function () {
    var prog = store.get(K.prog, null);
    var resumable = prog && prog.view && prog.view !== "home" && prog.profile;
    var hist = reports().sort(function (a, b) { return b.t - a.t; });
    var h = brandBar();
    h += '<main class="wrap home">';
    h += '<section class="hero"><p class="kicker">AI 场景初诊 · 约 10 分钟</p>';
    h += '<h1 data-focus>你的生活和工作里，<br>到底有哪些事情<br>应该交给AI？</h1>';
    h += '<p class="lead">用10分钟扫描你的工作、生活和业务，找到最值得AI化的场景。</p>';
    h += '<div class="hero-actions"><button type="button" class="btn btn-primary btn-lg" data-act="start">开始AI场景扫描</button>';
    if (resumable) h += '<button type="button" class="btn btn-ghost" data-act="resume">继续上次没做完的</button>';
    h += '</div><p class="note">不测 AI 水平，也不打分排名。<br>只帮你找出最值得先做的 3～5 件事。</p></section>';
    h += '<section class="path" aria-label="诊断路径"><ol>' +
      '<li><b>测</b><span>约3～5分钟，发现你的AI机会</span></li>' +
      '<li><b>聊</b><span>免费45分钟，和' + esc(ADV) + '一起厘清AI落地路径</span></li>' +
      '<li><b>定</b><span>选出第一个 AI 项目</span></li>' +
      '<li><b>做</b><span>21 天把它真正做出来</span></li></ol></section>';
    h += '<section class="history" aria-labelledby="histT"><h2 id="histT">我的报告</h2>';
    if (!hist.length) h += '<p class="empty">还没有报告。做完扫描后，报告会保存在这台手机上，随时回来看。</p>';
    else {
      h += '<ul class="hist-list">';
      hist.slice(0, 10).forEach(function (r) {
        h += '<li><button type="button" class="hist-item" data-act="openReport" data-id="' + esc(r.id) + '"><span class="hist-t">' + esc(U.fmtTime(r.t)) + '</span><span class="hist-s">' + esc(r.summary || "") + '</span></button>' +
          '<button type="button" class="hist-del" data-act="delReport" data-id="' + esc(r.id) + '" aria-label="删除这份报告">删除</button></li>';
      });
      h += "</ul>";
      h += '<p class="v2-homeconsult"><button type="button" class="btn-link" data-act="consult">想把报告里的 AI 机会真正落地？预约免费 45 分钟会诊 →</button></p>';
    }
    h += "</section></main>";
    h += '<footer class="foot">' + (String(CFG.AI_ENDPOINT || "").trim() ? "作答只保存在你自己的设备上 · 生成报告时会把匿名作答发给 AI 分析" : "作答只保存在你自己的设备上 · 不调用任何 AI 模型") + '</footer>';
    return h;
  };

  /* ---------- P2 基础画像 ---------- */
  VIEWS.profile = function () {
    var q = D.PROFILE[S.pi], val = S.profile[q.id];
    var h = brandBar('<span class="step-label">基础画像 ' + (S.pi + 1) + " / " + D.PROFILE.length + "</span>") + progress();
    h += '<main class="wrap q-screen"><p class="q-no">' + q.no + '</p><h2 class="q-title" data-focus id="qT">' + esc(q.title) + "</h2>";
    if (q.sub) h += '<p class="q-sub">' + esc(q.sub) + "</p>";
    var multi = q.type === "multi";
    h += '<div class="opts' + (multi ? " opts-grid" : "") + '" role="' + (multi ? "group" : "radiogroup") + '" aria-labelledby="qT">';
    q.options.forEach(function (o) {
      var on = multi ? (val || []).indexOf(o.v) >= 0 : val === o.v;
      h += '<button type="button" class="opt' + (on ? " on" : "") + '" role="' + (multi ? "checkbox" : "radio") + '" aria-checked="' + on + '" data-act="pick" data-v="' + esc(JSON.stringify(o.v)) + '">' +
        '<span>' + esc(o.label) + "</span>" + (o.hint ? '<small>' + esc(o.hint) + "</small>" : "") + "</button>";
    });
    h += "</div>";
    if (multi) {
      var cnt = (val || []).length;
      h += '<p class="q-count" aria-live="polite">已选 ' + cnt + " / " + q.max + "</p>";
      h += '<div class="q-next"><button type="button" class="btn btn-primary" data-act="profileNext"' + (cnt ? "" : " disabled") + ">下一步</button></div>";
    }
    h += navBack(S.pi > 0 || true);
    h += "</main>";
    return h;
  };
  function navBack(show) {
    return show ? '<nav class="q-nav"><button type="button" class="btn-link" data-act="back">← 上一题</button></nav>' : "";
  }

  VIEWS.scanIntro = function () {
    var id = idt(), n = scenes().length;
    var h = brandBar() + progress();
    h += '<main class="wrap center-screen"><p class="kicker">第二步 · 场景扫描</p>';
    h += '<h2 class="big" data-focus>接下来是 ' + n + ' 个<br>你生活和工作里的真实场景</h2>';
    h += '<p class="lead">按你作为「' + esc(D.IDENTITY[id].name) + '」的情况出题。<br>每题只选两样：<b>多久遇到一次</b>、<b>做起来感觉如何</b>。<br>凭直觉选就好，选完自动下一题。</p>';
    h += '<div class="domains" aria-hidden="true">' + Object.keys(D.DOMAINS).map(function (k) { return "<span>" + D.DOMAINS[k].name + "</span>"; }).join("") + "</div>";
    h += '<button type="button" class="btn btn-primary btn-lg" data-act="scanStart">开始扫描</button>';
    h += navBack(true) + "</main>";
    return h;
  };

  /* ---------- P3 场景扫描 ---------- */
  VIEWS.scan = function () {
    var list = scenes(), s = list[S.si], a = S.answers[s.id] || {};
    var h = brandBar('<span class="step-label">场景 ' + (S.si + 1) + " / " + list.length + "</span>") + progress();
    h += '<main class="wrap q-screen scan"><p class="q-domain"><span>' + esc(D.DOMAINS[s.d].full) + "</span></p>";
    h += '<h2 class="q-title scene-text" data-focus id="sT">' + esc(s.text) + "</h2>";
    h += '<div class="dim"><p class="dim-t" id="fT">多久遇到一次？</p><div class="chips" role="radiogroup" aria-labelledby="fT">';
    D.FREQ.forEach(function (o) {
      var on = a.f === o.v;
      h += '<button type="button" class="chip' + (on ? " on" : "") + '" role="radio" aria-checked="' + on + '" data-act="freq" data-v="' + o.v + '">' + esc(o.label) + "</button>";
    });
    h += '</div></div><div class="dim' + (a.f === 0 ? " dim-off" : "") + '"><p class="dim-t" id="pT">做起来感觉如何？</p><div class="chips" role="radiogroup" aria-labelledby="pT">';
    D.FEEL.forEach(function (o) {
      var on = a.f !== 0 && a.p === o.v;
      h += '<button type="button" class="chip' + (on ? " on" : "") + '" role="radio" aria-checked="' + on + '" data-act="feel" data-v="' + o.v + '"' + (a.f === 0 ? ' disabled' : "") + ">" + esc(o.label) + "</button>";
    });
    h += "</div></div>";
    if (a.f != null && (a.f === 0 || a.p != null)) h += '<div class="q-next"><button type="button" class="btn btn-ghost" data-act="scanNext">下一题</button></div>';
    h += navBack(true) + "</main>";
    return h;
  };

  /* ---------- P4 追问 ---------- */
  VIEWS.follow = function () {
    if (!S.followQs) {
      return brandBar() + progress() + '<main class="wrap center-screen"><div class="loader" role="status" aria-live="polite"><i></i><p>正在根据你的回答，准备几个追问…</p></div></main>';
    }
    var q = S.followQs[S.fi], val = S.fu[q.id];
    var h = brandBar('<span class="step-label">补充细节 ' + (S.fi + 1) + " / " + S.followQs.length + "</span>") + progress();
    h += '<main class="wrap q-screen"><p class="q-no">再确认几个细节，报告会更准</p><h2 class="q-title" data-focus id="qT">' + esc(q.title) + "</h2>";
    h += '<div class="opts" role="radiogroup" aria-labelledby="qT">';
    q.options.forEach(function (o) {
      var on = val === o.v;
      h += '<button type="button" class="opt' + (on ? " on" : "") + '" role="radio" aria-checked="' + on + '" data-act="fuPick" data-v="' + o.v + '"><span>' + esc(o.label) + "</span></button>";
    });
    h += "</div>" + navBack(true) + "</main>";
    return h;
  };

  function loadFollowUps() {
    var ctx = { profile: S.profile, answers: S.answers }; // 只含匿名作答
    var p;
    try { p = window.QuestionProvider.getFollowUps(ctx); } catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).then(function (qs) { return qs; }, function () { return E.ruleFollowUps(S.profile, S.answers); })
      .then(function (qs) {
        if (S.view !== "follow") return;
        S.followQs = Array.isArray(qs) ? qs : [];
        S.fi = 0;
        if (!S.followQs.length) return finish();
        saveProg(); render();
      });
  }

  /* ---------- 生成报告 ---------- */
  function finish() {
    S.view = "generating";
    render();
    setTimeout(function () {
      var rec = { id: "r" + Date.now().toString(36), t: Date.now(), profile: S.profile, answers: S.answers, followQs: S.followQs || [], fu: S.fu };
      var rep = E.computeReport(rec.profile, rec.answers, rec.followQs, rec.fu);
      rec.summary = rep.n ? "发现 " + rep.n + " 个场景" + (rep.top5[0] ? " · 首选：" + rep.top5[0].name : "") : "暂未发现明显场景";
      var list = [rec].concat(reports()).slice(0, 20);
      var ok = store.set(K.reports, list);
      store.del(K.prog);
      S = fresh(); S.rec = rec; S.saveOk = ok; S.view = "report";
      render();
    }, 700);
  }
  VIEWS.generating = function () {
    return brandBar() + '<main class="wrap center-screen"><div class="loader" role="status" aria-live="polite"><i></i><p>正在整理你的 AI 场景初诊报告…</p></div></main>';
  };

  /* ---------- P5 报告 ---------- */
  function hoursText(r) {
    var t = r.hours < 1 ? "每周不到 1 小时" : "每周约 " + r.hours + " 小时";
    return t + (r.hoursSource === "est" ? "（估算）" : "");
  }
  function curRep() { var r = S.rec; return E.computeReport(r.profile, r.answers, r.followQs, r.fu); }

  VIEWS.report = function () {
    if (!S.rec) return VIEWS.home();
    var rep = curRep(), rec = S.rec;
    S.rep = rep;
    var mat = U.maturityOf(rep.maturity);
    var h = brandBar('<span class="step-label">' + esc(U.fmtDate(rec.t)) + "</span>");
    h += '<main class="wrap report" id="report">';
    // 第一屏
    h += '<section class="r-first"><p class="kicker">你的AI场景初诊报告</p>';
    if (!rep.n) {
      h += '<h1 class="r-h1" data-focus>这次没有发现特别需要 AI 的场景</h1>';
      h += '<p class="lead">你选的大多是「几乎没有」或「不麻烦」。这本身是好事：说明眼下的节奏还算顺。<br>如果你觉得哪里不对，可以换个角度重新测一次——比如按“最忙的一周”来答。</p>';
      h += '<div class="r-actions"><button type="button" class="btn btn-primary" data-act="restart">重新测试</button><button type="button" class="btn btn-ghost" data-act="home">回到首页</button></div></section></main>';
      return h;
    }
    h += '<h1 class="r-h1" data-focus>我们从你的生活和工作中，<br>共发现 <b class="num" data-k="n">' + rep.n + "</b> 个潜在AI场景</h1>";
    h += '<ul class="r-counts">' +
      '<li class="t-A"><b data-k="A">' + rep.counts.A + "</b><span>个值得立即尝试</span></li>" +
      '<li class="t-B"><b data-k="B">' + rep.counts.B + "</b><span>个适合AI辅助</span></li>" +
      '<li class="t-C"><b data-k="C">' + rep.counts.C + "</b><span>个值得建设工作流</span></li>" +
      '<li class="t-D"><b data-k="D">' + rep.counts.D + "</b><span>个暂时无需AI化</span></li></ul>";
    h += '<p class="r-hours">值得 AI 分担的事，每周大约占用你 <b data-k="hours">' + rep.totalHours + "</b> 小时。</p>";
    h += '<a class="r-down" href="#top5">往下看你的 TOP' + rep.top5.length + " ↓</a></section>";

    // TOP5
    h += '<section class="r-sec" id="top5" aria-labelledby="t5T"><h2 id="t5T">TOP' + rep.top5.length + ' AI机会</h2><p class="sec-sub">按 AI 机会指数排序。数字越靠前，越值得先动手。</p>';
    if (!rep.top5.length) h += '<p class="empty">你发现的场景都更适合坚持真人来做，这也是一种清醒。</p>';
    rep.top5.forEach(function (r) {
      var sc = E.sceneById(r.id);
      h += '<article class="opp t-' + r.type + '" data-id="' + r.id + '" data-score="' + r.score + '">' +
        '<header><span class="rank">' + r.rank + "</span><h3>" + esc(r.name) + '</h3><span class="tag">' + D.TYPES[r.type].name + "</span></header>" +
        '<dl><dt>当前状态</dt><dd>' + esc(D.FREQ[r.f].label + " · " + hoursText(r) + " · " + D.FEEL[r.p].label) + "</dd>" +
        "<dt>建议方案</dt><dd>" + esc(sc.sol) + "</dd></dl>" +
        '<div class="split"><div><b>AI 负责</b><p>' + esc(sc.ai.join(" → ")) + '</p></div><div><b>你负责</b><p>' + esc(sc.you.join(" → ")) + "</p></div></div>" +
        '<footer><span>潜在价值 <i class="stars" aria-label="' + E.stars(r.value) + ' 星">' + stars(E.stars(r.value)) + '</i></span><span>实现难度 <i class="stars s-diff" aria-label="' + E.stars(r.diff) + ' 星">' + stars(E.stars(r.diff)) + "</i></span></footer></article>";
    });
    h += "</section>";

    // 机会地图
    h += '<section class="r-sec" id="map" aria-labelledby="mapT"><h2 id="mapT">AI场景机会地图</h2><p class="sec-sub">横轴是 AI 实现难度，纵轴是价值。左上角是你最该先动手的地方。</p>';
    h += mapSvg(rep);
    h += mapLegend(rep);
    h += "</section>";

    // 成熟度
    h += '<section class="r-sec" id="maturity" aria-labelledby="matT"><h2 id="matT">当前AI成熟度</h2><ol class="mat" aria-label="AI成熟度 L0 到 L5">';
    D.MATURITY.forEach(function (m) {
      h += '<li class="' + (m.lv <= mat.lv ? "on" : "") + (m.lv === mat.lv ? " cur" : "") + '"' + (m.lv === mat.lv ? ' aria-current="step"' : "") + "><i></i><span>L" + m.lv + "</span><small>" + esc(m.name) + "</small></li>";
    });
    h += '</ol><p class="mat-tip"><b>L' + mat.lv + " · " + esc(mat.name) + "</b>　" + esc(mat.tip) + "</p></section>";

    // 坚持真人
    if (rep.keepHuman.length) {
      h += '<section class="r-sec" aria-labelledby="hmT"><h2 id="hmT">这些事，先别急着交给AI</h2><p class="sec-sub">不是所有事都该 AI 化。下面这些，保持现在的方式就很好。</p><ul class="keep">';
      rep.keepHuman.forEach(function (r) {
        h += "<li><b>" + esc(r.name) + "</b><span>" + (r.why === "human" ? "需要真人的信任和温度，AI 最多帮你事前理思路" : "出现得少、收益小，眼下不值得折腾") + "</span></li>";
      });
      h += "</ul></section>";
    }

    // 收尾
    h += '<section class="r-end"><blockquote>AI真正困难的不是“能不能做”，<br>而是“你到底应该先做哪一个”。</blockquote>';
    h += '<button type="button" class="btn btn-primary btn-lg" data-act="book">和' + esc(ADV) + "聊聊我的AI行动地图</button>";
    h += '<div class="r-actions"><button type="button" class="btn btn-ghost" data-act="saveReportImg">保存报告为图片</button><button type="button" class="btn btn-ghost" data-act="restart">重新测试</button></div>';
    h += '<p class="note">' + (S.saveOk === false ? "这台设备的浏览器不让存数据，报告关掉就没了，建议先存图。" : "报告已保存在这台设备上，回到首页的「我的报告」随时能看。") + "</p></section>";
    h += "</main>";
    return h;
  };

  /* 地图坐标（SVG 与测试共用同一公式） */
  var MAP = { W: 340, H: 290, x0: 36, y0: 8, w: 296, h: 250, pad: 14 };
  function mapPos(diff, value) {
    return { x: +(MAP.x0 + MAP.pad + (MAP.w - MAP.pad * 2) * diff / 100).toFixed(1), y: +(MAP.y0 + MAP.pad + (MAP.h - MAP.pad * 2) * (1 - value / 100)).toFixed(1) };
  }
  window.ASDX_MAP = { MAP: MAP, pos: mapPos };

  function mapSvg(rep) {
    var m = MAP, cx = m.x0 + m.w / 2, cy = m.y0 + m.h / 2;
    var s = '<figure class="map-fig"><svg class="map" viewBox="0 0 ' + m.W + " " + m.H + '" role="img" aria-labelledby="mapDesc"><desc id="mapDesc">AI场景机会地图，横轴为AI实现难度，纵轴为价值。具体分布见下方文字。</desc>';
    s += '<rect x="' + m.x0 + '" y="' + m.y0 + '" width="' + m.w + '" height="' + m.h + '" class="m-bg"/>';
    s += '<rect x="' + m.x0 + '" y="' + m.y0 + '" width="' + m.w / 2 + '" height="' + m.h / 2 + '" class="m-act"/>';
    s += '<line x1="' + cx + '" y1="' + m.y0 + '" x2="' + cx + '" y2="' + (m.y0 + m.h) + '" class="m-mid"/><line x1="' + m.x0 + '" y1="' + cy + '" x2="' + (m.x0 + m.w) + '" y2="' + cy + '" class="m-mid"/>';
    s += '<text x="' + (m.x0 + 8) + '" y="' + (m.y0 + 18) + '" class="m-q m-q-act">立即行动</text>';
    s += '<text x="' + (cx + 8) + '" y="' + (m.y0 + 18) + '" class="m-q">战略项目</text>';
    s += '<text x="' + (m.x0 + 8) + '" y="' + (m.y0 + m.h - 8) + '" class="m-q">快速自动化</text>';
    s += '<text x="' + (cx + 8) + '" y="' + (m.y0 + m.h - 8) + '" class="m-q m-q-later">暂不处理</text>';
    s += '<text x="' + cx + '" y="' + (m.H - 12) + '" class="m-axis" text-anchor="middle">AI 实现难度 →</text>';
    s += '<text x="14" y="' + cy + '" class="m-axis" text-anchor="middle" transform="rotate(-90 14 ' + cy + ')">价值 →</text>';
    var others = rep.items.filter(function (r) { return !r.rank; });
    others.forEach(function (r) {
      var p = mapPos(r.diff, r.value);
      s += '<circle class="pt pt-o t-' + r.type + '" cx="' + p.x + '" cy="' + p.y + '" r="5" data-id="' + r.id + '" data-value="' + r.value + '" data-diff="' + r.diff + '"><title>' + esc(r.name) + "</title></circle>";
    });
    rep.top5.slice().reverse().forEach(function (r) {
      var p = mapPos(r.diff, r.value);
      s += '<g class="pt pt-top t-' + r.type + '" data-id="' + r.id + '" data-value="' + r.value + '" data-diff="' + r.diff + '" data-cx="' + p.x + '" data-cy="' + p.y + '"><circle cx="' + p.x + '" cy="' + p.y + '" r="11"/><text x="' + p.x + '" y="' + (p.y + 4) + '" text-anchor="middle">' + r.rank + "</text><title>" + esc(r.name) + "</title></g>";
    });
    s += "</svg></figure>";
    return s;
  }
  function mapLegend(rep) {
    var groups = { act: [], strat: [], quick: [], later: [] };
    rep.items.forEach(function (r) { groups[r.quadrant].push(r); });
    var s = '<div class="map-legend">';
    ["act", "strat", "quick", "later"].forEach(function (q) {
      var g = groups[q];
      s += '<div class="lg lg-' + q + '" data-q="' + q + '"><b>' + D.QUADRANTS[q].name + "</b><small>" + D.QUADRANTS[q].desc + "</small><p>" +
        (g.length ? g.map(function (r) { return (r.rank ? '<em class="t-' + r.type + '">' + r.rank + "</em>" : "") + esc(r.name); }).join("、") : "—") + "</p></div>";
    });
    return s + "</div>";
  }

  function reportBlocks(rep, rec) {
    var mat = U.maturityOf(rep.maturity);
    var b = [
      { t: "brand", text: "AI场景诊断 · 初诊报告", right: U.fmtDate(rec.t) },
      { t: "gap", h: 26 },
      { t: "title", text: "你的AI场景初诊报告" },
      { t: "gap", h: 8 },
      { t: "p", text: "我们从你的生活和工作中，共发现 " + rep.n + " 个潜在AI场景", size: 19, color: Sheet.colors.soft },
      { t: "gap", h: 18 },
      { t: "counts", items: [
        { type: "A", n: rep.counts.A, label: "值得立即尝试" }, { type: "B", n: rep.counts.B, label: "适合AI辅助" },
        { type: "C", n: rep.counts.C, label: "值得建设工作流" }, { type: "D", n: rep.counts.D, label: "暂时无需AI化" }] },
      { t: "gap", h: 14 },
      { t: "p", text: "值得 AI 分担的事，每周大约占用你 " + rep.totalHours + " 小时。", color: Sheet.colors.soft },
      { t: "gap", h: 26 }
    ];
    if (rep.top5.length) {
      b.push({ t: "h", text: "TOP" + rep.top5.length + " AI机会" }, { t: "gap", h: 12 });
      rep.top5.forEach(function (r) {
        var sc = E.sceneById(r.id);
        b.push({ t: "card", rank: r.rank, title: r.name, tag: D.TYPES[r.type].name, type: r.type, lines: [
          ["当前状态　", D.FREQ[r.f].label + " · " + hoursText(r)],
          ["建议方案　", sc.sol],
          ["AI 负责　", sc.ai.join(" → ")],
          ["你负责　　", sc.you.join(" → ")]
        ], stars: [["潜在价值", E.stars(r.value)], ["实现难度", E.stars(r.diff), Sheet.colors.green]] }, { t: "gap", h: 12 });
      });
      b.push({ t: "gap", h: 12 });
    }
    b.push({ t: "h", text: "AI场景机会地图" }, { t: "gap", h: 6 });
    b.push({ t: "map", points: rep.items.map(function (r) { return { x: r.diff, y: r.value, rank: r.rank, type: r.type }; }) });
    var act = rep.items.filter(function (r) { return r.quadrant === "act"; }).map(function (r) { return r.name; });
    if (act.length) b.push({ t: "p", text: "立即行动区：" + act.join("、"), size: 16, color: Sheet.colors.soft });
    b.push({ t: "gap", h: 24 }, { t: "h", text: "当前AI成熟度" }, { t: "gap", h: 12 }, { t: "maturity", lv: mat.lv, name: mat.name, tip: mat.tip }, { t: "gap", h: 24 });
    if (rep.keepHuman.length) b.push({ t: "box", title: "先别急着交给AI", lines: [rep.keepHuman.map(function (r) { return r.name; }).join("、")], bg: Sheet.colors.grayBg }, { t: "gap", h: 24 });
    b.push({ t: "quote", text: "AI真正困难的不是“能不能做”，\n而是“你到底应该先做哪一个”。" }, { t: "gap", h: 18 });
    b.push({ t: "foot", text: "和" + ADV + "聊聊你的AI行动地图 · " + (CFG.SITE_URL || "") });
    return b;
  }

  /* ---------- P6 预约 ---------- */
  VIEWS.book = function () {
    var c = store.get(K.contact, {}) || {};
    var h = brandBar();
    h += '<main class="wrap book"><p class="kicker">1v1 真人诊断</p><h1 data-focus>45 分钟，和' + esc(ADV) + "一起<br>定下你的第一个 AI 项目</h1>";
    h += '<p class="lead">报告告诉你“哪些事可以交给 AI”。1v1 要解决的是：<b>你到底先做哪一个，怎么做成。</b></p>';
    h += '<ol class="flow">' + ["聊目标：你接下来半年最想改变什么", "过一遍你真实的一周", "找出 AI 摩擦点：哪些事又烦又重复", "锁定 TOP3 场景", "定义第一个 AI 项目，写成行动地图"].map(function (t, i) {
      return "<li><b>" + (i + 1) + "</b><span>" + t + "</span></li>"; }).join("") + "</ol>";
    h += '<div class="price"><p><b>免费</b> · 45 分钟真人诊断</p><p class="price-sub">不收费，也不用先报名什么。' + esc(ADV) + '亲自和你聊，帮你把第一个 AI 项目定下来。</p></div>';
    h += '<form class="form" id="bookForm" novalidate>';
    h += '<div class="field"><label for="fName">怎么称呼你 <em>*</em></label><input id="fName" name="name" autocomplete="nickname" maxlength="20" required value="' + esc(c.name || "") + '" placeholder="比如：王老师 / 小林"></div>';
    h += '<fieldset class="field"><legend>联系方式 <em>*</em><small>微信或手机，至少填一个</small></legend>';
    h += '<label class="sub-l" for="fWx">微信号</label><input id="fWx" name="wechat" maxlength="40" autocomplete="off" value="' + esc(c.wechat || "") + '" placeholder="微信号">';
    h += '<label class="sub-l" for="fPh">手机号</label><input id="fPh" name="phone" type="tel" inputmode="tel" maxlength="20" autocomplete="tel" value="' + esc(c.phone || "") + '" placeholder="手机号"></fieldset>';
    h += '<div class="field"><label for="fWant">最想先改变什么？<small>选填</small></label><textarea id="fWant" name="want" rows="3" maxlength="200" placeholder="比如：每周写周报太耗时间，想先解决它"></textarea></div>';
    h += '<p class="form-err" id="formErr" role="alert" aria-live="assertive"></p>';
    h += '<button type="submit" class="btn btn-primary btn-lg" id="bookBtn">提交预约</button>';
    h += '<p class="note">你的联系方式只用于' + esc(ADV) + '联系你，不会发给任何 AI 模型。</p></form>';
    h += '<nav class="q-nav"><button type="button" class="btn-link" data-act="backReport">← 回到报告</button></nav></main>';
    return h;
  };

  function submitBooking(form) {
    var err = document.getElementById("formErr");
    var name = form.name.value.trim(), wx = form.wechat.value.trim(), ph = form.phone.value.trim(), want = form.want.value.trim();
    err.textContent = "";
    [form.name, form.wechat, form.phone].forEach(function (el) { el.removeAttribute("aria-invalid"); });
    if (!name) { err.textContent = "请填一下怎么称呼你。"; form.name.setAttribute("aria-invalid", "true"); form.name.focus(); return; }
    if (!wx && !ph) { err.textContent = "微信或手机至少填一个，" + ADV + "才能联系到你。"; form.wechat.setAttribute("aria-invalid", "true"); form.wechat.focus(); return; }
    if (ph && !/^\+?[\d\s-]{6,20}$/.test(ph)) { err.textContent = "手机号格式好像不对，请再检查一下。"; form.phone.setAttribute("aria-invalid", "true"); form.phone.focus(); return; }
    store.set(K.contact, { name: name, wechat: wx, phone: ph });
    var rep = curRep();
    var b = { id: "b" + Date.now().toString(36), t: Date.now(), name: name, wechat: wx, phone: ph, want: want };
    b.payload = U.bookingPayload(b, S.rec.profile, rep, S.rec.answers);
    b.text = U.bookingText(b.payload);
    var ep = (CFG.SUBMIT_ENDPOINT || "").trim();
    if (!ep) { b.status = "card"; saveBooking(b); S.booking = b; go("bookCard"); return; }
    var btn = document.getElementById("bookBtn");
    btn.disabled = true; btn.textContent = "提交中…";
    postBooking(ep, b.payload).then(function () {
      b.status = "sent"; saveBooking(b); S.booking = b; go("bookCard");
    }, function () {
      b.status = "queued"; saveBooking(b); enqueue(b); S.booking = b; S.submitFailed = true; go("bookCard");
    });
  }
  function saveBooking(b) { var l = store.get(K.bookings, []); if (!Array.isArray(l)) l = []; store.set(K.bookings, [b].concat(l).slice(0, 20)); }
  function postBooking(ep, payload) {
    var body = JSON.stringify({ type: "asdx_booking", v: 1, submittedAt: new Date().toISOString(), payload: payload });
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, CFG.SUBMIT_TIMEOUT_MS || 12000);
    return fetch(ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: body, signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error("http " + r.status); return r; },
            function (e) { clearTimeout(timer); throw e; });
  }
  function enqueue(b) { var q = store.get(K.queue, []); if (!Array.isArray(q)) q = []; q.push({ id: b.id, payload: b.payload, tries: 1 }); store.set(K.queue, q); }
  function flushQueue() {
    var ep = (CFG.SUBMIT_ENDPOINT || "").trim(), q = store.get(K.queue, []);
    if (!ep || !Array.isArray(q) || !q.length) return Promise.resolve(Array.isArray(q) ? q.length : 0);
    var left = [];
    return q.reduce(function (p, it) {
      return p.then(function () {
        return postBooking(ep, it.payload).then(function () { markSent(it.id); }, function () { it.tries = (it.tries || 1) + 1; left.push(it); });
      });
    }, Promise.resolve()).then(function () { store.set(K.queue, left); return left.length; });
  }
  function markSent(id) { var l = store.get(K.bookings, []); if (Array.isArray(l)) { l.forEach(function (b) { if (b.id === id) b.status = "sent"; }); store.set(K.bookings, l); } }

  VIEWS.bookCard = function () {
    var b = S.booking; if (!b) return VIEWS.home();
    var p = b.payload, mat = U.maturityOf(p.maturity);
    var h = brandBar();
    h += '<main class="wrap bookcard">';
    if (b.status === "sent") {
      h += '<div class="banner ok" role="status"><b>预约已提交。</b>' + esc(ADV) + "会在 1～2 天内联系你。下面这张预约卡也可以存一份。</div>";
    } else if (b.status === "queued") {
      h += '<div class="banner warn" role="alert"><b>提交没有成功</b>（网络或服务器的问题）。预约已存在这台设备上，下次打开会自动重试。<br>为了不耽误，建议现在就把预约卡发给' + esc(ADV) + '。<button type="button" class="btn-link" data-act="retryQueue">立即重试</button></div>';
    }
    h += '<p class="kicker">预约卡</p><h1 data-focus>还差最后一步：<br>把这张卡发给' + esc(ADV) + "</h1>";
    if (b.status === "card") h += '<p class="lead">目前预约还不会自动送达。请<b>保存图片</b>或<b>复制文字</b>，通过微信发给' + esc(ADV) + "。复制的文字里带着你的诊断数据，" + esc(ADV) + "能直接导入。</p>";
    h += '<article class="card-preview" aria-label="预约卡预览"><header><span class="seal" aria-hidden="true">诊</span><span>AI场景诊断 · 预约卡</span></header>';
    h += '<h2>' + esc(p.name) + ' 的 1v1 诊断预约</h2><dl>';
    if (p.wechat) h += "<dt>微信</dt><dd>" + esc(p.wechat) + "</dd>";
    if (p.phone) h += "<dt>手机</dt><dd>" + esc(p.phone) + "</dd>";
    if (p.want) h += "<dt>最想先改变</dt><dd>" + esc(p.want) + "</dd>";
    h += "<dt>身份</dt><dd>" + esc(D.IDENTITY[p.identity].name) + "</dd><dt>AI成熟度</dt><dd>L" + mat.lv + " " + esc(mat.name) + "</dd></dl>";
    h += '<h3>TOP3 场景</h3><ol class="card-top">';
    p.top.slice(0, 3).forEach(function (r) { h += "<li><b>" + esc(r.name) + "</b><span>" + D.TYPES[r.type].name + " · 每周约 " + r.hours + " 小时</span></li>"; });
    if (!p.top.length) h += "<li>暂无</li>";
    h += "</ol></article>";
    h += '<div class="r-actions"><button type="button" class="btn btn-primary" data-act="saveCardImg">保存预约卡图片</button><button type="button" class="btn btn-ghost" data-act="copyCard">一键复制文字</button></div>';
    h += '<p class="copy-msg" id="copyMsg" role="status" aria-live="polite"></p>';
    h += '<details class="raw"><summary>复制不了？点这里手动复制</summary><textarea readonly rows="8" id="rawText" aria-label="预约卡文字">' + esc(b.text) + "</textarea></details>";
    h += '<p class="note">预约卡已保存在这台设备上。</p>';
    h += '<nav class="q-nav"><button type="button" class="btn-link" data-act="backReport">← 回到报告</button></nav></main>';
    return h;
  };

  function cardBlocks(b) {
    var p = b.payload, mat = U.maturityOf(p.maturity);
    var rows = [["称呼", p.name]];
    if (p.wechat) rows.push(["微信", p.wechat]);
    if (p.phone) rows.push(["手机", p.phone]);
    if (p.want) rows.push(["最想先改变", p.want]);
    rows.push(["身份", D.IDENTITY[p.identity].name], ["AI成熟度", "L" + mat.lv + " " + mat.name], ["发现场景", p.n + " 个"]);
    var bl = [{ t: "brand", text: "AI场景诊断 · 预约卡", right: U.fmtDate(p.t) }, { t: "gap", h: 24 },
      { t: "title", text: p.name + " 的1v1诊断预约", size: 30 }, { t: "gap", h: 18 }, { t: "kv", rows: rows }, { t: "gap", h: 14 },
      { t: "h", text: "TOP3 场景" }, { t: "gap", h: 10 }];
    p.top.slice(0, 3).forEach(function (r, i) {
      bl.push({ t: "card", rank: i + 1, title: r.name, tag: D.TYPES[r.type].name, type: r.type, lines: [["当前状态　", "每周约 " + r.hours + " 小时"]] }, { t: "gap", h: 10 });
    });
    bl.push({ t: "gap", h: 10 }, { t: "foot", text: "免费 · 45 分钟真人 AI 场景诊断 · 请把这张图发给" + ADV });
    return bl;
  }

  /* ---------- 交互 ---------- */
  function autoAdvance(fn) { clearTimeout(advanceTimer); advanceTimer = setTimeout(fn, 260); }
  function scanNext() {
    var list = scenes();
    if (S.si < list.length - 1) { S.si++; go("scan"); }
    else { S.followQs = null; S.fi = 0; go("follow"); }
  }

  app.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]"); if (!el || el.disabled) return;
    var act = el.getAttribute("data-act");
    switch (act) {
      case "home": S = fresh(); render(); break;
      case "start": S = fresh(); S.a = { goals: [], scenes: [], pains: [] }; S.qi = 0; store.del(K.prog); go("q"); break;
      case "consult": { var hl = reports().sort(function (x, y) { return y.t - x.t; }); S = fresh(); S.rec = hl[0] || null; TRACK("consult_open", { from: "home" }); go("consult"); break; }
      case "resume": var pr = store.get(K.prog, null); if (pr) { S = pr; if (S.view === "follow") S.followQs = null; render(); } break;
      case "openReport": var id = el.getAttribute("data-id"); var r = reports().filter(function (x) { return x.id === id; })[0]; if (r) openRec(r); break;
      case "delReport": if (window.confirm("确定删除这份报告吗？删除后找不回来。")) { var did = el.getAttribute("data-id"); store.set(K.reports, reports().filter(function (x) { return x.id !== did; })); render(); } break;
      case "pick": {
        var q = D.PROFILE[S.pi], v = JSON.parse(el.getAttribute("data-v"));
        if (q.type === "multi") {
          var arr = (S.profile[q.id] || []).slice(), opt = q.options.filter(function (o) { return o.v === v; })[0];
          var i = arr.indexOf(v);
          if (i >= 0) arr.splice(i, 1);
          else if (opt.exclusive) arr = [v];
          else { arr = arr.filter(function (x) { return !q.options.some(function (o) { return o.exclusive && o.v === x; }); }); if (arr.length >= q.max) { flash("最多选 " + q.max + " 项，先取消一个再选"); return; } arr.push(v); }
          S.profile[q.id] = arr; saveProg(); render();
        } else {
          S.profile[q.id] = v; saveProg(); render();
          autoAdvance(profileNext);
        }
        break;
      }
      case "profileNext": profileNext(); break;
      case "scanStart": S.si = 0; go("scan"); break;
      case "freq": {
        var s = scenes()[S.si], a = S.answers[s.id] || {}; a.f = +el.getAttribute("data-v");
        if (a.f === 0) a.p = 0; else if (a.p == null) delete a.p;
        S.answers[s.id] = a; saveProg(); render();
        if (a.f === 0 || a.p != null) autoAdvance(scanNext);
        break;
      }
      case "feel": {
        var s2 = scenes()[S.si], a2 = S.answers[s2.id] || {}; a2.p = +el.getAttribute("data-v"); S.answers[s2.id] = a2; saveProg(); render();
        if (a2.f != null) autoAdvance(scanNext);
        break;
      }
      case "scanNext": scanNext(); break;
      case "fuPick": {
        var fq = S.followQs[S.fi]; S.fu[fq.id] = +el.getAttribute("data-v"); saveProg(); render();
        autoAdvance(function () { if (S.fi < S.followQs.length - 1) { S.fi++; go("follow"); } else finish(); });
        break;
      }
      case "back": back(); break;
      default: if (V2.actions[act]) { if (el.tagName !== "A") e.preventDefault(); V2.actions[act](el); } break;
      case "restart": S = fresh(); S.a = { goals: [], scenes: [], pains: [] }; S.qi = 0; store.del(K.prog); go("q"); break;
      case "book": TRACK("consult_open", { from: "v1report" }); go("consult"); break;
      case "backReport": go("report"); break;
      case "saveReportImg": try { Sheet.show(Sheet.render(reportBlocks(curRep(), S.rec)), "AI场景初诊报告", "AI场景初诊报告"); } catch (er) { flash("生成图片失败，可以直接截屏保存"); } break;
      case "saveCardImg": try { Sheet.show(Sheet.render(cardBlocks(S.booking)), "AI场景诊断-预约卡", "预约卡"); } catch (er2) { flash("生成图片失败，可以直接截屏保存"); } break;
      case "copyCard": U.copyText(S.booking.text).then(function (ok) {
        var m = document.getElementById("copyMsg");
        if (m) m.textContent = ok ? "已复制。打开微信，粘贴发给" + ADV + "就行。" : "这台设备不让自动复制，请展开下面的文字手动复制。";
        if (!ok) { var d = app.querySelector("details.raw"); if (d) d.open = true; }
      }); break;
      case "retryQueue": el.disabled = true; el.textContent = "重试中…"; flushQueue().then(function (left) {
        if (!left) { S.booking.status = "sent"; render(); } else { el.disabled = false; el.textContent = "还是没成功，再试一次"; }
      }); break;
    }
  });
  app.addEventListener("input", function (e) { V2.onInput(e); });
  app.addEventListener("submit", function (e) { if (e.target.id === "bookForm") { e.preventDefault(); submitBooking(e.target); } });

  function profileNext() {
    if (S.view !== "profile") return;
    var q = D.PROFILE[S.pi], v = S.profile[q.id];
    if (v == null || (Array.isArray(v) && !v.length)) return;
    if (S.pi < D.PROFILE.length - 1) { S.pi++; go("profile"); } else go("scanIntro");
  }
  function back() {
    if (S.view === "profile") { if (S.pi > 0) { S.pi--; go("profile"); } else { S.view = "home"; render(); } }
    else if (S.view === "q" || S.view === "fu") { V2.actions.v2Back(); }
    else if (S.view === "scanIntro") { S.pi = D.PROFILE.length - 1; go("profile"); }
    else if (S.view === "scan") { if (S.si > 0) { S.si--; go("scan"); } else go("scanIntro"); }
    else if (S.view === "follow") { if (S.followQs && S.fi > 0) { S.fi--; go("follow"); } else { S.si = scenes().length - 1; go("scan"); } }
  }

  var flashT = null;
  function flash(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(flashT); flashT = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  // 键盘：数字键快速作答（桌面）
  document.addEventListener("keydown", function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if ((e.key === "Enter" || e.key === " ") && e.target && e.target.getAttribute && e.target.getAttribute("role") === "button" && e.target.getAttribute("data-act")) { e.preventDefault(); e.target.click(); return; }
    if (e.key === "Backspace" && ["profile", "scan", "follow", "scanIntro", "q"].indexOf(S.view) >= 0) { e.preventDefault(); back(); }
  });

  var errShown = false;
  function onErr() {
    if (errShown) return; errShown = true;
    var b = document.getElementById("errBar"); if (b) b.hidden = false;
  }
  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onErr);

  // 测试与调试用（不含任何个人信息）
  window.ASDX_APP_V2 = { imgBlocks: V2.imgBlocks }; // 测试用
  window.ASDX_APP = { state: function () { return S; }, reportBlocks: reportBlocks, cardBlocks: cardBlocks, curRep: function () { return S.rec ? curRep() : null; }, flushQueue: flushQueue };

  try { render(); } catch (e) { onErr(); throw e; }
  flushQueue();
})();
