import { useEffect, useRef } from "react";

/**
 * Gold sparkle particle effect — renders floating golden particles
 * on a canvas overlay when active. Creates a magical "agent is thinking" feel.
 */
export default function SparkleOverlay({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const particles = particlesRef.current;

    const spawnParticle = () => {
      if (particles.length > 60) return;
      particles.push({
        x: Math.random() * canvas.width,
        y: canvas.height + 10,
        vx: (Math.random() - 0.5) * 0.8,
        vy: -(Math.random() * 1.5 + 0.5),
        size: Math.random() * 3 + 1,
        opacity: Math.random() * 0.7 + 0.3,
        life: 1,
        decay: Math.random() * 0.008 + 0.003,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: Math.random() * 0.03 + 0.01,
        hue: Math.random() * 30 + 35, // 35-65: gold range
      });
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (active) {
        // Spawn 1-3 particles per frame
        const count = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < count; i++) spawnParticle();
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= p.decay;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        p.wobble += p.wobbleSpeed;
        p.x += p.vx + Math.sin(p.wobble) * 0.3;
        p.y += p.vy;
        p.vy -= 0.005; // slight upward acceleration

        const alpha = p.opacity * p.life;

        // Glow
        ctx.beginPath();
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 4);
        gradient.addColorStop(0, `hsla(${p.hue}, 80%, 60%, ${alpha * 0.3})`);
        gradient.addColorStop(1, `hsla(${p.hue}, 80%, 60%, 0)`);
        ctx.fillStyle = gradient;
        ctx.arc(p.x, p.y, p.size * 4, 0, Math.PI * 2);
        ctx.fill();

        // Core sparkle
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue}, 85%, 70%, ${alpha})`;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Bright center
        if (p.size > 1.5) {
          ctx.beginPath();
          ctx.fillStyle = `hsla(${p.hue}, 40%, 95%, ${alpha * 0.8})`;
          ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }

        // Star cross (on larger particles)
        if (p.size > 2 && p.life > 0.5) {
          ctx.strokeStyle = `hsla(${p.hue}, 80%, 75%, ${alpha * 0.4})`;
          ctx.lineWidth = 0.5;
          const len = p.size * 2;
          ctx.beginPath();
          ctx.moveTo(p.x - len, p.y);
          ctx.lineTo(p.x + len, p.y);
          ctx.moveTo(p.x, p.y - len);
          ctx.lineTo(p.x, p.y + len);
          ctx.stroke();
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-10"
      style={{ mixBlendMode: "screen" }}
    />
  );
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  life: number;
  decay: number;
  wobble: number;
  wobbleSpeed: number;
  hue: number;
}
