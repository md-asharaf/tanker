import {
  Suspense, useRef, useState, useEffect, useCallback, useMemo, forwardRef, useImperativeHandle,
} from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Terrain } from './scene/Terrain';
import { Environment } from './scene/Environment';
import { PlayerTank, type PlayerTankHandle } from './entities/PlayerTank';
import { EnemyTank, type EnemyTankHandle } from './entities/EnemyTank';
import { Projectile } from './entities/Projectile';
import { Explosion } from './entities/Explosion';
import { useGameStore } from './gameStore';
import { useKeyboard, type KeyState } from '../controls/useKeyboard';
import { AudioManager } from '../audio/AudioManager';
import { randFloat } from '../utils/math';
import type { TankTarget } from './gameTypes';
import { GAME_CONFIG } from './gameConfig';

function createTrajectoryGroup(): THREE.Group {
  const group = new THREE.Group();
  const count = GAME_CONFIG.trajectory.dots;
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshBasicMaterial({ color: '#ffea00', transparent: true, opacity: 0.85 - i * 0.08 })
    );
    group.add(mesh);
  }
  return group;
}

// ─────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────
interface ProjectileState {
  id:       number;
  origin:   THREE.Vector3;
  velocity: THREE.Vector3;
}
type ExplosionItem = {
  id:   number;
  pos:  THREE.Vector3;
  type: 'tank' | 'terrain';
};

export interface GameSceneHandle {
  /** Let App push mobile key overrides into the scene */
  setMobileKeys: (keys: Partial<KeyState>) => void;
  /** Let App push a cannon angle update (from touch drag) */
  setCannonAngle: (angle: number) => void;
  /** Let App trigger fire */
  triggerFire: () => void;
}

// ─────────────────────────────────────────────────────────────────
//  Inner scene (inside R3F context)
// ─────────────────────────────────────────────────────────────────
interface SceneInnerProps {
  externalKeys:   React.MutableRefObject<KeyState>;
  fireSignal:     React.MutableRefObject<boolean>;
  playerRef:      React.RefObject<PlayerTankHandle>;
}

