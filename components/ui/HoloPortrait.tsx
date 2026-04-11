'use client';

import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface PortraitSceneProps {
  hexColor: string;
}

function PortraitScene({ hexColor }: PortraitSceneProps) {
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const ring3Ref = useRef<THREE.Mesh>(null);
  const pointsRef = useRef<THREE.Points>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      [ring1Ref, ring2Ref, ring3Ref, pointsRef].forEach(meshRef => {
        if (meshRef.current) {
          meshRef.current.geometry.dispose();
          if (meshRef.current.material instanceof THREE.Material) {
            meshRef.current.material.dispose();
          }
        }
      });
    };
  }, []);

  const particles = useMemo(() => {
    try {
      const count = 180;
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        const r     = 1.25 + Math.random() * 0.45;
        pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        pos[i * 3 + 2] = r * Math.cos(phi);
      }
      return pos;
    } catch {
      return new Float32Array(0);
    }
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ring1Ref.current) ring1Ref.current.rotation.z  =  t * 0.26;
    if (ring2Ref.current) {
      ring2Ref.current.rotation.x = t * 0.14;
      ring2Ref.current.rotation.y = t * 0.09;
    }
    if (ring3Ref.current) {
      ring3Ref.current.rotation.x = -t * 0.10;
      ring3Ref.current.rotation.z =  t * 0.07;
    }
    if (pointsRef.current) pointsRef.current.rotation.y = t * 0.05;
  });

  return (
    <>
      <ambientLight intensity={0.15} />
      <pointLight position={[2.5,  3,    3]}   intensity={2.2} color={hexColor} />
      <pointLight position={[-2,  -2,   -1.5]} intensity={0.8} color="#00ffc8" />

      {/* Equatorial ring */}
      <mesh ref={ring1Ref} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.08, 0.013, 6, 90]} />
        <meshBasicMaterial color={hexColor} transparent opacity={0.88} />
      </mesh>

      {/* Inclined ring — cyan */}
      <mesh ref={ring2Ref} rotation={[Math.PI / 3, Math.PI / 5, 0]}>
        <torusGeometry args={[1.22, 0.007, 6, 90]} />
        <meshBasicMaterial color="#00ffc8" transparent opacity={0.52} />
      </mesh>

      {/* Second inclined ring — domain color, thin */}
      <mesh ref={ring3Ref} rotation={[Math.PI / 6, 0, Math.PI / 4]}>
        <torusGeometry args={[1.32, 0.005, 6, 90]} />
        <meshBasicMaterial color={hexColor} transparent opacity={0.30} />
      </mesh>

      {/* Particle cloud */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particles, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.020} color={hexColor} transparent opacity={0.65} sizeAttenuation />
      </points>
    </>
  );
}

interface HoloPortraitProps {
  hexColor: string;
  initials: string;
  name?: string;
  imageUrl?: string;
  size?: number;
}

export default function HoloPortrait({ hexColor, initials, imageUrl, size = 180 }: HoloPortraitProps) {
  // Check if THREE is available (prevents constructor errors during loading)
  if (typeof THREE === 'undefined' || typeof Float32Array === 'undefined') {
    return <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }} />;
  }

  const portraitSize = Math.round(size * 0.54);

  return (
    <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>

      {/* Three.js layer — rings + particles, fully transparent center */}
      <Canvas
        camera={{ position: [0, 0, 3.1], fov: 46 }}
        gl={{ alpha: true, antialias: true }}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'transparent',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        <PortraitScene hexColor={hexColor} />
      </Canvas>

      {/* Portrait layer — centered, above Three.js */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width: portraitSize,
            height: portraitSize,
            borderRadius: '50%',
            overflow: 'hidden',
            position: 'relative',
            border: `1px solid ${hexColor}40`,
            boxShadow: `0 0 18px ${hexColor}35, 0 0 40px ${hexColor}10, inset 0 0 20px ${hexColor}12`,
          }}
        >
          {imageUrl ? (
            /* Real AI portrait — holographic filter treatment */
            <img
              src={imageUrl}
              alt=""
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                filter: `hue-rotate(15deg) saturate(0.65) brightness(1.15) contrast(1.05)`,
              }}
            />
          ) : (
            /* Initials placeholder — chromatic aberration + holographic treatment */
            <div
              className="holo-portrait-initials"
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: Math.round(portraitSize * 0.36),
                fontWeight: 700,
                fontFamily: 'var(--font-display, system-ui)',
                letterSpacing: '-0.02em',
                background: `radial-gradient(circle at 40% 35%, ${hexColor}28 0%, ${hexColor}08 60%, transparent 100%)`,
                color: hexColor,
                userSelect: 'none',
              }}
            >
              <span className="holo-chroma">
                {initials}
              </span>
            </div>
          )}

          {/* Scanlines overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,200,0.025) 2px,rgba(0,255,200,0.025) 3px)',
              pointerEvents: 'none',
              borderRadius: '50%',
            }}
          />

          {/* Fresnel edge glow */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `radial-gradient(circle at 30% 25%, ${hexColor}18 0%, transparent 55%), radial-gradient(circle at 70% 75%, rgba(0,255,200,0.06) 0%, transparent 50%)`,
              pointerEvents: 'none',
              borderRadius: '50%',
            }}
          />
        </div>
      </div>

    </div>
  );
}
