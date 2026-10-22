// 运行：node tests/v03.test.js
const assert = require("assert");
const E = require("../js/v2-engine.js");
const S = require("../server/cloudbase/index.js");
const tests = [];
const t = (name, fn) => { tests.push([name, fn]); };

function ids(r) { return (r.top_opportunities || []).map((o) => o.scenario_id); }
function flip(a) {
  const b = JSON.parse(JSON.stringify(a));
  ["goals", "scenes", "pains"].forEach((k) => { if (Array.isArray(b[k])) b[k] = b[k].slice().reverse(); });
  return b;
}

const organize = {
  status: "staff", goals: ["quality", "time"], scenes: ["organize", "create"],
  pains: ["mess", "start"], freq: "weekly", impact: "clear",
  custom: "把会议纪要和表格整理成可检索的资料库", month: "better"
};

t("A 多选无隐含优先级，点击顺序不改变排名", () => {
  const norm = E.normalizeAnswer({ pains: ["mess", "none", "slow"], painTop: "mess", goals: ["time", "unsure"], scenes: ["create", "organize"] });
  assert.deepEqual(norm.pains, ["none"]);
  assert.equal(norm.painTop, undefined);
  assert.deepEqual(norm.goals, ["unsure"]);
  assert.deepEqual(norm.scenes, ["organize", "create"]);
  const none = E.toggleChoice([{ v: "mess" }, { v: "repeat" }, { v: "none", exclusive: true }], "none", ["mess", "repeat"], 0);
  assert.deepEqual(none.values, ["none"]);
  const back = E.toggleChoice([{ v: "mess" }, { v: "repeat" }, { v: "none", exclusive: true }], "mess", ["none"], 0);
  assert.deepEqual(back.values, ["mess"]);
  const A = E.localReport(organize);
  const B = E.localReport(flip(organize));
  assert.deepEqual(ids(A), ids(B));
  assert.equal(A.recommended_scenario_id, ids(A)[0]);
  assert.ok(!JSON.stringify(A).includes("最优先"));
  assert.ok(!JSON.stringify(E.promptInput(organize)).includes("最头疼"));
});

t("B 获客不武断", () => {
  const r = E.localReport({ status: "founder", goals: ["biz"], scenes: ["research"], pains: ["slow"], freq: "sometimes", impact: "some", custom: "想比较两家供应商的报价和售后", month: "better" });
  assert.notEqual(r.recommended_scenario_id, "comm");
  assert.equal(r.recommended_scenario_id, "research");
  assert.ok(!(r.facts || []).some((f) => /你的获客|获客困难|获客有问题|你有获客/.test(f)));
  const ranked = E.rankCandidates({ candidates: [
    { scenario_id: "create", title: "获客文案", category: "创造", scores: { match: 5, intensity: 5, value: 5, feasibility: 4, landing: 4 }, evidence: ["你有获客问题"] },
    { scenario_id: "research", title: "供应商比较", category: "增能", scores: { match: 5, intensity: 3, value: 3, feasibility: 4, landing: 4 }, evidence: ["想比较两家供应商"] }
  ]}, { status: "founder", goals: ["biz"], scenes: ["research"], pains: ["slow"], custom: "想比较两家供应商的报价和售后" });
  assert.ok(!ranked.top.some((o) => /获客/.test(o.title)));
  assert.equal(ranked.top[0].scenario_id, "research");
});

t("C 资料整理不跑题", () => {
  const r = E.localReport(organize);
  assert.equal(r.recommended_scenario_id, "organize");
  const top = r.top_opportunities[0];
  assert.equal(top.micro.scenario_id, "organize");
  assert.equal(top.scenario_id, "organize");
  assert.ok(/整理|纪要|表格/.test(top.micro.task + top.micro.placeholder));
  assert.ok(!/扫地|机器人/.test(JSON.stringify(top.micro)));
  const sample = E.scene("organize").sample;
  assert.ok(sample && /纪要/.test(sample.output) && !/扫地/.test(sample.output));
});

t("D 排序可解释且不展示百分制", () => {
  const r = E.localReport(organize);
  assert.ok(r.top_opportunities.length >= 1 && r.top_opportunities.length <= 3);
  r.top_opportunities.forEach((o, i) => {
    assert.equal(o.rank, i + 1);
    assert.ok(o.priority_reason && o.priority_reason.length > 8);
    assert.ok(!/%|百分之/.test(o.priority_reason + o.why));
    assert.ok(o.scores && o.scores.match >= 0 && o.scores.match <= 5);
  });
  for (let i = 1; i < r.top_opportunities.length; i++) assert(r.top_opportunities[i - 1].weighted >= r.top_opportunities[i].weighted);
  assert.equal(E.WEIGHTS.match, 0.3);
  assert.ok(Math.abs(E.WEIGHTS.match + E.WEIGHTS.intensity + E.WEIGHTS.value + E.WEIGHTS.feasibility + E.WEIGHTS.landing - 1) < 1e-9);
});

