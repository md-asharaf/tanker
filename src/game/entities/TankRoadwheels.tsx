import { forwardRef } from 'react';
import * as THREE from 'three';

interface TankRoadwheelsProps {
  wheelXs?: number[];
  zOffset?: number;
  radius?: number;
  width?: number;
  hubRadius?: number;
  tireColor?: string;
  hubColor?: string;
}

const DEFAULT_WHEEL_XS = [-1.3, -0.65, 0, 0.65, 1.3];

export const TankRoadwheels = forwardRef<THREE.Group, TankRoadwheelsProps>(
  (
    {
      wheelXs = DEFAULT_WHEEL_XS,
      zOffset = 1.05,
      radius = 0.32,
      width = 0.25,
      hubRadius = 0.22,
      tireColor = '#1a1a1a',
      hubColor = '#78909c',
    },
    ref
  ) => {
    return (
      <group ref={ref}>
        {wheelXs.map((wx, i) => (
          <group key={`wheel-${i}`} position={[wx, -0.36, zOffset]}>
            {/* Outer Rubber Tire */}
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[radius, radius, width, 14]} />
              <meshLambertMaterial color={tireColor} />
            </mesh>
            {/* Metallic Center Hub */}
            <mesh position={[0, 0, width * 0.5 + 0.02]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[hubRadius, hubRadius, 0.04, 14]} />
              <meshLambertMaterial color={hubColor} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }
);

TankRoadwheels.displayName = 'TankRoadwheels';
