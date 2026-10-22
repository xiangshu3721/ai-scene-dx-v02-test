/*!
 * 与 server/cloudbase/index.js 同一套 V0.3 代理。
 * 云函数部署用 cloudbase 目录；本文件给本机 `node server/ai-proxy.js` 启动。
 */
"use strict";
const app = require("./cloudbase/index.js");
if (require.main === module) {
  const port = +process.env.PORT || 9000;
  app.server.listen(port, () => console.log("ai-proxy listening on " + port));
}
module.exports = app;