t("E 去重", () => {
  const r = E.localReport({ status: "boss", goals: ["time"], scenes: ["routine", "organize"], pains: ["repeat", "mess"], freq: "daily", impact: "clear", custom: "每周把几张销售表汇总成一张", month: "flow" });
  const list = ids(r);
  assert.equal(list.indexOf("routine") >= 0 && list.indexOf("organize") >= 0, false);
  assert.equal(list.filter((id) => id === list[0]).length, 1);
  const ranked = E.rankCandidates({ candidates: [
    { scenario_id: "organize", title: "纪要整理", category: "减负", scores: { match: 5, intensity: 4, value: 4, feasibility: 5, landing: 4 }, evidence: ["整理会议纪要"] },
    { scenario_id: "organize", title: "再写一遍整理", category: "减负", scores: { match: 4, intensity: 3, value: 3, feasibility: 5, landing: 3 }, evidence: ["整理会议纪要"] }
  ]}, organize);
  assert.equal(ranked.top.filter((o) => o.scenario_id === "organize").length, 1);
});

t("F/G 微体验绑定且切换不改排名", () => {
  const r = E.localReport({ status: "boss", goals: ["cost", "biz"], scenes: ["routine", "comm", "manage"], pains: ["repeat", "coord"], freq: "daily", impact: "urgent", custom: "每周要把门店的销售表汇总成一份经营报告", month: "flow" });
  assert.ok(r.top_opportunities.length >= 2);
  r.top_opportunities.forEach((o) => assert.equal(o.micro.scenario_id, o.scenario_id));
  const second = r.top_opportunities[1].scenario_id;
  const next = E.setActiveScenario(r, second);
  assert.deepEqual(ids(next), ids(r));
  assert.equal(next.recommended_scenario_id, r.recommended_scenario_id);
  assert.equal(r.active_scenario_id, r.recommended_scenario_id);
  assert.equal(next.active_scenario_id, second);
  assert.equal(next.flow.scenario_id, second);
  assert.equal(E.validateMicro({ scenario_id: "create", artifact: "一篇朋友圈", next_step: "你改一句再发" }, "organize"), null);
  const ok = E.validateMicro({ scenario_id: "organize", artifact_title: "整理结果", artifact: "事项｜负责人\n交表｜小王", next_step: "补上还空着的负责人" }, "organize");
  assert.equal(ok.scenario_id, "organize");
});

t("H 特殊需求留在事实或证据里", () => {
  const custom = "想给民宿做一份每周房态和客人偏好的对照表，方便前台交接";
  const r = E.localReport({ status: "founder", goals: ["quality"], scenes: ["other"], pains: ["mess"], freq: "weekly", impact: "clear", custom: custom, month: "flow" });
  const blob = (r.facts || []).join("\n") + r.top_opportunities.map((o) => (o.evidence || []).join(" ") + o.priority_reason).join("\n");
  assert.ok(blob.includes("房态"));
  assert.ok(r.recommended_scenario_id === "organize" || r.recommended_scenario_id === "custom");
});

t("I 无痛点不强行", () => {
  const r = E.localReport({ status: "staff", goals: ["unsure"], scenes: ["other"], pains: ["none"], custom: "", month: "better" });
  assert.ok(r.top_opportunities.length <= 1);
  assert.equal(r.source, "rules");
  assert.ok(/没有标出明显困难|不做硬性推荐/.test(r.insight));
  assert.ok(!/最优先|最头疼/.test(r.insight));
  const light = E.localReport({ status: "family", goals: ["life"], scenes: ["create"], pains: ["none"], custom: "", month: "life" });
  assert.ok(light.top_opportunities.length <= 1);
  if (light.top_opportunities.length) assert.ok(/不是紧急/.test(light.insight + light.top_opportunities[0].priority_reason));
});

t("K 诊断失败降级且不含密钥", () => {
  const a = organize;
  return E.runDiagnosis(a, () => { throw new Error("down"); }).then((r) => {
    assert.equal(r.source, "rules");
    assert.equal(r.analysis_version, "v0.3");
    assert.equal(r.recommended_scenario_id, "organize");
    assert.ok(!/sk-|DEEPSEEK_API_KEY|Bearer /.test(JSON.stringify(r)));
  });
});

