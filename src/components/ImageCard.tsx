import { useEffect, useState } from 'react';
import type { GeneratedAsset } from '../types';
import { toPreviewUrl } from '../lib/imageProxy';
import styles from './ImageCard.module.css';

interface Props {
  asset: GeneratedAsset;
  selected: boolean;
  multiSelectMode: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  onToggleSelect: () => void;
  onDragStart: (e: React.DragEvent<HTMLButtonElement>) => void;
  onOpenPreview: () => void;
}

export function ImageCard({
  asset,
  selected,
  multiSelectMode,
  onPointerDown,
  onWheel,
  onToggleSelect,
  onDragStart,
  onOpenPreview,
}: Props) {
  const [loadFailed, setLoadFailed] = useState(false);
  const [imgSrc, setImgSrc] = useState(toPreviewUrl(asset.imageUrl));
  const [retryCount, setRetryCount] = useState(0);
  const [showRef, setShowRef] = useState(false);

  const buildRetryUrl = (url: string) =>
    `${url}${url.includes('?') ? '&' : '?'}_retry=${Date.now()}`;

  useEffect(() => {
    setLoadFailed(false);
    setImgSrc(toPreviewUrl(asset.imageUrl));
    setRetryCount(0);
  }, [asset.imageUrl, asset.id]);

  const triggerRetry = () => {
    setLoadFailed(false);
    setRetryCount(0);
    setImgSrc(buildRetryUrl(toPreviewUrl(asset.imageUrl)));
  };

  return (
    <div
      className={`${styles.card} ${selected ? styles.cardSelected : ''}`}
      onPointerDown={onPointerDown}
      onWheel={onWheel}
    >
      <div className={styles.imageWrap}>
        {multiSelectMode && (
          <button
            type="button"
            className={selected ? styles.checkBtnOn : styles.checkBtn}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect();
            }}
            aria-label={selected ? '取消选中图片' : '选中图片'}
            aria-pressed={selected}
            title={selected ? '取消选中' : '选中用于批量导出'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M5 12l4 4 10-10" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className={styles.imgBtn}
          onClick={onToggleSelect}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onOpenPreview();
          }}
          aria-pressed={selected}
          disabled={asset.failed}
          draggable={!asset.failed}
          onDragStart={onDragStart}
        >
          {!loadFailed ? (
            <img
              src={imgSrc}
              alt=""
              className={styles.img}
              draggable={false}
              onError={() => {
                if (retryCount < 2) {
                  const next = retryCount + 1;
                  setRetryCount(next);
                  setImgSrc(buildRetryUrl(toPreviewUrl(asset.imageUrl)));
                  return;
                }
                setLoadFailed(true);
              }}
              onLoad={() => {
                if (loadFailed) setLoadFailed(false);
              }}
            />
          ) : (
            <div className={styles.fallback}>
              <span className={styles.fallbackTitle}>生成成功但预览失败</span>
              <span className={styles.fallbackDesc}>链接可能为工作流页而非图片直链</span>
              <button
                type="button"
                className={styles.retryBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerRetry();
                }}
              >
                重新加载
              </button>
              <a
                href={asset.imageUrl}
                target="_blank"
                rel="noreferrer"
                className={styles.fallbackLink}
                onClick={(e) => e.stopPropagation()}
              >
                打开原链接
              </a>
            </div>
          )}
        </button>
        <button
          type="button"
          className={styles.cornerRefBtn}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setShowRef((v) => !v);
          }}
          aria-label={showRef ? '收起依据' : '查看依据'}
          title={showRef ? '收起依据' : '查看依据'}
          aria-expanded={showRef}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6z" />
            <circle cx="12" cy="12" r="2.8" />
          </svg>
        </button>
      </div>
      {showRef && (
        <div className={styles.metaPanel}>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>参考依据</span>
            <span className={styles.metaValue}>
              {asset.trendUsed ? '爆款案例 / 市场趋势' : '爆款案例'}
            </span>
          </div>
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>视觉特征</span>
            <span className={styles.metaValue}>{asset.visualDna || '未返回'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
