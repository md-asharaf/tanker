import { useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { TankTarget, TankLifecycle } from '../gameTypes';
import { getTerrainHeight } from '../scene/Terrain';
import { secureRandom } from '../../utils/math';
import { useGameStore } from '../gameStore';

export interface EnemyTankHandle {
  triggerHit: () => void;
  getPosition: () => THREE.Vector3;
  getTargetId: () => string;
  getOptionIndex: () => number;
}

interface EnemyTankProps {
  target: TankTarget;
  initialPos: [number, number]; // [x, z]
  paused: boolean;
  playerPosRef?: React.MutableRefObject<THREE.Vector3>;
  onLifecycleChange?: (id: string, lifecycle: TankLifecycle) => void;
}

// ── Distinct Vibrant Camouflage Color Palettes for Each Enemy Tank ──
export const ENEMY_PALETTES = [
  // Tank A: Crimson Iron Camo (Red)
  {
    body: '#5c2424',
    highlight: '#7a3232',
    turretTop: '#8a3838',
    barrel: '#3d1616',
    tread: '#1a1414',
    accent: '#ef5350',
    name: 'A',
  },
  // Tank B: Steel Cobalt Camo (Blue)
  {
    body: '#1b3a57',
    highlight: '#264e75',
    turretTop: '#326190',
    barrel: '#142a3f',
    tread: '#121820',
    accent: '#42a5f5',
    name: 'B',
  },
  // Tank C: Desert Amber Sand Camo (Gold/Orange)
  {
    body: '#5e4518',
    highlight: '#7a591e',
    turretTop: '#8f6824',
    barrel: '#3d2c0e',
    tread: '#1c1710',
    accent: '#ffa726',
    name: 'C',
  },
  // Tank D: Amethyst Night Camo (Purple)
  {
    body: '#431e4d',
    highlight: '#572863',
    turretTop: '#693178',
    barrel: '#2d1334',
    tread: '#18121c',
    accent: '#ab47bc',
    name: 'D',
  },
];

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ── Sleek Dark Pill Badge Texture (matching Concept Reference Image) ─────
const letterBadgeCache = new Map<string, THREE.CanvasTexture>();

function getLetterBadgeTexture(letter: string, accentColor: string): THREE.CanvasTexture {
  const key = `${letter}_${accentColor}`;
  if (letterBadgeCache.has(key)) return letterBadgeCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 140;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const cx = 128;
    const cy = 60;
    const w = 150;
    const h = 76;
    const r = 24;

    // 1. Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;

    // 2. Rounded Dark Capsule Background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, r);
    ctx.fill();

    // 3. Accent Border
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();

    // 4. Downward indicator pointer
    ctx.save();
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy + h / 2 - 2);
    ctx.lineTo(cx + 14, cy + h / 2 - 2);
    ctx.lineTo(cx, cy + h / 2 + 24);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 5. Large, bold letter text (A, B, C, D)
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 48px "Orbitron", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, cx, cy + 2);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  letterBadgeCache.set(key, texture);
  return texture;
}

// Pre-allocated math objects (Zero-GC)
const _defaultPlayerPos = new THREE.Vector3(0, 0.5, 10.0);

