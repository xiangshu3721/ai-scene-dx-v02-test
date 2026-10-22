"""
V0.2 端到端测试（Playwright Chromium，手机尺寸）
用法：python3 tests/e2e_v2.py http://127.0.0.1:8765/ [截图目录]
覆盖：多身份跑通、AI 失败降级、AI 成功+追问、AI 返回违规内容被拦、旧版报告兼容、会诊联系方式三种配置、密钥扫描。
"""
import json, os, re, sys, subprocess
from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip("/") + "/"
SHOTS = sys.argv[2] if len(sys.argv) > 2 else None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ok, bad = [], []
def check(c, m): (ok if c else bad).append(m); print(("  ✓ " if c else "  ✗ ") + m)
def shot(p, n):
    if SHOTS: os.makedirs(SHOTS, exist_ok=True); p.screenshot(path=os.path.join(SHOTS, n), full_page=True)

def click_opt(p, label): p.locator("button.opt", has_text=label).first.click()
def nxt(p): p.locator('[data-act="v2Next"]').click(); p.wait_for_timeout(120)

PERSONAS = {
  "student": dict(status="学生", goals=["学习新知识"], scenes=["学习新知识", "写东西"], pains=["缺少专业知识"], top=None, freq="每周都会", impact="有点麻烦", custom="想学会用AI帮我准备英语四级", month="开始掌握一项新能力"),
  "retired": dict(status="退休", goals=["让生活更轻松"], scenes=["查找资料"], pains=["小事花很长时间", "资料太多"], top="资料太多", freq="偶尔发生", impact="影响不大", custom="", month="让生活更轻松"),
  "boss": dict(status="企业老板", goals=["帮助做生意", "降低成本"], scenes=["处理重复操作", "和别人沟通", "安排任务"], pains=["重复做差不多的事", "需要不断沟通协调"], top="重复做差不多的事", freq="几乎每天", impact="非常希望尽快解决", custom="每周要把门店的销售表汇总成一份经营报告", month="让某个业务流程更高效"),
  "nopain": dict(status="职场人士", goals=["还不清楚"], scenes=["其他"], pains=["暂时没有明显困难"], top=None, freq=None, impact=None, custom="", month="工作更快、更好"),
  "custom_job": dict(status="专业人士", detail="社区医生", goals=["帮助思考"], scenes=["整理文档"], pains=["容易出错"], top=None, freq="几乎每天", impact="已明显影响", custom="整理病人随访记录，总担心漏掉", month="其他", other="随访记录不再漏"),
}

def run(p, key, d, ai_mode=None):
    p.goto(BASE); p.wait_for_selector('[data-act="start"]'); p.click('[data-act="start"]')
    click_opt(p, d["status"])
    if d.get("detail"): p.fill('[data-in="statusDetail"]', d["detail"])
    if key == "student": shot(p, "02-q1-status.png")
    nxt(p)
    for g in d["goals"]: click_opt(p, g)
    nxt(p)
    for s in d["scenes"]: click_opt(p, s)
    if key == "boss": shot(p, "03-q3-scenes-boss.png")
    if key == "retired": shot(p, "03-q3-scenes-retired.png")
    nxt(p)
    for x in d["pains"]: click_opt(p, x)
    if key == "boss":
        shot(p, "04-q4-pains.png")
        check(p.locator('[data-act="v2PainTop"]').count() == 0 and "设为最优先" not in p.inner_text("body"), "A 困难多选没有「设为最优先」")
        check("同等重要" in p.inner_text(".q-sub"), "A 多选说明是并列、不分先后")
    nxt(p)
    if d["freq"]:
        p.locator("button.chip", has_text=d["freq"]).click(); p.locator("button.chip", has_text=d["impact"]).click()
        if key == "boss": shot(p, "05-q5-impact.png")
        nxt(p)
    if d["custom"]: p.fill('[data-in="custom"]', d["custom"])
    if key == "boss": shot(p, "06-q6-custom.png")
    nxt(p)
    click_opt(p, d["month"])
    if d.get("other"): p.fill('[data-in="monthOther"]', d["other"])
    nxt(p)
    if ai_mode == "follow":
        p.wait_for_selector('[data-act="v2Fu"]', timeout=5000); shot(p, "07-ai-followup.png")
        p.locator('[data-act="v2Fu"]').first.click()
    p.wait_for_selector(".v2-insight", timeout=15000)

