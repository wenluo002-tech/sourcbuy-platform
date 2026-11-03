import { useEffect, useRef, useState } from "react";

/** 滚动进入视口时加 .is-in 触发 .sb-reveal 过渡；只触发一次 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("is-in");
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    const seen = new WeakSet<Element>();
    const collect = () => {
      el.querySelectorAll(".sb-reveal").forEach((t) => {
        if (!seen.has(t)) {
          seen.add(t);
          io.observe(t);
        }
      });
      if (el.classList.contains("sb-reveal") && !seen.has(el)) {
        seen.add(el);
        io.observe(el);
      }
    };
    collect();
    // 异步渲染（如接口数据回来后插入的卡片）也要被观察到
    const mo = new MutationObserver(collect);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return ref;
}

/** 数字滚动：进入视口后从 0 数到目标值，easeOut 缓动，表格数字逐位对齐 */
export function CountUp({
  value,
  duration = 1400,
  className = "",
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || started.current) return;
        started.current = true;
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - t0) / duration, 1);
          // easeOutExpo
          const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
          setDisplay(Math.round(value * eased));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        io.disconnect();
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className={`sb-num ${className}`}>
      {display.toLocaleString()}
    </span>
  );
}
