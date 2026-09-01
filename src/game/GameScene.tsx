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
import { Canvas, useFrame, useThree } from '@react-three/fiber';
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
import type { TankTarget } from './gameTypes';

// ─────────────────────────────────────────────────────────────────
//  Public handle exposed by GameScene
// ─────────────────────────────────────────────────────────────────
export interface GameSceneHandle {
  setMobileKeys: (keys: Partial<KeyState>) => void;
  triggerFire:   () => void;
}

// ─────────────────────────────────────────────────────────────────
//  Inner scene (inside R3F context)
// ─────────────────────────────────────────────────────────────────
interface SceneInnerProps {
  externalKeys: React.MutableRefObject<KeyState>;
  fireSignal:   React.MutableRefObject<boolean>;
  playerRef:    React.RefObject<PlayerTankHandle>;
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

// ── Floating Score Popup in 3D Space ─────────────────────────────
interface FloatingScoreItem {
  id: number;
  text: string;
  color: string;
  pos: THREE.Vector3;
  age: number;
}

const scoreTextureCache = new Map<string, THREE.CanvasTexture>();

function getScoreCanvasTexture(text: string, color: string): THREE.CanvasTexture {
  const key = `${text}_${color}`;
  if (scoreTextureCache.has(key)) return scoreTextureCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = '900 48px "Orbitron", sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;

    ctx.fillStyle = color;
    ctx.fillText(text, 128, 48);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeText(text, 128, 48);
  }

  const texture = new THREE.CanvasTexture(canvas);
  scoreTextureCache.set(key, texture);
  return texture;
}

function FloatingScoreSprite({ item }: { item: FloatingScoreItem }) {
  const spriteRef = useRef<THREE.Sprite>(null);
  const texture = useMemo(() => getScoreCanvasTexture(item.text, item.color), [item.text, item.color]);

  useFrame((_, delta) => {
    if (!spriteRef.current) return;
    const dt = Math.min(delta, 0.05);
    spriteRef.current.position.y += dt * 3.5;
    const scale = 1.0 + Math.sin(Math.min(1, item.age * 3) * Math.PI) * 0.25;
    spriteRef.current.scale.set(4.2 * scale, 1.6 * scale, 1);
  });

  return (
    <sprite
      ref={spriteRef}
      position={[item.pos.x, item.pos.y, item.pos.z + 1.0]}
      scale={[4.2, 1.6, 1]}
      renderOrder={999}
    >
      <spriteMaterial
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
        opacity={Math.max(0, 1 - item.age / 1.2)}
      />
    </sprite>
  );
}

// ── 4 Distinct Front Ridge Coordinates for Enemy Tanks (A, B, C, D) ──
const BASE_ENEMY_COORDS: [number, number][] = [
  [-18, -16], // Tank A (Left Ridge)
  [-6, -20],  // Tank B (Mid-Left Peak)
  [6, -20],   // Tank C (Mid-Right Peak)
  [18, -16],  // Tank D (Right Ridge)
];

