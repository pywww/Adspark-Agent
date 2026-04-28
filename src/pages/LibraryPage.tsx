import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { FinalizedRecord } from '../types';
import { loadAllFinalized, patchFinalized } from '../lib/finalizedStorage';
import {
  dayKeyFromIso,
  formatLibraryDayHeading,
  HIGH_CTR_THRESHOLD,
  isHighPerforming,
} from '../lib/finalizedRecordUtils';
import {
  isLibraryDemoAsset,
  LIBRARY_DEMO_RECORDS,
} from '../lib/libraryDemoMock';
import { getLibraryImageSrc } from '../lib/libraryImageSrc';
import { loadTasks } from '../lib/taskStorage';
import styles from './LibraryPage.module.css';

type MainTab = 'image' | 'video';
type SubFilter = 'all' | 'favorites';
const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  'http://localhost:8787';
const MATERIAL_PAGE_SIZE = 24;

interface MaterialApiRecord {
  material_id: string;
  source_candidate_id?: string;
  task_id: string;
  image_url: string;
  final_prompt?: string;
  visual_dna?: string;
  review_status?: string;
  ctr?: number;
  created_at: string;
  market?: string;
  topic?: string;
  style?: string;
  scene?: string;
  product_subject?: string;
  constraints?: string[];
  negative_constraints?: string[];
  output_goal?: string;
  trend_used?: boolean;
  trend_source?: 'live' | 'cache' | 'none' | 'circuit_open';
  trend_conflict?: boolean;
  trend_conflict_reason?: string;
  trend_range?: '3d' | '7d' | '15d' | '30d';
  trend_keywords?: string[];
  knowledge_used?: string;
  platform_fit_notes?: string;
  platform_preset?: string;
  reference_summary?: string;
  reference_hit_count?: number;
  reference_used?: boolean;
  reference_count?: number;
  reference_mode?: 'style' | 'structure';
  reference_weight?: number;
  debug_received_fields?: Record<string, unknown>;
  debug_trend_used?: boolean;
  debug_rag_hit_count?: number;
  debug_final_prompt_excerpt?: string;
  intent_source?: string;
  model_name?: string;
  parent_material_id?: string | null;
  source?: string;
  platform?: string;
}

interface MaterialListApiResponse {
  ok?: boolean;
  data?: MaterialApiRecord[];
  meta?: {
    page?: number;
    page_size?: number;
    total?: number;
    total_pages?: number;
    order?: 'asc' | 'desc';
  };
}

