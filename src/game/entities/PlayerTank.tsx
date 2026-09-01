import { useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GAME_CONFIG } from '../gameConfig';
import { getTerrainHeight, getTerrainAngle } from '../scene/Terrain';
import { ballisticPositions, secureRandom } from '../../utils/math';
import { AudioManager } from '../../audio/AudioManager';
import { useGameStore } from '../gameStore';
import type { KeyState } from '../../controls/useKeyboard';

const CFG = GAME_CONFIG;

// ─────────────────────────────────────────────────────────────────
//  Public handle exposed to parent
// ─────────────────────────────────────────────────────────────────
export interface PlayerTankHandle {
  getPosition: () => THREE.Vector3;
  getVelocity: () => number;
  triggerRecoil: () => void;
  fire: () => void;
}

interface Props {
  keys: React.MutableRefObject<KeyState>;
  fireSignal: React.MutableRefObject<boolean>;
  enemyPositionsRef?: React.MutableRefObject<THREE.Vector3[]>;
  onFire?: (origin: THREE.Vector3, velocity: THREE.Vector3) => void;
  paused: boolean;
  showTrajectory: boolean;
  trajectoryGroupRef: React.RefObject<THREE.Group>;
}

// ── Pre-allocated Math Objects (Zero-GC Optimization) ─────────────
const _targetPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 18.0); // vertical plane at Z = -18 (enemy ridges)
const _planeIntersect = new THREE.Vector3();
const _ndcVec = new THREE.Vector2();
const _muzzleWorld = new THREE.Vector3();
const _velWorld = new THREE.Vector3();

