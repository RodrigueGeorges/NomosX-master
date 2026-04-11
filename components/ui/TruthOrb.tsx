'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';

/**
 * TruthOrb — The visual metaphor for NomosX
 *
 * Particles start in chaos (doxa) and converge into ordered rings (nomos).
 * The X variable is being solved in real-time.
 * 
 * Two states:
 * - doxa: particles scattered randomly, drifting
 * - nomos: particles converge into structured orbital rings
 * 
 * The orb oscillates between the two, showing the transformation.
 */

interface TruthOrbProps {
  size?: number;
  color?: string;
  accentColor?: string;
}

/* Particles that morph between chaos and order */
function MorphParticles({ 
  count, 
  color, 
  accentColor, 
  orderFactor 
}: { 
  count: number; 
  color: string; 
  accentColor: string; 
  orderFactor: number; // 0 = chaos (doxa), 1 = order (nomos)
}) {
  const ref = useRef<THREE.Points>(null);

  // Generate two sets of positions: chaotic and ordered
  const { chaosPositions, orderedPositions } = useMemo(() => {
    const chaos = new Float32Array(count * 3);
    const ordered = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Chaos: random sphere distribution
      const r = 0.8 + Math.random() * 1.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      chaos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      chaos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      chaos[i * 3 + 2] = r * Math.cos(phi);

      // Order: distributed on orbital rings
      const ringIndex = i % 3;
      const ringRadius = ringIndex === 0 ? 1.1 : ringIndex === 1 ? 1.3 : 1.5;
      const angle = (i / count) * Math.PI * 2 * (ringIndex + 2) + ringIndex * 0.5;
      const tilt = ringIndex === 0 ? 0 : ringIndex === 1 ? Math.PI / 3 : Math.PI / 6;

      const x = ringRadius * Math.cos(angle);
      const y = ringRadius * Math.sin(angle) * Math.cos(tilt);
      const z = ringRadius * Math.sin(angle) * Math.sin(tilt);

      ordered[i * 3]     = x;
      ordered[i * 3 + 1] = y;
      ordered[i * 3 + 2] = z;
    }

    return { chaosPositions: chaos, orderedPositions: ordered };
  }, [count]);

  // Current positions buffer
  const positions = useMemo(() => new Float32Array(count * 3), [count]);

  // Cleanup on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (ref.current) {
        ref.current.geometry.dispose();
        if (ref.current.material instanceof THREE.Material) {
          ref.current.material.dispose();
        }
      }
    };
  }, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const posAttr = ref.current.geometry.attributes.position;
    if (!posAttr) return;

    const t = clock.elapsedTime;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // Lerp between chaos and order based on orderFactor
      const chaosX = chaosPositions[i3] + Math.sin(t * 0.3 + i) * 0.15;
      const chaosY = chaosPositions[i3 + 1] + Math.cos(t * 0.25 + i * 0.7) * 0.15;
      const chaosZ = chaosPositions[i3 + 2] + Math.sin(t * 0.35 + i * 1.3) * 0.15;

      // Ordered positions rotate slowly
      const angle = (i / count) * Math.PI * 2 * ((i % 3) + 2) + t * 0.08 * ((i % 3) + 1);
      const ringIndex = i % 3;
      const ringRadius = ringIndex === 0 ? 1.1 : ringIndex === 1 ? 1.3 : 1.5;
      const tilt = ringIndex === 0 ? 0 : ringIndex === 1 ? Math.PI / 3 : Math.PI / 6;
      const orderX = ringRadius * Math.cos(angle);
      const orderY = ringRadius * Math.sin(angle) * Math.cos(tilt);
      const orderZ = ringRadius * Math.sin(angle) * Math.sin(tilt);

      positions[i3]     = chaosX + (orderX - chaosX) * orderFactor;
      positions[i3 + 1] = chaosY + (orderY - chaosY) * orderFactor;
      positions[i3 + 2] = chaosZ + (orderZ - chaosZ) * orderFactor;
    }

    posAttr.array = positions;
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.035}
        color={color}
        transparent
        opacity={0.75}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* Accent particles — smaller, different color */
function AccentParticles({ count, color, orderFactor }: { count: number; color: string; orderFactor: number }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => new Float32Array(count * 3), [count]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ref.current) {
        ref.current.geometry.dispose();
        if (ref.current.material instanceof THREE.Material) {
          ref.current.material.dispose();
        }
      }
    };
  }, []);

  const chaosPositions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 1.0 + Math.random() * 1.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, [count]);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const posAttr = ref.current.geometry.attributes.position;
    if (!posAttr) return;
    const t = clock.elapsedTime;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const chaosX = chaosPositions[i3] + Math.sin(t * 0.2 + i * 2) * 0.2;
      const chaosY = chaosPositions[i3 + 1] + Math.cos(t * 0.18 + i * 1.5) * 0.2;
      const chaosZ = chaosPositions[i3 + 2] + Math.sin(t * 0.22 + i * 0.8) * 0.2;

      // Ordered: on a single inclined ring
      const angle = (i / count) * Math.PI * 2 + t * 0.12;
      const orderX = 1.24 * Math.cos(angle);
      const orderY = 1.24 * Math.sin(angle) * Math.cos(Math.PI / 5);
      const orderZ = 1.24 * Math.sin(angle) * Math.sin(Math.PI / 5);

      positions[i3]     = chaosX + (orderX - chaosX) * orderFactor;
      positions[i3 + 1] = chaosY + (orderY - chaosY) * orderFactor;
      positions[i3 + 2] = chaosZ + (orderZ - chaosZ) * orderFactor;
    }

    posAttr.array = positions;
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.025}
        color={color}
        transparent
        opacity={0.4}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/* Central icosahedron cage — the "law" structure */
