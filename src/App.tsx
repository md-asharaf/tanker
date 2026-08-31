import { useCallback, useEffect, useRef, useState } from 'react';
import { GameScene, type GameSceneHandle } from './game/GameScene';
import { useGameStore } from './game/gameStore';
import { fetchQuiz } from './api/quizApi';
import { GAME_CONFIG } from './game/gameConfig';
import { AudioManager } from './audio/AudioManager';

// HUD
import { QuestionPanel } from './ui/hud/QuestionPanel';
import { ScorePanel }    from './ui/hud/ScorePanel';
import { ControlBar }    from './ui/hud/ControlBar';

// Overlays
import { LoadingOverlay }   from './ui/overlays/LoadingOverlay';
import { CountdownOverlay } from './ui/overlays/CountdownOverlay';
import { ResultFeedback }   from './ui/overlays/ResultFeedback';
import { PauseOverlay }     from './ui/overlays/PauseOverlay';
import { HintModal }        from './ui/overlays/HintModal';
import { GameOverOverlay }  from './ui/overlays/GameOverOverlay';
import { ErrorOverlay }     from './ui/overlays/ErrorOverlay';

import './styles/index.css';

// ─────────────────────────────────────────────────────────────────
//  Portrait warning (CSS media query controls display)
// ─────────────────────────────────────────────────────────────────
function PortraitWarning() {
  return (
    <div className="portrait-warning" role="alert" aria-label="Rotate device to landscape">
      <div className="portrait-icon" aria-hidden>📱</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, color: 'var(--col-primary)', marginBottom: 8 }}>
        ROTATE DEVICE
      </div>
      <div style={{ color: 'var(--col-text-muted)', fontSize: 14, lineHeight: 1.5 }}>
        This mission is optimised for landscape.
        <br />
        <span style={{ opacity: 0.6, fontSize: 12 }}>Portrait is still usable.</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Keyboard guide (desktop only, fades after 4 s)
// ─────────────────────────────────────────────────────────────────
function KeyboardGuide() {
  const { phase } = useGameStore();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (phase === 'playing') {
      const t = setTimeout(() => setVisible(false), 4000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase]);

  const isActive = phase === 'playing' || phase === 'aiming';
  if (!isActive || !visible) return null;

  const hints = [
    { key: 'A / D', desc: 'Move' },
    { key: 'Mouse', desc: 'Aim' },
    { key: 'Space', desc: 'Fire' },
    { key: 'P',     desc: 'Pause' },
    { key: 'H',     desc: 'Hint' },
    { key: 'M',     desc: 'Mute' },
  ];

  return (
    <div
      className="keyboard-guide"
      style={{
        position: 'absolute',
        bottom: 52,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 12,
        pointerEvents: 'none',
        opacity: 0.4,
        transition: 'opacity 1s ease',
      }}
    >
      {hints.map(({ key, desc }) => (
        <div key={key} style={{ textAlign: 'center' }}>
          <div style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 4,
            padding: '2px 7px',
            fontFamily: 'var(--font-heading)',
            fontSize: 10,
            letterSpacing: '0.08em',
            color: 'var(--col-primary)',
            marginBottom: 3,
          }}>{key}</div>
          <div style={{ fontSize: 10, color: 'var(--col-text-muted)' }}>{desc}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Touch aiming overlay (drag anywhere on canvas center)
// ─────────────────────────────────────────────────────────────────
interface TouchAimProps {
  onAngleChange: (angle: number) => void;
}

function TouchAimArea({ onAngleChange }: TouchAimProps) {
  const { phase } = useGameStore();
  const touchStartY = useRef<number | null>(null);
  const lastAngle   = useRef(0.4);

  if (phase !== 'playing' && phase !== 'aiming') return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    e.preventDefault();
    const dy     = e.touches[0].clientY - touchStartY.current;
    // Drag up → raise cannon, drag down → lower cannon
    const delta  = -dy / window.innerHeight * 2.5;
    const angle  = Math.max(
      GAME_CONFIG.cannon.minAngle,
      Math.min(GAME_CONFIG.cannon.maxAngle, lastAngle.current + delta)
    );
    lastAngle.current = angle;
    onAngleChange(angle);
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    touchStartY.current = null;
  };

  return (
    <div
      className="aim-drag-area"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ cursor: 'crosshair', touchAction: 'none' }}
      aria-label="Drag to aim cannon"
      role="application"
    />
  );
}

// ─────────────────────────────────────────────────────────────────
//  Mobile controls — left (move) + right (fire)
// ─────────────────────────────────────────────────────────────────
interface MobileControlsProps {
  onLeftStart:   () => void;
  onLeftEnd:     () => void;
  onRightStart:  () => void;
  onRightEnd:    () => void;
  onFire:        () => void;
  onPause:       () => void;
  onHint:        () => void;
}

