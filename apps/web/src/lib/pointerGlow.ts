/** Feeds the pointer position into --gx/--gy on the hovered glass card for the glow in app-skin.css. */
const GLOW_TARGETS = '.card,.section-block,.player-card,.elo-card,.idle-card,.live-score,.tactical-hud,.analysis-hero,.settings-card,.empty-match';

export function initPointerGlow(): void {
  if (typeof window === 'undefined' || !window.matchMedia('(hover: hover)').matches) return;
  let frame = 0;
  let last: PointerEvent | null = null;
  window.addEventListener('pointermove', (event) => {
    last = event;
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      const target = last && (last.target as Element | null)?.closest?.(GLOW_TARGETS);
      if (!last || !(target instanceof HTMLElement)) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty('--gx', `${last.clientX - rect.left}px`);
      target.style.setProperty('--gy', `${last.clientY - rect.top}px`);
    });
  }, { passive: true });
}