function LawCage({ color, orderFactor }: { color: string; orderFactor: number }) {
  const ref = useRef<THREE.Mesh>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ref.current) {
        ref.current.geometry.dispose();
        if (ref.current.material instanceof THREE.Material) {
          ref.current.material.dispose();
        }
      }
    };
  }, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.rotation.x = t * 0.11;
    ref.current.rotation.y = t * 0.17;
    ref.current.rotation.z = t * 0.06;
  });

  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[0.46, 1]} />
      <meshBasicMaterial 
        color={color} 
        wireframe 
        transparent 
        opacity={0.08 + orderFactor * 0.12} 
      />
    </mesh>
  );
}

/* The X glyph at center — the variable being solved */
function XGlyph({ orderFactor }: { orderFactor: number }) {
  const groupRef = useRef<THREE.Group>(null);
  const mesh1Ref = useRef<THREE.Mesh>(null);
  const mesh2Ref = useRef<THREE.Mesh>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      [mesh1Ref, mesh2Ref].forEach(meshRef => {
        if (meshRef.current) {
          meshRef.current.geometry.dispose();
          if (meshRef.current.material instanceof THREE.Material) {
            meshRef.current.material.dispose();
          }
        }
      });
    };
  }, []);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.z = clock.elapsedTime * 0.05;
    // Scale pulses subtly
    const s = 1 + Math.sin(clock.elapsedTime * 0.8) * 0.03;
    groupRef.current.scale.setScalar(s);
  });

  const barColor = '#D4AF37'; // Gold — truth, authority
  const opacity = 0.3 + orderFactor * 0.6;

  return (
    <group ref={groupRef}>
      {/* Diagonal 1 */}
      <mesh ref={mesh1Ref} position={[0, 0, 0]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.04, 0.6, 0.01]} />
        <meshBasicMaterial color={barColor} transparent opacity={opacity} />
      </mesh>
      {/* Diagonal 2 */}
      <mesh ref={mesh2Ref} position={[0, 0, 0]} rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[0.04, 0.6, 0.01]} />
        <meshBasicMaterial color={barColor} transparent opacity={opacity} />
      </mesh>
    </group>
  );
}

function TruthOrbScene({ color, accentColor }: { color: string; accentColor: string }) {
  // Oscillate between doxa and nomos over time — use ref to avoid re-renders
  const orderFactorRef = useRef(0);

  useFrame(({ clock }) => {
    // Smooth oscillation: 0→1→0 over ~8 seconds, biased toward nomos (stays ordered longer)
    const t = clock.elapsedTime;
    const cycle = (Math.sin(t * 0.4 - Math.PI / 2) + 1) / 2; // 0→1→0
    // Ease: spend more time in nomos state
    const eased = cycle < 0.5
      ? 2 * cycle * cycle
      : 1 - Math.pow(-2 * cycle + 2, 2) / 2;
    orderFactorRef.current = eased;
  });

  return (
    <>
      <ambientLight intensity={0.2} />
      <pointLight position={[2.5, 3, 3]} intensity={1.8} color={color} />
      <pointLight position={[-2, -2, -1.5]} intensity={0.6} color={accentColor} />
      <pointLight position={[0, 0, 0]} intensity={0.5 + orderFactorRef.current * 1.5} color="#D4AF37" />

      <Float speed={1.2} rotationIntensity={0.08} floatIntensity={0.2}>
        <LawCage color={color} orderFactor={orderFactorRef.current} />
        <XGlyph orderFactor={orderFactorRef.current} />
        <MorphParticles count={80} color={color} accentColor={accentColor} orderFactor={orderFactorRef.current} />
        <AccentParticles count={25} color={accentColor} orderFactor={orderFactorRef.current} />
      </Float>
    </>
  );
}

export default function TruthOrb({ size = 280, color = '#6366F1', accentColor = '#00ffc8' }: TruthOrbProps) {
  return (
    <div style={{ width: size, height: size }}>
      <Canvas
        camera={{ position: [0, 0, 3.2], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <TruthOrbScene color={color} accentColor={accentColor} />
      </Canvas>
    </div>
  );
}