function MobileControls({
  onLeftStart, onLeftEnd, onRightStart, onRightEnd, onFire, onPause, onHint,
}: MobileControlsProps) {
  const { phase } = useGameStore();
  const visible = phase === 'playing' || phase === 'aiming' || phase === 'firing';
  if (!visible) return null;

  return (
    <div className="mobile-controls" aria-label="Mobile game controls">
      {/* Left — movement */}
      <div className="move-group">
        <button
          className="move-btn"
          aria-label="Move tank left"
          onTouchStart={(e) => { e.preventDefault(); onLeftStart(); }}
          onTouchEnd={(e)   => { e.preventDefault(); onLeftEnd();   }}
          onMouseDown={onLeftStart}
          onMouseUp={onLeftEnd}
          onMouseLeave={onLeftEnd}
        >◀</button>

        <button
          className="move-btn"
          aria-label="Move tank right"
          onTouchStart={(e) => { e.preventDefault(); onRightStart(); }}
          onTouchEnd={(e)   => { e.preventDefault(); onRightEnd();   }}
          onMouseDown={onRightStart}
          onMouseUp={onRightEnd}
          onMouseLeave={onRightEnd}
        >▶</button>
      </div>

      {/* Right — utility + fire */}
      <div className="fire-group">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            className="ctrl-btn"
            style={{ fontSize: 10, padding: '5px 10px' }}
            aria-label="Pause game"
            onTouchStart={(e) => { e.preventDefault(); onPause(); }}
            onMouseDown={onPause}
          >⏸</button>
          <button
            className="ctrl-btn"
            style={{ fontSize: 10, padding: '5px 10px' }}
            aria-label="Show hint"
            onTouchStart={(e) => { e.preventDefault(); onHint(); }}
            onMouseDown={onHint}
          >💡</button>
        </div>

        <button
          className="fire-btn-mobile"
          aria-label="Fire cannon"
          onTouchStart={(e) => { e.preventDefault(); onFire(); }}
          onMouseDown={onFire}
        >
          🎯<br />FIRE
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Main App
// ─────────────────────────────────────────────────────────────────
export default function App() {
  const { phase, setQuestions, setError, startCountdown } = useGameStore();
  const sceneRef = useRef<GameSceneHandle>(null);

  // ── Initial quiz load ─────────────────────────────────────────
  useEffect(() => {
    fetchQuiz()
      .then(setQuestions)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load quiz'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New-game load (triggered from overlays)
  const loadNewQuiz = useCallback(async () => {
    try {
      const qs = await fetchQuiz();
      setQuestions(qs);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load quiz');
    }
  }, [setQuestions, setError]);

  // ── Loading → Countdown ───────────────────────────────────────
  const handleLoadingStart = useCallback(() => {
    startCountdown();
  }, [startCountdown]);

  // ── Fire (HUD button + mobile) ────────────────────────────────
  const handleFire = useCallback(() => {
    const p = useGameStore.getState().phase;
    if (p === 'playing' || p === 'aiming') {
      useGameStore.getState().setPhase('firing');
      sceneRef.current?.triggerFire();
    }
    AudioManager.play('uiClick');
  }, []);

  // ── Pause ─────────────────────────────────────────────────────
  const handlePause = useCallback(() => {
    const p = useGameStore.getState().phase;
    if (p === 'playing' || p === 'aiming') useGameStore.getState().setPhase('paused');
    AudioManager.play('uiClick');
  }, []);

  // ── Hint ──────────────────────────────────────────────────────
  const handleHint = useCallback(() => {
    const p = useGameStore.getState().phase;
    if (p === 'playing' || p === 'aiming') useGameStore.getState().setHintVisible(true);
    AudioManager.play('uiClick');
  }, []);

  // ── Mobile movement ───────────────────────────────────────────
  const handleLeftStart  = useCallback(() => { sceneRef.current?.setMobileKeys({ left: true  }); }, []);
  const handleLeftEnd    = useCallback(() => { sceneRef.current?.setMobileKeys({ left: false }); }, []);
  const handleRightStart = useCallback(() => { sceneRef.current?.setMobileKeys({ right: true  }); }, []);
  const handleRightEnd   = useCallback(() => { sceneRef.current?.setMobileKeys({ right: false }); }, []);

  // ── Touch aim ─────────────────────────────────────────────────
  const handleAngleChange = useCallback((angle: number) => {
    sceneRef.current?.setCannonAngle(angle);
  }, []);

  return (
    <div className="game-root">
      {/* 3D scene */}
      <GameScene ref={sceneRef} />

      {/* Touch aim drag area (above canvas, below HUD) */}
      <TouchAimArea onAngleChange={handleAngleChange} />

      {/* HUD */}
      <div className="hud-layer">
        <QuestionPanel />
        <ScorePanel />
        <ControlBar onFire={handleFire} />
        <KeyboardGuide />
        <MobileControls
          onLeftStart={handleLeftStart}
          onLeftEnd={handleLeftEnd}
          onRightStart={handleRightStart}
          onRightEnd={handleRightEnd}
          onFire={handleFire}
          onPause={handlePause}
          onHint={handleHint}
        />
      </div>

      {/* Overlays (stack on top) */}
      <LoadingOverlay onStart={handleLoadingStart} />
      <CountdownOverlay />
      <ResultFeedback />
      <PauseOverlay />
      <HintModal />
      <GameOverOverlay />
      <ErrorOverlay />

      {/* Portrait warning (CSS media query shows it) */}
      <PortraitWarning />
    </div>
  );
}
