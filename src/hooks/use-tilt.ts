import { useRef, useCallback } from "react";

/**
 * 3D mouse-tilt hook — kart üzerine mouse gelince perspektifli eğim,
 * neon-yansımalı bir "shine" spot'u CSS custom property'leriyle yönetir.
 * Reduced-motion durumunda no-op.
 */
export function useTilt<T extends HTMLElement = HTMLDivElement>(max = 6) {
  const ref = useRef<T | null>(null);

  const onMove = useCallback(
    (e: React.MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (mq.matches) return;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const rx = (0.5 - py) * max * 2;
      const ry = (px - 0.5) * max * 2;
      el.style.setProperty("--tilt-rx", `${rx.toFixed(2)}deg`);
      el.style.setProperty("--tilt-ry", `${ry.toFixed(2)}deg`);
      el.style.setProperty("--tilt-x", `${(px * 100).toFixed(1)}%`);
      el.style.setProperty("--tilt-y", `${(py * 100).toFixed(1)}%`);
    },
    [max],
  );

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tilt-rx", "0deg");
    el.style.setProperty("--tilt-ry", "0deg");
  }, []);

  return { ref, onMouseMove: onMove, onMouseLeave: onLeave };
}
