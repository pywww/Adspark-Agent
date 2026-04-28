# agent-ad-web — 电商广告创作 Agent 前端（P0）

依据已确认文档实现：

- [Agent前端界面设计方案-待确认.md](../AGENT/Agent前端界面设计方案-待确认.md)
- [Agent前端界面方案v1.0.md](../AGENT/Agent前端界面方案v1.0.md)

## 技术栈

- Vite 8 + React 19 + TypeScript + react-router-dom 7

## 命令

```bash
cd PMMM/agent-ad-web
npm install
npm run dev
```

浏览器打开终端提示的本地地址（一般为 `http://localhost:5173`）。

## 已实现（P0）

- 路由：`/`、`/tasks`、`/workspace/:taskId`、`/library`、`/settings`
- L1 `AppHeader`：工作台｜资产库｜设置、新建任务
- L2 `WorkspaceHeader`：任务名、生图设置、任务素材 Popover、定稿并入库、导出
- 左栏：DeepSeek 式任务侧栏 + 对话 + 摘要卡片 + BriefComposer
- 右栏：CanvasToolbar（网格/对比、生成 Mock、多选）、ImageGrid、CompareView、预览条、FinalizeBar
- 本地持久化：`localStorage` 任务列表、最近任务、定稿资产（资产库页）

## 后续（P1）

- 接入真实 BFF / Coze 工作流 API
- 批量导出 ZIP、任务素材「载入草稿」完整逻辑
- UI 组件库与设计稿像素级对齐
