"use client";

import React, { useRef, useMemo, useEffect, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Module-level check to prevent constructor errors
const THREE_AVAILABLE = typeof THREE !== 'undefined' && typeof THREE.MeshStandardMaterial !== 'undefined';

interface Logo3DProps {
  size?: number;
  className?: string;
}

function ThinkTankSphere() {
  const sphereRef = useRef<THREE.Mesh>(null);
  const xGroupRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    // Subtle sphere rotation
    if (sphereRef.current) {
      sphereRef.current.rotation.y = state.clock.elapsedTime * 0.08;
    }
    // X pulses gently
    if (xGroupRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 1.2) * 0.06;
      xGroupRef.current.scale.set(scale, scale, scale);
    }
    // Halo pulses
    if (haloRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 0.8) * 0.03;
      haloRef.current.scale.set(scale, scale, scale);
    }
  });

  // Indigo/violet material for sphere (structure/knowledge)
  const sphereMaterial = useMemo(() => {
    try {
      return new THREE.MeshStandardMaterial({
        color: '#6366F1',
        metalness: 0.88,
        roughness: 0.14,
        emissive: '#818CF8',
        emissiveIntensity: 0.2,
      });
    } catch {
      return null;
    }
  }, []);

  // Gold material for X (truth/authority)
  const goldMaterial = useMemo(() => {
    try {
      return new THREE.MeshStandardMaterial({
        color: '#D4AF37',
        metalness: 0.94,
        roughness: 0.1,
        emissive: '#D4AF37',
        emissiveIntensity: 0.35,
      });
    } catch {
      return null;
    }
  }, []);

  // Gold halo material
  const haloMaterial = useMemo(() => {
    try {
      return new THREE.MeshStandardMaterial({
        color: '#F5D778',
        metalness: 0.5,
        roughness: 0.5,
        emissive: '#F5D778',
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.25,
      });
    } catch {
      return null;
    }
  }, []);

  return (
    <group>
      {/* Main indigo sphere - structure/knowledge */}
      <mesh ref={sphereRef} material={sphereMaterial}>
        <sphereGeometry args={[0.6, 64, 64]} />
      </mesh>

      {/* Gold X incised - truth/authority */}
      <group ref={xGroupRef}>
        {/* First diagonal of X */}
        <mesh material={goldMaterial} position={[0, 0, 0.52]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.09, 0.85, 0.06]} />
        </mesh>
        {/* Second diagonal of X */}
        <mesh material={goldMaterial} position={[0, 0, 0.52]} rotation={[0, 0, -Math.PI / 4]}>
          <boxGeometry args={[0.09, 0.85, 0.06]} />
        </mesh>
      </group>

      {/* Gold halo - truth emanating */}
      <mesh ref={haloRef} material={haloMaterial}>
        <sphereGeometry args={[0.75, 32, 32]} />
      </mesh>
    </group>
  );
}

function OrbScene() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} />
      <directionalLight position={[-5, -5, 3]} intensity={0.8} color="#F5D778" />
      <pointLight position={[0, 0, 5]} intensity={0.5} color="#D4AF37" />

      {/* Think tank sphere with indigo base + gold X */}
      <ThinkTankSphere />
    </>
  );
}

export function NomosXLogo3D({ size = 120, className }: Logo3DProps) {
  // Check if THREE is available (prevents constructor errors during loading)
  if (typeof THREE === 'undefined' || typeof THREE.MeshStandardMaterial === 'undefined') {
    return <div className={className} style={{ width: size, height: size }} />;
  }

  return (
    <div className={className} style={{ width: size, height: size }}>
      <Canvas
        camera={{ position: [0, 0, 2.2], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <Suspense fallback={null}>
          <OrbScene />
        </Suspense>
      </Canvas>
    </div>
  );
}
