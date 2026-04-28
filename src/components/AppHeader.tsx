import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  createTaskId,
  setLastTaskId,
  upsertTask,
} from '../lib/taskStorage';
import { UserMenu } from './UserMenu';
import styles from './AppHeader.module.css';

const nav = [
  { to: '/', label: '工作台' },
  { to: '/library', label: '资产库' },
  { to: '/settings', label: '设置' },
];

export function AppHeader() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const onNewTask = () => {
    const id = createTaskId();
    const name = `新任务 ${id.slice(0, 8)}`;
    upsertTask({
      id,
      name,
      updatedAt: new Date().toISOString(),
      status: 'draft',
      assetCount: 0,
    });
    setLastTaskId(id);
    navigate(`/workspace/${id}`);
  };

  return (
    <header className={styles.header} role="banner">
      <div className={styles.left}>
        <Link to="/" className={styles.logo} aria-label="工作台">
          AdSpark
        </Link>
        <nav className={styles.nav} aria-label="主导航">
          {nav.map((item) => {
            const isWorkspaceNav = item.to === '/';
            const active = isWorkspaceNav
              ? pathname === '/' || pathname === '/tasks' || pathname.startsWith('/workspace')
              : pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={active ? styles.navActive : styles.navLink}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className={styles.right}>
        <button type="button" className={styles.primary} onClick={onNewTask}>
          新建任务
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
