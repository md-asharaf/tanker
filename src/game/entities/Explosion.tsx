import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ExplosionProps {
  position: THREE.Vector3;
  onComplete: () => void;
  type?: 'tank' | 'terrain';
}

const DEBRIS_COUNT = 20;

export function Explosion({ position, onComplete, type = 'tank' }: ExplosionProps) {
  const groupRef    = useRef<THREE.Group>(null);
  const shockwaveRef = useRef<THREE.Mesh>(null);
  const fireballRef = useRef<THREE.Group>(null);
  const age         = useRef(0);
  const duration    = type === 'tank' ? 1.1 : 0.7;
  const done        = useRef(false);

  // Ballistic debris trajectories
  const debrisVelocities = useRef<THREE.Vector3[]>(
    Array.from({ length: DEBRIS_COUNT }, () =>
      new THREE.Vector3(
        (Math.random() - 0.5) * 16,
        Math.random() * 14 + 3,
        (Math.random() - 0.5) * 6
      )
    )
  );

  useEffect(() => {
    return () => { done.current = true; };
  }, []);

  useFrame((_, delta) => {
    if (done.current || !groupRef.current) return;
    age.current += delta;
    const t = age.current / duration;

    if (t >= 1) {
      done.current = true;
      onComplete();
      return;
    }

    // 1. Expand and fade fireball
    if (fireballRef.current) {
      const scale = Math.sin(t * Math.PI) * (type === 'tank' ? 3.8 : 2.0);
      fireballRef.current.scale.setScalar(Math.max(0.01, scale));
      fireballRef.current.position.y = t * 2.5;
    }

    // 2. Expand shockwave ring
    if (shockwaveRef.current) {
      shockwaveRef.current.scale.setScalar(1 + t * (type === 'tank' ? 8 : 4));
      const mat = shockwaveRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - t) * 0.7;
    }

    // 3. Debris physics
    if (groupRef.current) {
      const debrisGroup = groupRef.current.children[2] as THREE.Group | undefined;
      if (debrisGroup) {
        debrisGroup.children.forEach((child, i) => {
          const vel = debrisVelocities.current[i];
          child.position.set(
            vel.x * age.current,
            vel.y * age.current - 9.81 * age.current * age.current,
            vel.z * age.current
          );
          child.rotation.x += delta * 6;
          child.rotation.y += delta * 8;
          child.scale.setScalar(Math.max(0.01, 1 - t));
        });
      }
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* 1. Comic Fireball Blast */}
      <group ref={fireballRef}>
        {/* Core Yellow Flash */}
        <mesh>
          <sphereGeometry args={[1.2, 12, 12]} />
          <meshBasicMaterial color="#fff59d" />
        </mesh>
        {/* Mid Orange Burst */}
        <mesh position={[0.4, 0.3, 0.2]}>
          <sphereGeometry args={[1.5, 12, 12]} />
          <meshBasicMaterial color="#ff9800" transparent opacity={0.85} />
        </mesh>
        <mesh position={[-0.4, 0.2, -0.2]}>
          <sphereGeometry args={[1.4, 12, 12]} />
          <meshBasicMaterial color="#ff5722" transparent opacity={0.85} />
        </mesh>
        {/* Outer Red/Black Flame Shell */}
        <mesh position={[0, 0.5, 0]}>
          <sphereGeometry args={[1.8, 12, 12]} />
          <meshBasicMaterial color="#d32f2f" transparent opacity={0.7} />
        </mesh>
      </group>

      {/* 2. Expanding Shockwave Ring */}
      <mesh ref={shockwaveRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <ringGeometry args={[0.5, 1.2, 24]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>

      {/* 3. Flying Metal Shrapnel / Dirt Clods */}
      <group>
        {Array.from({ length: DEBRIS_COUNT }, (_, i) => {
          const color = type === 'tank'
            ? (i % 3 === 0 ? '#ffb300' : i % 3 === 1 ? '#424242' : '#d32f2f')
            : (i % 2 === 0 ? '#5d4037' : '#7cb342');
          return (
            <mesh key={i}>
              <dodecahedronGeometry args={[type === 'tank' ? 0.22 : 0.15, 0]} />
              <meshLambertMaterial color={color} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
