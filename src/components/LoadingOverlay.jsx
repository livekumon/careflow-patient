export default function LoadingOverlay({ show, message = 'Loading…' }) {
  return (
    <div className={`loading-overlay${show ? ' show' : ''}`} aria-live="polite" aria-busy={show}>
      <div className="loading-card">
        <div className="spinner" aria-hidden="true" />
        <span>{message}</span>
      </div>
    </div>
  );
}
