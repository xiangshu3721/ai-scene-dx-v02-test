# asdxAiProxy 部署说明

环境：`root-journey-prod-d4d7pzd0a8f805`  
函数：`asdxAiProxy`（type=HTTP）  
路径：`/asdx-ai`  
公开基址：

```text
https://root-journey-prod-d4d7pzd0a8f805-1304965105.ap-shanghai.app.tcloudbase.com/asdx-ai
```

## 关键

1. 在本目录准备好 `index.js` / `v2-engine.js` / `v2-data.js` / `scf_bootstrap`。
2. **密钥只写进云函数环境变量 `DEEPSEEK_API_KEY`，不要写进本仓库。** 可用本机临时 `cloudbaserc.local.json`（已 gitignore）注入后部署，部署完立刻删掉本地密钥。
3. 部署：

```bash
tcb fn deploy asdxAiProxy --httpFn --dir . --runtime Nodejs20.19 --install-dependency false -e root-journey-prod-d4d7pzd0a8f805
```

4. **不要只用 `--path` 绑网关**：`--path` 有时会建成 Event 型「Cloud function」路由，访问会报 `FUNCTIONS_PARAM_INVALID`。应删除错误路由后执行：

```bash
tcb service delete -e root-journey-prod-d4d7pzd0a8f805 -p /asdx-ai
tcb service create -e root-journey-prod-d4d7pzd0a8f805 -p /asdx-ai -f asdxAiProxy
```

正确时 `tcb service list` 里 Trigger type 应为 **Cloud hosting**。

5. 健康检查：`curl -sS "$BASE/health"` → `{"ok":true,"ai":true}`
