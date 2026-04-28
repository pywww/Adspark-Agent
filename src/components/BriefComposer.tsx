import { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { requestIntentParse } from '../lib/intentParserClient';
import { generateRefinedAsset } from '../lib/workspaceFlows';
import { AttachmentPlusMenu } from './AttachmentPlusMenu';
import { DataReferencePopover } from './DataReferencePopover';
import { GenerationPreferencesPopover } from './GenerationPreferencesPopover';
import styles from './BriefComposer.module.css';

const MODEL_OPTIONS = [
  'Seedream 5.0',
  'Seedream 4.5',
  '通用多模态 · Pro',
  '通用多模态 · Flash',
] as const;
/** 参考图二：白底输入 + 极淡紫底工具栏、主色发送钮；生图/数据入口见子组件 */
export function BriefComposer() {
  const { state, dispatch } = useWorkspace();
  const [text, setText] = useState('');
  const [dropping, setDropping] = useState(false);

  const refineTarget = state.refineTargetAssetId
    ? state.assets.find((a) => a.id === state.refineTargetAssetId) ?? null
    : null;

  const onSend = async () => {
    const t = text.trim();
    if (!t) return;
    if (state.referenceUploading) {
      dispatch({
        type: 'TOAST',
        toast: {
          id: crypto.randomUUID(),
          type: 'info',
          text: '参考图上传中，请稍候再发送',
        },
      });
      return;
    }
    const sentReferenceImages = [...state.referenceImages];
    setText('');
    dispatch({
      type: 'ADD_USER_MESSAGE',
      content: refineTarget ? `【微调】${t}` : t,
      referenceImages: sentReferenceImages,
    });
    // 发送后清空输入区附件，避免用户误以为下一次仍沿用同一批附件
    dispatch({ type: 'CLEAR_REFERENCE_IMAGES' });
    dispatch({
      type: 'ADD_ASSISTANT_MESSAGE',
      content: '思考中，正在生成摘要...',
      kind: 'thinking',
    });
    try {
      const { brief, chips } = await requestIntentParse(t);
      dispatch({ type: 'CLEAR_THINKING_MESSAGES' });
      dispatch({ type: 'SET_LATEST_INTENT_BRIEF', brief });
      if (refineTarget) {
        // 微调链路：先意图识别，再把解析后的微调意图送入生图工作流
        const refineIntent = brief.normalizedUserIntent?.trim() || t;
        const ok = await generateRefinedAsset(state, dispatch, refineIntent, {
          briefOverride: brief,
        });
        if (!ok) {
          dispatch({
            type: 'TOAST',
            toast: {
              id: crypto.randomUUID(),
              type: 'error',
              text: '微调生成失败，请检查参数后重试',
            },
          });
        }
        return;
      }
      // 首次生图链路：一律弹出摘要卡，用户确认后再调用生图工作流
      dispatch({ type: 'ADD_SUMMARY_DRAFT_WITH_CHIPS', chips, brief, required: true });
    } catch (error) {
      dispatch({ type: 'CLEAR_THINKING_MESSAGES' });
      dispatch({
        type: 'ADD_ASSISTANT_MESSAGE',
        content: '摘要生成失败，请稍后重试或调整表述后再发送。',
      });
      dispatch({
        type: 'TOAST',
        toast: {
          id: crypto.randomUUID(),
          type: 'error',
          text: error instanceof Error ? error.message : '意图解析失败，请稍后重试',
        },
      });
    }
  };

  return (
    <div className={styles.shell}>
      <div
        className={`${styles.inputBlock} ${dropping ? styles.inputBlockDropping : ''}`}
        onDragOver={(e) => {
          const hasAssetId = Array.from(e.dataTransfer.types).includes(
            'application/x-refine-asset-id',
          );
          if (!hasAssetId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropping(false);
          const assetId =
            e.dataTransfer.getData('application/x-refine-asset-id') ||
            e.dataTransfer.getData('text/plain');
          if (!assetId) return;
          const exists = state.assets.some((a) => a.id === assetId);
          if (!exists) return;
          dispatch({ type: 'SET_REFINE_TARGET', assetId });
          dispatch({
            type: 'TOAST',
            toast: {
              id: crypto.randomUUID(),
              type: 'info',
              text: '已选择微调图片，请输入修改意见后发送',
            },
          });
        }}
      >
        {state.referenceImages.length > 0 && (
          <div className={styles.refStrip}>
            {state.referenceImages.map((img) => (
              <span key={img.id} className={styles.refItem}>
                <img src={img.url} alt="" className={styles.refThumb} />
                <span className={styles.refName}>{img.name}</span>
                <button
                  type="button"
                  className={styles.refRemove}
                  onClick={() => dispatch({ type: 'REMOVE_REFERENCE_IMAGE', imageId: img.id })}
                  aria-label="移除参考图"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {refineTarget && (
          <div className={styles.refineTarget}>
            <button
              type="button"
              className={styles.refineClear}
              aria-label="清除微调目标图"
              title="清除微调目标图"
              onClick={() => dispatch({ type: 'CLEAR_REFINE_TARGET' })}
            >
              <img src={refineTarget.imageUrl} alt="" className={styles.refineThumb} />
              <span className={styles.refineClearIcon} aria-hidden>
                ×
              </span>
            </button>
          </div>
        )}
        <textarea
          className={styles.textarea}
          rows={3}
          placeholder={
            refineTarget
              ? '输入微调要求，例如：保持风格，背景更干净，主体更居中'
              : '描述需求或修改意见…'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void onSend();
            }
          }}
        />
      </div>
      <div className={styles.footer}>
        <div className={styles.toolbarLeft}>
          <AttachmentPlusMenu />
          <GenerationPreferencesPopover />
          <DataReferencePopover />
        </div>
        <div className={styles.toolbarRight}>
          <label className={styles.modelWrap}>
            <span className={styles.srOnly}>对话模型</span>
            <select
              className={styles.modelSelect}
              value={state.generateSettings.modelName ?? MODEL_OPTIONS[0]}
              onChange={(e) =>
                dispatch({
                  type: 'SET_SETTINGS',
                  partial: { modelName: e.target.value, engineVersion: e.target.value },
                })
              }
            >
              {MODEL_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.sendBtn}
            title="发送"
            aria-label="发送"
            onClick={() => void onSend()}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
