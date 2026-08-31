import { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { secureRandom } from '../../utils/math';

interface ExplosionProps {
  position: THREE.Vector3;
  onComplete: () => void;
  type?: 'tank' | 'terrain';
}

const DEBRIS_COUNT = 36;
const DUST_RING_COUNT = 14;
const MUSHROOM_LOBES = 8;

// ── Shared Pre-allocated Geometries (Zero-GC WebGL Buffer Reuse) ─
const geoSpark = new THREE.DodecahedronGeometry(0.16, 0);
const geoDebrisChunk = new THREE.DodecahedronGeometry(0.3, 0);
const geoShockwave = new THREE.RingGeometry(0.5, 1.6, 32);
const geoFireSphere = new THREE.SphereGeometry(1.0, 14, 14);
const geoSmokeSphere = new THREE.DodecahedronGeometry(0.95, 1);
const geoDustPuff = new THREE.DodecahedronGeometry(0.65, 1);

export function Explosion({ position, onComplete, type = 'tank' }: ExplosionProps) {
  const groupRef = useRef<THREE.Group>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const shockwaveRef = useRef<THREE.Mesh>(null);
  const stemRef = useRef<THREE.Group>(null);
  const mushroomHeadRef = useRef<THREE.Group>(null);
  const dustRingRef = useRef<THREE.Group>(null);
  const debrisRef = useRef<THREE.Group>(null);

  const age = useRef(0);
  const duration = type === 'tank' ? 1.35 : 0.85;
  const done = useRef(false);

  // Ballistic debris trajectories with random angular speeds
  const debrisData = useRef(
    Array.from({ length: DEBRIS_COUNT }, (_, i) => {
      const isSpark = i < 18;
      const angle = secureRandom() * Math.PI * 2;
      const pitch = secureRandom() * 0.85 + 0.25;
      const speed = (secureRandom() * 0.7 + 0.4) * (type === 'tank' ? 24 : 14);
      return {
        isSpark,
        vx: Math.cos(angle) * Math.cos(pitch) * speed,
        vy: Math.sin(pitch) * speed * (isSpark ? 1.2 : 0.95),
        vz: Math.sin(angle) * Math.cos(pitch) * speed * 0.45,
        rotSpeed: new THREE.Vector3(
          (secureRandom() - 0.5) * 18,
          (secureRandom() - 0.5) * 18,
          (secureRandom() - 0.5) * 18
        ),
      };
    })
  );

  // Mushroom cap lobe offsets (Toroidal Vortex expanding outwards & curling)
  const lobeData = useMemo(() => {
    return Array.from({ length: MUSHROOM_LOBES }, (_, i) => {
      const angle = (i / MUSHROOM_LOBES) * Math.PI * 2 + (secureRandom() - 0.5) * 0.4;
      const radius = 0.8 + secureRandom() * 0.5;
      return {
        dirX: Math.cos(angle),
        dirZ: Math.sin(angle),
        radius,
        scaleOffset: 0.85 + secureRandom() * 0.4,
      };
    });
  }, []);

  // Ground Dust Ring angles
  const dustData = useMemo(() => {
    return Array.from({ length: DUST_RING_COUNT }, (_, i) => {
      const angle = (i / DUST_RING_COUNT) * Math.PI * 2 + (secureRandom() - 0.5) * 0.3;
      const speed = (secureRandom() * 0.4 + 0.8) * (type === 'tank' ? 9.5 : 5.5);
      return {
        dx: Math.cos(angle) * speed,
        dz: Math.sin(angle) * speed * 0.5,
        scale: 0.7 + secureRandom() * 0.6,
      };
    });
  }, [type]);

  useEffect(() => {
    return () => {
      done.current = true;
    };
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

    // ── 1. Dynamic Flash & Point Light ───────────────────────────
    if (lightRef.current) {
      if (t < 0.12) {
        // Blinding white-hot peak
        lightRef.current.intensity = (1 - t / 0.12) * (type === 'tank' ? 24 : 12);
        lightRef.current.color.set('#ffffff');
      } else {
        // Warm fire fading glow
        const fade = 1 - (t - 0.12) / 0.88;
        lightRef.current.intensity = Math.max(0, fade * fade * (type === 'tank' ? 8 : 4));
        lightRef.current.color.set('#ff6d00');
      }
    }

    // ── 2. Mushroom Cloud Cap (Rising Toroidal Fireball & Smoke) ─
    if (mushroomHeadRef.current) {
      const head = mushroomHeadRef.current;
      const riseY = t * (type === 'tank' ? 5.8 : 3.2);
      head.position.y = riseY;

      // Overall head expansion
      const headScale = Math.sin(Math.min(1, t * 1.5) * (Math.PI / 2)) * (type === 'tank' ? 4.5 : 2.5);
      head.scale.setScalar(Math.max(0.01, headScale));

      // Color transition from white-hot -> fiery orange -> dark billowing soot
      head.children.forEach((child, idx) => {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material as THREE.MeshLambertMaterial;
        const lobe = lobeData[idx];

        if (lobe) {
          // Toroidal expansion outward
          const outward = Math.min(1, t * 1.8) * lobe.radius;
          mesh.position.x = lobe.dirX * outward;
          mesh.position.z = lobe.dirZ * outward;
          mesh.position.y = Math.sin(t * Math.PI) * 0.4 - t * 0.6; // Roll downward slightly as it climbs
        }

        if (t < 0.25) {
          // Fire phase
          mat.color.set(idx % 2 === 0 ? '#fff176' : '#ff9800');
          mat.emissive.set(idx % 2 === 0 ? '#ffe082' : '#ff5722');
          mat.emissiveIntensity = 0.9 * (1 - t / 0.25);
          mat.opacity = 0.95;
        } else if (t < 0.6) {
          // Flame to Dark Smoke transition
          const blend = (t - 0.25) / 0.35;
          mat.color.lerpColors(new THREE.Color('#ff5722'), new THREE.Color('#263238'), blend);
          mat.emissive.lerpColors(new THREE.Color('#d50000'), new THREE.Color('#000000'), blend);
          mat.emissiveIntensity = (1 - blend) * 0.5;
          mat.opacity = THREE.MathUtils.lerp(0.95, 0.75, blend);
        } else {
          // Pure Soot Smoke dissipation
          const fade = (t - 0.6) / 0.4;
          mat.color.set('#212121');
          mat.emissiveIntensity = 0;
          mat.opacity = Math.max(0, (1 - fade) * 0.75);
        }
      });
    }

    // ── 3. Smoke Column / Stem ───────────────────────────────────
    if (stemRef.current) {
      const stem = stemRef.current;
      const stemT = Math.min(1, t * 1.3);
      stem.scale.set(
        (1 + stemT * 1.2) * (type === 'tank' ? 1.8 : 1.1),
        stemT * (type === 'tank' ? 4.8 : 2.6),
        (1 + stemT * 1.2) * (type === 'tank' ? 1.8 : 1.1)
      );
      stem.children.forEach((child) => {
        const mat = (child as THREE.Mesh).material as THREE.MeshLambertMaterial;
        if (t > 0.4) {
          const fade = (t - 0.4) / 0.6;
          mat.opacity = Math.max(0, (1 - fade) * 0.7);
        }
      });
    }

    // ── 4. Ground Dust Shockwave Ring ────────────────────────────
    if (dustRingRef.current) {
      dustRingRef.current.children.forEach((child, i) => {
        const d = dustData[i];
        if (!d) return;
        const dustAge = age.current;
        child.position.x = d.dx * dustAge;
        child.position.z = d.dz * dustAge;
        child.position.y = 0.2 + dustAge * 0.4;
        const growScale = d.scale * (1 + dustAge * 2.2);
        child.scale.setScalar(growScale);

        const mat = (child as THREE.Mesh).material as THREE.MeshLambertMaterial;
        mat.opacity = Math.max(0, (1 - t * 1.2) * 0.6);
      });
    }

    // ── 5. Supersonic Surface Shockwave ──────────────────────────
    if (shockwaveRef.current) {
      const swT = Math.min(1, t * 2.2);
      shockwaveRef.current.scale.setScalar(1 + swT * (type === 'tank' ? 15 : 8));
      const mat = shockwaveRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, (1 - swT) * 0.9);
    }

    // ── 6. Ballistic Shrapnel & Sparks with Ground Gravitation ───
    if (debrisRef.current) {
      debrisRef.current.children.forEach((child, i) => {
        const d = debrisData.current[i];
        if (!d) return;
        const curAge = age.current;
        const drag = Math.exp(-curAge * (d.isSpark ? 1.2 : 0.5));

        child.position.set(
          d.vx * curAge * drag,
          Math.max(0.1, d.vy * curAge * drag - 9.81 * curAge * curAge * 0.5),
          d.vz * curAge * drag
        );

        child.rotation.x += d.rotSpeed.x * dt;
        child.rotation.y += d.rotSpeed.y * dt;
        child.rotation.z += d.rotSpeed.z * dt;

        const shrink = Math.max(0.01, (1 - t) * (d.isSpark ? 1.0 : 1.2));
        child.scale.setScalar(shrink);
      });
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* ── Blinding Dynamic Flash Light ── */}
      <pointLight ref={lightRef} color="#ffffff" intensity={24} distance={42} decay={2} />

      {/* ── Supersonic Expanding Shockwave ── */}
      <mesh
        ref={shockwaveRef}
        geometry={geoShockwave}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.15, 0]}
      >
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>

      {/* ── Rising Smoke Stem / Column ── */}
      <group ref={stemRef} position={[0, 0.8, 0]}>
        <mesh geometry={geoSmokeSphere}>
          <meshLambertMaterial color="#263238" transparent opacity={0.75} />
        </mesh>
        <mesh geometry={geoSmokeSphere} position={[0, 0.9, 0]}>
          <meshLambertMaterial color="#37474f" transparent opacity={0.7} />
        </mesh>
      </group>

      {/* ── Expanding Toroidal Mushroom Fireball Cap ── */}
      <group ref={mushroomHeadRef}>
        {Array.from({ length: MUSHROOM_LOBES }).map((_, i) => (
          <mesh key={i} geometry={i % 2 === 0 ? geoFireSphere : geoSmokeSphere}>
            <meshLambertMaterial
              color="#fff176"
              emissive="#ff5722"
              emissiveIntensity={0.8}
              transparent
              opacity={0.95}
            />
          </mesh>
        ))}
      </group>

      {/* ── Ground Blast Dust Ring (Outward Rolling Cloud) ── */}
      <group ref={dustRingRef}>
        {Array.from({ length: DUST_RING_COUNT }).map((_, i) => (
          <mesh key={i} geometry={geoDustPuff} position={[0, 0.2, 0]}>
            <meshLambertMaterial color="#8d6e63" transparent opacity={0.6} />
          </mesh>
        ))}
      </group>

      {/* ── Ballistic Shrapnel, Sparks & Metal Fragments ── */}
      <group ref={debrisRef}>
        {debrisData.current.map((d, i) => {
          const isSpark = d.isSpark;
          const color = isSpark
            ? i % 2 === 0
              ? '#ffff00'
              : '#ff6d00'
            : type === 'tank'
            ? i % 3 === 0
              ? '#212121'
              : i % 3 === 1
              ? '#ff3d00'
              : '#424242'
            : '#5d4037';

          return (
            <mesh key={i} geometry={isSpark ? geoSpark : geoDebrisChunk}>
              <meshLambertMaterial
                color={color}
                emissive={isSpark ? color : '#000000'}
                emissiveIntensity={isSpark ? 0.9 : 0}
              />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}


