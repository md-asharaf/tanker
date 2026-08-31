import { useGameStore } from '../../game/gameStore';

export function ErrorOverlay() {
  const { phase, errorMessage, newGame } = useGameStore();
  if (phase !== 'error') return null;

  return (
    <div className="overlay overlay--dim">
      <div className="overlay-card anim-fade-in" style={{ borderColor: 'rgba(232,64,64,0.4)' }}>
        <div className="overlay-title overlay-title--wrong">⚠ MISSION FAILED</div>
        <div className="overlay-subtitle">
          Unable to prepare mission.
          <br />
          <span style={{ color: 'var(--col-text)', fontSize: 13, marginTop: 6, display: 'block' }}>
            {errorMessage ?? 'Unknown error occurred.'}
          </span>
        </div>
        <div className="btn-row">
          <button
            className="btn btn--danger"
            onClick={() => { newGame(); }}
            aria-label="Try again"
          >
            ↺ TRY AGAIN
          </button>
        </div>
      </div>
    </div>
  );
}
