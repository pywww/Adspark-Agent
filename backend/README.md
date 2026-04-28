# Agent 后端服务（生成 + 微调 + 入库）

## 1. 安装与启动

```bash
cd backend
npm install
npm run dev
```

默认端口：`8787`

健康检查：

`GET /api/health`

## 2. 环境变量

复制 `.env.example` 为 `.env`，按需填写：

- `COZE_API_TOKEN`
- `COZE_BOT_ID`（推荐：Agent 优先模式）
- `COZE_USER_ID`（可选，不填则后端自动生成）
- `COZE_FORCE_AGENT_ONLY`（`true` 时只允许 Agent，不回退 workflow/local）
- `COZE_WORKFLOW_ID`
- `COZE_PARSE_WORKFLOW_ID`（可选，摘要卡 ParseFlow 的 workflow id）
- `COZE_INTENT_WORKFLOW_ID`（可选，推荐单独配置意图解析工作流）
- `COZE_WRITEBACK_WORKFLOW_ID`（可选，审核通过后写回 Coze 动态库）
- `COZE_API_BASE_URL`（默认 `https://api.coze.cn`）

若不填 `COZE_API_TOKEN/COZE_WORKFLOW_ID`，服务会走 Mock 出图，方便先联调前端流程。

## 3. 主要接口

### 3.0 意图解析（新增）

`POST /api/intent/parse`

请求体示例：

```json
{
  "text": "给日本市场做冥想垫广告图，4:5，治愈自然风，背景更干净"
}
```

返回中包含：`intent_type`、`market`、`topic`、`ratio`、`style`、`constraints`、`normalized_user_intent`。  
另外会返回 `source` 字段：`coze_agent`、`coze` 或 `local_fallback`，用于判断本次是否命中 Coze 大模型。

> 调用优先级：`Agent(Bot)` -> `Workflow` -> `local_fallback`。

### 3.1 生成（首次 + 微调）

`POST /api/workflow/generate`

请求体示例：

```json
{
  "task_id": "task-001",
  "market": "日本",
  "topic": "冥想垫",
  "style": "治愈自然风",
  "user_intent": "保持风格，背景更简洁，主体更居中",
  "is_refine": true,
  "history_prompt": "single product ad image ...",
  "history_seed": "12345",
  "history_image_url": "",
  "history_material_id": "M-001",
  "parent_candidate_id": "cand-001"
}
```

服务会自动清洗 `history_prompt`，并在非法内容报错时用安全兜底文案重试一次。

两段式约束：
- 首次生成（`is_refine=false`）必须传 `market/topic/style`
- 微调生成（`is_refine=true`）必须传历史上下文（`history_prompt` 或 `history_image_url` 或 `parent_candidate_id`）

### 3.2 候选列表

`GET /api/candidates?task_id=task-001`

### 3.3 确认入库

`POST /api/candidates/:id/finalize`

将候选图状态从 `pending_review` 变为 `approved`，并写入正式资产库。
若配置了 `COZE_WRITEBACK_WORKFLOW_ID`，会在本地入库成功后自动调用写回工作流同步到 Coze 动态库。

### 3.4 拒绝候选

`POST /api/candidates/:id/reject`

### 3.5 手动 CTR 回填（MVP）

`POST /api/materials/:id/ctr`

请求体：

```json
{
  "ctr": 0.08
}
```

`ctr` 取值范围必须在 `0~1`。

## 4. 数据存储

当前为本地 JSON 文件（便于快速开发）：

- `backend/data/generation_candidates.json`
- `backend/data/material_library.json`

后续可替换为 MySQL / Postgres。
