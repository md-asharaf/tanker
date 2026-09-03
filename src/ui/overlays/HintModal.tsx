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
      <div
        className="overlay-card anim-fade-in"
        style={{ width: 'min(92vw, 480px)', padding: '28px 24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overlay-title overlay-title--gold" style={{ marginBottom: 12 }}>
          💡 HINT
        </div>

        {q?.question && (
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 12, fontWeight: 600 }}>
            Question: <span style={{ color: '#ffffff', fontWeight: 800 }}>"{q.question}"</span>
          </div>
        )}

        <div className="hint-modal-body">
          {q?.hint ? q.hint : 'Identify the correct definition target and destroy it.'}
        </div>

        <div className="btn-row" style={{ marginTop: 24 }}>
          <button className="btn btn--primary" onClick={dismiss} style={{ minWidth: 160 }} aria-label="Close hint">
            GOT IT
          </button>
        </div>
      </div>
    </div>
  );
}