function SceneInner({ externalKeys, fireSignal, playerRef }: SceneInnerProps) {
  const {
    phase, questions, currentQuestionIndex, questionSessionId,
    muted, resolveShot, advanceQuestion,
  } = useGameStore();

  // Keyboard (merged with externalKeys via shared ref)
  const { keys: kbKeys, oneShot } = useKeyboard();

  // Every frame, merge touch keys into the keyboard state so PlayerTank sees one unified ref
  useFrame(() => {
    kbKeys.current.left  = kbKeys.current.left  || externalKeys.current.left;
    kbKeys.current.right = kbKeys.current.right || externalKeys.current.right;
  });

  const enemyRefs      = useRef<(EnemyTankHandle | null)[]>([]);
  const enemyTargetIds = useRef<string[]>([]);
  const hasResolved    = useRef(false);

  // One-shot pending flags (consumed in useFrame, never cause re-renders)
  const pendingPause = useRef(false);
  const pendingMute  = useRef(false);
  const pendingFire  = useRef(false);
  const pendingHint  = useRef(false);

  const trajectoryGroupRef = useRef<THREE.Group>(createTrajectoryGroup());

  const [activeProjectile, setActiveProjectile] = useState<ProjectileState | null>(null);
  const [explosions, setExplosions]             = useState<ExplosionItem[]>([]);
  const projCounter = useRef(0);
  const explCounter = useRef(0);

  // ── Current question targets (preserve exact backend order) ──
  const targets = useMemo<TankTarget[]>(() => {
    if (!questions.length) return [];
    const q = questions[currentQuestionIndex];
    return q.options.map((opt, i) => ({
      id:          `t-${questionSessionId}-${i}`,
      optionIndex: i,
      optionText:  opt,
      isCorrect:   opt === q.answer,
    }));
  }, [questions, currentQuestionIndex, questionSessionId]);

  const enemyStartXs = useMemo(() => {
    const count = targets.length;
    if (count === 0) return [];
    if (count === 1) return [15];
    const span = 80; // from -40 to +40
    const step = span / (count - 1);
    const start = -40;
    return Array.from({ length: count }, (_, i) => start + i * step + randFloat(-2, 2));
  }, [targets.length, questionSessionId]);

  useEffect(() => {
    enemyTargetIds.current = targets.map((t) => t.id);
  }, [targets]);

  // ── Per-question reset ───────────────────────────────────────
  useEffect(() => {
    hasResolved.current = false;
    setActiveProjectile(null);
    setExplosions([]);
    enemyRefs.current = new Array(targets.length).fill(null);
  }, [questionSessionId, targets.length]);

  // ── Mute sync ────────────────────────────────────────────────
  useEffect(() => {
    AudioManager.setMuted(muted);
  }, [muted]);

  // ── One-shot keyboard handling (runs every frame) ─────────────
  useFrame(() => {
    if (oneShot.current.fire)  { pendingFire.current  = true;  oneShot.current.fire  = false; }
    if (oneShot.current.pause) { pendingPause.current = true;  oneShot.current.pause = false; }
    if (oneShot.current.mute)  { pendingMute.current  = true;  oneShot.current.mute  = false; }
    if (oneShot.current.hint)  { pendingHint.current  = true;  oneShot.current.hint  = false; }

    // External fire signal (from App's fire button / mobile fire button)
    if (fireSignal.current) { pendingFire.current = true; fireSignal.current = false; }

    const p = useGameStore.getState().phase;

    if (pendingPause.current) {
      pendingPause.current = false;
      if (p === 'playing' || p === 'aiming')  useGameStore.getState().setPhase('paused');
      else if (p === 'paused')               useGameStore.getState().setPhase('playing');
    }
    if (pendingMute.current) {
      pendingMute.current = false;
      useGameStore.getState().toggleMute();
    }
    if (pendingHint.current) {
      pendingHint.current = false;
      if (p === 'playing' || p === 'aiming') useGameStore.getState().setHintVisible(true);
    }
    if (pendingFire.current && !hasResolved.current) {
      pendingFire.current = false;
      if ((p === 'playing' || p === 'aiming') && !activeProjectile) {
        fireSignal.current = false;
        useGameStore.getState().setPhase('firing');
        // The PlayerTank reads fireSignal each frame — set it once more
        fireSignal.current = true;
      }
    }
  });

  // ── Fire callback ─────────────────────────────────────────────
  const handleFire = useCallback((origin: THREE.Vector3, velocity: THREE.Vector3) => {
    if (hasResolved.current) return;
    setActiveProjectile({ id: projCounter.current++, origin: origin.clone(), velocity: velocity.clone() });
  }, []);

  // ── Tank hit ──────────────────────────────────────────────────
  const handleHitTank = useCallback((tankId: string) => {
    if (hasResolved.current) return;
    hasResolved.current = true;

    const target = targets.find((t) => t.id === tankId);
    if (!target) return;

    const result  = target.isCorrect ? 'correct' : 'wrong';
    const st      = useGameStore.getState();
    const answer  = st.questions[st.currentQuestionIndex].answer;

    resolveShot(result, answer);
    AudioManager.play(result === 'correct' ? 'correct' : 'wrong');
    AudioManager.play('explosion');

    const idx = targets.indexOf(target);
    enemyRefs.current[idx]?.triggerHit();
    const pos = enemyRefs.current[idx]?.getPosition() ?? new THREE.Vector3();
    setExplosions((e) => [...e, { id: explCounter.current++, pos, type: 'tank' }]);

    setTimeout(() => advanceQuestion(), GAME_CONFIG.feedback.displayTime);
  }, [targets, resolveShot, advanceQuestion]);

  // ── Terrain hit ───────────────────────────────────────────────
  const handleHitTerrain = useCallback(() => {
    if (hasResolved.current) return;
    hasResolved.current = true;

    const st = useGameStore.getState();
    resolveShot('miss', st.questions[st.currentQuestionIndex].answer);
    AudioManager.play('impact');

    const pos = playerRef.current?.getPosition() ?? new THREE.Vector3();
    setExplosions((e) => [...e, { id: explCounter.current++, pos, type: 'terrain' }]);
    setTimeout(() => advanceQuestion(), GAME_CONFIG.feedback.displayTime);
  }, [resolveShot, advanceQuestion, playerRef]);

  const removeExplosion = useCallback((id: number) => {
    setExplosions((e) => e.filter((ex) => ex.id !== id));
  }, []);

  const isPlaying = ['playing', 'aiming', 'firing', 'resolving'].includes(phase);
  const paused    = ['paused', 'hint', 'game-over'].includes(phase);
  const showTraj  = (phase === 'playing' || phase === 'aiming') && !activeProjectile;

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight
        position={[25, 40, 25]}
        intensity={1.75}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={35}
        shadow-camera-bottom={-35}
      />
      <hemisphereLight args={['#b3e5fc', '#558b2f', 0.55]} />

      <Suspense fallback={null}>
        <Environment />
        <Terrain />
      </Suspense>

      {isPlaying && showTraj && <primitive object={trajectoryGroupRef.current} visible />}

      {isPlaying && (
        <PlayerTank
          ref={playerRef}
          keys={kbKeys}
          fireSignal={fireSignal}
          onFire={handleFire}
          paused={paused}
          showTrajectory={showTraj}
          trajectoryGroupRef={trajectoryGroupRef}
        />
      )}

      {isPlaying && targets.map((target, i) => (
        <EnemyTankWrapper
          key={target.id}
          target={target}
          initialX={enemyStartXs[i] ?? 0}
          paused={paused}
          enemyRef={(h) => { enemyRefs.current[i] = h; }}
        />
      ))}

      {activeProjectile && (
        <Projectile
          key={activeProjectile.id}
          origin={activeProjectile.origin}
          velocity={activeProjectile.velocity}
          sessionId={questionSessionId}
          enemyHandles={enemyRefs}
          enemyTargetIds={enemyTargetIds.current}
          onHitTank={handleHitTank}
          onHitTerrain={handleHitTerrain}
          onDestroy={() => setActiveProjectile(null)}
        />
      )}

      {explosions.map((ex) => (
        <Explosion
          key={ex.id}
          position={ex.pos}
          type={ex.type}
          onComplete={() => removeExplosion(ex.id)}
        />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
//  EnemyTankWrapper — minimal wrapper to collect ref
// ─────────────────────────────────────────────────────────────────
interface WrapperProps {
  target:    TankTarget;
  initialX:  number;
  paused:    boolean;
  enemyRef:  (h: EnemyTankHandle | null) => void;
}

function EnemyTankWrapper({ target, initialX, paused, enemyRef }: WrapperProps) {
  const localRef = useRef<EnemyTankHandle>(null);

  useEffect(() => {
    enemyRef(localRef.current);
    return () => { enemyRef(null); };
  });

  return <EnemyTank ref={localRef} target={target} initialX={initialX} paused={paused} />;
}

// ─────────────────────────────────────────────────────────────────
//  GameScene — top-level Canvas + public handle
// ─────────────────────────────────────────────────────────────────
// No props needed — all state comes from zustand
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GameSceneProps {}

export const GameScene = forwardRef<GameSceneHandle, GameSceneProps>((_props, ref) => {
  /** Shared mutable key state — written by App (touch), read by SceneInner (merged with keyboard) */
  const externalKeys = useRef<KeyState>({ left: false, right: false });
  const fireSignal   = useRef(false);
  const playerRef    = useRef<PlayerTankHandle>(null);

  useImperativeHandle(ref, () => ({
    setMobileKeys:  (k) => { Object.assign(externalKeys.current, k); },
    setCannonAngle: (a) => { playerRef.current?.setCannonAngle(a); },
    triggerFire:    ()  => { fireSignal.current = true; },
  }));

  return (
    <Canvas
      shadows
      camera={{ position: [-22, 5, 23], fov: 42 }}
      style={{ position: 'absolute', inset: 0 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 1.5]}
    >
      <Suspense fallback={null}>
        <SceneInner
          externalKeys={externalKeys}
          fireSignal={fireSignal}
          playerRef={playerRef}
        />
      </Suspense>
    </Canvas>
  );
});

GameScene.displayName = 'GameScene';
