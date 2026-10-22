/*!
 * track.js · 埋点（V0.2）
 * 现状：仓库里没有统计通道。先记在本机（localStorage: asdx.events.v1，最多 200 条）+ 控制台。
 * 接口：ASDX_CONFIG.TRACK_ENDPOINT 填了地址后，用 sendBeacon 发送 {event, data, t}。
 * 只发匿名数据（报告编号、事件名），不含自由文字。
 * 事件：test_complete / report_view / consult_open / contact_qr_open / contact_copy_wechat /
 *       contact_save_qr   （点联系方式 = 意向，不等于预约）
 */
(function (root) {
  "use strict";
  var KEY = "asdx.events.v1";
  function track(event, data) {
    var ev = { event: event, data: data || {}, t: Date.now() };
    try { if (root.console) console.log("[asdx-track]", event, ev.data); } catch (e) {}
    try {
      var l = JSON.parse(root.localStorage.getItem(KEY) || "[]"); if (!Array.isArray(l)) l = [];
      l.push(ev); root.localStorage.setItem(KEY, JSON.stringify(l.slice(-200)));
    } catch (e) {}
    var ep = ((root.ASDX_CONFIG || {}).TRACK_ENDPOINT || "").trim();
    if (ep && root.navigator && navigator.sendBeacon) {
      try { navigator.sendBeacon(ep, new Blob([JSON.stringify(ev)], { type: "application/json" })); } catch (e) {}
    }
    return ev;
  }
  root.ASDX_TRACK = track;
  root.ASDX_TRACK.list = function () { try { return JSON.parse(root.localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } };
})(window);
