import { useMemo } from "react";
import * as THREE from "three";

const GREEN = "#00493a";
const CREME = "Arial, Helvetica, sans-serif";

// Material físico simples; `clearcoat` dá o brilho de embalagem.
function Mat({ color, roughness = 0.35, clearcoat = 0.6, metalness = 0, ...rest }) {
  return (
    <meshPhysicalMaterial
      color={color}
      roughness={roughness}
      clearcoat={clearcoat}
      metalness={metalness}
      {...rest}
    />
  );
}

function Band({ r, y, h }) {
  return (
    <mesh position={[0, y, 0]} castShadow>
      <cylinderGeometry args={[r + 0.008, r + 0.008, h, 64, 1, true]} />
      <Mat color={GREEN} roughness={0.5} clearcoat={0.2} />
    </mesh>
  );
}

// Desenha o rótulo num canvas: título, subtítulo, micro-linhas e marca.
function criarTextura({ largura, altura, titulo, sub, linhas, marca, cor = GREEN }) {
  const c = document.createElement("canvas");
  c.width = largura;
  c.height = altura;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, largura, altura);
  ctx.fillStyle = cor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = largura / 2;
  let y = altura * 0.36;

  if (titulo) {
    ctx.font = `700 ${Math.round(altura * 0.17)}px ${CREME}`;
    ctx.fillText(titulo, cx, y);
    y += altura * 0.15;
  }
  if (sub) {
    ctx.font = `400 ${Math.round(altura * 0.1)}px ${CREME}`;
    ctx.fillText(sub, cx, y);
    y += altura * 0.11;
  }
  if (linhas) {
    ctx.font = `400 ${Math.round(altura * 0.05)}px ${CREME}`;
    for (const l of linhas) {
      ctx.fillText(l, cx, y);
      y += altura * 0.068;
    }
  }
  if (marca) {
    ctx.font = `600 ${Math.round(altura * 0.06)}px ${CREME}`;
    ctx.fillText(marca, cx, altura * 0.84);
    ctx.fillRect(cx - largura * 0.11, altura * 0.89, largura * 0.22, Math.max(2, altura * 0.007));
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Rótulo curvo (segue o corpo de frascos, potes e bisnagas).
function EtiquetaCurva({ r, y, h, arc = 1.6, largura = 768, altura = 384, titulo, sub, linhas, marca, cor }) {
  const map = useMemo(
    () => criarTextura({ largura, altura, titulo, sub, linhas, marca, cor }),
    [largura, altura, titulo, sub, linhas, marca, cor]
  );
  return (
    <mesh position={[0, y, 0]}>
      <cylinderGeometry args={[r + 0.004, r + 0.004, h, 64, 1, true, -arc / 2, arc]} />
      <meshStandardMaterial map={map} roughness={0.6} metalness={0} side={THREE.DoubleSide} />
    </mesh>
  );
}

// Rótulo plano (caixas e embalagens de faces planas).
function EtiquetaPlana({ pos, w, h, largura = 768, altura = 480, titulo, sub, linhas, marca, cor }) {
  const map = useMemo(
    () => criarTextura({ largura, altura, titulo, sub, linhas, marca, cor }),
    [largura, altura, titulo, sub, linhas, marca, cor]
  );
  return (
    <mesh position={pos}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={map} roughness={0.65} metalness={0} />
    </mesh>
  );
}

function Frasco() {
  return (
    <group>
      <mesh position={[0, 1.1, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.9, 0.9, 2.2, 64]} />
        <Mat color="#b8741a" roughness={0.15} clearcoat={1} />
      </mesh>
      <mesh position={[0, 2.3, 0]} castShadow>
        <cylinderGeometry args={[0.6, 0.9, 0.2, 64]} />
        <Mat color="#b8741a" roughness={0.15} clearcoat={1} />
      </mesh>
      <mesh position={[0, 2.5, 0]} castShadow>
        <cylinderGeometry args={[0.95, 0.95, 0.6, 64]} />
        <Mat color="#ffffff" roughness={0.4} />
      </mesh>
      <Band r={0.91} y={1.1} h={0.25} />
    </group>
  );
}

function Bisnaga() {
  return (
    <group>
      {/* Corpo com fundo selado por prensagem, bem visível */}
      <mesh position={[0, 1.55, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.62, 0.5, 2.6, 64, 1, true]} />
        <Mat color="#f4f4f4" roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.27, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.12, 0.16, 0.13]} />
        <Mat color="#eaeaea" roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.44, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.18, 48]} />
        <Mat color="#f0f0f0" roughness={0.35} />
      </mesh>
      {/* Ombro e tampa flip-top */}
      <mesh position={[0, 2.93, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.62, 0.24, 64]} />
        <Mat color="#f4f4f4" roughness={0.3} />
      </mesh>
      <mesh position={[0, 3.28, 0]} castShadow>
        <cylinderGeometry args={[0.33, 0.35, 0.46, 48]} />
        <Mat color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[0, 3.53, 0]} castShadow>
        <boxGeometry args={[0.34, 0.1, 0.2]} />
        <Mat color="#ffffff" roughness={0.3} />
      </mesh>
      <EtiquetaCurva
        r={0.58}
        y={1.9}
        h={0.9}
        arc={1.7}
        titulo="Uso externo"
        linhas={["Aplicar na pele 1 a 2 vezes por dia", "Manter fora do alcance das crianças"]}
      />
    </group>
  );
}

