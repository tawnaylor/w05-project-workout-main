import { gql } from './api.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- animated network background ---------- */
interface Dot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hue: number;
}

const startBackground = (): void => {
  const canvas = document.getElementById('bg-canvas') as HTMLCanvasElement | null;
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;

  let width = 0;
  let height = 0;
  let dots: Dot[] = [];
  const pointer = { x: -9999, y: -9999 };

  const resize = (): void => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const count = Math.min(90, Math.floor((width * height) / 18000));
    dots = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      hue: Math.random() < 0.5 ? 186 : 312
    }));
  };

  const frame = (): void => {
    ctx.clearRect(0, 0, width, height);
    for (const dot of dots) {
      dot.x += dot.vx;
      dot.y += dot.vy;
      if (dot.x < 0 || dot.x > width) dot.vx *= -1;
      if (dot.y < 0 || dot.y > height) dot.vy *= -1;
    }
    for (let i = 0; i < dots.length; i += 1) {
      const a = dots[i];
      if (!a) continue;
      ctx.fillStyle = `hsla(${a.hue}, 100%, 65%, 0.85)`;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
      for (let j = i + 1; j < dots.length; j += 1) {
        const b = dots[j];
        if (!b) continue;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist < 130) {
          ctx.strokeStyle = `hsla(${a.hue}, 100%, 65%, ${(1 - dist / 130) * 0.28})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      const toPointer = Math.hypot(a.x - pointer.x, a.y - pointer.y);
      if (toPointer < 170) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - toPointer / 170) * 0.5})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(pointer.x, pointer.y);
        ctx.stroke();
      }
    }
    window.requestAnimationFrame(frame);
  };

  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });
  resize();
  if (reduceMotion) {
    frame();
    return;
  }
  window.requestAnimationFrame(frame);
};

/* ---------- pointer spotlight (page glow + card highlight) ---------- */
const startSpotlight = (): void => {
  const root = document.documentElement;
  window.addEventListener('pointermove', (event) => {
    root.style.setProperty('--mx', `${event.clientX}px`);
    root.style.setProperty('--my', `${event.clientY}px`);
    const card = (event.target as HTMLElement | null)?.closest<HTMLElement>('.card');
    if (card) {
      const box = card.getBoundingClientRect();
      card.style.setProperty('--cx', `${event.clientX - box.left}px`);
      card.style.setProperty('--cy', `${event.clientY - box.top}px`);
    }
  });
};

/* ---------- reveal on scroll ---------- */
const startReveal = (): void => {
  const items = document.querySelectorAll<HTMLElement>('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('in'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.12 }
  );
  items.forEach((item, index) => {
    item.style.transitionDelay = `${(index % 4) * 70}ms`;
    observer.observe(item);
  });
};

/* ---------- count-up numbers ---------- */
const countUp = (element: HTMLElement, target: number): void => {
  if (reduceMotion || target === 0) {
    element.textContent = String(target);
    return;
  }
  const start = performance.now();
  const duration = 1200;
  const tick = (now: number): void => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = String(Math.round(target * eased));
    if (progress < 1) window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
};

const startCounters = async (): Promise<void> => {
  document.querySelectorAll<HTMLElement>('[data-count]').forEach((element) => {
    const target = Number(element.dataset.count);
    if (target > 0) countUp(element, target);
  });
  try {
    const data = await gql<{ players: { id: string }[]; workouts: { id: string }[] }>('{ players { id } workouts { id } }');
    const players = document.getElementById('stat-players');
    const workouts = document.getElementById('stat-workouts');
    if (players) countUp(players, data.players.length);
    if (workouts) countUp(workouts, data.workouts.length);
  } catch {
    // Stats are decoration: leave them at zero if the API is unreachable.
  }
};

startBackground();
startSpotlight();
startReveal();
void startCounters();