function SceneInner({ externalKeys, fireSignal, playerRef }: SceneInnerProps) {
  const {
    phase, questions, currentQuestionIndex, questionSessionId,
    muted, streak, resolveShot, advanceQuestion,
  } = useGameStore();

  // Keyboard state
  const { keys: kbKeys, oneShot } = useKeyboard();

  // Unified keys ref combining keyboard + mobile touch controls
  const unifiedKeys = useRef<KeyState>({ left: false, right: false, up: false, down: false });
  const tankFireSignal = useRef(false);

  const enemyRefs      = useRef<(EnemyTankHandle | null)[]>([]);
  const enemyTargetIds = useRef<string[]>([]);
  const hasResolved    = useRef(false);

  const trajectoryGroupRef = useRef<THREE.Group>(createTrajectoryGroup());

  const [activeProjectile, setActiveProjectile] = useState<ProjectileState | null>(null);
  const [explosions, setExplosions]             = useState<ExplosionItem[]>([]);
  const [floatingScores, setFloatingScores]     = useState<FloatingScoreItem[]>([]);
  const projCounter = useRef(0);
  const explCounter = useRef(0);
  const scoreCounter = useRef(0);
  const shakeRef = useRef(0);

  // ── Current question targets ──────────────────────────────────
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

  // Assign 4 distinct ridge positions in front
  const enemyPositions = useMemo<[number, number][]>(() => {
    const count = targets.length;
    if (count === 0) return [];
    return Array.from({ length: count }, (_, i) => {
      if (i < BASE_ENEMY_COORDS.length) {
        return BASE_ENEMY_COORDS[i];
      }
      const span = 42;
      const step = span / Math.max(1, count - 1);
      return [-21 + i * step, -18 - (i % 2) * 4] as [number, number];
    });
  }, [targets.length]);

  useEffect(() => {
    enemyTargetIds.current = targets.map((t) => t.id);
  }, [targets]);

  // ── Per-question reset ───────────────────────────────────────
  useEffect(() => {
    hasResolved.current = false;
    tankFireSignal.current = false;
    setActiveProjectile(null);
    setExplosions([]);
    setFloatingScores([]);
    enemyRefs.current = new Array(targets.length).fill(null);
  }, [questionSessionId, targets.length]);

  // ── Mute sync ────────────────────────────────────────────────
  useEffect(() => {
    AudioManager.setMuted(muted);
  }, [muted]);

  const playerPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0.5, 10.0));
  const allEnemyPositionsRef = useRef<THREE.Vector3[]>([]);

  // ── Frame Loop: Unified Controls & State Transitions ───────────
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    // Track player tank position in 3D for enemy tank turrets
    const p = playerRef.current?.getPosition();
    if (p) playerPosRef.current.copy(p);

    // Track all active enemy tank positions for trajectory collision stopping
    allEnemyPositionsRef.current = enemyRefs.current
      .map((e) => e?.getPosition())
      .filter((pos): pos is THREE.Vector3 => Boolean(pos));

    // Decay camera shake smoothly
    if (shakeRef.current > 0.001) {
      shakeRef.current *= Math.exp(-dt * 6.5);
    } else {
      shakeRef.current = 0;
    }

    // Age floating scores
    if (floatingScores.length > 0) {
      setFloatingScores((prev) =>
        prev
          .map((s) => ({ ...s, age: s.age + dt }))
          .filter((s) => s.age < 1.2)
      );
    }

    // Merge keyboard and mobile touch keys
    unifiedKeys.current.left  = Boolean(kbKeys.current.left  || externalKeys.current.left);
    unifiedKeys.current.right = Boolean(kbKeys.current.right || externalKeys.current.right);
    unifiedKeys.current.up    = Boolean(kbKeys.current.up    || externalKeys.current.up);
    unifiedKeys.current.down  = Boolean(kbKeys.current.down  || externalKeys.current.down);

    // Consume keyboard hotkeys
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

    // Fire trigger from Space or UI button
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
    shakeRef.current = Math.max(shakeRef.current, 0.25);
    setActiveProjectile({ id: projCounter.current++, origin: origin.clone(), velocity: velocity.clone() });
  }, []);

  // ── Tank hit in 3D ────────────────────────────────────────────
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

    if (result === 'correct' && (streak + 1) >= 2) {
      setTimeout(() => AudioManager.play('combo'), 180);
    }

    shakeRef.current = Math.max(shakeRef.current, result === 'correct' ? 0.7 : 0.45);

    const idx = targets.indexOf(target);
    enemyRefs.current[idx]?.triggerHit();
    const pos = enemyRefs.current[idx]?.getPosition() ?? new THREE.Vector3();
    setExplosions((e) => [...e, { id: explCounter.current++, pos, type: 'tank' }]);

    // Spawn 3D floating score popup
    const popupText = result === 'correct'
      ? (streak >= 1 ? `+100 (x${streak + 1})` : '+100')
      : '-10';
    const popupColor = result === 'correct' ? '#4caf50' : '#f44336';
    setFloatingScores((prev) => [
      ...prev,
      {
        id: scoreCounter.current++,
        text: popupText,
        color: popupColor,
        pos: pos.clone().add(new THREE.Vector3(0, 3.2, 0)),
        age: 0,
      },
    ]);

    setTimeout(() => advanceQuestion(), GAME_CONFIG.feedback.displayTime);
  }, [targets, streak, resolveShot, advanceQuestion]);

  // ── Terrain hit in 3D ─────────────────────────────────────────
  const handleHitTerrain = useCallback((impactPos?: THREE.Vector3) => {
    if (hasResolved.current) return;
    hasResolved.current = true;

    const st     = useGameStore.getState();
    const answer = st.questions[st.currentQuestionIndex].answer;

    resolveShot('miss', answer);
    AudioManager.play('wrong');
    AudioManager.play('impact');

    shakeRef.current = Math.max(shakeRef.current, 0.35);

    const pos = impactPos ?? (activeProjectile ? activeProjectile.origin : new THREE.Vector3(0, getTerrainHeight(0, -18), -18));
    setExplosions((e) => [...e, { id: explCounter.current++, pos, type: 'terrain' }]);

    setFloatingScores((prev) => [
      ...prev,
      {
        id: scoreCounter.current++,
        text: 'MISS -10',
        color: '#ff9800',
        pos: pos.clone().add(new THREE.Vector3(0, 2.2, 0)),
        age: 0,
      },
    ]);

    setTimeout(() => advanceQuestion(), GAME_CONFIG.feedback.displayTime);
  }, [activeProjectile, resolveShot, advanceQuestion]);

  const removeExplosion = useCallback((id: number) => {
    setExplosions((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const paused = phase === 'paused';
  const showTrajectory = phase === 'playing' || phase === 'aiming';

  return (
    <>
      <ResponsiveCamera shakeRef={shakeRef} playerRef={playerRef} />
      <fog attach="fog" args={['#b8d0e0', 50, 140]} />

      {/* Realistic Hemisphere Light (Sky Blue top, Warm Earth bottom) */}
      <hemisphereLight args={['#e0f2fe', '#8d735c', 0.95]} />

      {/* Main Front-Side Key Sunlight (Bright, warm illumination on player tank & battlefield) */}
      <directionalLight
        position={[18, 38, 28]}
        intensity={2.2}
        color="#fffbf0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={1.0}
        shadow-camera-far={140}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.0003}
      />

      {/* Backlight / Rim Light (Edge highlights on tanks & mountains) */}
      <directionalLight position={[-18, 28, -25]} intensity={0.85} color="#e0f2fe" />

      {/* Player Tank Local Fill (Ensures player tank & commander are bright and crisp) */}
      <pointLight position={[0, 8, 16]} intensity={0.65} color="#fffaed" distance={25} />

      <Environment />
      <Terrain />

      {/* Trajectory preview dots in 3D */}
      <primitive object={trajectoryGroupRef.current} />

      {/* 3D Player Tank (Centered in foreground) */}
      <PlayerTank
        ref={playerRef}
        keys={unifiedKeys}
        fireSignal={tankFireSignal}
        enemyPositionsRef={allEnemyPositionsRef}
        onFire={handleFire}
        paused={paused}
        showTrajectory={showTrajectory}
        trajectoryGroupRef={trajectoryGroupRef}
      />

      {/* 3D Enemy answer tanks stationed on 4 front ridges */}
      {targets.map((target, idx) => (
        <EnemyTankWrapper
          key={target.id}
          target={target}
          initialPos={enemyPositions[idx] ?? [0, -18]}
          paused={paused}
          playerPosRef={playerPosRef}
          enemyRef={(handle) => {
            enemyRefs.current[idx] = handle;
          }}
        />
      ))}

      {/* Active 3D Artillery Shell */}
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

      {/* 3D Explosions */}
      {explosions.map((ex) => (
        <Explosion
          key={ex.id}
          position={ex.pos}
          type={ex.type}
          onComplete={() => removeExplosion(ex.id)}
        />
      ))}

      {/* Floating 3D score popups */}
      {floatingScores.map((item) => (
        <FloatingScoreSprite key={item.id} item={item} />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
//  EnemyTankWrapper
// ─────────────────────────────────────────────────────────────────
interface WrapperProps {
  target:        TankTarget;
  initialPos:    [number, number];
  paused:        boolean;
  playerPosRef?: React.MutableRefObject<THREE.Vector3>;
  enemyRef:      (h: EnemyTankHandle | null) => void;
}

function EnemyTankWrapper({ target, initialPos, paused, playerPosRef, enemyRef }: WrapperProps) {
  const localRef = useRef<EnemyTankHandle>(null);

  useEffect(() => {
    enemyRef(localRef.current);
    return () => { enemyRef(null); };
  });

  return (
    <EnemyTank
      ref={localRef}
      target={target}
      initialPos={initialPos}
      paused={paused}
      playerPosRef={playerPosRef}
    />
  );
}

// ─────────────────────────────────────────────────────────────────
//  3D Centered Perspective Camera (Perfect View of Tank & 4 Ridges)
// ─────────────────────────────────────────────────────────────────
function ResponsiveCamera({
  shakeRef,
  playerRef,
}: {
  shakeRef: React.MutableRefObject<number>;
  playerRef: React.RefObject<PlayerTankHandle>;
}) {
  const { camera, size } = useThree();

  useFrame(() => {
    const aspect = size.width / Math.max(1, size.height);
    const isPortrait = aspect < 1.0;

    const targetFov = isPortrait ? 54 : 44;
    const playerPos = playerRef.current?.getPosition() ?? new THREE.Vector3(0, 0.5, 10.0);

    const cam = camera as THREE.PerspectiveCamera;
    if (Math.abs(cam.fov - targetFov) > 0.05) {
      cam.fov = THREE.MathUtils.lerp(cam.fov, targetFov, 0.08);
      cam.updateProjectionMatrix();
    }

    // Shake offset
    const shake = shakeRef.current;
    const shakeX = (Math.random() - 0.5) * shake * 1.5;
    const shakeY = (Math.random() - 0.5) * shake * 1.5;

    // Camera tracks 1:1 with player on X to keep tank DEAD-CENTERED horizontally at all times
    const targetCamX = playerPos.x + shakeX;
    const targetCamY = isPortrait ? playerPos.y + 9.5 + shakeY : playerPos.y + 6.5 + shakeY;
    const targetCamZ = isPortrait ? playerPos.z + 16.0 : playerPos.z + 12.5;

    cam.position.x = THREE.MathUtils.lerp(cam.position.x, targetCamX, 0.12);
    cam.position.y = THREE.MathUtils.lerp(cam.position.y, targetCamY, 0.12);
    cam.position.z = THREE.MathUtils.lerp(cam.position.z, targetCamZ, 0.12);

    // Camera looks directly forward from player position across the 4 front ridges
    const lookTargetX = playerPos.x;
    const lookTargetY = isPortrait ? playerPos.y + 3.2 : playerPos.y + 2.4;
    const lookTargetZ = isPortrait ? playerPos.z - 26.0 : playerPos.z - 24.0;

    cam.lookAt(lookTargetX, lookTargetY, lookTargetZ);
  });
  return null;
}

// ─────────────────────────────────────────────────────────────────
//  Helper: create 3D trajectory dot group
// ─────────────────────────────────────────────────────────────────
function createTrajectoryGroup(): THREE.Group {
  const grp = new THREE.Group();
  for (let i = 0; i < 24; i++) {
    const geo = new THREE.SphereGeometry(0.25, 10, 10);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x69f0ae,
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
    setMobileKeys: (k) => { Object.assign(externalKeys.current, k); },
    triggerFire:   () => {
      const p = useGameStore.getState().phase;
      if (p === 'playing' || p === 'aiming') {
        useGameStore.getState().setPhase('firing');
        playerRef.current?.fire();
      }
    },
  }));

  return (
    <Canvas
      shadows
      camera={{ position: [0, 8.0, 24], fov: 44 }}
      style={{ position: 'absolute', inset: 0 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)]}
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
