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
- `COZE_WORKFLOW_ID`
- `COZE_API_BASE_URL`（默认 `https://api.coze.cn`）

若不填 `COZE_API_TOKEN/COZE_WORKFLOW_ID`，服务会走 Mock 出图，方便先联调前端流程。

## 3. 主要接口

### 3.1 生成（首次 + 微调）

`POST /api/workflow/generate`

请求体示例：

```json
{
  "task_id": "task-001",
  "market": "日本",
  "topic": "冥想垫",
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

### 3.2 候选列表

`GET /api/candidates?task_id=task-001`

### 3.3 确认入库

`POST /api/candidates/:id/finalize`

将候选图状态从 `pending_review` 变为 `approved`，并写入正式资产库。

### 3.4 拒绝候选

`POST /api/candidates/:id/reject`

## 4. 数据存储

当前为本地 JSON 文件（便于快速开发）：

- `backend/data/generation_candidates.json`
- `backend/data/material_library.json`

后续可替换为 MySQL / Postgres。
