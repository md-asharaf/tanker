import {
  useRef,
  useState,
  useCallback,
  useMemo,
  useEffect,
  forwardRef,
  useImperativeHandle,
  Suspense,
} from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Terrain, getTerrainHeight } from './scene/Terrain';
import { Environment } from './scene/Environment';
import { PlayerTank, type PlayerTankHandle } from './entities/PlayerTank';
import { EnemyTank, type EnemyTankHandle } from './entities/EnemyTank';
import { Projectile } from './entities/Projectile';
import { Explosion } from './entities/Explosion';
import { useKeyboard, type KeyState } from '../controls/useKeyboard';
import { useGameStore } from './gameStore';
import { GAME_CONFIG } from './gameConfig';
import { AudioManager } from '../audio/AudioManager';
import { randFloat } from '../utils/math';
import type { TankTarget } from './gameTypes';

// ─────────────────────────────────────────────────────────────────
//  Public handle exposed by GameScene
// ─────────────────────────────────────────────────────────────────
export interface GameSceneHandle {
  /** Update external touch key state from UI overlay */
  setMobileKeys:  (keys: Partial<KeyState>) => void;
  /** Direct cannon elevation control */
  setCannonAngle: (angle: number) => void;
  /** Let App trigger fire */
  triggerFire:    () => void;
}

// ─────────────────────────────────────────────────────────────────
//  Inner scene (inside R3F context)
// ─────────────────────────────────────────────────────────────────
interface SceneInnerProps {
  externalKeys:   React.MutableRefObject<KeyState>;
  fireSignal:     React.MutableRefObject<boolean>;
  playerRef:      React.RefObject<PlayerTankHandle>;
}

interface ProjectileState {
  id:       number;
  origin:   THREE.Vector3;
  velocity: THREE.Vector3;
}

interface ExplosionItem {
  id:   number;
  pos:  THREE.Vector3;
  type: 'tank' | 'terrain';
}

function SceneInner({ externalKeys, fireSignal, playerRef }: SceneInnerProps) {
  const {
    phase, questions, currentQuestionIndex, questionSessionId,
    muted, resolveShot, advanceQuestion,
  } = useGameStore();

  // Keyboard state
  const { keys: kbKeys, oneShot } = useKeyboard();

  // Unified keys ref combining keyboard + mobile touch controls every frame
  const unifiedKeys = useRef<KeyState>({ left: false, right: false, up: false, down: false });
  const tankFireSignal = useRef(false);

  const enemyRefs      = useRef<(EnemyTankHandle | null)[]>([]);
  const enemyTargetIds = useRef<string[]>([]);
  const hasResolved    = useRef(false);

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
    tankFireSignal.current = false;
    setActiveProjectile(null);
    setExplosions([]);
    enemyRefs.current = new Array(targets.length).fill(null);
  }, [questionSessionId, targets.length]);

  // ── Mute sync ────────────────────────────────────────────────
  useEffect(() => {
    AudioManager.setMuted(muted);
  }, [muted]);

  // ── Frame Loop: Unified Controls & State Transitions ───────────
  useFrame(() => {
    // 1. Merge keyboard and mobile touch keys smoothly every frame
    unifiedKeys.current.left  = Boolean(kbKeys.current.left  || externalKeys.current.left);
    unifiedKeys.current.right = Boolean(kbKeys.current.right || externalKeys.current.right);
    unifiedKeys.current.up    = Boolean(kbKeys.current.up    || externalKeys.current.up);
    unifiedKeys.current.down  = Boolean(kbKeys.current.down  || externalKeys.current.down);

    // 2. Consume keyboard hotkeys
    if (oneShot.current.pause) {
      oneShot.current.pause = false;
      const p = useGameStore.getState().phase;
      if (p === 'playing' || p === 'aiming') useGameStore.getState().setPhase('paused');
      else if (p === 'paused')              useGameStore.getState().setPhase('playing');
    }
    if (oneShot.current.mute) {
      oneShot.current.mute = false;
      useGameStore.getState().toggleMute();
    }
    if (oneShot.current.hint) {
      oneShot.current.hint = false;
      const p = useGameStore.getState().phase;
      if (p === 'playing' || p === 'aiming') useGameStore.getState().setHintVisible(true);
    }

    // 3. Fire trigger from keyboard (Space) or mobile/touch button
    if ((oneShot.current.fire || fireSignal.current) && !hasResolved.current) {
      oneShot.current.fire = false;
      fireSignal.current = false;
      const p = useGameStore.getState().phase;
      if ((p === 'playing' || p === 'aiming') && !activeProjectile) {
        useGameStore.getState().setPhase('firing');
        tankFireSignal.current = true;
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

    const st     = useGameStore.getState();
    const answer = st.questions[st.currentQuestionIndex].answer;

    resolveShot('miss', answer);
    AudioManager.play('wrong');
    AudioManager.play('impact');

    const projPos = activeProjectile ? activeProjectile.origin : new THREE.Vector3(0, getTerrainHeight(0), 0);
    setExplosions((e) => [...e, { id: explCounter.current++, pos: projPos, type: 'terrain' }]);

    setTimeout(() => advanceQuestion(), GAME_CONFIG.feedback.displayTime);
  }, [activeProjectile, resolveShot, advanceQuestion]);

  const removeExplosion = useCallback((id: number) => {
    setExplosions((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const paused = phase === 'paused';
  const showTrajectory = phase === 'playing' || phase === 'aiming';

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight
        position={[25, 45, 20]}
        intensity={1.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={120}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={35}
        shadow-camera-bottom={-25}
      />
      <directionalLight position={[-20, 20, -10]} intensity={0.5} color="#b3e5fc" />
      <directionalLight position={[0, -15, 10]} intensity={0.3} color="#81c784" />

      <Environment />
      <Terrain />

      {/* Trajectory preview dots */}
      <primitive object={trajectoryGroupRef.current} />

      {/* Player Tank with Unified Controls */}
      <PlayerTank
        ref={playerRef}
        keys={unifiedKeys}
        fireSignal={tankFireSignal}
        onFire={handleFire}
        paused={paused}
        showTrajectory={showTrajectory}
        trajectoryGroupRef={trajectoryGroupRef}
      />

      {/* Enemy answer tanks */}
      {targets.map((target, idx) => (
        <EnemyTankWrapper
          key={target.id}
          target={target}
          initialX={enemyStartXs[idx] ?? idx * 18}
          paused={paused}
          enemyRef={(handle) => {
            enemyRefs.current[idx] = handle;
          }}
        />
      ))}

      {/* Active Artillery Projectile */}
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
//  Helper: create trajectory dot group
// ─────────────────────────────────────────────────────────────────
function createTrajectoryGroup(): THREE.Group {
  const grp = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const geo = new THREE.SphereGeometry(0.22, 10, 10);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffea00,
      transparent: true,
      opacity: 0.9,
    });
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    grp.add(m);
  }
  return grp;
}

// ─────────────────────────────────────────────────────────────────
//  GameScene — top-level Canvas + public handle
// ─────────────────────────────────────────────────────────────────
export interface GameSceneProps {}

export const GameScene = forwardRef<GameSceneHandle, GameSceneProps>((_props, ref) => {
  const externalKeys = useRef<KeyState>({ left: false, right: false, up: false, down: false });
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
