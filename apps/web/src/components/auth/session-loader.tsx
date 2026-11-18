export function SessionLoader() {
  return (
    <main className="session-loader" aria-live="polite" aria-busy="true">
      <div className="session-loader__pulse" aria-hidden="true" />
      <h1>جارٍ التحميل…</h1>
    </main>
  );
}
