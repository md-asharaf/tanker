import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GAME_CONFIG } from '../gameConfig';
import { getTerrainHeight } from '../scene/Terrain';
import { distToSegment3D } from '../../utils/math';
import type { EnemyTankHandle } from './EnemyTank';

interface ProjectileProps {
  origin: THREE.Vector3;
  velocity: THREE.Vector3;
  sessionId: number;
  enemyHandles: React.MutableRefObject<(EnemyTankHandle | null)[]>;
  enemyTargetIds: string[];
  onHitTank: (tankId: string) => void;
  onHitTerrain: (impactPos: THREE.Vector3) => void;
  onDestroy: () => void;
}

// ── Pre-allocated Math Objects (Zero-GC) ──────────────────────────
const _vForward = new THREE.Vector3(0, 0, 1);
const _dirVec = new THREE.Vector3();
const TANK_HIT_RADIUS = 1.45;

export function Projectile({
  origin,
  velocity,
  sessionId,
  enemyHandles,
  enemyTargetIds,
  onHitTank,
  onHitTerrain,
  onDestroy,
}: ProjectileProps) {
  const meshRef = useRef<THREE.Group>(null);
  const pos = useRef(origin.clone());
  const prevPos = useRef(origin.clone());
  const vel = useRef(velocity.clone());
  const resolved = useRef(false);
  const age = useRef(0);
  const mySession = useRef(sessionId);

  // Trail Particles in 3D
  const TRAIL_LEN = 36;
  const trailPos = useRef<Float32Array>(new Float32Array(TRAIL_LEN * 3).fill(9999));
  const trailIdx = useRef(0);
  const trailRef = useRef<THREE.Points>(null);

  useEffect(() => {
    return () => { resolved.current = true; };
  }, []);

  useFrame((_, delta) => {
    if (resolved.current) return;
    if (mySession.current !== sessionId) {
      resolved.current = true;
      return;
    }

    const dt = Math.min(delta, 0.035);
    age.current += dt;

    // Save previous position for Continuous Collision Detection (CCD) in 3D
    prevPos.current.copy(pos.current);

    // 3D Ballistic Physics
    vel.current.y -= 9.81 * dt;
    pos.current.x += vel.current.x * dt;
    pos.current.y += vel.current.y * dt;
    pos.current.z += vel.current.z * dt;

    if (meshRef.current) {
      meshRef.current.position.copy(pos.current);
      // Orient bullet shell along flight trajectory in 3D (Zero-GC)
      _dirVec.copy(vel.current).normalize();
      meshRef.current.quaternion.setFromUnitVectors(_vForward, _dirVec);
    }

    // Update sparkling particle trail in 3D
    const ti = (trailIdx.current % TRAIL_LEN) * 3;
    trailPos.current[ti] = pos.current.x;
    trailPos.current[ti + 1] = pos.current.y;
    trailPos.current[ti + 2] = pos.current.z;
    trailIdx.current++;
    if (trailRef.current) {
      (trailRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    // ── 1. CONTINUOUS COLLISION DETECTION AGAINST ENEMY TANKS IN 3D ──
    for (let i = 0; i < enemyHandles.current.length; i++) {
      const handle = enemyHandles.current[i];
      if (!handle) continue;
      const tankPos = handle.getPosition();

      // Compute shortest distance from tank center to the projectile's 3D swept path
      const sweptDist = distToSegment3D(
        tankPos.x, tankPos.y + 0.9, tankPos.z,
        prevPos.current.x, prevPos.current.y, prevPos.current.z,
        pos.current.x, pos.current.y, pos.current.z
      );

      if (sweptDist < TANK_HIT_RADIUS && !resolved.current) {
        resolved.current = true;
        const tankId = enemyTargetIds[i];
        if (tankId) {
          onHitTank(tankId);
          setTimeout(onDestroy, 500);
        }
        return;
      }
    }

    // ── 2. 3D TERRAIN COLLISION ───────────────────────────────
    const terrainY = getTerrainHeight(pos.current.x, pos.current.z);
    if (pos.current.y <= terrainY + 0.35) {
      if (!resolved.current) {
        resolved.current = true;
        onHitTerrain(pos.current.clone());
        setTimeout(onDestroy, 400);
      }
      return;
    }

    // ── 3. MAX FLIGHT TIME ────────────────────────────────────
    if (age.current > GAME_CONFIG.projectile.maxFlightTime) {
      if (!resolved.current) {
        resolved.current = true;
        onHitTerrain(pos.current.clone());
        setTimeout(onDestroy, 200);
      }
      return;
    }
  });

  return (
    <group>
      {/* 3D Glowing Heavy Artillery Shell */}
      <group ref={meshRef} position={origin.toArray()}>
        {/* Bullet Body */}
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 0.7, 14]} />
          <meshLambertMaterial color="#ffd54f" emissive="#ff8f00" emissiveIntensity={0.6} />
        </mesh>
        {/* Bullet Nose Cone */}
        <mesh position={[0, 0, 0.45]}>
          <coneGeometry args={[0.22, 0.4, 14]} />
          <meshLambertMaterial color="#ff3d00" emissive="#d50000" emissiveIntensity={0.7} />
        </mesh>
        {/* Radiant Shell Glow */}
        <mesh>
          <sphereGeometry args={[0.9, 12, 12]} />
          <meshBasicMaterial color="#fff59d" transparent opacity={0.45} />
        </mesh>
      </group>

      {/* Sparkling Particle Trail */}
      <points ref={trailRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={trailPos.current}
            count={TRAIL_LEN}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial color="#ffea00" size={0.38} transparent opacity={0.85} sizeAttenuation />
      </points>
    </group>
  );
}