function pctText(value?: number): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(2)}%`;
}

function intText(value?: number): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString();
}

function calcRate(numerator?: number, denominator?: number): number | undefined {
  if (
    numerator === undefined ||
    denominator === undefined ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return undefined;
  }
  return numerator / denominator;
}

function moneyText(value?: number): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—';
  return `¥${value.toFixed(2)}`;
}

function toRateInput(value?: number): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return '';
  return String((value * 100).toFixed(2));
}

function parseRateInput(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(1, Math.max(0, n / 100));
}

function parsePositiveInt(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n);
}

function toDateInput(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeDeliveryStatus(status?: string): string {
  const s = String(status || '').trim().toLowerCase();
  if (!s) return '未投放';
  if (s === 'approved' || s === '批准了' || s === '已批准') return '已投放';
  if (s === 'pending' || s === 'pending_review' || s === '待审核') return '待投放';
  if (s === 'rejected' || s === '驳回') return '投放失败';
  return String(status);
}

function groupItemsByDay(items: FinalizedRecord[]): { dayKey: string; rows: FinalizedRecord[] }[] {
  const map = new Map<string, FinalizedRecord[]>();
  for (const item of items) {
    const k = dayKeyFromIso(item.createdAt);
    const arr = map.get(k) ?? [];
    arr.push(item);
    map.set(k, arr);
  }
  const keys = [...map.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  return keys.map((dayKey) => ({
    dayKey,
    rows: (map.get(dayKey) ?? []).sort(
      (x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime(),
    ),
  }));
}

function matchesSearch(rec: FinalizedRecord, q: string, taskLabel: string): boolean {
  if (!q.trim()) return true;
  const s = q.trim().toLowerCase();
  const hay = [
    rec.materialId,
    taskLabel,
    rec.market,
    rec.topic,
    rec.finalPrompt,
    rec.deliveryStatus,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(s);
}

/** 即梦式资产库：双行顶栏、按日分组、缩略图 CTR 胶囊 + 数据脚 + 高表现/收藏样式 */
export function LibraryPage() {
  const [search, setSearchParams] = useSearchParams();
  const highlight = search.get('highlight');
  const [listTick, setListTick] = useState(0);
  const localItems = useMemo(() => loadAllFinalized(), [listTick]);
  const [remoteItems, setRemoteItems] = useState<FinalizedRecord[] | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const localIndex = useMemo(
    () => new Map(localItems.map((item) => [item.materialId, item])),
    [localItems],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setRemoteLoading(true);
      setRemoteError('');
      try {
        const resp = await fetch(
          `${API_BASE}/api/materials?page=${page}&page_size=${MATERIAL_PAGE_SIZE}&order=desc`,
        );
        const json = (await resp.json().catch(() => ({}))) as MaterialListApiResponse;
        if (!resp.ok || json.ok === false) {
          throw new Error('资产库接口不可用，已回退本地数据');
        }
        const mapped = (json.data ?? []).map((item) => {
          const local = localIndex.get(item.material_id);
          return {
            materialId: item.material_id,
            assetId: item.source_candidate_id ?? item.material_id,
            imageUrl: item.image_url,
            taskId: item.task_id,
            createdAt: item.created_at,
            market: item.market,
            topic: item.topic,
            style: item.style,
            scene: item.scene,
            productSubject: item.product_subject,
            finalPrompt: item.final_prompt,
            visualDna: item.visual_dna,
            ctr: item.ctr,
            deliveryStatus: normalizeDeliveryStatus(
              local?.business?.deliveryStatus || item.review_status,
            ),
            constraints: item.constraints,
            negativeConstraints: item.negative_constraints,
            outputGoal: item.output_goal,
            trendUsed: item.trend_used,
            trendSource: item.trend_source,
            trendConflict: item.trend_conflict,
            trendConflictReason: item.trend_conflict_reason,
            trendRange: item.trend_range,
            trendKeywords: item.trend_keywords,
            knowledgeUsed: item.platform_fit_notes || item.knowledge_used,
            platformPreset: item.platform || item.platform_preset,
            referenceSummary: item.reference_summary,
            referenceHitCount: item.reference_hit_count,
            referenceUsed: item.reference_used,
            referenceCount: item.reference_count,
            referenceMode: item.reference_mode,
            referenceWeight: item.reference_weight,
            debugReceivedFields: item.debug_received_fields,
            debugTrendUsed: item.debug_trend_used,
            debugRagHitCount: item.debug_rag_hit_count,
            debugFinalPromptExcerpt: item.debug_final_prompt_excerpt,
            intentSource: item.intent_source,
            modelName: item.model_name,
            parentMaterialId: item.parent_material_id,
            source: item.source,
            business: local?.business,
            ingest: local?.ingest,
          };
        }) satisfies FinalizedRecord[];
        if (!cancelled) {
          setRemoteItems(mapped);
          setTotalPages(Math.max(1, json.meta?.total_pages ?? 1));
        }
      } catch (error) {
        if (!cancelled) {
          setRemoteItems(null);
          setTotalPages(1);
          setRemoteError(
            error instanceof Error ? error.message : '资产库接口不可用，已回退本地数据',
          );
        }
      } finally {
        if (!cancelled) setRemoteLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [page, listTick, localIndex]);

  const usingRemote = Array.isArray(remoteItems);
  const rawItems = usingRemote ? remoteItems : localItems;
  const usingDemo = !usingRemote && rawItems.length === 0;
  const catalog = usingDemo ? LIBRARY_DEMO_RECORDS : rawItems;
  const bumpList = () => setListTick((t) => t + 1);

  const [mainTab, setMainTab] = useState<MainTab>('image');
  const [subFilter, setSubFilter] = useState<SubFilter>('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selectedId, setSelectedId] = useState<string | null>(highlight);

  useEffect(() => {
    if (highlight) setSelectedId(highlight);
  }, [highlight]);

  const taskLabel = (rec: FinalizedRecord) =>
    rec.taskName ?? loadTasks().find((t) => t.id === rec.taskId)?.name ?? rec.taskId.slice(0, 8);

  const filtered = useMemo(() => {
    return catalog.filter((rec) => {
      if (subFilter === 'favorites' && !rec.business?.starred) return false;
      return matchesSearch(rec, query, taskLabel(rec));
    });
  }, [catalog, subFilter, query]);

  const grouped = useMemo(() => groupItemsByDay(filtered), [filtered]);
  const listSorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [filtered],
  );

  const selected = useMemo(
    () => catalog.find((x) => x.materialId === selectedId) ?? null,
    [catalog, selectedId],
  );

  const [bizDraft, setBizDraft] = useState({
    tags: '',
    campaignId: '',
    notes: '',
    starred: false,
    markAsHigh: false,
    deliveryStatus: '未投放' as NonNullable<FinalizedRecord['business']>['deliveryStatus'],
    deliveryPlatform: '',
    deliveryDate: '',
    exposureRate: '',
    conversionRate: '',
    impressions: '',
    clicks: '',
    conversions: '',
  });

  useEffect(() => {
    if (!selected) return;
    setBizDraft({
      tags: (selected.business?.tags ?? []).join(', '),
      campaignId: selected.business?.campaignId ?? '',
      notes: selected.business?.notes ?? '',
      starred: selected.business?.starred ?? false,
      markAsHigh: selected.business?.markAsHigh ?? false,
      deliveryStatus: selected.business?.deliveryStatus ?? '未投放',
      deliveryPlatform: selected.business?.deliveryPlatform ?? '',
      deliveryDate: toDateInput(selected.business?.deliveryDate || selected.createdAt),
      exposureRate: toRateInput(selected.business?.exposureRate),
      conversionRate: toRateInput(selected.business?.conversionRate),
      impressions: selected.business?.impressions
        ? String(selected.business.impressions)
        : '',
      clicks: selected.business?.clicks ? String(selected.business.clicks) : '',
      conversions: selected.business?.conversions
        ? String(selected.business.conversions)
        : '',
    });
  }, [selected]);

  const openDetail = (rec: FinalizedRecord) => {
    setSelectedId(rec.materialId);
    const next = new URLSearchParams(search);
    next.set('highlight', rec.materialId);
    setSearchParams(next, { replace: true });
  };

  const closeDetail = () => {
    setSelectedId(null);
    const next = new URLSearchParams(search);
    next.delete('highlight');
    setSearchParams(next, { replace: true });
  };

  const ctrText = (r: FinalizedRecord) =>
    r.ctr !== undefined ? `${(r.ctr * 100).toFixed(2)}%` : '—';

  const saveBusiness = () => {
    if (!selected || isLibraryDemoAsset(selected.materialId)) return;
    const tags = bizDraft.tags
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    patchFinalized(selected.materialId, {
      business: {
        tags: tags.length ? tags : undefined,
        campaignId: bizDraft.campaignId.trim() || undefined,
        notes: bizDraft.notes.trim() || undefined,
        starred: bizDraft.starred,
        markAsHigh: bizDraft.markAsHigh,
        deliveryStatus: bizDraft.deliveryStatus,
        deliveryPlatform: bizDraft.deliveryPlatform.trim() || undefined,
        deliveryDate: bizDraft.deliveryDate || undefined,
        exposureRate: parseRateInput(bizDraft.exposureRate),
        conversionRate: parseRateInput(bizDraft.conversionRate),
        impressions: parsePositiveInt(bizDraft.impressions),
        clicks: parsePositiveInt(bizDraft.clicks),
        conversions: parsePositiveInt(bizDraft.conversions),
      },
    });
    bumpList();
  };

  const cardClass = (rec: FinalizedRecord, on: boolean) => {
    const high = isHighPerforming(rec);
    const parts = [styles.card];
    if (high) parts.push(styles.cardHighPerforming);
    if (on) parts.push(styles.cardOn);
    return parts.join(' ');
  };

  const renderGridCard = (f: FinalizedRecord) => {
    const high = isHighPerforming(f);
    const on = f.materialId === selectedId;
    const cardStatus = normalizeDeliveryStatus(f.deliveryStatus);
    return (
      <button
        key={f.materialId}
        type="button"
        className={cardClass(f, on)}
        onClick={() => openDetail(f)}
      >
        <div className={styles.thumbWrap}>
          {high && (
            <span className={styles.highBadge} title="高表现">
              <span className={styles.highBadgeDot} aria-hidden />
              高表现
            </span>
          )}
          <span className={styles.ctrPill}>{ctrText(f)}</span>
          <img
            src={getLibraryImageSrc(f, 480)}
            alt=""
            className={styles.img}
            loading="lazy"
          />
        </div>
        <div className={styles.dataFoot}>
          <div className={styles.dataFootRow}>
            <span className={styles.dataFootLabel}>平台</span>
            <span className={styles.dataFootValue}>{f.platformPreset ?? '—'}</span>
          </div>
          <div className={styles.dataFootMuted}>
            {(f.market ?? '—') + ' · ' + (f.topic ?? '—') + ' · ' + cardStatus}
          </div>
        </div>
      </button>
    );
  };

  const emptyReal =
    !usingDemo && rawItems.length === 0 ? (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>暂无定稿记录</p>
        <p className={styles.emptyDesc}>请在工作台将图片入库后，将在此按日期展示</p>
      </div>
    ) : null;

  return (
    <main className={styles.jimengMain}>
      {usingDemo && (
        <div className={styles.demoRibbon} role="status">
          当前为<strong>演示数据</strong>（模拟成片占位图），工作台图片入库后将替换为真实素材
        </div>
      )}
      {!usingDemo && remoteError && (
        <div className={styles.remoteHint} role="status">
          {remoteError}
        </div>
      )}

      <header className={styles.jimengHeader}>
        <h1 className={styles.jimengTitle}>资产库</h1>
        <p className={styles.jimengSub}>已定稿素材 · 按日浏览</p>
      </header>

      <div className={styles.primaryTabRow} role="tablist" aria-label="资产类型">
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === 'image'}
          className={mainTab === 'image' ? styles.primaryTabOn : styles.primaryTab}
          onClick={() => setMainTab('image')}
        >
          图片
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === 'video'}
          className={mainTab === 'video' ? styles.primaryTabOn : styles.primaryTab}
          onClick={() => setMainTab('video')}
        >
          视频
        </button>
        <button type="button" className={styles.primaryTabSoon} disabled title="敬请期待">
          无限画布
        </button>
        <button type="button" className={styles.primaryTabSoon} disabled title="敬请期待">
          图片编辑器
        </button>
      </div>

      <div className={styles.subToolRow}>
        <div className={styles.subTabs} role="tablist" aria-label="筛选">
          <button
            type="button"
            className={subFilter === 'all' ? styles.subTabOn : styles.subTab}
            onClick={() => setSubFilter('all')}
          >
            {mainTab === 'image' ? '所有图片' : '所有视频'}
          </button>
          <button
            type="button"
            className={subFilter === 'favorites' ? styles.subTabOn : styles.subTab}
            onClick={() => setSubFilter('favorites')}
          >
            我的收藏
          </button>
        </div>
        <div className={styles.toolCluster}>
          <label className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden>
              ⌕
            </span>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="搜索素材、任务、市场…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="搜索"
            />
          </label>
          <button type="button" className={styles.toolBtn} disabled title="敬请期待">
            批量操作
          </button>
          <button type="button" className={styles.toolBtn} disabled title="敬请期待">
            同步到剪映
          </button>
          <div className={styles.viewSeg} role="group" aria-label="视图">
            <button
              type="button"
              className={view === 'grid' ? styles.viewSegOn : styles.viewSegBtn}
              onClick={() => setView('grid')}
            >
              网格
            </button>
            <button
              type="button"
              className={view === 'list' ? styles.viewSegOn : styles.viewSegBtn}
              onClick={() => setView('list')}
            >
              列表
            </button>
          </div>
        </div>
      </div>

      <p className={styles.thresholdHint}>
        高表现：CTR ≥ {(HIGH_CTR_THRESHOLD * 100).toFixed(0)}% 或详情内「人工标为高表现」· 缩略图左下角为 CTR
      </p>

      {selected && (
        <section className={styles.detail} aria-label="资产详情">
          {isLibraryDemoAsset(selected.materialId) && (
            <p className={styles.demoDetailNote}>演示素材仅用于界面预览，保存业务字段已禁用。</p>
          )}
          <div className={styles.detailImg}>
            <img src={getLibraryImageSrc(selected, 720)} alt="" loading="eager" />
          </div>
          <div className={styles.detailBody}>
            <div className={styles.detailHead}>
              <span className={styles.mid}>{selected.materialId}</span>
              <button type="button" className={styles.close} onClick={closeDetail}>
                关闭
              </button>
            </div>

            <section className={styles.metricsRow} aria-label="关键投放信息">
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>CTR / CVR / 曝光率</span>
                <strong className={styles.metricValue}>
                  {ctrText(selected)} / {pctText(selected.business?.conversionRate)} /{' '}
                  {pctText(selected.business?.exposureRate)}
                </strong>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>投放状态</span>
                <strong className={styles.metricValue}>
                  {normalizeDeliveryStatus(
                    selected.business?.deliveryStatus || selected.deliveryStatus || '未投放',
                  )}
                </strong>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>投放平台</span>
                <strong className={styles.metricValue}>
                  {selected.business?.deliveryPlatform || selected.platformPreset || '—'}
                </strong>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricLabel}>投放日期</span>
                <strong className={styles.metricValue}>
                  {bizDraft.deliveryDate ||
                    toDateInput(selected.business?.deliveryDate || selected.createdAt) ||
                    '—'}
                </strong>
              </div>
            </section>

            <div className={styles.infoGrid}>
              <section className={`${styles.infoPanel} ${styles.deliveryPanel}`}>
                <h3 className={styles.sectionTitle}>投放数据</h3>
                <dl className={styles.kvGrid}>
                  <dt>投放计划 ID</dt>
                  <dd>{selected.business?.campaignId ?? '—'}</dd>
                  <dt>投放平台 / 状态</dt>
                  <dd>
                    {selected.business?.deliveryPlatform || selected.platformPreset || '—'} /{' '}
                    {normalizeDeliveryStatus(
                      selected.business?.deliveryStatus || selected.deliveryStatus || '未投放',
                    )}
                  </dd>
                  <dt>投放日期</dt>
                  <dd>{bizDraft.deliveryDate || toDateInput(selected.business?.deliveryDate) || '—'}</dd>
                  <dt>曝光 / 点击 / 转化</dt>
                  <dd>
                    {intText(selected.business?.impressions)} / {intText(selected.business?.clicks)} /{' '}
                    {intText(selected.business?.conversions)}
                  </dd>
                  <dt>CTR / CVR</dt>
                  <dd>
                    {pctText(
                      selected.ctr ??
                        calcRate(selected.business?.clicks, selected.business?.impressions),
                    )}{' '}
                    /{' '}
                    {pctText(
                      selected.business?.conversionRate ??
                        calcRate(selected.business?.conversions, selected.business?.clicks),
                    )}
                  </dd>
                  <dt>点击成本 CPC</dt>
                  <dd>{moneyText(undefined)}</dd>
                  <dt>单次转化成本 CPA</dt>
                  <dd>{moneyText(undefined)}</dd>
                  <dt>归因观察窗</dt>
                  <dd>点击 7 天 / 浏览 1 天（Mock）</dd>
                  <dt>投放标签</dt>
                  <dd>{(selected.business?.tags ?? []).join(' / ') || '—'}</dd>
                  <dt>数据更新时间</dt>
                  <dd>{new Date(selected.createdAt).toLocaleString()}</dd>
                  <dt>数据质量</dt>
                  <dd>
                    {selected.business?.impressions || selected.business?.clicks || selected.business?.conversions
                      ? '已回传（部分）'
                      : '待回传'}
                  </dd>
                </dl>
              </section>

              <section className={`${styles.infoPanel} ${styles.materialPanel}`}>
                <h3 className={styles.sectionTitle}>素材生成信息</h3>
                <dl className={styles.kvGrid}>
                  <dt>市场 / 主题</dt>
                  <dd>
                    {selected.market ?? '—'} / {selected.topic ?? '—'}
                  </dd>
                  <dt>风格 / 场景</dt>
                  <dd>
                    {selected.style ?? '—'} / {selected.scene ?? '—'}
                  </dd>
                  <dt>主体 / 用途</dt>
                  <dd>
                    {selected.productSubject ?? '—'} / {selected.outputGoal ?? '—'}
                  </dd>
                  <dt>模型 / 来源</dt>
                  <dd>
                    {selected.modelName ?? '—'} / {selected.platformPreset ?? '通用'} /{' '}
                    {selected.intentSource ?? '—'} / {selected.source ?? '—'}
                  </dd>
                  <dt>父素材</dt>
                  <dd>{selected.parentMaterialId ?? '—'}</dd>
                </dl>
                <div className={styles.longTextGroup}>
                  <p className={styles.longTextTitle}>图片提示词</p>
                  <p className={styles.longTextValue}>{selected.finalPrompt ?? '—'}</p>
                  <p className={styles.longTextTitle}>Visual DNA</p>
                  <p className={styles.longTextValue}>{selected.visualDna ?? '—'}</p>
                </div>
              </section>

              <section className={`${styles.infoPanel} ${styles.strategyPanel}`}>
                <h3 className={styles.sectionTitle}>参考与策略</h3>
                <dl className={styles.kvGrid}>
                  <dt>生成依据</dt>
                  <dd>
                    {selected.trendUsed ? '爆款案例 / 市场趋势' : '爆款案例'}
                  </dd>
                  <dt>生成策略</dt>
                  <dd>
                    {(() => {
                      const mode =
                        String(selected.debugReceivedFields?.explore_mode ?? '')
                          .trim()
                          .toLowerCase() ||
                        String(selected.debugReceivedFields?.exploreMode ?? '')
                          .trim()
                          .toLowerCase();
                      if (mode === 'multi_scene') return '多场景';
                      if (mode === 'multi_style') return '多风格';
                      if (mode === 'single') return '单一稳定';
                      return '—';
                    })()}
                  </dd>
                </dl>
              </section>

            </div>

            <h3 className={styles.sectionTitle}>业务字段</h3>
            <p className={styles.sectionHint}>可编辑，保存后写入本地（用于投放回填与 Agent 自学习）</p>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>投放状态</span>
                <select
                  className={styles.input}
                  value={bizDraft.deliveryStatus}
                  disabled={isLibraryDemoAsset(selected.materialId)}
                  onChange={(e) =>
                    setBizDraft((d) => ({
                      ...d,
                      deliveryStatus: e.target.value as NonNullable<
                        FinalizedRecord['business']
                      >['deliveryStatus'],
                    }))
                  }
                >
                  <option value="未投放">未投放</option>
                  <option value="待投放">待投放</option>
                  <option value="投放中">投放中</option>
                  <option value="已投放">已投放</option>
                  <option value="已下线">已下线</option>
                  <option value="投放失败">投放失败</option>
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>投放平台</span>
                <input
                  className={styles.input}
                  value={bizDraft.deliveryPlatform}
                  disabled={isLibraryDemoAsset(selected.materialId)}
                  onChange={(e) =>
                    setBizDraft((d) => ({ ...d, deliveryPlatform: e.target.value }))
                  }
                  placeholder="如：Amazon, TikTok"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>投放日期</span>
                <input
                  type="date"
                  className={styles.input}
                  value={bizDraft.deliveryDate}
                  disabled={isLibraryDemoAsset(selected.materialId)}
                  onChange={(e) =>
                    setBizDraft((d) => ({ ...d, deliveryDate: e.target.value }))
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>标签（逗号分隔）</span>
                <input
                  className={styles.input}
                  value={bizDraft.tags}
                  disabled={isLibraryDemoAsset(selected.materialId)}
                  onChange={(e) => setBizDraft((d) => ({ ...d, tags: e.target.value }))}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>投放计划 ID</span>
                <input
                  className={styles.input}
                  value={bizDraft.campaignId}
                  disabled={isLibraryDemoAsset(selected.materialId)}
                  onChange={(e) =>
                    setBizDraft((d) => ({ ...d, campaignId: e.target.value }))
                  }
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>曝光率（%）</span>
                <input
                  className={styles.input}
                  value={bizDraft.exposureRate}
                  disabled={isLibraryDemoAsset(selected.materialId)}
                  onChange={(e) =>
                    setBizDraft((d) => ({ ...d, exposureRate: e.target.value }))
                  }
                  placeholder="例如 12.5"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>转化率 CVR（%）</span>
                <input
                  className={styles.input}
                  value={bizDraft.conversionRate}
                  disabled={isLibraryDemoAsset(selected.materialId)}
                  onChange={(e) =>
                    setBizDraft((d) => ({ ...d, conversionRate: e.target.value }))
                  }
                  placeholder="例如 3.2"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>曝光量</span>
                <input
                  className={styles.input}
                  value={bizDraft.impressions}
                  disabled={isLibraryDemoAsset(selected.materialId)}
                  onChange={(e) =>
                    setBizDraft((d) => ({ ...d, impressions: e.target.value }))
                  }
                  placeholder="整数"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>点击量</span>
                <input
                  className={styles.input}
                  value={bizDraft.clicks}
                  disabled={isLibraryDemoAsset(selected.materialId)}
                  onChange={(e) => setBizDraft((d) => ({ ...d, clicks: e.target.value }))}
                  placeholder="整数"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>转化量</span>
                <input
                  className={styles.input}
                  value={bizDraft.conversions}
                  disabled={isLibraryDemoAsset(selected.materialId)}
                  onChange={(e) =>
                    setBizDraft((d) => ({ ...d, conversions: e.target.value }))
                  }
                  placeholder="整数"
                />
              </label>
              <label className={styles.fieldFull}>
                <span className={styles.fieldLabel}>备注</span>
                <textarea
                  className={styles.textarea}
                  rows={3}
                  value={bizDraft.notes}
                  disabled={isLibraryDemoAsset(selected.materialId)}
                  onChange={(e) => setBizDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </label>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={bizDraft.starred}
                  disabled={isLibraryDemoAsset(selected.materialId)}
                  onChange={(e) =>
                    setBizDraft((d) => ({ ...d, starred: e.target.checked }))
                  }
                />
                <span>加入「我的收藏」</span>
              </label>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={bizDraft.markAsHigh}
                  disabled={isLibraryDemoAsset(selected.materialId)}
                  onChange={(e) =>
                    setBizDraft((d) => ({ ...d, markAsHigh: e.target.checked }))
                  }
                />
                <span>人工标为高表现（与 CTR 规则并列）</span>
              </label>
              <button
                type="button"
                className={styles.saveBiz}
                disabled={isLibraryDemoAsset(selected.materialId)}
                onClick={saveBusiness}
              >
                保存业务字段
              </button>
            </div>

            {isLibraryDemoAsset(selected.materialId) ? (
              <p className={styles.backTaskMuted}>
                来源任务（演示）：{taskLabel(selected)}
              </p>
            ) : (
              <Link className={styles.backTask} to={`/workspace/${selected.taskId}`}>
                来源任务：{taskLabel(selected)} →
              </Link>
            )}
          </div>
        </section>
      )}

      {mainTab === 'video' ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>视频资产</p>
          <p className={styles.emptyDesc}>敬请期待，当前请使用「图片」浏览演示栅格</p>
        </div>
      ) : emptyReal ? (
        emptyReal
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>无匹配素材</p>
          <p className={styles.emptyDesc}>试试调整搜索或筛选条件</p>
        </div>
      ) : view === 'grid' ? (
        <div className={styles.dayGroups}>
          {grouped.map(({ dayKey, rows }) => (
            <section key={dayKey} className={styles.daySection}>
              <h2 className={styles.dayHeading}>{formatLibraryDayHeading(dayKey)}</h2>
              <div className={styles.grid}>{rows.map(renderGridCard)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>缩略图</th>
                <th>Material_ID</th>
                <th>高表现</th>
                <th>收藏</th>
                <th>来源任务</th>
                <th>市场</th>
                <th>主题</th>
                <th>定稿时间</th>
                <th>投放状态</th>
                <th className={styles.ctrCol}>CTR</th>
              </tr>
            </thead>
            <tbody>
              {listSorted.map((f) => (
                <tr
                  key={f.materialId}
                  className={
                    f.materialId === selectedId
                      ? styles.trOn
                      : isHighPerforming(f)
                        ? styles.trHigh
                        : undefined
                  }
                >
                  <td>
                    <button
                      type="button"
                      className={styles.thumbBtn}
                      onClick={() => openDetail(f)}
                    >
                      <img
                        src={getLibraryImageSrc(f, 128)}
                        alt=""
                        className={styles.thumb}
                        loading="lazy"
                      />
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.cellLink}
                      onClick={() => openDetail(f)}
                    >
                      {f.materialId}
                    </button>
                  </td>
                  <td>{isHighPerforming(f) ? '是' : '—'}</td>
                  <td>{f.business?.starred ? '★' : '—'}</td>
                  <td>{taskLabel(f)}</td>
                  <td>{f.market ?? '—'}</td>
                  <td>{f.topic ?? '—'}</td>
                  <td className={styles.nowrap}>
                    {new Date(f.createdAt).toLocaleString()}
                  </td>
                  <td>{normalizeDeliveryStatus(f.deliveryStatus)}</td>
                  <td className={styles.ctrMuted}>{ctrText(f)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {usingRemote && (
        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={remoteLoading || page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span className={styles.pageMeta}>
            第 {page} / {totalPages} 页
          </span>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={remoteLoading || page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            下一页
          </button>
        </div>
      )}
    </main>
  );
}
