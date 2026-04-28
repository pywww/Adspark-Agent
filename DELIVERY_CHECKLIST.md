# 交付验收清单（生成 + 微调 + 入库）

## A. 运行环境

- [ ] 后端在 `agent-ad-web/backend` 目录启动成功（`npm run dev`）
- [ ] 前端在 `agent-ad-web` 目录启动成功（`npm run dev`）
- [ ] `backend/.env` 已配置 `COZE_API_TOKEN` / `COZE_WORKFLOW_ID`
- [ ] `GET /api/health` 返回 `ok: true`

## B. 主流程验收

- [ ] 输入需求并发送，可进入“摘要确认”状态
- [ ] 点击确认后可发起生成，请求不再长期卡死
- [ ] 成功返回后，右侧画布出现候选图
- [ ] 失败时有明确提示（超时/网络/后端错误）

## C. 微调流程验收

- [ ] 将右侧候选图拖拽到左侧输入区，出现微调目标标记
- [ ] 输入自然语言微调并发送，请求能返回新候选
- [ ] 新候选带有 `generation_mode=refine`
- [ ] 若图片链接不可预览，卡片显示“生成成功但预览失败”并可“打开原链接”

## D. 入库流程验收

- [ ] 点击入库触发 `/api/candidates/:id/finalize`
- [ ] 返回 `material_id`，候选状态变为 `approved`
- [ ] `/api/materials` 查询到新增正式资产

## E. API 管理能力

- [ ] `/api/candidates` 支持分页（`page`、`page_size`）和排序（`order`）
- [ ] `/api/materials` 支持分页（`page`、`page_size`）和排序（`order`）
- [ ] 列表接口返回 `meta`（总数、总页数、当前页）

## F. 回归建议

- [ ] 清理 `backend/data` 后跑一轮全新任务，验证无历史污染
- [ ] 连续微调 2-3 轮，确认链路稳定
- [ ] 断网/错误 token 场景下，错误提示可理解
