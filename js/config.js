/**
 * AI场景诊断 · 配置
 * ------------------------------------------------------------
 * 这是静态网页，本文件任何人都看得到：这里只放「地址」，绝不放密钥、令牌。
 *
 * SUBMIT_ENDPOINT
 *   预约表单的提交地址（接收 POST JSON）。留空 = 不提交到任何服务器：
 *   页面会生成一张「预约卡」，让用户存图或复制文字发给翔叔，同时存在本机。
 *   填了地址：提交 JSON；失败会明确告诉用户，并在本机排队，下次打开自动重试。
 *   请求体示例见 README.md「预约提交格式」。
 *
 * QUESTION_PROVIDER / PRODUCT_API_BASE
 *   追问出题方式。V0.1 固定 "rules"（本地规则，不调用任何大模型、不需要 API Key）。
 *   未来可改为 "api"：经 Product API → AI Gateway → 多模型路由 出题。
 *   注意：发给出题接口的只有匿名作答数据，永远不含称呼、手机号、微信。
 *
 * AI_ENDPOINT（V0.2）
 *   DeepSeek 服务端代理地址（server/ai-proxy.js 部署后的地址，如 https://xxx.scf.tencentcs.com）。
 *   密钥只在服务端环境变量里，绝不写在这里。留空 = 不调用 AI，报告用本地规则生成（简化版）。
 *
 * TRACK_ENDPOINT（V0.2）
 *   埋点接收地址（sendBeacon POST JSON）。留空 = 只记在本机 localStorage + 控制台。
 *
 * 改完本文件后，把 index.html / advisor.html 里 ?v= 数字加一，避免旧缓存。
 */
window.ASDX_CONFIG = {
  SUBMIT_ENDPOINT: "",
  SUBMIT_TIMEOUT_MS: 12000,
  QUESTION_PROVIDER: "rules",
  PRODUCT_API_BASE: "",
  AI_ENDPOINT: "https://root-journey-prod-d4d7pzd0a8f805-1304965105.ap-shanghai.app.tcloudbase.com/asdx-ai",
  AI_TIMEOUT_MS: 25000,
  TRACK_ENDPOINT: "",
  ADVISOR_NAME: "翔叔",
  PRICE_LAB: 1499,
  SITE_URL: "xiangshu3721.github.io/ai-scene-dx"
};
