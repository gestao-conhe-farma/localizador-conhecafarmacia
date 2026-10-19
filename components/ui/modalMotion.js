// Animação partilhada dos modais centrados. Uso com `motion` (motion/react):
// o modal tem de estar dentro de um <AnimatePresence> no pai, senão a saída
// não corre e o modal desaparece de imediato.
const EASE_OUT = [0.22, 1, 0.36, 1]

// Scrim e contentor: apenas esbatimento.
export const modalFadeMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 },
}

// Cartão: sobe ligeiramente e cresce de 96% para 100% ao abrir; faz o inverso ao fechar.
export const modalCardMotion = {
  initial: { opacity: 0, y: 12, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 12, scale: 0.96 },
  transition: { duration: 0.22, ease: EASE_OUT },
}
