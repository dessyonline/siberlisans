import { useEffect, useRef } from "react";

export function MatrixRain({ opacity = 0.12 }: { opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    const fontSize = 14;
    let columns = Math.floor(width / fontSize);
    let drops = Array.from({ length: columns }, () => Math.random() * -50);

    const chars = "0123456789ABCDEF<>/{}[]$#@!*+SIBERPHP".split("");
    let raf = 0;
    let last = 0;

    const draw = (t: number) => {
      if (t - last > 60) {
        ctx.fillStyle = "rgba(10, 14, 22, 0.16)";
        ctx.fillRect(0, 0, width, height);
        ctx.font = `${fontSize}px "JetBrains Mono", monospace`;
        for (let i = 0; i < drops.length; i++) {
          const text = chars[Math.floor(Math.random() * chars.length)];
          const x = i * fontSize;
          const y = drops[i] * fontSize;
          ctx.fillStyle = Math.random() > 0.975 ? "#a3ffcf" : "#39ff88";
          ctx.fillText(text, x, y);
          if (y > height && Math.random() > 0.965) drops[i] = 0;
          drops[i]++;
        }
        last = t;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      columns = Math.floor(width / fontSize);
      drops = Array.from({ length: columns }, () => Math.random() * -50);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={{ opacity }}
    />
  );
}
