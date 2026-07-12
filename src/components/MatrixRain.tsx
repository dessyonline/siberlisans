import { useEffect, useRef } from "react";

/**
 * Canvas-based matrix rain — kısık, siteye uygun neon-yeşil, hero'nun arka planına
 * layer'lanır. Otomatik reduced-motion desteği, mount unmount temiz.
 */
export function MatrixRain({
  className,
  opacity = 0.18,
  speed = 1,
  fontSize = 14,
}: {
  className?: string;
  opacity?: number;
  speed?: number;
  fontSize?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let columns = 0;
    let drops: number[] = [];
    let raf = 0;
    let last = performance.now();

    const CHARS =
      "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789$#@%&*<>{}[]/=+-";

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = parent.clientWidth;
      height = parent.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      columns = Math.max(1, Math.floor(width / fontSize));
      drops = new Array(columns).fill(0).map(() => Math.random() * -20);
      ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
    };

    const draw = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;
      // fade previous frame (creates trail)
      ctx.fillStyle = "rgba(6,10,10,0.15)";
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = `oklch(0.82 0.20 145 / ${opacity})`;
      const step = (dt / 32) * speed;
      for (let i = 0; i < columns; i++) {
        const ch = CHARS.charAt(Math.floor(Math.random() * CHARS.length));
        const x = i * fontSize;
        const y = drops[i] * fontSize;
        ctx.fillText(ch, x, y);
        // occasional bright head
        if (Math.random() < 0.015) {
          ctx.fillStyle = `oklch(0.95 0.22 145 / ${Math.min(1, opacity * 4)})`;
          ctx.fillText(ch, x, y);
          ctx.fillStyle = `oklch(0.82 0.20 145 / ${opacity})`;
        }
        if (y > height && Math.random() > 0.975) drops[i] = 0;
        drops[i] += step;
      }
      raf = requestAnimationFrame(draw);
    };

    resize();
    raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [fontSize, opacity, speed]);

  return (
    <canvas
      ref={ref}
      className={`pointer-events-none absolute inset-0 ${className ?? ""}`}
      aria-hidden
    />
  );
}
