import { useEffect } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import styles from './ToastHost.module.css';

export function ToastHost() {
  const { state, dispatch } = useWorkspace();

  useEffect(() => {
    if (state.toasts.length === 0) return;
    const t = setTimeout(() => {
      const id = state.toasts[0]?.id;
      if (id) dispatch({ type: 'DISMISS_TOAST', id });
    }, 3200);
    return () => clearTimeout(t);
  }, [state.toasts, dispatch]);

  if (state.toasts.length === 0) return null;
  const t = state.toasts[state.toasts.length - 1];

  return (
    <div className={styles.host} role="status">
      <div
        className={
          t.type === 'success'
            ? styles.toastOk
            : t.type === 'error'
              ? styles.toastErr
              : styles.toastInfo
        }
      >
        {t.text}
      </div>
    </div>
  );
}
