# KiteAI Bounty submission draft

**Direction:** `x402-service`

**Repository:** https://github.com/zhengqiuwan/kite-web-reader

**Commit SHA:** use the latest published `git rev-parse HEAD` value.

## 本次交付说明

Kite Web Reader 为 AI Agent 提供基于 Kite x402 的网页正文提取服务。
输入公开 HTML 文章链接，返回标题、作者、摘要、语言、正文、Markdown 与来源地址。
通过官方 x402 SDK 实现未付款返回 402、支付验证、成功提取后结算；
抓取与提取失败不发起结算，结算失败不交付文章内容。
包含 SSRF 防护、DNS 地址固定、跳转校验、大小与超时限制，以及自动化测试、
离线演示、Dockerfile 和中英文使用说明。

## 可复查验收材料

- `npm ci && npm run check`：类型检查、行为测试和构建。
- `npm run demo`：明确标记为模拟的 HTTP 支付流程与提取结果。
- `test/payment.test.ts`：真实 x402 中间件 + 模拟 facilitator 的生命周期断言。
- `test/reader.test.ts`：网页提取、内网限制、重定向、大小与时间限制。
- `docs/VERIFICATION.md`：本次实际执行的验证结果与未验证事项。

## 尚待补充的线上材料

- 公开 HTTPS 部署地址：未提供。
- 自己的公开收款地址：未配置。
- 真实测试网调用输出与交易哈希：未生成。
- 官方服务目录 manifest / 上游 PR：未提交。

当前只能如实申报源码 MVP，不能声明已经完成真实链上支付验收。
部署和真实支付完成后，在此补充实际凭证，再评估是否满足当期审核要求。

## 看板填写提醒

目标提交账号是 `zhengqiuwan`，请确认仓库转移已被该账号接受，且这也是你在活动看板绑定的 GitHub 账号。
如果此前已登记其他仓库，应沿用已登记仓库。后续每周在同一仓库持续开发，
提交新增 Commit SHA 与真实更新说明。
