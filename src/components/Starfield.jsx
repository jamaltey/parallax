import { useEffect, useRef } from 'react';

export default function Starfield() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let width,
      height,
      stars = [],
      frame,
      last = 0,
      previousScroll = window.scrollY;
    let boost = 0,
      rotation = 0,
      mx = 0,
      my = 0,
      tx = 0,
      ty = 0;
    let visible = !document.hidden;

    // Seeded positions keep the composition stable across resizes.
    let seed = 7319;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    const make = (z = random() * 0.95 + 0.05) => ({
      x: (random() * 2 - 1) * 1.6,
      y: (random() * 2 - 1) * 1.6,
      z,
      phase: random() * Math.PI * 2,
    });

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed = 7319;
      stars = Array.from({ length: Math.min(360, Math.round((width * height) / 4000)) }, () =>
        make()
      );
      if (motion.matches) draw(0);
    }

    function draw(time) {
      const still = motion.matches;
      const delta = Math.min((time - last) / 16.67 || 1, 2);
      last = time;
      const dy = window.scrollY - previousScroll;
      previousScroll = window.scrollY;
      boost += (Math.min(Math.abs(dy) * 0.00008, 0.01) - boost) * 0.1;
      mx += (tx - mx) * 0.04;
      my += (ty - my) * 0.04;
      if (!still) rotation += 0.00006 * delta;
      const cos = Math.cos(rotation),
        sin = Math.sin(rotation),
        focal = Math.min(width, height) * 0.9;
      const cx = width / 2 - (still ? 0 : mx * 60),
        cy = height / 2 - (still ? 0 : my * 60);
      ctx.clearRect(0, 0, width, height);
      for (const star of stars) {
        if (!still) star.z -= (0.0007 + boost) * delta;
        if (star.z <= 0.02) Object.assign(star, make(1));
        const rx = star.x * cos - star.y * sin,
          ry = star.x * sin + star.y * cos;
        const scale = focal / (star.z * 1.6),
          x = cx + rx * scale,
          y = cy + ry * scale;
        if (x < -20 || x > width + 20 || y < -20 || y > height + 20) {
          if (!still && star.z < 0.3) Object.assign(star, make(1));
          continue;
        }
        const near = 1 - star.z,
          radius = 0.3 + near * near * 1.8;
        ctx.globalAlpha = Math.min(
          0.8,
          (0.18 + near * 0.7) * (still ? 1 : 0.8 + 0.2 * Math.sin(time / 1000 + star.phase))
        );
        ctx.fillStyle = '#e4e4e7';
        if (!still && boost > 0.002) {
          const tail = focal / ((star.z + boost * 14) * 1.6);
          ctx.strokeStyle = '#c4b5fd';
          ctx.lineWidth = radius;
          ctx.beginPath();
          ctx.moveTo(cx + rx * tail, cy + ry * tail);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!still && visible) frame = requestAnimationFrame(draw);
    }

    function start() {
      cancelAnimationFrame(frame);
      last = 0;
      draw(0);
    }

    function visibility() {
      visible = !document.hidden;
      if (visible) start();
      else cancelAnimationFrame(frame);
    }

    function pointer(event) {
      tx = event.clientX / width - 0.5;
      ty = event.clientY / height - 0.5;
    }

    resize();
    start();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', pointer, { passive: true });
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', start);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', pointer);
      document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', start);
    };
  }, []);
  return (
    <canvas
      ref={ref}
      className="starfield pointer-events-none fixed inset-0 z-0 h-full w-full opacity-[0.65]"
      aria-hidden="true"
    />
  );
}
