/*!
 * v2-data.js · AI场景诊断 V0.2 题目 + 本地规则场景库（只放数据）
 * 浏览器挂到 window.ASDX_V2_DATA；Node 里 module.exports。
 */
(function (root) {
  "use strict";

  // 第1题 · 身份 → 例子分组 grp：life 普通/生活  work 职场/专业  boss 老板/主理人
  var STATUS = [
    { v: "staff", label: "职场人士", grp: "work" },
    { v: "pro", label: "专业人士", hint: "教师、医生、设计师、顾问等", grp: "work" },
    { v: "freelance", label: "自由职业者", grp: "work" },
    { v: "founder", label: "个体创业者 / 主理人", grp: "boss" },
    { v: "boss", label: "企业老板 / 管理者", grp: "boss" },
    { v: "student", label: "学生", grp: "life" },
    { v: "retired", label: "退休", grp: "life" },
    { v: "family", label: "家庭生活为主", grp: "life" },
    { v: "other", label: "其他", grp: "life" }
  ];

  var GOALS = [
    { v: "time", label: "节省时间，少做繁琐的事", dir: "减负" },
    { v: "quality", label: "提高工作效率和质量", dir: "减负" },
    { v: "learn", label: "学习新知识、提升能力", dir: "增能" },
    { v: "think", label: "帮助思考、分析和决策", dir: "增能" },
    { v: "create", label: "创作内容、作品或产品", dir: "创造" },
    { v: "biz", label: "帮助做生意、赚钱、获客", dir: "创造" },
    { v: "cost", label: "降低成本、优化团队业务", dir: "减负" },
    { v: "life", label: "让生活更轻松、更有趣", dir: "减负" },
    { v: "explore", label: "探索以前做不到的事情", dir: "创造" },
    { v: "unsure", label: "还不清楚，想看看AI能做什么", exclusive: true }
  ];

  // 困难
  var PAINS = [
    { v: "repeat", label: "重复做差不多的事" },
    { v: "slow", label: "小事花很长时间" },
    { v: "mess", label: "资料太多，整理费劲" },
    { v: "start", label: "思路不清，不知道怎么开始" },
    { v: "skill", label: "缺少专业知识或技能" },
    { v: "coord", label: "需要不断沟通协调" },
    { v: "error", label: "容易出错、遗漏" },
    { v: "resource", label: "需要大量人力或资金" },
    { v: "limited", label: "想做的多，但时间精力有限" },
    { v: "none", label: "暂时没有明显困难", exclusive: true }
  ];

  var FREQ = [
    { v: "daily", label: "几乎每天" }, { v: "weekly", label: "每周都会" },
    { v: "sometimes", label: "偶尔发生" }, { v: "idea", label: "还没开始，只是想法" }
  ];
  var IMPACT = [
    { v: "low", label: "影响不大" }, { v: "some", label: "有点麻烦" },
    { v: "clear", label: "已明显影响效率或效果" }, { v: "urgent", label: "非常希望尽快解决" }
  ];

  var MONTH = [
    { v: "lesstime", label: "每周少花时间处理琐事" },
    { v: "better", label: "工作更快、更好" },
    { v: "newskill", label: "开始掌握一项新能力" },
    { v: "make", label: "做出以前做不出的作品或产品" },
    { v: "flow", label: "让某个业务流程更高效" },
    { v: "income", label: "获得新收入或业务机会" },
    { v: "life", label: "让生活更轻松、更有创造力" },
    { v: "other", label: "其他（自己写）", other: true }
  ];

  /* 第3题 · 场景卡片 + 本地规则场景库
   * ex：按身份分组的举例；pains：第4题展示哪些困难；dir：减负/增能/创造
   * opp：生成报告用的模板。before/after：流程对比（初步方案）。demo：微体验类型 */
  var SCENES = [
    { id: "research", name: "查找资料、研究比较方案", dir: "增能", pains: ["slow", "mess", "skill", "limited"],
      ex: { life: "比较家电/保险/旅行方案、查健康或育儿知识", work: "查行业资料、竞品对比、写调研", boss: "看市场和竞品、比较供应商、找政策信息" },
      opp: { name: "AI资料研究助手", ai: "按你的问题快速搜集资料、列出对比表、标出差异和需要核实的地方", you: "定好要比较什么、核实关键信息、做最后选择",
        why: "查资料往往一查就是半天，AI 擅长先帮你把信息摊开、理清楚。",
        before: ["自己到处搜", "打开十几个网页", "手抄要点", "凭印象比较"], after: ["说清你要比较什么", "AI 汇总成对比表", "你核实关键信息", "做决定"] }, demo: "table" },
    { id: "organize", name: "整理文档、表格、记录信息", dir: "减负", pains: ["repeat", "mess", "error", "slow"],
      ex: { life: "整理家庭开支、照片、孩子学习资料", work: "整理会议记录、文件归档、表格汇总", boss: "整理客户资料、合同台账、经营数据" },
      opp: { name: "AI整理归档助手", ai: "把零散的文字、表格、记录整理成统一格式，提取要点、分类归档", you: "给出整理规则、抽查结果、处理例外情况",
        why: "整理类工作规则清楚、重复多，是最容易先交给 AI 的事。",
        before: ["收集零散信息", "一条条复制粘贴", "手动分类", "检查遗漏"], after: ["把材料丢给 AI", "AI 按规则整理成表", "你抽查纠错", "存档"] }, demo: "table" },
    { id: "think", name: "思考问题、做计划、设计方案、作决定", dir: "增能", pains: ["start", "skill", "limited", "error"],
      ex: { life: "做旅行/学习/理财计划、想清楚一件家里的大事", work: "写方案、拆解项目、准备汇报思路", boss: "定经营计划、想新业务、权衡重要决定" },
      opp: { name: "AI思考陪练", ai: "帮你把想法拆成几个方面、列出不同方案的利弊、提出你可能漏掉的问题", you: "提供真实情况、做判断和最终决定",
        why: "卡在“不知从何开始”时，有个随时可问的陪练，能让你更快理清思路。",
        before: ["脑子里想来想去", "迟迟动不了笔", "问几个人意见", "拖到最后匆忙决定"], after: ["把问题说给 AI", "AI 拆成几个方面和选项", "你补充真实情况", "你做决定、定下一步"] }, demo: "plan" },
    { id: "create", name: "写东西、做PPT、图片、视频", dir: "创造", pains: ["start", "slow", "skill", "limited"],
      ex: { life: "写游记、做家庭相册视频、写贺卡和发言稿", work: "写报告、做PPT、做宣传图", boss: "做产品介绍、朋友圈和短视频内容、招商资料" },
      opp: { name: "AI内容创作搭档", ai: "根据你的要点出初稿、提纲、配图或视频脚本，按你的意见反复修改", you: "提供真实素材和观点、把关风格和事实、决定发布",
        why: "从零开始写和做最耗精力，AI 先给一个初稿，你只需要改。",
        before: ["对着空白页发呆", "自己从头写/做", "反复改", "勉强交差"], after: ["你说要点和素材", "AI 出 2～3 版初稿", "你挑一版改", "定稿发布"] }, demo: "draft" },
    { id: "comm", name: "和别人沟通、回复消息、处理客户问题", dir: "减负", pains: ["coord", "repeat", "slow", "error"],
      ex: { life: "回复群消息、和物业/学校沟通、写邀请或道歉", work: "回邮件和消息、跨部门沟通、写通知", boss: "回复客户咨询、处理售后、跟进合作方" },
      opp: { name: "AI沟通回复助手", ai: "帮你起草回复、整理常见问题的标准答复、把长消息提炼成要点", you: "确认语气和内容、处理需要真人判断和关系维护的部分",
        why: "很多消息内容相似，AI 起草、你确认，能省下大量来回时间。",
        before: ["逐条看消息", "每次重新组织语言", "反复斟酌措辞", "漏回或回晚"], after: ["AI 先提炼要点", "AI 按你的口吻起草", "你确认或微调", "发送"] }, demo: "reply" },
    { id: "routine", name: "处理重复操作、事务、琐碎工作", dir: "减负", pains: ["repeat", "slow", "error", "resource"],
      ex: { life: "生活账单、预约提醒、购物清单", work: "表格汇总、写日报、处理文件", boss: "业务报表、订单处理、客户资料、人员协作" },
      opp: { name: "AI琐事减负清单", ai: "把重复的步骤写成固定模板或清单，自动汇总、提醒、生成固定格式的内容", you: "定规则、检查结果、处理不按套路来的情况",
        why: "重复又琐碎的事最消耗精力，固定下来交给 AI，省下的时间每周都能感受到。",
        before: ["每次手动重复操作", "到处找数据", "复制粘贴汇总", "容易漏和错"], after: ["定好一次规则", "AI 按模板汇总/生成", "你核对一下", "完成"] }, demo: "table" },
    { id: "manage", name: "安排任务、推进项目、管理团队或家庭事务", dir: "减负", pains: ["coord", "limited", "error", "resource"],
      ex: { life: "安排家里的日程、孩子的课程、搬家装修", work: "排进度、跟进任务、写周报", boss: "分配任务、跟进团队进度、开会定事" },
      opp: { name: "AI事务推进助手", ai: "把大事拆成任务清单和时间表、整理会议纪要和待办、提醒跟进", you: "定优先级、和人沟通协调、拍板",
        why: "事情多、人多时最容易乱，AI 帮你理清单和节奏，你专注在人和决定上。",
        before: ["事情记在脑子里", "临时想起来再安排", "反复追问进度", "有事漏掉"], after: ["把事情说给 AI", "AI 拆成清单和时间表", "你定优先级、分配", "AI 整理进度提醒"] }, demo: "plan" },
    { id: "learn", name: "学习新知识、训练技能、探索兴趣", dir: "增能", pains: ["skill", "start", "limited", "slow"],
      ex: { life: "学外语、学乐器/摄影、了解健康知识、陪孩子学习", work: "学新技能、准备考试/认证、了解新领域", boss: "了解新行业、学管理和经营知识" },
      opp: { name: "AI私人学习教练", ai: "按你的水平定学习计划、用大白话讲解、出练习题并点评", you: "坚持练习、提出不懂的地方、在真实场景里用起来",
        why: "有一个随时可问、不嫌你问题简单的老师，学新东西会快很多。",
        before: ["不知道从哪学起", "资料东一块西一块", "遇到问题没人问", "学了就忘"], after: ["告诉 AI 你的目标和基础", "AI 定计划、讲解", "你练习、AI 点评", "用在真实场景"] }, demo: "plan" },
    { id: "other", name: "其他 / 说不清", dir: "增能", pains: ["start", "limited", "none"], ex: { life: "以上都不太像，或者还没想好", work: "以上都不太像，或者还没想好", boss: "以上都不太像，或者还没想好" } }
  ];

  var Q6_EXAMPLES = [
    "每周要把几张表汇总成一份报告，总是花一下午",
    "想给自己的小店写朋友圈和产品介绍，但不知道怎么写",
    "想做一个家庭旅行计划，比较几个目的地",
    "想学会用AI帮孩子辅导英语"
  ];

  // 敏感/高风险：命中则加人机协作提示（简单关键词，宁可多提醒）
  var SENSITIVE = /(医|病|药|诊|健康|法律|律师|合同|诉讼|财务|税|投资|理财|贷款|股票|保险|心理|孩子隐私|身份证|病人|患者)/;
  var SENSITIVE_STATUS = { pro: true };

  var data = { STATUS: STATUS, GOALS: GOALS, PAINS: PAINS, FREQ: FREQ, IMPACT: IMPACT, MONTH: MONTH, SCENES: SCENES, Q6_EXAMPLES: Q6_EXAMPLES, SENSITIVE: SENSITIVE, SENSITIVE_STATUS: SENSITIVE_STATUS,
    MAX_GOALS: 3, MAX_SCENES: 4, Q6_MAX: 300 };
  if (typeof module !== "undefined" && module.exports) module.exports = data;
  else root.ASDX_V2_DATA = data;
})(typeof window !== "undefined" ? window : this);
