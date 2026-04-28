import { useMemo, useState, useEffect } from 'react';
import type { SummarySnapshot } from '../types';
import { patchTask } from '../lib/taskStorage';
import { useWorkspace } from '../context/WorkspaceContext';
import { requestIntentSummaryChips } from '../lib/intentParserClient';
import { generateFromConfirmedSummary } from '../lib/workspaceFlows';
import styles from './SummaryCardMessage.module.css';

/** 文档 §3.1：点改 + 确认并生成 */
export function SummaryCardMessage({ snapshot }: { snapshot: SummarySnapshot }) {
  const { state, dispatch } = useWorkspace();
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const isCurrent = snapshot.version === state.summaryVersion;
  const confirmed = isCurrent && state.summaryConfirmed;
  const isHistory = snapshot.version < state.summaryVersion;

  const parsed = useMemo(() => {
    let market = '';
    let topic = '';
    let style = '';
    let scene = '';
    let productSubject = '';
    let platform = '';
    let hasLegacyRatio = false;
    for (const c of snapshot.chips) {
      if (c.startsWith('市场:')) market = c.slice(3);
      if (c.startsWith('主题:')) topic = c.slice(3);
      if (c.startsWith('风格:')) style = c.slice(3);
      if (c.startsWith('场景:')) scene = c.slice(3);
      if (c.startsWith('主体:')) productSubject = c.slice(3);
      if (c.startsWith('平台:')) platform = c.slice(3);
      if (c.startsWith('比例:')) hasLegacyRatio = true;
    }
    const normalizedStyle = style || (hasLegacyRatio ? '通用商业风' : '');
    return {
      market,
      topic,
      style: normalizedStyle,
      scene,
      productSubject,
      platform,
      hasLegacyRatio,
    };
  }, [snapshot.chips]);

  const [market, setMarket] = useState(parsed.market);
  const [topic, setTopic] = useState(parsed.topic);
  const [style, setStyle] = useState(parsed.style || '未填');
  const [scene, setScene] = useState(parsed.scene || '未填');
  const [productSubject, setProductSubject] = useState(parsed.productSubject || '未填');
  const [platform, setPlatform] = useState(parsed.platform || '通用');

  useEffect(() => {
    setMarket(parsed.market);
    setTopic(parsed.topic);
    setStyle(parsed.style || '未填');
    setScene(parsed.scene || '未填');
    setProductSubject(parsed.productSubject || '未填');
    setPlatform(parsed.platform || '通用');
  }, [
    snapshot.id,
    parsed.market,
    parsed.topic,
    parsed.style,
    parsed.scene,
    parsed.productSubject,
    parsed.platform,
  ]);

  useEffect(() => {
    if (!parsed.hasLegacyRatio) return;
    const nextChips = [
      `市场:${(parsed.market || '未填').trim() || '未填'}`,
      `主题:${(parsed.topic || '未填').trim() || '未填'}`,
      `风格:${(parsed.style || '通用商业风').trim() || '通用商业风'}`,
      `场景:${(parsed.scene || '未填').trim() || '未填'}`,
      `主体:${(parsed.productSubject || '未填').trim() || '未填'}`,
      `平台:${(parsed.platform || '通用').trim() || '通用'}`,
    ];
    dispatch({ type: 'UPDATE_SNAPSHOT_CHIPS', snapshotId: snapshot.id, chips: nextChips });
  }, [
    dispatch,
    parsed.hasLegacyRatio,
    parsed.market,
    parsed.style,
    parsed.topic,
    snapshot.id,
  ]);

  const buildCommittedChips = () => {
    return [
      `市场:${market.trim() || '未填'}`,
      `主题:${topic.trim() || '未填'}`,
      `风格:${style.trim() || '未填'}`,
      `场景:${scene.trim() || '未填'}`,
      `主体:${productSubject.trim() || '未填'}`,
      `平台:${platform.trim() || '通用'}`,
    ];
  };

  const commitChips = () => {
    const chips = buildCommittedChips();
    dispatch({ type: 'UPDATE_SNAPSHOT_CHIPS', snapshotId: snapshot.id, chips });
  };

  const handleRegenerateSummary = async () => {
    if (regenerating) return;
    const latestUserMessage = [...state.messages]
      .reverse()
      .find((m) => m.role === 'user')?.content;
    const userText = (latestUserMessage || '').replace(/^【微调】/, '').trim();
    if (!userText) {
      dispatch({
        type: 'TOAST',
        toast: {
          id: crypto.randomUUID(),
          type: 'error',
          text: '未找到可用于重生成的用户输入',
        },
      });
      return;
    }
    setRegenerating(true);
    dispatch({
      type: 'ADD_ASSISTANT_MESSAGE',
      content: '思考中，正在生成摘要...',
      kind: 'thinking',
    });
    try {
      const chips = await requestIntentSummaryChips(userText);
      dispatch({ type: 'CLEAR_THINKING_MESSAGES' });
      dispatch({ type: 'ADD_SUMMARY_DRAFT_WITH_CHIPS', chips });
      setFeedback(null);
    } catch (error) {
      dispatch({ type: 'CLEAR_THINKING_MESSAGES' });
      dispatch({
        type: 'ADD_ASSISTANT_MESSAGE',
        content: '摘要重生成失败，请稍后重试。',
      });
      dispatch({
        type: 'TOAST',
        toast: {
          id: crypto.randomUUID(),
          type: 'error',
          text: error instanceof Error ? error.message : '摘要重生成失败，请稍后重试',
        },
      });
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.card} role="region" aria-label="摘要卡片">
        <div className={styles.title}>{snapshot.title} · 第 {snapshot.version} 版</div>
        {!isHistory && !confirmed ? (
          <div className={styles.form}>
            <label className={styles.row}>
              <span>市场</span>
              <input
                value={market}
                onChange={(e) => setMarket(e.target.value)}
                onBlur={commitChips}
              />
            </label>
            <label className={styles.row}>
              <span>主题</span>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onBlur={commitChips}
              />
            </label>
            <label className={styles.row}>
              <span>风格</span>
              <input
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                onBlur={commitChips}
              />
            </label>
            <label className={styles.row}>
              <span>场景</span>
              <input
                value={scene}
                onChange={(e) => setScene(e.target.value)}
                onBlur={commitChips}
              />
            </label>
            <label className={styles.row}>
              <span>主体</span>
              <input
                value={productSubject}
                onChange={(e) => setProductSubject(e.target.value)}
                onBlur={commitChips}
              />
            </label>
            <label className={styles.row}>
              <span>平台</span>
              <input
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                onBlur={commitChips}
              />
            </label>
          </div>
        ) : (
          <div className={styles.chips}>
            {snapshot.chips.map((c) => (
              <span key={c} className={styles.chip}>
                {c}
              </span>
            ))}
          </div>
        )}
        <div className={styles.meta}>
          {new Date(snapshot.createdAt).toLocaleString()}
        </div>
        {isHistory && <span className={styles.history}>历史版本</span>}
        {!isHistory && !confirmed && (
          <button
            type="button"
            className={styles.confirm}
            disabled={state.generating}
            onClick={async () => {
              const chips = buildCommittedChips();
              // 先把当前输入写回摘要卡，再按“已确认版本”调用生成，避免读取到旧 chips
              dispatch({ type: 'UPDATE_SNAPSHOT_CHIPS', snapshotId: snapshot.id, chips });
              dispatch({ type: 'CONFIRM_SUMMARY' });
              patchTask(state.taskId, {
                status: 'in_progress',
                updatedAt: new Date().toISOString(),
              });
              const briefOverride = {
                ...(snapshot.brief ?? {
                  intentType: 'create' as const,
                  constraints: [],
                  negativeConstraints: [],
                  outputGoal: '',
                  normalizedUserIntent: '',
                }),
                market: market.trim() || '未填',
                topic: topic.trim() || '未填',
                style: style.trim() || '未填',
                scene: scene.trim() || '未填',
                productSubject: productSubject.trim() || '未填',
                platform: platform.trim() || '通用',
              };
              const nextState = {
                ...state,
                summaryConfirmed: true,
                latestIntentBrief: briefOverride,
                summarySnapshots: state.summarySnapshots.map((item) =>
                  item.id === snapshot.id ? { ...item, chips, brief: briefOverride } : item,
                ),
              };
              await generateFromConfirmedSummary(
                nextState,
                dispatch,
                {
                  skipSummaryGuard: true,
                  briefOverride,
                },
              );
            }}
          >
            {state.generating ? '生成中…' : '确认并生成'}
          </button>
        )}
        {!isHistory && confirmed && <span className={styles.badge}>已确认</span>}
      </div>
      {!isHistory && (
        <div className={styles.feedbackRow}>
          <button
            type="button"
            className={`${styles.iconBtn} ${feedback === 'up' ? styles.iconBtnActive : ''}`}
            aria-label="赞同此结果"
            title="赞同此结果"
            onClick={() => setFeedback('up')}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M9 11V20H5V11H9ZM11 20H18.3C19.2 20 20 19.3 20 18.4L20.8 13.4C20.9 12.4 20.1 11.5 19.1 11.5H14L14.6 8.6C14.8 7.7 14.5 6.8 13.8 6.2L13.1 5.5L9.2 9.4C8.8 9.8 8.6 10.3 8.6 10.9V19.5C8.6 20 9 20.4 9.5 20.4H11Z" />
            </svg>
          </button>
          <button
            type="button"
            className={`${styles.iconBtn} ${feedback === 'down' ? styles.iconBtnActive : ''}`}
            aria-label="不赞同此结果"
            title="不赞同此结果"
            onClick={() => setFeedback('down')}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M15 13V4H19V13H15ZM13 4H5.7C4.8 4 4 4.7 4 5.6L3.2 10.6C3.1 11.6 3.9 12.5 4.9 12.5H10L9.4 15.4C9.2 16.3 9.5 17.2 10.2 17.8L10.9 18.5L14.8 14.6C15.2 14.2 15.4 13.7 15.4 13.1V4.5C15.4 4 15 3.6 14.5 3.6H13Z" />
            </svg>
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="重新生成摘要"
            title="重新生成摘要"
            onClick={() => void handleRegenerateSummary()}
            disabled={regenerating}
          >
            {regenerating ? (
              <svg viewBox="0 0 24 24" aria-hidden className={styles.spinning}>
                <path d="M21 12A9 9 0 1 1 8.6 3.5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M20 11A8 8 0 1 0 8.6 19.4M20 4V11H13" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
