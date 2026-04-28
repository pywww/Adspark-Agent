import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import styles from './AttachmentPlusMenu.module.css';

const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
  'http://localhost:8787';

interface UploadRecord {
  name: string;
  url: string;
  preview_url?: string;
}

/** 仅支持图片附件：上传至后端后用于 reference_images */
export function AttachmentPlusMenu() {
  const { state, dispatch } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, []);

  const toast = (text: string) => {
    dispatch({
      type: 'TOAST',
      toast: { id: crypto.randomUUID(), type: 'info', text },
    });
    setOpen(false);
  };

  const onPickImages = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  const onFilesChange = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const picked = Array.from(files).filter((file) =>
      ['image/jpeg', 'image/png', 'image/webp'].includes(file.type),
    );
    if (!picked.length) {
      toast('未识别到图片文件');
      return;
    }
    const room = Math.max(0, 6 - state.referenceImages.length);
    if (room <= 0) {
      toast('最多保留 6 张参考图，请先移除后再添加');
      return;
    }
    const images = picked.slice(0, room);
    if (picked.length > images.length) {
      dispatch({
        type: 'TOAST',
        toast: { id: crypto.randomUUID(), type: 'info', text: '最多上传 6 张，已自动截取前 6 张' },
      });
    }

    const formData = new FormData();
    images.forEach((file) => formData.append('images', file));
    setUploading(true);
    dispatch({ type: 'SET_REFERENCE_UPLOADING', value: true });
    try {
      const resp = await fetch(`${API_BASE}/api/upload/reference-images`, {
        method: 'POST',
        body: formData,
      });
      const json = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        data?: UploadRecord[];
        public_reachable?: boolean;
      };
      if (!resp.ok || json.ok === false || !Array.isArray(json.data)) {
        throw new Error(json.message || `上传失败（${resp.status}）`);
      }
      dispatch({
        type: 'ADD_REFERENCE_IMAGES',
        images: json.data.map((item) => ({
          id: crypto.randomUUID(),
          name: item.name,
          // 前端预览优先用本地地址，避免 ngrok 浏览器防护页导致图片裂开
          url: item.preview_url || item.url,
          transportUrl: item.url,
        })),
      });
      if (json.public_reachable === false) {
        dispatch({
          type: 'TOAST',
          toast: {
            id: crypto.randomUUID(),
            type: 'info',
            text: '当前参考图链接可能仅本机可访问，Coze 可能无法取图。请配置后端 PUBLIC_ASSET_BASE_URL 为公网地址。',
          },
        });
      }
      toast(`已添加 ${json.data.length} 张参考图`);
    } catch (error) {
      dispatch({
        type: 'TOAST',
        toast: {
          id: crypto.randomUUID(),
          type: 'error',
          text: error instanceof Error ? error.message : '图片上传失败',
        },
      });
      setOpen(false);
    } finally {
      setUploading(false);
      dispatch({ type: 'SET_REFERENCE_UPLOADING', value: false });
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.plusBtn}
        title="添加附件"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <button
            type="button"
            className={styles.closeBtn}
            aria-label="关闭添加图片"
            title="关闭"
            onClick={() => setOpen(false)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12" />
              <path d="M18 6l-12 12" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className={styles.hiddenInput}
            onChange={(e) => onFilesChange(e.target.files)}
          />
          <button
            type="button"
            className={styles.item}
            role="menuitem"
            onClick={onPickImages}
            disabled={uploading}
          >
            <span className={styles.ico} aria-hidden>
              📎
            </span>
            <span className={styles.itemText}>
              <span className={styles.en}>{uploading ? '上传中，请稍候...' : '添加图片'}</span>
            </span>
          </button>
          {state.referenceImages.length > 0 && (
            <div className={styles.selectedInfo}>已选参考图：{state.referenceImages.length} 张</div>
          )}
        </div>
      )}
    </div>
  );
}