function Boiao() {
  return (
    <group>
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.2, 1.12, 1.2, 64]} />
        <Mat color="#fafafa" roughness={0.2} clearcoat={1} />
      </mesh>
      <mesh position={[0, 1.18, 0]}>
        <cylinderGeometry args={[1.12, 1.12, 0.1, 64]} />
        <Mat color="#f3e6cf" roughness={0.6} clearcoat={0} />
      </mesh>
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[1.26, 1.26, 0.55, 64]} />
        <Mat color="#ffffff" roughness={0.35} />
      </mesh>
      <EtiquetaCurva
        r={1.2}
        y={0.62}
        h={0.95}
        arc={1.7}
        titulo="Creme"
        sub="hidratante"
      />
      <Band r={1.21} y={0.17} h={0.12} />
    </group>
  );
}

function Injetavel() {
  // Ampola de vidro âmbar selada na ponta, com anel de cor no gargalo.
  return (
    <group>
      <mesh position={[-1.15, 0.72, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.36, 0.36, 1.44, 64]} />
        <Mat color="#c98a3a" roughness={0.1} clearcoat={1} />
      </mesh>
      <mesh position={[-1.15, 0.45, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.9, 64]} />
        <Mat color="#a86f2a" roughness={0.15} />
      </mesh>
      <mesh position={[-1.15, 1.62, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.36, 0.36, 64]} />
        <Mat color="#c98a3a" roughness={0.1} clearcoat={1} />
      </mesh>
      <mesh position={[-1.15, 1.9, 0]} castShadow>
        <cylinderGeometry args={[0.09, 0.09, 0.26, 32]} />
        <Mat color="#c98a3a" roughness={0.1} clearcoat={1} />
      </mesh>
      <mesh position={[-1.15, 2.06, 0]} castShadow>
        <sphereGeometry args={[0.12, 32, 20]} />
        <Mat color="#c98a3a" roughness={0.1} clearcoat={1} />
      </mesh>
      <group position={[-1.15, 0, 0]}>
        <Band r={0.365} y={1.78} h={0.07} />
        <EtiquetaCurva
          r={0.365}
          y={0.78}
          h={0.6}
          arc={1.9}
          largura={768}
          altura={480}
          titulo="Solução"
          sub="injetável"
          linhas={["Via intramuscular"]}
        />
      </group>

      {/* Seringa deitada: corpo, flange, êmbolo, bico e agulha */}
      <mesh position={[1.45, 0.21, 0.1]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.21, 0.21, 1.9, 48]} />
        <Mat color="#ffffff" roughness={0.1} clearcoat={1} transparent opacity={0.5} />
      </mesh>
      <mesh position={[1.2, 0.21, 0.1]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.17, 0.17, 0.9, 48]} />
        <Mat color="#f2e4c8" roughness={0.3} clearcoat={0} />
      </mesh>
      <mesh position={[2.41, 0.21, 0.1]} castShadow>
        <boxGeometry args={[0.07, 0.6, 0.6]} />
        <Mat color="#ffffff" roughness={0.25} clearcoat={0.8} />
      </mesh>
      <mesh position={[2.85, 0.21, 0.1]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.9, 24]} />
        <Mat color="#f7f7f7" roughness={0.5} />
      </mesh>
      <mesh position={[3.33, 0.21, 0.1]} castShadow>
        <boxGeometry args={[0.06, 0.44, 0.44]} />
        <Mat color="#f7f7f7" roughness={0.5} />
      </mesh>
      <mesh position={[0.42, 0.21, 0.1]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.07, 0.21, 0.2, 32]} />
        <Mat color="#e8edf2" roughness={0.3} />
      </mesh>
      <mesh position={[0.02, 0.21, 0.1]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, 0.62, 12]} />
        <Mat color="#b9c0c7" metalness={0.9} roughness={0.2} />
      </mesh>
    </group>
  );
}

