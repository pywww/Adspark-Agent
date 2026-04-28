import { useRef, useState, useEffect } from 'react';
import styles from './UserMenu.module.css';

/** 文档 §1.2：账号、退出（占位） */
export function UserMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', fn);
    return () => document.removeEventListener('click', fn);
  }, []);

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.avatar}>U</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <button type="button" className={styles.item} role="menuitem">
            账号
          </button>
          <button type="button" className={styles.item} role="menuitem">
            退出
          </button>
        </div>
      )}
    </div>
  );
}
