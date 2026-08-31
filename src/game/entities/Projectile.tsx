import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GAME_CONFIG } from '../gameConfig';
import { getTerrainHeight } from '../scene/Terrain';
import { distToSegment2D } from '../../utils/math';
import type { EnemyTankHandle } from './EnemyTank';

interface ProjectileProps {
  origin:         THREE.Vector3;
  velocity:       THREE.Vector3;
  sessionId:      number;
  enemyHandles:   React.MutableRefObject<(EnemyTankHandle | null)[]>;
  enemyTargetIds: string[];
  onHitTank:      (tankId: string) => void;
  onHitTerrain:   (impactPos: THREE.Vector3) => void;
  onDestroy:      () => void;
}

// Generous arcade hit radius (tank chassis + turret)
const TANK_HIT_RADIUS = 2.8;

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
  const meshRef   = useRef<THREE.Group>(null);
  const pos       = useRef(origin.clone());
  const prevPos   = useRef(origin.clone());
  const vel       = useRef(velocity.clone());
  const resolved  = useRef(false);
  const age       = useRef(0);
  const mySession = useRef(sessionId);

  // Trail Particles
  const TRAIL_LEN = 28;
  const trailPos  = useRef<Float32Array>(new Float32Array(TRAIL_LEN * 3));
  const trailIdx  = useRef(0);
  const trailRef  = useRef<THREE.Points>(null);

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

    // Save previous position for Continuous Collision Detection (CCD)
    prevPos.current.copy(pos.current);

    // Ballistic Physics
    vel.current.y -= 9.81 * dt;
    pos.current.x += vel.current.x * dt;
    pos.current.y += vel.current.y * dt;
    pos.current.z += vel.current.z * dt;

    if (meshRef.current) {
      meshRef.current.position.copy(pos.current);
      // Orient bullet shell along flight trajectory
      const heading = Math.atan2(vel.current.y, vel.current.x);
      meshRef.current.rotation.z = heading;
    }

    // Update sparkling particle trail
    const ti = (trailIdx.current % TRAIL_LEN) * 3;
    trailPos.current[ti]     = pos.current.x;
    trailPos.current[ti + 1] = pos.current.y;
    trailPos.current[ti + 2] = pos.current.z;
    trailIdx.current++;
    if (trailRef.current) {
      (trailRef.current.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    // ── 1. CONTINUOUS COLLISION DETECTION AGAINST ENEMY TANKS ──
    for (let i = 0; i < enemyHandles.current.length; i++) {
      const handle = enemyHandles.current[i];
      if (!handle) continue;
      const tankPos = handle.getPosition();

      // Compute shortest distance from tank center to the projectile's swept path
      const sweptDist = distToSegment2D(
        tankPos.x, tankPos.y + 0.8, // aim at mid-body of enemy tank
        prevPos.current.x, prevPos.current.y,
        pos.current.x, pos.current.y
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

    // ── 2. TERRAIN COLLISION ──────────────────────────────────
    const terrainY = getTerrainHeight(pos.current.x);
    if (pos.current.y <= terrainY + 0.4) {
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
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.22, 0.22, 0.7, 14]} />
          <meshLambertMaterial color="#ffd54f" emissive="#ff8f00" emissiveIntensity={0.6} />
        </mesh>
        {/* Bullet Nose Cone */}
        <mesh position={[0.45, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
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
        <pointsMaterial color="#ffea00" size={0.36} transparent opacity={0.8} sizeAttenuation />
      </points>
    </group>
  );
}
