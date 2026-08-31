import { useGameStore } from '../../game/gameStore';
import { AudioManager } from '../../audio/AudioManager';
import { OverlayModal } from './OverlayModal';

export function ErrorOverlay() {
  const { phase, errorMessage, startNewGame } = useGameStore();

  if (phase !== 'error') return null;

  const handleRetry = () => {
    AudioManager.play('uiClick');
    startNewGame();
  };

  return (
    <OverlayModal
      title="⚠ GAME ERROR"
      titleType="wrong"
      subtitle={
        <>
          Unable to load game.
          <br />
          <span style={{ color: '#e2e8f0', fontSize: 13, marginTop: 6, display: 'block' }}>
            {errorMessage ?? 'Unknown error occurred.'}
          </span>
        </>
      }
      animationClass="anim-fade-in"
      footer={
        <button
          className="btn btn--danger"
          onClick={handleRetry}
          aria-label="Try again"
        >
          ↺ TRY AGAIN
        </button>
      }
    />
  );
}
