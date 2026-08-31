import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ExplosionProps {
  position:   THREE.Vector3;
  onComplete: () => void;
  type?:      'tank' | 'terrain';
}

const DEBRIS_COUNT = 28;

export function Explosion({ position, onComplete, type = 'tank' }: ExplosionProps) {
  const groupRef       = useRef<THREE.Group>(null);
  const shockwave1Ref  = useRef<THREE.Mesh>(null);
  const shockwave2Ref  = useRef<THREE.Mesh>(null);
  const fireballRef    = useRef<THREE.Group>(null);
  const smokeRef       = useRef<THREE.Group>(null);
  const lightRef       = useRef<THREE.PointLight>(null);
  const age            = useRef(0);
  const duration       = type === 'tank' ? 1.25 : 0.75;
  const done           = useRef(false);

  // Ballistic debris trajectories
  const debrisVelocities = useRef<THREE.Vector3[]>(
    Array.from({ length: DEBRIS_COUNT }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 0.7 + 0.3) * (type === 'tank' ? 22 : 12);
      const elevation = Math.random() * 16 + 4;
      return new THREE.Vector3(
        Math.cos(angle) * speed,
        elevation,
        Math.sin(angle) * (speed * 0.35)
      );
    })
  );

  useEffect(() => {
    return () => { done.current = true; };
  }, []);

  useFrame((_, delta) => {
    if (done.current || !groupRef.current) return;
    const dt = Math.min(delta, 0.05);
    age.current += dt;
    const t = age.current / duration;

    if (t >= 1) {
      done.current = true;
      onComplete();
      return;
    }

    // 1. Dynamic Point Light Flash
    if (lightRef.current) {
      if (t < 0.2) {
        lightRef.current.intensity = (1 - t / 0.2) * (type === 'tank' ? 18 : 8);
      } else {
        lightRef.current.intensity = Math.max(0, (1 - t) * 3);
      }
    }

    // 2. Multi-phase Expanding & Rising Fireball
    if (fireballRef.current) {
      if (t < 0.4) {
        // Fast explosive bloom
        const scale = Math.sin((t / 0.4) * (Math.PI / 2)) * (type === 'tank' ? 4.2 : 2.2);
        fireballRef.current.scale.setScalar(Math.max(0.01, scale));
        fireballRef.current.position.y = t * 3.0;
      } else {
        // Fade & transition into dark smoke
        const fadeT = (t - 0.4) / 0.6;
        const scale = (type === 'tank' ? 4.2 : 2.2) * (1 + fadeT * 0.35);
        fireballRef.current.scale.setScalar(scale);
        fireballRef.current.position.y = 1.2 + fadeT * 3.5;

        fireballRef.current.children.forEach((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.material) {
            (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - fadeT) * 0.85);
          }
        });
      }
    }

    // 3. Billowing Rising Smoke Plumes
    if (smokeRef.current && t > 0.15) {
      smokeRef.current.visible = true;
      const smokeT = (t - 0.15) / 0.85;
      const scale = smokeT * (type === 'tank' ? 5.2 : 2.8);
      smokeRef.current.scale.setScalar(scale);
      smokeRef.current.position.y = smokeT * 5.0;
      smokeRef.current.rotation.y += dt * 0.8;
      smokeRef.current.children.forEach((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.material) {
          (mesh.material as THREE.MeshLambertMaterial).opacity = Math.max(0, (1 - smokeT) * 0.7);
        }
      });
    }

    // 4. Dual Ground Shockwave Rings
    if (shockwave1Ref.current) {
      const swT = Math.min(1, t * 1.6);
      shockwave1Ref.current.scale.setScalar(1 + swT * (type === 'tank' ? 12 : 6));
      const mat = shockwave1Ref.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, (1 - swT) * 0.85);
    }
    if (shockwave2Ref.current) {
      const swT = Math.max(0, (t - 0.08) * 1.5);
      shockwave2Ref.current.scale.setScalar(1 + swT * (type === 'tank' ? 9 : 4.5));
      const mat = shockwave2Ref.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, (1 - swT) * 0.65);
    }

    // 5. Ballistic Shrapnel & Sparks
    const debrisGroup = groupRef.current.children[4] as THREE.Group | undefined;
    if (debrisGroup) {
      debrisGroup.children.forEach((child, i) => {
        const vel = debrisVelocities.current[i];
        if (!vel) return;
        const curAge = age.current;
        child.position.set(
          vel.x * curAge * Math.exp(-curAge * 0.6),
          vel.y * curAge - 9.81 * curAge * curAge * 0.5,
          vel.z * curAge * Math.exp(-curAge * 0.6)
        );
        child.rotation.x += dt * 10;
        child.rotation.y += dt * 12;
        child.rotation.z += dt * 8;
        child.scale.setScalar(Math.max(0.01, (1 - t) * (type === 'tank' ? 1.0 : 0.7)));
      });
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* ── Dynamic Point Light Flash ── */}
      <pointLight ref={lightRef} color="#ff9800" intensity={16} distance={36} decay={2} />

      {/* ── 1. Layered Volumetric Fireball ── */}
      <group ref={fireballRef}>
        {/* Blinding Incandescent White-Hot Core */}
        <mesh>
          <sphereGeometry args={[1.1, 14, 14]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        {/* Core Radiant Lemon Flare */}
        <mesh position={[0.2, 0.2, 0.1]}>
          <sphereGeometry args={[1.4, 14, 14]} />
          <meshBasicMaterial color="#fff59d" transparent opacity={0.95} />
        </mesh>
        {/* Vivid Tangerine Flame Lobe */}
        <mesh position={[-0.4, 0.3, -0.2]}>
          <sphereGeometry args={[1.6, 12, 12]} />
          <meshBasicMaterial color="#ff9800" transparent opacity={0.88} />
        </mesh>
        {/* Crimson Explosion Lobe */}
        <mesh position={[0.3, 0.5, 0.2]}>
          <sphereGeometry args={[1.7, 12, 12]} />
          <meshBasicMaterial color="#ff3d00" transparent opacity={0.82} />
        </mesh>
        {/* Deep Ruby Shell */}
        <mesh position={[0, 0.6, 0]}>
          <sphereGeometry args={[1.9, 12, 12]} />
          <meshBasicMaterial color="#b71c1c" transparent opacity={0.7} />
        </mesh>
      </group>

      {/* ── 2. Billowing Rising Smoke Plumes ── */}
      <group ref={smokeRef} visible={false}>
        <mesh position={[0, 0.4, 0]}>
          <dodecahedronGeometry args={[0.9, 1]} />
          <meshLambertMaterial color="#263238" transparent opacity={0.7} />
        </mesh>
        <mesh position={[0.5, 0.8, 0.3]}>
          <dodecahedronGeometry args={[0.75, 1]} />
          <meshLambertMaterial color="#37474f" transparent opacity={0.65} />
        </mesh>
        <mesh position={[-0.4, 0.9, -0.2]}>
          <dodecahedronGeometry args={[0.8, 1]} />
          <meshLambertMaterial color="#212121" transparent opacity={0.65} />
        </mesh>
      </group>

      {/* ── 3. Dual Expanding Ground Shockwaves ── */}
      <mesh ref={shockwave1Ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
        <ringGeometry args={[0.6, 1.4, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={shockwave2Ref} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
        <ringGeometry args={[0.3, 0.9, 28]} />
        <meshBasicMaterial color="#ffd54f" transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>

      {/* ── 4. Ballistic Shrapnel, Sparks & Metal Fragments ── */}
      <group>
        {Array.from({ length: DEBRIS_COUNT }, (_, i) => {
          const isSpark = i < 10;
          const color = isSpark
            ? (i % 2 === 0 ? '#ffff00' : '#ff9100')
            : type === 'tank'
            ? (i % 3 === 0 ? '#424242' : i % 3 === 1 ? '#ff5722' : '#212121')
            : (i % 2 === 0 ? '#5d4037' : '#795548');

          return (
            <mesh key={i}>
              <dodecahedronGeometry args={[isSpark ? 0.14 : (type === 'tank' ? 0.26 : 0.18), 0]} />
              <meshLambertMaterial
                color={color}
                emissive={isSpark ? color : '#000000'}
                emissiveIntensity={isSpark ? 0.8 : 0}
              />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
