import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '../../game/gameStore';

interface Props {
  onStart: () => void;
}

export function LoadingOverlay({ onStart }: Props) {
  const { phase } = useGameStore();
  const [step, setStep] = useState(1);
  const started = useRef(false);

  // Progressive steps animation while waiting or ready
  useEffect(() => {
    if (phase !== 'loading' && phase !== 'ready') {
      started.current = false;
      return;
    }

    const t1 = setTimeout(() => setStep((s) => Math.max(s, 2)), 300);
    const t2 = setTimeout(() => setStep((s) => Math.max(s, 3)), 700);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [phase]);

  // When phase becomes 'ready', advance smoothly to game start
  useEffect(() => {
    if (phase === 'ready' && !started.current) {
      setStep(3);
      const timer = setTimeout(() => {
        if (!started.current) {
          started.current = true;
          onStart();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [phase, onStart]);

  if (phase !== 'loading' && phase !== 'ready') return null;

  const isReady = phase === 'ready';
  const progress = isReady ? 100 : step === 1 ? 40 : step === 2 ? 75 : 95;

  return (
    <div className="overlay loading-overlay" style={{ flexDirection: 'column' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="loading-title">⚙ PREPARING MISSION</div>
        <ul className="loading-steps">
          <li className={isReady || step >= 1 ? 'done' : 'anim-pulse'}>
            Loading questions...
          </li>
          <li
            className={isReady || step >= 2 ? 'done' : step === 1 ? 'anim-pulse' : ''}
            style={{ opacity: isReady || step >= 1 ? 1 : 0.3 }}
          >
            Preparing battlefield...
          </li>
          <li
            className={isReady || step >= 3 ? 'done' : step === 2 ? 'anim-pulse' : ''}
            style={{ opacity: isReady || step >= 2 ? 1 : 0.3 }}
          >
            Deploying tanks...
          </li>
        </ul>

        <div className="loading-bar-wrap">
          <div className="loading-bar-fill" style={{ width: `${progress}%` }} />
        </div>

        {isReady && (
          <div
            style={{
              fontSize: 13,
              color: 'var(--col-correct)',
              fontFamily: 'var(--font-heading)',
              letterSpacing: '0.12em',
              marginTop: 8,
              animation: 'fadeIn 0.2s ease',
            }}
          >
            ✓ MISSION READY
          </div>
        )}
      </div>
    </div>
  );
}