function Inalador() {
  // Inalador pressurizado: atuador branco com bocal bem visível a apontar para a frente.
  return (
    <group>
      <mesh position={[0, 2.15, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.4, 0.4, 1.1, 64]} />
        <Mat color="#d5d9de" metalness={0.75} roughness={0.3} />
      </mesh>
      <mesh position={[0, 2.72, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.38, 0.16, 48]} />
        <Mat color="#c3c8ce" metalness={0.8} roughness={0.35} />
      </mesh>
      {/* Atuador */}
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.52, 0.46, 1.5, 64]} />
        <Mat color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.66, 0]} castShadow>
        <cylinderGeometry args={[0.44, 0.52, 0.2, 64]} />
        <Mat color="#ffffff" roughness={0.3} />
      </mesh>
      {/* Bocal horizontal, com a abertura escura bem visível */}
      <mesh position={[0, 0.62, 0.52]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.24, 0.95, 48, 1, true]} />
        <Mat color="#ffffff" roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.62, 0.7]} castShadow>
        <cylinderGeometry args={[0.24, 0.24, 0.04, 48]} />
        <Mat color="#ffffff" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.62, 0.995]}>
        <cylinderGeometry args={[0.17, 0.17, 0.02, 48]} />
        <Mat color="#111111" roughness={0.9} clearcoat={0} />
      </mesh>
      <Band r={0.5} y={1.0} h={0.22} />
    </group>
  );
}

function Pacote() {
  return (
    <group>
      <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 2.4, 0.5]} />
        <Mat color="#ffffff" roughness={0.6} clearcoat={0} />
      </mesh>
      <mesh position={[0, 2.4, 0]} castShadow>
        <boxGeometry args={[1.8, 0.1, 0.52]} />
        <Mat color="#e2e2e2" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[1.82, 0.2, 0.52]} />
        <Mat color={GREEN} roughness={0.5} clearcoat={0.2} />
      </mesh>
      <EtiquetaPlana
        pos={[0, 1.62, 0.253]}
        w={1.55}
        h={1.2}
        titulo="Comprimidos"
        marca="Conheça Farmácia"
        linhas={["22 comprimidos"]}
      />
    </group>
  );
}

function Biberao() {
  // Lados direitos: mesma largura em cima e em baixo.
  return (
    <group>
      <mesh position={[0, 1.15, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.7, 0.7, 2.3, 64]} />
        <Mat color="#ffffff" roughness={0.1} clearcoat={1} transparent opacity={0.45} />
      </mesh>
      <mesh position={[0, 0.95, 0]}>
        <cylinderGeometry args={[0.66, 0.66, 1.85, 64]} />
        <Mat color="#f2e3c6" roughness={0.5} clearcoat={0} />
      </mesh>
      <mesh position={[0, 2.32, 0]} castShadow>
        <cylinderGeometry args={[0.64, 0.64, 0.3, 64]} />
        <Mat color={GREEN} roughness={0.45} clearcoat={0.3} />
      </mesh>
      <mesh position={[0, 2.55, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.42, 0.42, 48]} />
        <Mat color="#e8d3bd" roughness={0.55} clearcoat={0.3} />
      </mesh>
      <mesh position={[0, 2.76, 0]} castShadow>
        <sphereGeometry args={[0.2, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Mat color="#e8d3bd" roughness={0.55} clearcoat={0.3} />
      </mesh>
    </group>
  );
}

function Caixa() {
  return (
    <group>
      <mesh position={[0, 0.8, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, 1.6, 1.6]} />
        <Mat color="#ffffff" roughness={0.6} clearcoat={0} />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <boxGeometry args={[2.44, 0.26, 1.64]} />
        <Mat color={GREEN} roughness={0.5} clearcoat={0.2} />
      </mesh>
      <EtiquetaPlana
        pos={[0, 1.12, 0.803]}
        w={2.1}
        h={0.95}
        titulo="Medicamentos"
        marca="Conheça Farmácia"
      />
    </group>
  );
}

export const ITENS = {
  frasco: Frasco,
  bisnaga: Bisnaga,
  boiao: Boiao,
  injetavel: Injetavel,
  inalador: Inalador,
  pacote: Pacote,
  biberao: Biberao,
  caixa: Caixa,
};
