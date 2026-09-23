# Kite Web Reader：按次付费的网页正文提取服务

提交方向：**x402-service**。

AI Agent 输入公开文章网址，服务返回标题、作者、摘要、语言、正文、Markdown
和最终来源地址。无需大模型 API Key。使用 TypeScript、Express、Mozilla
Readability、JSDOM、Turndown 和官方 x402 SDK。

## 第一版实现

- `GET /v1/read?url=...`：未付款返回 402 及付款要求。
- 按 `verify → 抓取与提取 → settle` 顺序处理；抓取或提取失败不发起结算。
- 结算失败不返回文章结果；成功响应携带 `PAYMENT-RESPONSE`。
- 阻止内网地址、DNS 重绑定和跳转到内网；限制抓取大小、时间和跳转次数。
- 免费健康检查和项目自定义发现接口。
- 自动化测试、离线演示、Dockerfile 和配置示例。

## 启动

```sh
npm ci
cp .env.example .env
# 在 .env 中填写自己的公开收款地址 PAY_TO，无需私钥。
npm run check
npm start
```

不用钱包也能运行 `npm run demo`，查看离线模拟的完整支付流程。
模拟器只供测试，不存在生产服务跳过支付的配置开关。

## 当前交付边界

这是已实现并可本地验证的源码 MVP。公开部署、真实钱包授权和真实测试网结算
尚未完成，不能把模拟交易当作链上验收凭证。默认使用 Kite 测试网。

第一版只支持普通 HTML 文章，不支持登录、JS 动态渲染、PDF 或付费墙绕过。
默认限制 2 MiB 页面、10 秒抓取、3 次跳转和 8 个并发请求。Markdown 是来自
外部网页的不可信数据，调用方应安全渲染并避免将正文中的指令作为系统指令。

提交材料见 [SUBMISSION.md](SUBMISSION.md)，实际验证记录见
[VERIFICATION.md](VERIFICATION.md)，完整配置和部署步骤见 [项目主页](../README.md)。
