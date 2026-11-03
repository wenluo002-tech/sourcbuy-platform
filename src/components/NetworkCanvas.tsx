import { useEffect, useRef } from "react";

/**
 * 环境网络画布：供应链网络隐喻——缓慢漂移的节点 + 邻近节点连线。
 * 纯 Canvas 2D 渲染循环，DPR 感知，指针轻微视差，reduced-motion 时只画一帧静态图。
 * 颜色取自品牌蓝（--sb-brand #1f4a94），在浅底上以低透明度呈现。
 */
export default function NetworkCanvas({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let running = true;

    interface Node {
      x: number; y: number;      // 归一化坐标 0..1
      vx: number; vy: number;    // 归一化速度（每秒）
      r: number;                 // 半径 px
    }
    let nodes: Node[] = [];

    // 指针视差（归一化 -1..1），缓动跟随
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.round(w * dpr);
      canvas!.height = Math.round(h * dpr);
      // 节点密度按面积：约每 16000px² 一个，40~90 个
      const count = Math.max(40, Math.min(90, Math.round((w * h) / 16000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.012,
        vy: (Math.random() - 0.5) * 0.012,
        r: 1.1 + Math.random() * 1.4,
      }));
    }

    const LINK_DIST = 0.16; // 归一化连线距离阈值

    function draw(dt: number) {
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);

      // 指针缓动跟随
      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;

      // 节点漂移，边缘回绕
      for (const n of nodes) {
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        if (n.x < -0.05) n.x = 1.05;
        if (n.x > 1.05) n.x = -0.05;
        if (n.y < -0.05) n.y = 1.05;
        if (n.y > 1.05) n.y = -0.05;
      }

      // 视差偏移量（整体轻微移动 ±10px）
      const px = pointer.x * 10;
      const py = pointer.y * 10;
      const P = nodes.map((n) => ({
        x: n.x * w + px * (n.r / 2.5),
        y: n.y * h + py * (n.r / 2.5),
        r: n.r,
      }));

      // 连线：近邻两点，透明度随距离衰减
      const maxD = LINK_DIST * Math.max(w, h);
      ctx!.strokeStyle = "rgba(31, 74, 148, 1)";
      ctx!.lineWidth = 1;
      for (let i = 0; i < P.length; i++) {
        for (let j = i + 1; j < P.length; j++) {
          const dx = P[i].x - P[j].x;
          const dy = P[i].y - P[j].y;
          const d = Math.hypot(dx, dy);
          if (d < maxD) {
            ctx!.globalAlpha = (1 - d / maxD) * 0.14;
            ctx!.beginPath();
            ctx!.moveTo(P[i].x, P[i].y);
            ctx!.lineTo(P[j].x, P[j].y);
            ctx!.stroke();
          }
        }
      }

      // 节点圆点
      ctx!.globalAlpha = 1;
      ctx!.fillStyle = "rgba(31, 74, 148, 0.35)";
      for (const p of P) {
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    let last = performance.now();
    function loop(now: number) {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      draw(dt);
      raf = requestAnimationFrame(loop);
    }

    function onPointer(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      pointer.tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      pointer.ty = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    }

    resize();
    if (reduced) {
      draw(0); // 静帧
    } else {
      raf = requestAnimationFrame(loop);
      window.addEventListener("pointermove", onPointer, { passive: true });
    }
    const ro = new ResizeObserver(() => { resize(); if (reduced) draw(0); });
    ro.observe(canvas);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
}