with sync_playwright() as pw:
    br = pw.chromium.launch(executable_path=next((x for x in ["/usr/bin/google-chrome", "/opt/google/chrome/chrome"] if os.path.exists(x)), None))
    def ctx(cfg_patch=None, consult=None, ai=None):
        c = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                           user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.47")
        errs = []
        if cfg_patch:
            c.route(re.compile(r".*/js/config\.js.*"), lambda r: r.fulfill(content_type="application/javascript", body=open(ROOT + "/js/config.js").read() + "\n" + cfg_patch))
        if consult is not None:
            c.route(re.compile(r".*/js/consult-config\.js.*"), lambda r: r.fulfill(content_type="application/javascript", body="window.ASDX_CONSULT=" + json.dumps(consult)))
        if ai:
            c.route(re.compile(r"https://ai\.test/.*"), ai)
        p = c.new_page(); p.on("pageerror", lambda e: errs.append(str(e)))
        return c, p, errs

    print("· 首页")
    c, p, errs = ctx(); p.goto(BASE); p.wait_for_selector(".path")
    t = p.inner_text(".path")
    check("约3～5分钟，发现你的AI机会" in t and "免费45分钟，和翔叔一起厘清AI落地路径" in t, "首页四步文案已改两句")
    check(all(x in t for x in "测聊定做") and p.inner_text("h1").startswith("你的生活和工作里"), "主标题与四步保留")
    check(p.locator("#histT").count() == 1, "保留「我的报告」入口")
    shot(p, "01-home.png")
    c.close()

    print("· 多身份，无 AI（本地规则 / 基础初诊）")
    c, p, errs = ctx('window.ASDX_CONFIG.AI_ENDPOINT="";')
    for k, d in PERSONAS.items():
        run(p, k, d)
        st = p.evaluate("() => window.ASDX_APP.state().rec")
        r = st["report"]
        nopp = len(r.get("top_opportunities") or r.get("opps") or [])
        check(r["source"] == "rules" and r.get("analysis_version") == "v0.3" and nopp <= 3, k + "：基础初诊，机会不超过 3")
        check("基础初诊" in p.inner_text("#report"), k + "：页面标明基础初诊")
        if k == "nopain":
            check(nopp <= 1 and "没有标出明显困难" in r["insight"], k + "：无痛点不强行推荐")
        else:
            check(nopp >= 1 and any(o["source"] == "user" for o in r["opps"]), k + "：至少 1 个机会来自用户明说")
            check(p.locator("#flowBox").get_attribute("data-scenario") == r["recommended_scenario_id"], k + "：前后对比绑定建议场景")
            check(p.locator("#microBox").get_attribute("data-scenario") == r["active_scenario_id"], k + "：微体验绑定当前场景")
            check(p.locator(".v2-demo-tag", has_text="示例").count() >= 1 and p.locator(".v2-demo-tag", has_text="演示").count() == 0, k + "：静态内容标示例，不冒充演示结果")
        consult = p.inner_text("#consult")
        check("免费45分钟" in consult and "xiangshu-pm" in consult and "AI行动建议卡" in consult and "我们会聊什么" in consult, k + "：免费45分钟会诊入口")
        check("复制预约说明" not in consult and "我刚完成AI场景诊断" not in consult and p.locator(".v2-booktext, [data-act='v2CopyBook']").count() == 0, k + "：会诊区没有复制预约说明")
        check(p.locator('[data-act="v2Contact"]').count() == 1, k + "：会诊按钮可点")
        m = st["meta"]; check(bool(st["code"]) and m["identity"] and "consult" in st, k + "：存储字段齐全 " + st["code"])
        if k == "custom_job": check(r["sensitive"] and p.locator(".v2-safe").count() == 1 and "社区医生" in m["identity"], k + "：敏感场景人机协作提示 + 自填职业")
        if k == "boss" and nopp >= 2:
            before = p.evaluate("() => { const r = window.ASDX_APP.state().rec.report; return { ids: r.top_opportunities.map(o => o.scenario_id), rec: r.recommended_scenario_id }; }")
            p.locator("article.opp").nth(1).click()
            after = p.evaluate("() => { const r = window.ASDX_APP.state().rec.report; return { ids: r.top_opportunities.map(o => o.scenario_id), rec: r.recommended_scenario_id, active: r.active_scenario_id }; }")
            check(after["ids"] == before["ids"] and after["rec"] == before["rec"] and after["active"] == before["ids"][1], "G 切换场景不改变推荐排名")
            check(p.locator("#flowBox").get_attribute("data-scenario") == after["active"] and p.locator("#microBox").get_attribute("data-scenario") == after["active"], "G 对比和微体验跟着当前场景")
        shot(p, "08-report-%s.png" % k)
    check(not errs, "无页面报错 " + str(errs[:2]))
    ev = p.evaluate("() => window.ASDX_TRACK.list().map(e => e.event)")
    check(ev.count("test_complete") == 5 and ev.count("report_view") >= 5, "埋点：测试完成/报告查看")
    # 我的报告
    p.goto(BASE); p.wait_for_selector(".hist-item")
    check(p.locator(".hist-item").count() == 5, "我的报告列出 5 份")
    check(p.evaluate("() => JSON.parse(localStorage['asdx.reports.v1']).filter(x => x.id && x.profile && x.answers).length") == 0, "正式站旧代码（同域）会忽略 V0.2 记录，不误渲染")
    p.locator(".hist-item").first.click(); p.wait_for_selector(".v2-insight"); check(True, "从我的报告重新打开 V0.2 报告")
    p.goto(BASE); p.click('[data-act="consult"]'); p.wait_for_selector("#cT"); check("编号" not in "" and p.inner_text("#cT") == "你的这些AI机会，到底该怎么真正实现？", "我的报告 → 会诊入口")
    c.close()

    print("· AI 失败降级（端点不可达 / 返回 500 / 返回违规内容）")
    for name, handler in [("unreachable", lambda r: r.abort()), ("500", lambda r: r.fulfill(status=500, body="{}")),
                          ("bad-json", lambda r: r.fulfill(status=200, content_type="application/json", body="not json")),
                          ("banned", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"need": False} if "followup" in r.request.url else {"insight": "AI 能帮你提升 80% 效率", "opps": [{"name": "一键搭建全自动系统", "why": "x", "ai": "y", "you": "z", "source": "user"}]})))]:
        c, p, errs = ctx('window.ASDX_CONFIG.AI_ENDPOINT="https://ai.test";', ai=handler)
        run(p, "boss", PERSONAS["boss"])
        r = p.evaluate("() => window.ASDX_APP.state().rec.report")
        txt = p.inner_text("#report")
        check(r["source"] == "rules" and r.get("analysis_version") == "v0.3" and "80%" not in txt and "一键" not in txt and "免费45分钟" in txt and not errs, "AI " + name + " → 基础初诊，页面不崩、会诊还在")
        if name == "500": shot(p, "09-report-ai-failed.png")
        c.close()

    print("· AI 成功 + 追问")
    good = {"insight": "你每天都在重复汇总销售表，这件事最值得先交给 AI。", "opps": [
        {"name": "销售表自动汇总", "dir": "减负", "source": "user", "scene": "routine", "why": "你每天都在做，且非常想尽快解决。", "ai": "按固定格式把各门店表格合并，生成经营报告初稿。", "you": "核对关键数字，补充判断。"},
        {"name": "客户咨询回复草稿", "dir": "减负", "source": "user", "scene": "comm", "why": "沟通协调占用你大量时间。", "ai": "整理常见问题，起草回复。", "you": "确认后发送。"},
        {"name": "经营决策陪练", "dir": "增能", "source": "discover", "scene": "think", "why": "你可能还没想到：AI 可以帮你多角度想问题。", "ai": "列出方案利弊和遗漏的问题。", "you": "做最终决定。"}],
        "flow": {"title": "销售表汇总", "before": ["收集各店表格", "手动复制", "算汇总", "写报告"], "after": ["导出表格", "AI 合并出初稿", "你核对", "发出"]}}
    def ok_handler(r):
        body = {"need": True, "title": "你的销售表一般是什么格式？", "options": ["Excel 表格", "手写或拍照", "系统导出"]} if "followup" in r.request.url else good
        r.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(body, ensure_ascii=False))
    c, p, errs = ctx('window.ASDX_CONFIG.AI_ENDPOINT="https://ai.test";', ai=ok_handler)
    run(p, "boss", PERSONAS["boss"], ai_mode="follow")
    st = p.evaluate("() => window.ASDX_APP.state().rec")
    check(st["report"]["source"] == "ai" and st["report"]["top_opportunities"][0]["scenario_id"] == "routine" and st["report"]["top_opportunities"][0]["title"] == "销售表自动汇总" and st["a"]["followUp"]["answer"], "AI 报告按场景编号承接，追问答案有记录")
    check(p.locator(".v2-badge", has_text="你可能还没想到").count() == 1, "主动发现标「你可能还没想到」")
    shot(p, "10-report-ai-ok.png")
    c.close()

    print("· 微体验失败不串场景")
    def micro_handler(r):
        if "micro" in r.request.url:
            r.abort(); return
        body = {"need": False} if "followup" in r.request.url else good
        r.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(body, ensure_ascii=False))
    c, p, errs = ctx('window.ASDX_CONFIG.AI_ENDPOINT="https://ai.test";', ai=micro_handler)
    run(p, "boss", PERSONAS["boss"])
    sid = p.evaluate("() => window.ASDX_APP.state().rec.report.active_scenario_id")
    p.fill("#microBox textarea", "门店周一卖了20份，周二卖了18份，想收成一张周表")
    p.click('[data-act="v2Micro"]')
    p.wait_for_selector(".v2-micro-err", timeout=8000)
    check("没有生成成功" in p.inner_text(".v2-micro-result"), "K 微体验失败有明确提示")
    check(p.locator("#microBox").get_attribute("data-scenario") == sid and p.locator("#flowBox").get_attribute("data-scenario") == sid, "K 失败后场景编号不变")
    check("扫地机器人" not in p.inner_text("#microBox") and not errs, "K 失败时不拿无关演示顶上，页面不崩")
    c.close()

    print("· 微体验成功只写回当前场景")
    def micro_ok(r):
        if "micro" in r.request.url:
            req = json.loads(r.request.post_data or "{}")
            body = {"scenario_id": "create", "artifact_title": "跑题了", "artifact": "这是别的场景", "next_step": "不该出现"} if req.get("scenario_id") != "routine" else {"scenario_id": req.get("scenario_id"), "artifact_title": "本周销售空表", "artifact": "门店｜周一｜周二\n（数字待你核对）", "next_step": "补上你知道的两天数字", "missing": ["具体门店名"]}
            r.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(body, ensure_ascii=False)); return
        body = {"need": False} if "followup" in r.request.url else good
        r.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(body, ensure_ascii=False))
    c, p, errs = ctx('window.ASDX_CONFIG.AI_ENDPOINT="https://ai.test";', ai=micro_ok)
    run(p, "boss", PERSONAS["boss"])
    p.fill("#microBox textarea", "门店周一卖了20份，周二卖了18份")
    p.click('[data-act="v2Micro"]')
    p.wait_for_selector(".v2-micro-result .v2-ai", timeout=8000)
    check("本周销售空表" in p.inner_text(".v2-micro-result") and "跑题了" not in p.inner_text("#microBox") and not errs, "F 微体验结果属于当前场景")
    check("示例" in p.inner_text("#microBox aside"), "静态样例仍标成示例")
    c.close()

    print("· 会诊联系方式配置")
    c, p, errs = ctx('window.ASDX_CONFIG.AI_ENDPOINT="";', consult={"ADVISOR_NAME": "翔叔", "WECHAT_ID": "TEST_WX_ONLY", "QR_IMAGE": "", "REMARK": "AI场景诊断"})
    run(p, "retired", PERSONAS["retired"])
    p.click('[data-act="v2Contact"]'); p.wait_for_selector("#v2Modal:not([hidden])")
    check(p.locator(".v2-qr").count() == 0 and "TEST_WX_ONLY" in p.inner_text("#v2Modal"), "只有微信号：不显示二维码，只显示微信号")
    shot(p, "11-consult-wx-only.png")
    p.click('#v2Modal [data-act="v2CopyWx"]'); p.click('[data-act="v2CloseModal"]')
    consult = p.inner_text("#consult")
    check("复制预约说明" not in consult and "我刚完成AI场景诊断" not in consult and p.locator(".v2-booktext, [data-act='v2CopyBook']").count() == 0, "会诊区不再出现复制预约说明")
    check("免费45分钟" in consult and "TEST_WX_ONLY" in consult and p.locator("#consult [data-act='v2CopyWx']").count() == 1, "仍保留免费45分钟、微信号和复制微信号")
    ev = p.evaluate("() => window.ASDX_TRACK.list().map(e => e.event)")
    check(all(e in ev for e in ["contact_qr_open", "contact_copy_wechat"]) and "contact_copy_booking" not in ev, "埋点：点联系方式/复制微信号，不再记复制预约说明")
    check(p.evaluate("() => JSON.parse(localStorage['asdx.reports.v1'])[0].consult.intent") is True, "报告记录意向（不等于预约）")
    c.close()
    qr = "data:image/svg+xml," + "%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23ddd'/%3E%3Ctext x='100' y='105' text-anchor='middle'%3E测试二维码%3C/text%3E%3C/svg%3E"
    c, p, errs = ctx('window.ASDX_CONFIG.AI_ENDPOINT="";', consult={"WECHAT_ID": "", "QR_IMAGE": qr})
    run(p, "student", PERSONAS["student"]); p.click('[data-act="v2Contact"]')
    check(p.locator(".v2-qr").count() == 1 and p.locator("#v2Modal .v2-wx").count() == 0, "只有二维码：显示二维码")
    shot(p, "12-consult-qr.png"); c.close()

    print("· 旧版（V0.1）报告兼容")
    c, p, errs = ctx(); p.goto(BASE); p.wait_for_selector(".path")
    p.evaluate("""() => { const D = window.ASDX_DATA, E = window.ASDX_ENGINE;
      const prof = {}; D.PROFILE.forEach(q => { prof[q.id] = q.type === 'multi' ? [q.options[0].v] : q.options[1].v; });
      const ans = {}; E.scenesFor(E.identityOf(prof)).forEach((s, i) => { ans[s.id] = { f: 1 + (i % 3), p: 1 + (i % 3) }; });
      const rec = { id: 'rold1', t: Date.now() - 86400000, profile: prof, answers: ans, followQs: [], fu: {}, summary: '旧版报告' };
      const v2 = { v: 2, id: 'rnew1', code: 'DXTEST1', t: Date.now(), a: { status: 'retired', scenes: ['research'] }, report: null, summary: '新版报告' };
      localStorage.setItem('asdx.reports.v1', JSON.stringify([v2, rec])); }""")
    p.reload(); p.wait_for_selector(".hist-item"); check(p.locator(".hist-item").count() == 2, "新旧报告混合列表都显示")
    p.locator(".hist-item").first.click(); p.wait_for_selector(".v2-insight"); check(True, "缺 report 字段的 V0.2 记录用规则补全，不崩")
    p.goto(BASE); p.wait_for_selector(".hist-item"); p.locator(".hist-item").nth(1).click(); p.wait_for_selector("#top5")
    check(p.locator(".opp").count() >= 1 and not errs, "旧报告仍按旧版样式打开")
    shot(p, "13-legacy-report.png")
    p.click('[data-act="book"]'); p.wait_for_selector("#cT"); check(True, "旧报告的预约按钮 → 新会诊页")
    c.close()
    br.close()

print("· 密钥扫描")
out = subprocess.run(["git", "grep", "-nIE", r"sk-[A-Za-z0-9]{16,}|DEEPSEEK_API_KEY\s*=\s*['\"][^'\"]+|Bearer [A-Za-z0-9]{16,}"], cwd=ROOT, capture_output=True, text=True).stdout
check(out.strip() == "", "仓库里无密钥 " + out[:200])
fe = "".join(open(os.path.join(ROOT, "js", f)).read() for f in os.listdir(os.path.join(ROOT, "js")))
check("api.deepseek.com" not in fe, "前端不直连 DeepSeek")
print("\n通过 %d，失败 %d" % (len(ok), len(bad)))
sys.exit(1 if bad else 0)