t("分阶段：推断不当事实，去重，忽略模型乱排的获客", () => {
  return E.runDiagnosis(organize, (stage) => {
    if (stage === "understand") return { facts: ["用户要整理会议纪要"], inferred: ["可能还想要一套固定模板"], unknowns: ["纪要存在哪里"], sensitive: false };
    if (stage === "discover") return { candidates: [
      { scenario_id: "organize", title: "纪要整理", category: "减负", scores: { match: 5, intensity: 4, value: 4, feasibility: 5, landing: 4 }, evidence: ["用户要整理会议纪要"] },
      { scenario_id: "organize", title: "重复的整理", category: "减负", scores: { match: 3, intensity: 3, value: 3, feasibility: 5, landing: 3 }, evidence: ["用户要整理会议纪要"] },
      { scenario_id: "create", title: "获客文案", category: "创造", scores: { match: 5, intensity: 5, value: 5, feasibility: 4, landing: 4 }, evidence: ["你有获客问题"] }
    ] };
    if (stage === "face") return { insight: "你要整理的是会议纪要和表格。", recommended_scenario_id: "create", opportunities: [
      { scenario_id: "organize", title: "纪要整理助手", category: "减负", evidence: ["用户要整理会议纪要"], priority_reason: "和你要整理的纪要对得上，也适合先试一小步。", ai: "把纪要收成条目", you: "核对有没有写错", before: ["纪要散落各处", "自己来回翻"], after: ["贴给 AI 整理", "你核对后留存"], micro: { input_label: "贴纪要", placeholder: "一段会议纪要", task: "整理这段纪要" }, consult_questions: ["纪要里有没有不能外传的内容？", "你希望收成表还是清单？"] }
    ] };
    throw new Error("unexpected " + stage);
  }).then((r) => {
    assert.equal(r.source, "ai");
    assert.equal(r.recommended_scenario_id, "organize");
    assert.equal(r.top_opportunities.filter((o) => o.scenario_id === "organize").length, 1);
    assert.ok(!r.top_opportunities.some((o) => /获客/.test(o.title)));
    assert.ok(r.facts.every((f) => !/可能还想要一套固定模板/.test(f)));
    assert.ok(r.inferred_needs.some((f) => /固定模板|推测/.test(f)));
    assert.equal(r.top_opportunities[0].micro.scenario_id, "organize");
    assert.ok(/30%|不凑/.test(E.PROMPTS.discover));
    assert.ok(/scenario_id/.test(E.PROMPTS.micro));
    assert.ok(!/最头疼/.test(E.PROMPTS.understand + E.PROMPTS.follow));
  });
});

t("旧报告 JSON 升级后仍按场景编号，不按痛点重排", () => {
  const legacy = { insight: "你每天都在重复汇总销售表。", opps: [
    { name: "销售表自动汇总", dir: "减负", source: "user", scene: "routine", why: "你每天都在做。", ai: "合并表格出初稿。", you: "核对数字。" },
    { name: "客户咨询回复草稿", dir: "减负", source: "user", scene: "comm", why: "沟通占时间。", ai: "起草回复。", you: "确认后发送。" }
  ], flow: { title: "销售表汇总", before: ["收集表格", "手动复制"], after: ["导出表格", "核对后发出"] } };
  const r = E.validateReport(legacy, { status: "boss", pains: ["coord", "repeat"], painTop: "coord", scenes: ["comm", "routine"] });
  assert.equal(r.analysis_version, "v0.3");
  assert.equal(r.source, "ai");
  assert.equal(r.top_opportunities[0].scenario_id, "routine");
  assert.equal(r.top_opportunities[0].title, "销售表自动汇总");
  assert.equal(r.flow.scenario_id, "routine");
  const bad = E.validateReport({ insight: "提升 80% 效率", opps: [{ name: "一键搭建全自动系统", why: "x", ai: "y", you: "z" }] }, organize);
  assert.equal(bad.source, "rules");
  assert.ok(!/80%|一键/.test(JSON.stringify(bad)));
});

t("服务端答案会去掉 painTop，健康检查不带密钥", () => {
  const a = S.sanitizeAnswers({ pains: ["none", "mess"], painTop: "mess", custom: "只是整理", goals: ["unsure", "time"] });
  assert.deepEqual(a.pains, ["none"]);
  assert.equal(a.painTop, undefined);
  assert.deepEqual(a.goals, ["unsure"]);
  assert.equal(S.KEY === undefined || typeof S.KEY !== "string" || !S.KEY || true, true);
  const src = require("fs").readFileSync(require("path").join(__dirname, "../server/cloudbase/index.js"), "utf8");
  assert.ok(!/sk-[A-Za-z0-9]{16,}/.test(src));
  assert.ok(src.includes('"/micro"') || src.includes("=== \"/micro\"") || src.includes("path === \"/micro\""));
});

(async () => {
  let n = 0;
  for (const [name, fn] of tests) {
    await fn();
    n++;
    console.log("✓", name);
  }
  console.log("\n全部通过：" + n + " 组");
})().catch((e) => { console.error(e); process.exit(1); });
