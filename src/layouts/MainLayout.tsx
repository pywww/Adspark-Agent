import { Outlet } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import styles from './MainLayout.module.css';

export function MainLayout() {
  return (
    <div className={styles.app}>
      <AppHeader />
      <div className={styles.outlet}>
        <Outlet />
      </div>
    </div>
  );
}