// ─────────────────────────────────────────────────────────────────
//  3D Realistic Player Tank with Heroic Tank Commander
// ─────────────────────────────────────────────────────────────────
export const PlayerTank = forwardRef<PlayerTankHandle, Props>(
  ({ keys, onFire, fireSignal, enemyPositionsRef, paused, showTrajectory, trajectoryGroupRef }, ref) => {
    const groupRef = useRef<THREE.Group>(null);
    const chassisRef = useRef<THREE.Group>(null);
    const turretRef = useRef<THREE.Group>(null);
    const cannonRef = useRef<THREE.Group>(null);
    const commanderRef = useRef<THREE.Group>(null);
    const flashRef = useRef<THREE.Group>(null);
    const leftWheelsRef = useRef<THREE.Group>(null);
    const rightWheelsRef = useRef<THREE.Group>(null);
    const exhaustRef = useRef<THREE.Group>(null);
    const antennaRef = useRef<THREE.Group>(null);
    const streakAuraRef = useRef<THREE.Group>(null);
    const trackDustRef = useRef<THREE.Group>(null);

    const streak = useGameStore((s) => s.streak);

    // High-frequency physics & position state
    const velocity = useRef(0);
    const posX = useRef(0); // positioned in horizontal center
    const posZ = 10.0;      // foreground combat road

    // Base hull heading: facing forward into the battlefield (-Z)
    const BASE_HULL_YAW = Math.PI;

    // 3D Aiming Angles in World Space
    const turretYaw = useRef(0.0);
    const cannonPitch = useRef(0.38);
    const recoilTimer = useRef(0);

    const { camera, raycaster, size } = useThree();

    // ── Execute Fire in 3D ─────────────────────────────────────────
    const executeFire = useCallback(() => {
      const px = posX.current;
      const pz = posZ;
      const py = getTerrainHeight(px, pz);

      recoilTimer.current = 0.22;

      const yaw = turretYaw.current;
      const pitch = cannonPitch.current;

      // 100% Exact 3D Launch Direction Vector
      const dirX = Math.sin(yaw) * Math.cos(pitch);
      const dirY = Math.sin(pitch);
      const dirZ = -Math.cos(yaw) * Math.cos(pitch);

      // Muzzle world position (matches barrel tip)
      const barrelLen = 3.6;
      const muzzleX = px + dirX * barrelLen;
      const muzzleY = py + 1.55 + dirY * barrelLen;
      const muzzleZ = pz + dirZ * barrelLen;
      _muzzleWorld.set(muzzleX, muzzleY, muzzleZ);

      // Initial 3D launch velocity
      const speed = CFG.projectile.speed;
      _velWorld.set(
        dirX * speed,
        dirY * speed,
        dirZ * speed
      );

      AudioManager.play('fire');
      onFire?.(_muzzleWorld, _velWorld);

      if (flashRef.current) {
        flashRef.current.visible = true;
        flashRef.current.scale.setScalar(1.5 + secureRandom() * 0.4);
        setTimeout(() => {
          if (flashRef.current) flashRef.current.visible = false;
        }, 90);
      }
    }, [onFire, posZ]);

    // ── Public handle ─────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      getPosition: () => new THREE.Vector3(posX.current, getTerrainHeight(posX.current, posZ), posZ),
      getVelocity: () => velocity.current,
      triggerRecoil: () => { recoilTimer.current = 0.22; },
      fire: executeFire,
    }));

    // ── Hold-to-Aim & Drag-to-Aim Listeners (Only aims while holding) ──
    const isAimDragging = useRef(false);

    useEffect(() => {
      const updateAimFromPointer = (clientX: number, clientY: number) => {
        _ndcVec.x = (clientX / size.width) * 2 - 1;
        _ndcVec.y = -(clientY / size.height) * 2 + 1;

        raycaster.setFromCamera(_ndcVec, camera);

        // Intersect ray with target plane at Z = -18 (depth of enemy ridges)
        _targetPlane.constant = 18.0;
        if (raycaster.ray.intersectPlane(_targetPlane, _planeIntersect)) {
          const px = posX.current;
          const pz = posZ;
          const py = getTerrainHeight(px, pz) + 1.55;

          const targetX = _planeIntersect.x;
          const targetY = Math.max(0.5, Math.min(10.0, _planeIntersect.y));
          const targetZ = -18.0;

          const dx = targetX - px;
          const dz = targetZ - pz;
          const dy = targetY - py;
          const distXZ = Math.hypot(dx, dz);

          // Turret Yaw: points left or right across ridges
          const targetYaw = Math.atan2(dx, -dz);
          turretYaw.current = Math.max(CFG.cannon.minYaw, Math.min(CFG.cannon.maxYaw, targetYaw));

          // Ballistic Elevation Pitch to hit target exactly
          const v = CFG.projectile.speed;
          const g = 9.81;
          const v2 = v * v;
          const v4 = v2 * v2;
          const root = v4 - g * (g * distXZ * distXZ + 2 * dy * v2);

          if (root >= 0) {
            const theta = Math.atan((v2 - Math.sqrt(root)) / (g * distXZ));
            cannonPitch.current = Math.max(CFG.cannon.minElevation, Math.min(CFG.cannon.maxElevation, theta));
          } else {
            const straightAngle = Math.atan2(dy, distXZ);
            cannonPitch.current = Math.max(CFG.cannon.minElevation, Math.min(CFG.cannon.maxElevation, straightAngle + 0.1));
          }
        }
      };

      const isIgnoredTarget = (target: HTMLElement | null) => {
        return Boolean(
          target?.closest?.('.options-tray') ||
          target?.closest?.('.control-bar') ||
          target?.closest?.('.top-utility-bar') ||
          target?.closest?.('.desktop-fire-container') ||
          target?.closest?.('.mobile-controls') ||
          target?.closest?.('.score-panel') ||
          target?.closest?.('.arcade-question-header') ||
          target?.closest?.('button')
        );
      };

      const onPointerDown = (e: PointerEvent) => {
        if (paused) return;
        if (isIgnoredTarget(e.target as HTMLElement | null)) return;
        isAimDragging.current = true;
        updateAimFromPointer(e.clientX, e.clientY);
      };

      const onPointerMove = (e: PointerEvent) => {
        if (paused || !isAimDragging.current) return;
        updateAimFromPointer(e.clientX, e.clientY);
      };

      const onPointerUp = () => {
        isAimDragging.current = false;
      };

      window.addEventListener('pointerdown', onPointerDown, { passive: true });
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerup', onPointerUp, { passive: true });
      window.addEventListener('pointercancel', onPointerUp, { passive: true });

      return () => {
        window.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
      };
    }, [camera, raycaster, size, paused, posZ]);

    // ── Main Frame Loop ───────────────────────────────────────────
    useFrame((_, delta) => {
      const grp = groupRef.current;
      if (!grp) return;
      const dt = Math.min(delta, 0.05);

      const h = getTerrainHeight(posX.current, posZ);
      const slope = getTerrainAngle(posX.current, posZ);

      // Fire trigger
      if (fireSignal.current) {
        fireSignal.current = false;
        executeFire();
      }

      if (paused) return;

      // Tank Movement Controls (A/D or ◀/▶)
      const { left, right } = keys.current;
      const { acceleration: accel, deceleration: decel, maxSpeed, boundaryX } = CFG.playerTank;

      if (left) {
        velocity.current = Math.max(-maxSpeed, velocity.current - accel * dt);
      } else if (right) {
        velocity.current = Math.min(maxSpeed, velocity.current + accel * dt);
      } else {
        if (velocity.current > 0) velocity.current = Math.max(0, velocity.current - decel * dt);
        else velocity.current = Math.min(0, velocity.current + decel * dt);
      }

      // Keyboard Turret elevation controls (Up/Down / W/S)
      if (keys.current.up) {
        cannonPitch.current = Math.min(CFG.cannon.maxElevation, cannonPitch.current + 1.2 * dt);
      } else if (keys.current.down) {
        cannonPitch.current = Math.max(CFG.cannon.minElevation, cannonPitch.current - 1.2 * dt);
      }

      posX.current = Math.max(-boundaryX, Math.min(boundaryX, posX.current + velocity.current * dt));

      const bob = Math.sin(Date.now() * 0.01) * 0.03 * (Math.abs(velocity.current) / maxSpeed);

      // Tank root sits on terrain aligned with World space
      grp.position.set(posX.current, h + 0.68 + bob, posZ);

      // Chassis faces forward (-Z) and tilts with terrain slope
      if (chassisRef.current) {
        chassisRef.current.rotation.set(0, BASE_HULL_YAW, -slope * 0.8);
      }

      // Rotate roadwheels on their own local axles
      if (leftWheelsRef.current && rightWheelsRef.current) {
        leftWheelsRef.current.children.forEach((w) => {
          w.rotation.x += velocity.current * dt * 2.5;
        });
        rightWheelsRef.current.children.forEach((w) => {
          w.rotation.x += velocity.current * dt * 2.5;
        });
      }

      // Turret rotates directly in World Y axis (aiming towards -Z)
      if (turretRef.current) {
        turretRef.current.rotation.y = -turretYaw.current;
      }

      // Commander subtle look/breathing animation
      if (commanderRef.current) {
        const breathing = Math.sin(Date.now() * 0.004) * 0.03;
        commanderRef.current.position.y = 1.06 + breathing;
        commanderRef.current.rotation.y = Math.sin(Date.now() * 0.002) * 0.08;
      }

      // Cannon elevates directly in local X axis (tilts -Z barrel up towards +Y)
      if (cannonRef.current) {
        cannonRef.current.rotation.x = cannonPitch.current;
        if (recoilTimer.current > 0) {
          recoilTimer.current -= dt;
          cannonRef.current.position.z = 0.35 * (recoilTimer.current / 0.22);
        } else {
          cannonRef.current.position.z = 0;
        }
      }

      // Exhaust smoke particles
      if (exhaustRef.current) {
        const isMoving = Math.abs(velocity.current) > 0.4;
        exhaustRef.current.visible = isMoving;
        if (isMoving) {
          exhaustRef.current.scale.setScalar(0.8 + Math.sin(Date.now() * 0.02) * 0.3);
        }
      }

      // Streak Combat Energy Aura Animation
      if (streakAuraRef.current) {
        streakAuraRef.current.rotation.y += dt * 3.0;
        const auraPulse = 1.0 + Math.sin(Date.now() * 0.008) * 0.06;
        streakAuraRef.current.scale.set(auraPulse, auraPulse, auraPulse);
      }

      // Track dust kick-up particles when driving
      if (trackDustRef.current) {
        const isDriving = Math.abs(velocity.current) > 0.4;
        trackDustRef.current.visible = isDriving;
        if (isDriving) {
          const dustPuff = 0.8 + Math.sin(Date.now() * 0.03) * 0.35;
          trackDustRef.current.scale.set(dustPuff, dustPuff, dustPuff);
        }
      }

      // Trajectory preview in 3D (100% matches barrel, projectile, and stops at enemy tank!)
      if (showTrajectory && trajectoryGroupRef.current) {
        const enemies = enemyPositionsRef?.current ?? [];
        update3DTrajectoryDots(
          trajectoryGroupRef.current,
          posX.current,
          posZ,
          turretYaw.current,
          cannonPitch.current,
          enemies
        );
        trajectoryGroupRef.current.visible = true;
      } else if (trajectoryGroupRef.current) {
        trajectoryGroupRef.current.visible = false;
      }
    });

    const HULL_GREEN = '#3b4b28'; // WWII Sherman olive-drab
    const HULL_HIGHLIGHT = '#4a5d33';
    const TREAD_COLOR = '#1a1f18';
    const CANNON_STEEL = '#263238';
    const EMBLEM_GOLD = '#ffd54f';
    const wheelZs = [-1.4, -0.7, 0, 0.7, 1.4];

    return (
      <group ref={groupRef}>
        {/* ── CHASSIS & TANK BODY ── */}
        <group ref={chassisRef}>
          {/* Lower Chassis & Treads */}
          <mesh position={[1.22, -0.32, 0]} castShadow>
            <boxGeometry args={[0.38, 0.48, 3.8]} />
            <meshLambertMaterial color={TREAD_COLOR} />
          </mesh>
          <mesh position={[-1.22, -0.32, 0]} castShadow>
            <boxGeometry args={[0.38, 0.48, 3.8]} />
            <meshLambertMaterial color={TREAD_COLOR} />
          </mesh>

          {/* 5 Roadwheels on Right Track */}
          <group ref={rightWheelsRef}>
            {wheelZs.map((wz, i) => (
              <group key={`r-wheel-${i}`} position={[1.25, -0.32, wz]}>
                <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[0.36, 0.36, 0.3, 14]} />
                  <meshLambertMaterial color="#37474f" />
                </mesh>
                <mesh position={[0.16, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.24, 0.24, 0.05, 12]} />
                  <meshLambertMaterial color="#78909c" />
                </mesh>
              </group>
            ))}
          </group>

          {/* 5 Roadwheels on Left Track */}
          <group ref={leftWheelsRef}>
            {wheelZs.map((wz, i) => (
              <group key={`l-wheel-${i}`} position={[-1.25, -0.32, wz]}>
                <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
                  <cylinderGeometry args={[0.36, 0.36, 0.3, 14]} />
                  <meshLambertMaterial color="#37474f" />
                </mesh>
                <mesh position={[-0.16, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                  <cylinderGeometry args={[0.24, 0.24, 0.05, 12]} />
                  <meshLambertMaterial color="#78909c" />
                </mesh>
              </group>
            ))}
          </group>

          {/* Armored Hull */}
          <mesh position={[0, 0.14, 0]} castShadow>
            <boxGeometry args={[2.1, 0.68, 3.4]} />
            <meshLambertMaterial color={HULL_GREEN} />
          </mesh>
          <mesh position={[0, 0.48, 0.2]} castShadow>
            <boxGeometry args={[1.9, 0.45, 2.6]} />
            <meshLambertMaterial color={HULL_HIGHLIGHT} />
          </mesh>
          <mesh position={[0, 0.28, 1.5]} rotation={[0.55, 0, 0]} castShadow>
            <boxGeometry args={[2.05, 0.62, 0.9]} />
            <meshLambertMaterial color={HULL_GREEN} />
          </mesh>
          <mesh position={[0, 0.38, -1.45]} castShadow>
            <boxGeometry args={[2.0, 0.48, 0.75]} />
            <meshLambertMaterial color={HULL_GREEN} />
          </mesh>

          {/* Front Dual Headlights */}
          <mesh position={[0.78, 0.3, 1.75]}>
            <sphereGeometry args={[0.13, 10, 10]} />
            <meshBasicMaterial color="#fff59d" />
          </mesh>
          <mesh position={[-0.78, 0.3, 1.75]}>
            <sphereGeometry args={[0.13, 10, 10]} />
            <meshBasicMaterial color="#fff59d" />
          </mesh>

          {/* Star Insignia on Side Armor */}
          <mesh position={[1.08, 0.45, 0.2]} rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[0.6, 0.3, 0.04]} />
            <meshLambertMaterial color={EMBLEM_GOLD} />
          </mesh>
          <mesh position={[-1.08, 0.45, 0.2]} rotation={[0, -Math.PI / 2, 0]}>
            <boxGeometry args={[0.6, 0.3, 0.04]} />
            <meshLambertMaterial color={EMBLEM_GOLD} />
          </mesh>

          {/* Rear Exhaust Pipes */}
          <mesh position={[0.6, 0.42, -1.85]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.11, 0.45, 8]} />
            <meshLambertMaterial color="#212121" />
          </mesh>
          <group ref={exhaustRef} position={[0.6, 0.52, -2.1]} visible={false}>
            <mesh>
              <sphereGeometry args={[0.24, 8, 8]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.65} />
            </mesh>
          </group>

          {/* Track Dust Kick-Up Particles */}
          <group ref={trackDustRef} visible={false}>
            <mesh position={[1.22, -0.42, 1.95]}>
              <dodecahedronGeometry args={[0.32, 0]} />
              <meshLambertMaterial color="#6e5d4e" transparent opacity={0.65} />
            </mesh>
            <mesh position={[-1.22, -0.42, 1.95]}>
              <dodecahedronGeometry args={[0.32, 0]} />
              <meshLambertMaterial color="#6e5d4e" transparent opacity={0.65} />
            </mesh>
          </group>

          {/* Streak Power Aura (Energy Torus Rings & Point Light) */}
          {streak >= 2 && (
            <group ref={streakAuraRef} position={[0, 0.35, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[2.4, 0.08, 10, 28]} />
                <meshBasicMaterial
                  color={streak >= 5 ? '#ff1744' : streak >= 3 ? '#ffd700' : '#00e5ff'}
                  transparent
                  opacity={0.85}
                />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, Math.PI / 4]}>
                <torusGeometry args={[2.1, 0.05, 8, 24]} />
                <meshBasicMaterial
                  color={streak >= 5 ? '#ff9100' : streak >= 3 ? '#fff176' : '#80d8ff'}
                  transparent
                  opacity={0.65}
                />
              </mesh>
              <pointLight
                color={streak >= 5 ? '#ff1744' : streak >= 3 ? '#ffd700' : '#00e5ff'}
                intensity={1.4}
                distance={12}
              />
            </group>
          )}
        </group>

        {/* ── 3D ROUNDED TURRET ── */}
        <group ref={turretRef} position={[0, 0.88, 0]}>
          <mesh position={[0, 0.05, 0]} castShadow>
            <cylinderGeometry args={[1.1, 1.2, 0.38, 18]} />
            <meshLambertMaterial color={HULL_GREEN} />
          </mesh>
          <mesh position={[0, 0.24, 0]} castShadow>
            <sphereGeometry args={[0.95, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshLambertMaterial color={HULL_HIGHLIGHT} />
          </mesh>

          {/* Radio Antenna */}
          <group ref={antennaRef} position={[-0.45, 0.48, 0.5]}>
            <mesh position={[0, 0.85, 0]}>
              <cylinderGeometry args={[0.02, 0.04, 1.7, 6]} />
              <meshLambertMaterial color="#212121" />
            </mesh>
            <mesh position={[0, 1.75, 0]}>
              <sphereGeometry args={[0.09, 8, 8]} />
              <meshBasicMaterial color="#ffd54f" />
            </mesh>
          </group>

          {/* ── HEROIC TANK COMMANDER MAN (Standing Prominently on Turret Roof) ── */}
          <group ref={commanderRef} position={[0, 1.06, 0.1]} scale={[1.15, 1.15, 1.15]}>
            {/* Open Cupola Hatch Ring on Roof */}
            <mesh position={[0, -0.06, 0]} castShadow>
              <cylinderGeometry args={[0.46, 0.5, 0.18, 16]} />
              <meshLambertMaterial color={HULL_GREEN} />
            </mesh>
            <mesh position={[0, 0.01, 0]}>
              <cylinderGeometry args={[0.38, 0.38, 0.04, 16]} />
              <meshLambertMaterial color="#1a2016" />
            </mesh>

            {/* Commander Torso in Combat Uniform */}
            <mesh position={[0, 0.28, 0]} castShadow>
              <boxGeometry args={[0.52, 0.52, 0.34]} />
              <meshLambertMaterial color="#3d4c28" />
            </mesh>
            {/* Shoulder Epaulets / Straps */}
            <mesh position={[-0.24, 0.52, 0]}>
              <boxGeometry args={[0.1, 0.05, 0.2]} />
              <meshLambertMaterial color="#2f3b1f" />
            </mesh>
            <mesh position={[0.24, 0.52, 0]}>
              <boxGeometry args={[0.1, 0.05, 0.2]} />
              <meshLambertMaterial color="#2f3b1f" />
            </mesh>
            {/* Chest Webbing & Tactical Leather Harness */}
            <mesh position={[0, 0.3, 0.12]}>
              <boxGeometry args={[0.32, 0.32, 0.14]} />
              <meshLambertMaterial color="#3e2723" />
            </mesh>

            {/* Commander Head / Neck */}
            <mesh position={[0, 0.68, 0]} castShadow>
              <sphereGeometry args={[0.22, 14, 14]} />
              <meshLambertMaterial color="#d7ccc8" />
            </mesh>

            {/* WWII Leather Tanker Helmet with Top Dome & Earflaps */}
            <mesh position={[0, 0.76, 0]} castShadow>
              <sphereGeometry args={[0.26, 16, 14, 0, Math.PI * 2, 0, Math.PI / 1.6]} />
              <meshLambertMaterial color="#3e2723" />
            </mesh>
            {/* Helmet Rim & Goggles Strap */}
            <mesh position={[0, 0.74, 0]}>
              <torusGeometry args={[0.25, 0.035, 8, 16]} />
              <meshLambertMaterial color="#1a1a1a" />
            </mesh>
            {/* Radio Headset Earcups */}
            <mesh position={[0.24, 0.68, 0]}>
              <cylinderGeometry args={[0.08, 0.08, 0.07, 10]} />
              <meshLambertMaterial color="#212121" />
            </mesh>
            <mesh position={[-0.24, 0.68, 0]}>
              <cylinderGeometry args={[0.08, 0.08, 0.07, 10]} />
              <meshLambertMaterial color="#212121" />
            </mesh>

            {/* Aviator Goggles on Front of Helmet */}
            <mesh position={[0, 0.72, -0.22]}>
              <boxGeometry args={[0.28, 0.09, 0.09]} />
              <meshLambertMaterial color="#1a237e" />
            </mesh>

            {/* Arms Gripping Hatch Rim / Binoculars */}
            <group position={[-0.32, 0.22, -0.1]} rotation={[0.4, 0.3, 0.2]}>
              <mesh position={[0, 0, 0]}>
                <cylinderGeometry args={[0.09, 0.1, 0.36, 8]} />
                <meshLambertMaterial color="#3d4c28" />
              </mesh>
              <mesh position={[0, -0.18, 0]}>
                <sphereGeometry args={[0.09, 8, 8]} />
                <meshLambertMaterial color="#3e2723" />
              </mesh>
            </group>
            <group position={[0.32, 0.22, -0.1]} rotation={[0.4, -0.3, -0.2]}>
              <mesh position={[0, 0, 0]}>
                <cylinderGeometry args={[0.09, 0.1, 0.36, 8]} />
                <meshLambertMaterial color="#3d4c28" />
              </mesh>
              <mesh position={[0, -0.18, 0]}>
                <sphereGeometry args={[0.09, 8, 8]} />
                <meshLambertMaterial color="#3e2723" />
              </mesh>
            </group>

            {/* Tactical Military Binoculars Held in Front */}
            <group position={[0, 0.36, -0.32]}>
              <mesh position={[-0.07, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.05, 0.06, 0.2, 8]} />
                <meshLambertMaterial color="#212121" />
              </mesh>
              <mesh position={[0.07, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.05, 0.06, 0.2, 8]} />
                <meshLambertMaterial color="#212121" />
              </mesh>
              <mesh position={[0, 0, 0]}>
                <boxGeometry args={[0.18, 0.05, 0.08]} />
                <meshLambertMaterial color="#37474f" />
              </mesh>
            </group>
          </group>

          {/* ── ELEVATING HEAVY CANNON (Points along -Z into battlefield) ── */}
          <group ref={cannonRef} position={[0, 0.24, 0]}>
            <mesh position={[0, 0, -0.45]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.34, 0.34, 0.7, 16]} />
              <meshLambertMaterial color={HULL_GREEN} />
            </mesh>
            <mesh position={[0, 0, -2.0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.13, 0.17, 3.2, 14]} />
              <meshLambertMaterial color={CANNON_STEEL} />
            </mesh>
            <mesh position={[0, 0, -1.0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.2, 0.22, 1.0, 14]} />
              <meshLambertMaterial color={CANNON_STEEL} />
            </mesh>
            <mesh position={[0, 0, -3.6]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.24, 0.24, 0.5, 14]} />
              <meshLambertMaterial color="#212121" />
            </mesh>

            {/* Muzzle Flash */}
            <group ref={flashRef} position={[0, 0, -3.9]} visible={false}>
              <mesh>
                <sphereGeometry args={[0.7, 10, 10]} />
                <meshBasicMaterial color="#fff59d" />
              </mesh>
              <mesh>
                <dodecahedronGeometry args={[1.05, 0]} />
                <meshBasicMaterial color="#ff9800" transparent opacity={0.7} />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    );
  }
);

