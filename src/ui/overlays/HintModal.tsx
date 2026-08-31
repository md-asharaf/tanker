import { useGameStore } from '../../game/gameStore';
import { AudioManager } from '../../audio/AudioManager';

export function HintModal() {
  const { phase, questions, currentQuestionIndex, hintVisible, setHintVisible, setPhase } = useGameStore();

  const visible = (phase === 'playing' || phase === 'aiming' || phase === 'hint') && hintVisible;
  if (!visible) return null;

  const q = questions[currentQuestionIndex];

  const dismiss = () => {
    AudioManager.play('uiClick');
    setHintVisible(false);
    if (phase === 'hint') setPhase('playing');
  };

  return (
    <div className="overlay overlay--dim" onClick={dismiss}>
      <div className="overlay-card anim-fade-in" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-title overlay-title--gold">💡 INTEL</div>
        <div className="hint-text">{q?.hint ?? 'No hint available.'}</div>
        <div className="btn-row">
          <button className="btn btn--primary" onClick={dismiss} aria-label="Close hint">
            GOT IT
          </button>
        </div>
      </div>
    </div>
  );
}