export const EnemyTank = forwardRef<EnemyTankHandle, EnemyTankProps>(
  ({ target, initialPos, paused, playerPosRef, onLifecycleChange }, ref) => {
    const { phase } = useGameStore();

    const groupRef = useRef<THREE.Group>(null);
    const chassisRef = useRef<THREE.Group>(null);
    const turretRef = useRef<THREE.Group>(null);
    const cannonRef = useRef<THREE.Group>(null);
    const commanderRef = useRef<THREE.Group>(null);
    const badgeRef = useRef<THREE.Sprite>(null);

    // Enemy tanks are STATIONARY at their tactical ridge coordinates
    const posX = initialPos[0];
    const posZ = initialPos[1];
    const posY = getTerrainHeight(posX, posZ);

    const lifecycle = useRef<TankLifecycle>('active');
    const explodeTimer = useRef(0);

    const palette = ENEMY_PALETTES[target.optionIndex % ENEMY_PALETTES.length];
    const letter = OPTION_LETTERS[target.optionIndex % OPTION_LETTERS.length];

    const badgeTexture = useMemo(() => {
      return getLetterBadgeTexture(letter, palette.accent);
    }, [letter, palette.accent]);

    const report = (lc: TankLifecycle) => {
      lifecycle.current = lc;
      onLifecycleChange?.(target.id, lc);
    };

    useImperativeHandle(ref, () => ({
      triggerHit: () => {
        if (lifecycle.current !== 'active') return;
        report('hit');
        explodeTimer.current = 0.35;
      },
      getPosition: () =>
        groupRef.current
          ? groupRef.current.position.clone()
          : new THREE.Vector3(posX, posY, posZ),
      getTargetId: () => target.id,
      getOptionIndex: () => target.optionIndex,
    }));

    useFrame((_, delta) => {
      const grp = groupRef.current;
      if (!grp) return;
      const dt = Math.min(delta, 0.05);

      if (lifecycle.current === 'destroyed') {
        grp.visible = false;
        return;
      }

      if (lifecycle.current === 'hit') {
        explodeTimer.current -= dt;
        grp.rotation.z += (secureRandom() - 0.5) * 0.3;
        grp.rotation.x += (secureRandom() - 0.5) * 0.3;
        if (explodeTimer.current <= 0) {
          report('exploding');
          explodeTimer.current = 0.6;
        }
        return;
      }

      if (lifecycle.current === 'exploding') {
        explodeTimer.current -= dt;
        grp.rotation.y += dt * 6;
        grp.position.y += dt * 2.5;
        grp.scale.multiplyScalar(Math.max(0.01, 1 - dt * 1.5));
        if (explodeTimer.current <= 0) report('destroyed');
        return;
      }

      if (paused) return;

      // ── ENEMY TANK & COMMANDER AIM DIRECTLY TOWARDS PLAYER TANK ──
      const pPos = playerPosRef?.current ?? _defaultPlayerPos;
      const dx = pPos.x - posX;
      const dz = pPos.z - posZ;
      const dy = (pPos.y + 1.2) - (posY + 0.8);
      const distXZ = Math.hypot(dx, dz);

      // Turret Yaw aiming towards player
      if (turretRef.current) {
        const targetYaw = Math.atan2(dx, dz);
        turretRef.current.rotation.y = THREE.MathUtils.lerp(turretRef.current.rotation.y, targetYaw, dt * 5.0);
      }

      // Cannon Pitch aiming towards player
      if (cannonRef.current) {
        const targetPitch = Math.atan2(dy, distXZ);
        cannonRef.current.rotation.x = THREE.MathUtils.lerp(cannonRef.current.rotation.x, targetPitch, dt * 5.0);
      }

      // Commander Idle Breathing
      if (commanderRef.current) {
        const breathing = Math.sin(Date.now() * 0.003 + target.optionIndex) * 0.03;
        commanderRef.current.position.y = 1.0 + breathing;
      }

      // Gentle badge hover bob
      if (badgeRef.current) {
        const badgeBob = Math.sin(Date.now() * 0.005 + target.optionIndex * 1.5) * 0.12;
        badgeRef.current.position.set(0, 4.4 + badgeBob, 0);
      }
    });

    const wheelZs = [-1.2, -0.6, 0, 0.6, 1.2];

    const showBadge =
      (phase === 'playing' ||
        phase === 'aiming' ||
        phase === 'firing' ||
        phase === 'resolving' ||
        phase === 'countdown') &&
      lifecycle.current === 'active';

    return (
      <group ref={groupRef} position={[posX, posY + 0.65, posZ]}>
        {/* Tank Model (Chassis faces +Z towards player in foreground) */}
        <group ref={chassisRef} rotation={[0, 0, 0]}>
          {/* ── LOWER CHASSIS & TREADS ── */}
          <mesh position={[1.05, -0.3, 0]} castShadow>
            <boxGeometry args={[0.32, 0.44, 3.2]} />
            <meshLambertMaterial color={palette.tread} />
          </mesh>
          <mesh position={[-1.05, -0.3, 0]} castShadow>
            <boxGeometry args={[0.32, 0.44, 3.2]} />
            <meshLambertMaterial color={palette.tread} />
          </mesh>

          {/* Roadwheels */}
          {wheelZs.map((wz, i) => (
            <group key={`e-wheels-${i}`}>
              <mesh position={[1.08, -0.3, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.3, 0.3, 0.24, 12]} />
                <meshLambertMaterial color="#37474f" />
              </mesh>
              <mesh position={[-1.08, -0.3, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.3, 0.3, 0.24, 12]} />
                <meshLambertMaterial color="#37474f" />
              </mesh>
            </group>
          ))}

          {/* ── ARMORED HULL WITH DISTINCT CAMO COLOR ── */}
          <mesh position={[0, 0.1, 0]} castShadow>
            <boxGeometry args={[1.88, 0.6, 3.0]} />
            <meshLambertMaterial color={palette.body} />
          </mesh>
          <mesh position={[0, 0.42, 0.1]} castShadow>
            <boxGeometry args={[1.68, 0.38, 2.2]} />
            <meshLambertMaterial color={palette.highlight} />
          </mesh>
          <mesh position={[0, 0.2, 1.3]} rotation={[0.5, 0, 0]} castShadow>
            <boxGeometry args={[1.82, 0.54, 0.75]} />
            <meshLambertMaterial color={palette.body} />
          </mesh>

          {/* Team Accent Glow Bars on Armor */}
          <mesh position={[0.96, 0.4, 0.1]} rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[0.7, 0.16, 0.05]} />
            <meshLambertMaterial color={palette.accent} />
          </mesh>
          <mesh position={[-0.96, 0.4, 0.1]} rotation={[0, -Math.PI / 2, 0]}>
            <boxGeometry args={[0.7, 0.16, 0.05]} />
            <meshLambertMaterial color={palette.accent} />
          </mesh>

          {/* Front Glowing Team Headlights */}
          <mesh position={[0.68, 0.28, 1.55]}>
            <sphereGeometry args={[0.11, 10, 10]} />
            <meshBasicMaterial color={palette.accent} />
          </mesh>
          <mesh position={[-0.68, 0.28, 1.55]}>
            <sphereGeometry args={[0.11, 10, 10]} />
            <meshBasicMaterial color={palette.accent} />
          </mesh>

          {/* ── ROUNDED TURRET & CANNON (Tracks Player in Real-Time) ── */}
          <group ref={turretRef} position={[0, 0.74, 0.05]}>
            <mesh position={[0, 0.05, 0]} castShadow>
              <cylinderGeometry args={[0.92, 1.02, 0.34, 16]} />
              <meshLambertMaterial color={palette.body} />
            </mesh>
            <mesh position={[0, 0.26, 0.05]} castShadow>
              <sphereGeometry args={[0.82, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshLambertMaterial color={palette.turretTop} />
            </mesh>

            {/* ── ENEMY TANK COMMANDER MAN (Standing in Turret Roof Hatch) ── */}
            <group ref={commanderRef} position={[0, 1.0, -0.05]} scale={[1.05, 1.05, 1.05]}>
              {/* Cupola Hatch Ring */}
              <mesh position={[0, -0.05, 0]} castShadow>
                <cylinderGeometry args={[0.42, 0.46, 0.16, 14]} />
                <meshLambertMaterial color={palette.body} />
              </mesh>
              <mesh position={[0, 0.01, 0]}>
                <cylinderGeometry args={[0.34, 0.34, 0.04, 14]} />
                <meshLambertMaterial color="#111111" />
              </mesh>

              {/* Enemy Commander Torso in Team Camo Uniform */}
              <mesh position={[0, 0.24, 0]} castShadow>
                <boxGeometry args={[0.46, 0.46, 0.3]} />
                <meshLambertMaterial color={palette.body} />
              </mesh>
              {/* Chest Accent Webbing Straps */}
              <mesh position={[0, 0.26, 0.1]}>
                <boxGeometry args={[0.28, 0.28, 0.12]} />
                <meshLambertMaterial color={palette.accent} />
              </mesh>

              {/* Commander Head / Neck */}
              <mesh position={[0, 0.58, 0]} castShadow>
                <sphereGeometry args={[0.19, 12, 12]} />
                <meshLambertMaterial color="#d7ccc8" />
              </mesh>

              {/* Enemy Tanker Helmet with Team Color */}
              <mesh position={[0, 0.65, 0]} castShadow>
                <sphereGeometry args={[0.23, 14, 12, 0, Math.PI * 2, 0, Math.PI / 1.6]} />
                <meshLambertMaterial color={palette.highlight} />
              </mesh>
              <mesh position={[0, 0.64, 0]}>
                <torusGeometry args={[0.22, 0.03, 8, 14]} />
                <meshLambertMaterial color={palette.accent} />
              </mesh>

              {/* Tactical Aviator Shades / Goggles */}
              <mesh position={[0, 0.6, 0.18]}>
                <boxGeometry args={[0.24, 0.08, 0.08]} />
                <meshLambertMaterial color={palette.accent} />
              </mesh>

              {/* Radio Headset */}
              <mesh position={[0.21, 0.58, 0]}>
                <cylinderGeometry args={[0.07, 0.07, 0.06, 8]} />
                <meshLambertMaterial color="#212121" />
              </mesh>
              <mesh position={[-0.21, 0.58, 0]}>
                <cylinderGeometry args={[0.07, 0.07, 0.06, 8]} />
                <meshLambertMaterial color="#212121" />
              </mesh>

              {/* Arms Gripping Hatch Rim & Holding Binoculars Forward */}
              <group position={[-0.28, 0.2, 0.1]} rotation={[0.4, -0.3, 0.2]}>
                <mesh position={[0, 0, 0]}>
                  <cylinderGeometry args={[0.08, 0.09, 0.32, 8]} />
                  <meshLambertMaterial color={palette.body} />
                </mesh>
                <mesh position={[0, -0.16, 0]}>
                  <sphereGeometry args={[0.08, 8, 8]} />
                  <meshLambertMaterial color="#212121" />
                </mesh>
              </group>
              <group position={[0.28, 0.2, 0.1]} rotation={[0.4, 0.3, -0.2]}>
                <mesh position={[0, 0, 0]}>
                  <cylinderGeometry args={[0.08, 0.09, 0.32, 8]} />
                  <meshLambertMaterial color={palette.body} />
                </mesh>
                <mesh position={[0, -0.16, 0]}>
                  <sphereGeometry args={[0.08, 8, 8]} />
                  <meshLambertMaterial color="#212121" />
                </mesh>
              </group>

              {/* Military Binoculars Aimed at Player */}
              <group position={[0, 0.32, 0.26]}>
                <mesh position={[-0.06, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.045, 0.055, 0.18, 8]} />
                  <meshLambertMaterial color="#212121" />
                </mesh>
                <mesh position={[0.06, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.045, 0.055, 0.18, 8]} />
                  <meshLambertMaterial color="#212121" />
                </mesh>
                <mesh position={[0, 0, 0]}>
                  <boxGeometry args={[0.16, 0.045, 0.07]} />
                  <meshLambertMaterial color="#37474f" />
                </mesh>
              </group>
            </group>

            {/* Cannon facing towards player */}
            <group ref={cannonRef} position={[0, 0.16, 0.4]}>
              <mesh position={[0, 0, 1.1]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.12, 0.15, 2.3, 12]} />
                <meshLambertMaterial color={palette.barrel} />
              </mesh>
              <mesh position={[0, 0, 2.3]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.19, 0.19, 0.38, 12]} />
                <meshLambertMaterial color="#1a1a1a" />
              </mesh>
            </group>
          </group>
        </group>

        {/* ── CRISP FLOATING TACTICAL BADGE (A, B, C, D) ── */}
        {showBadge && (
          <sprite
            ref={badgeRef}
            position={[0, 4.4, 0]}
            scale={[3.2, 1.75, 1]}
            renderOrder={999}
          >
            <spriteMaterial
              map={badgeTexture}
              transparent
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </sprite>
        )}
      </group>
    );
  }
);

EnemyTank.displayName = 'EnemyTank';
