import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";
import { ITENS } from "./Itens.jsx";

// Sem ?item= mostra o frasco, para a página nunca ficar em branco.
const item = new URLSearchParams(location.search).get("item") ?? "frasco";
const Item = ITENS[item];

// Enquadra o objeto: afasta/ aproxima a câmara para o item ocupar ~70% da altura.
function Enquadrar({ alvo }) {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    if (!alvo.current) return;
    const box = new THREE.Box3().setFromObject(alvo.current);
    const size = box.getSize(new THREE.Vector3());
    const centro = box.getCenter(new THREE.Vector3());
    const maior = Math.max(size.x, size.y);
    const fov = (camera.fov * Math.PI) / 180;
    const dist = (maior / 2 / Math.tan(fov / 2)) * 1.45;
    camera.position.set(dist * 0.3, centro.y + size.y * 0.1, dist);
    camera.lookAt(centro);
    camera.updateProjectionMatrix();
  }, [alvo, camera]);
  return null;
}

function Cena() {
  const alvo = useRef();
  return (
    <>
      <color attach="background" args={["#ffffff"]} />
      <hemisphereLight args={["#ffffff", "#d8d8d8", 0.45]} />
      <directionalLight
        position={[5, 9, 6]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0005}
      />
      <directionalLight position={[-7, 4, 3]} intensity={0.5} />
      <directionalLight position={[0, 3, -8]} intensity={0.4} />
      {/* Estúdio procedural: dá reflexos realistas sem descarregar HDR da internet. */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.4} position={[0, 5, 4]} scale={[12, 12, 1]} target={[0, 1, 0]} />
        <Lightformer form="rect" intensity={1.4} position={[-6, 3, 2]} rotation={[0, Math.PI / 3, 0]} scale={[8, 8, 1]} />
        <Lightformer form="rect" intensity={1.6} position={[6, 4, -2]} rotation={[0, -Math.PI / 3, 0]} scale={[8, 8, 1]} />
        <Lightformer form="ring" intensity={1} position={[0, 6, -4]} scale={6} target={[0, 1, 0]} />
      </Environment>
      <group ref={alvo}>{Item && <Item />}</group>
      {/* Chão branco que só recebe sombra, para o item assentar sem sujar o fundo. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <shadowMaterial opacity={0.2} />
      </mesh>
      <Enquadrar alvo={alvo} />
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <Canvas
    gl={{ preserveDrawingBuffer: true, antialias: true }}
    shadows
    dpr={1}
    camera={{ position: [3.5, 2.6, 9], fov: 22 }}
    style={{ width: 1600, height: 1200 }}
  >
    <Cena />
  </Canvas>
);