PlayerTank.displayName = 'PlayerTank';

// ─────────────────────────────────────────────────────────────────
//  3D Ballistic Trajectory Arc with Precise Tank & Terrain Collision
// ─────────────────────────────────────────────────────────────────
function update3DTrajectoryDots(
  group: THREE.Group,
  px: number,
  pz: number,
  yaw: number,
  pitch: number,
  enemyPositions: THREE.Vector3[]
) {
  const py = getTerrainHeight(px, pz);

  const dirX = Math.sin(yaw) * Math.cos(pitch);
  const dirY = Math.sin(pitch);
  const dirZ = -Math.cos(yaw) * Math.cos(pitch);

  const barrelLen = 3.6;
  const origin: [number, number, number] = [
    px + dirX * barrelLen,
    py + 1.55 + dirY * barrelLen,
    pz + dirZ * barrelLen,
  ];

  const speed = CFG.projectile.speed;
  const vel: [number, number, number] = [
    dirX * speed,
    dirY * speed,
    dirZ * speed,
  ];

  const count = group.children.length;
  const pts = ballisticPositions(origin, vel, 9.81, count, CFG.trajectory.timeStep);

  let hasTerminated = false;

  for (let i = 0; i < count; i++) {
    const child = group.children[i] as THREE.Mesh | undefined;
    if (!child) continue;

    if (hasTerminated) {
      child.visible = false;
      continue;
    }

    const pt = pts[i];

    // 1. Check if trajectory intersects any enemy tank bounding sphere (exact 1.45 physical radius)
    let hitEnemy = false;
    for (let e = 0; e < enemyPositions.length; e++) {
      const ep = enemyPositions[e];
      const dist = Math.hypot(pt[0] - ep.x, pt[1] - (ep.y + 0.8), pt[2] - ep.z);
      if (dist < 1.45) {
        hitEnemy = true;
        break;
      }
    }

    if (hitEnemy) {
      hasTerminated = true;
      child.position.set(pt[0], pt[1], pt[2]);
      child.scale.set(2.6, 2.6, 2.6);
      (child.material as THREE.MeshBasicMaterial).color.set('#ffd700'); // Radiant Gold Target Lock!
      (child.material as THREE.MeshBasicMaterial).opacity = 1.0;
      child.visible = true;
      continue;
    }

    // 2. Check if trajectory intersects ground terrain
    const groundY = getTerrainHeight(pt[0], pt[2]);
    if (pt[1] <= groundY + 0.35) {
      hasTerminated = true;
      child.position.set(pt[0], groundY + 0.35, pt[2]);
      child.scale.set(2.2, 2.2, 2.2);
      (child.material as THREE.MeshBasicMaterial).color.set('#ff1744');
      (child.material as THREE.MeshBasicMaterial).opacity = 0.95;
      child.visible = true;
      continue;
    }

    // 3. Normal airborne trajectory dot
    child.position.set(pt[0], pt[1], pt[2]);
    child.scale.setScalar(Math.max(0.4, 1.05 - i * 0.038));
    (child.material as THREE.MeshBasicMaterial).color.set('#69f0ae');
    (child.material as THREE.MeshBasicMaterial).opacity = Math.max(0.35, 0.95 - i * 0.04);
    child.visible = true;
  }
}
