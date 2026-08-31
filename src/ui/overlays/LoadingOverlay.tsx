import { useEffect, useState } from 'react';
import { useGameStore } from '../../game/gameStore';
import { AudioManager } from '../../audio/AudioManager';

export function LoadingOverlay() {
  const { phase, startNewGame } = useGameStore();
  const [progress, setProgress] = useState(25);
  const [statusText, setStatusText] = useState('CONNECTING SATELLITE RADAR...');

  useEffect(() => {
    if (phase !== 'loading') {
      setProgress(25);
      setStatusText('CONNECTING SATELLITE RADAR...');
      return;
    }

    const t1 = setTimeout(() => {
      setProgress(60);
      setStatusText('FETCHING QUESTIONS & CALIBRATING TANKS...');
    }, 200);

    const t2 = setTimeout(() => {
      setProgress(95);
      setStatusText('PREPARING 3D BATTLEFIELD...');
    }, 500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [phase]);

  if (phase !== 'menu' && phase !== 'loading') return null;

  const handlePlayClick = () => {
    AudioManager.play('uiClick');
    startNewGame();
  };

  return (
    <div className="overlay overlay--dim">
      <div className="overlay-card anim-slide-up" style={{ width: 'min(92vw, 540px)', padding: '36px 32px' }}>
        {/* Game Logo & Branding */}
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'clamp(28px, 6.5vw, 44px)',
              fontWeight: 900,
              color: 'var(--col-gold)',
              letterSpacing: '0.14em',
              textShadow: '0 0 32px rgba(255, 213, 79, 0.6), 0 4px 14px rgba(0,0,0,0.9)',
              lineHeight: 1.1,
            }}
          >
            TANK TRIVIA
          </div>
          <div
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'clamp(12px, 2.8vw, 16px)',
              fontWeight: 700,
              color: '#81d4fa',
              letterSpacing: '0.35em',
              marginTop: 4,
            }}
          >
            HILLS OF STEEL
          </div>
        </div>

        {phase === 'menu' ? (
          /* ── 1. MAIN MENU SCREEN (ZERO PRE-FETCH) ── */
          <div className="anim-fade-in">
            <div
              style={{
                background: 'rgba(255, 213, 79, 0.08)',
                border: '1.5px solid rgba(255, 213, 79, 0.35)',
                borderRadius: 16,
                padding: '14px 18px',
                marginBottom: 22,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 10, fontFamily: 'var(--font-heading)', color: '#94a3b8', letterSpacing: '0.15em', marginBottom: 4 }}>
                GAME OBJECTIVE
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', lineHeight: 1.4 }}>
                Calculate ballistic angles, aim 360°, and destroy the correct enemy tank!
              </div>
            </div>

            {/* Controls Guide */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
                marginBottom: 26,
              }}
            >
              <div className="control-guide-card">
                <div style={{ fontSize: 20, marginBottom: 4 }}>🎯</div>
                <div className="guide-title">AIM</div>
                <div className="guide-desc">Move Cursor (360°)</div>
              </div>
              <div className="control-guide-card">
                <div style={{ fontSize: 20, marginBottom: 4 }}>💥</div>
                <div className="guide-title">FIRE</div>
                <div className="guide-desc">Click / Spacebar</div>
              </div>
              <div className="control-guide-card">
                <div style={{ fontSize: 20, marginBottom: 4 }}>🚗</div>
                <div className="guide-title">DRIVE</div>
                <div className="guide-desc">A / D Keys</div>
              </div>
            </div>

            {/* Play Button */}
            <button
              className="btn btn--primary btn--start"
              onClick={handlePlayClick}
              aria-label="Play Game"
            >
              ▶ PLAY GAME
            </button>
          </div>
        ) : (
          /* ── 2. LOADING STATE (FETCHING ONLY ON USER COMMAND) ── */
          <div className="anim-fade-in" style={{ padding: '16px 8px' }}>
            <div className="loading-radar-ring">
              <div className="loading-radar-sweep" />
              <div className="loading-radar-core">🎯</div>
            </div>

            <div
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 13,
                fontWeight: 700,
                color: '#e2e8f0',
                letterSpacing: '0.12em',
                marginBottom: 16,
              }}
            >
              {statusText}
            </div>

            <div className="loading-bar-wrap">
              <div
                className="loading-bar-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, fontFamily: 'var(--font-heading)', letterSpacing: '0.1em' }}>
              {progress}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
