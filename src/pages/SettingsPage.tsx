import styles from './SettingsPage.module.css';

export function SettingsPage() {
  return (
    <main className={styles.main}>
      <h1 className={styles.h1}>设置</h1>
      <section className={styles.section}>
        <h2 className={styles.h2}>账号</h2>
        <p className={styles.p}>登录与账号绑定（接入后端后启用）。</p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>数据回传</h2>
        <p className={styles.p}>
          CTR/CVR 等投放数据将异步回传并用于 Dynamic
          RAG；此处展示配置说明与开关（占位）。
        </p>
      </section>
      <section className={styles.section}>
        <h2 className={styles.h2}>协作与审核</h2>
        <p className={styles.p}>多人协作、审核流等能力接入前占位。</p>
      </section>
    </main>
  );
}
