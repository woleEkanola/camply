"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * FLIP (First-Last-Invert-Play) rank reordering without framer-motion.
 * Record each item's offsetTop before the DOM updates, then after React
 * re-renders in the new order, apply an inverting translateY with no
 * transition, force a reflow, and clear it with an eased transition — this
 * is exactly what framer-motion's `layout` prop does underneath, just for
 * the one case this page needs (vertical reordering by key).
 *
 * Respects prefers-reduced-motion: skips the animation entirely, letting
 * the reorder just snap (the container ref map is still updated so the
 * next real transition has correct starting positions).
 */
export function useFlipList<T extends string>(orderedKeys: T[]) {
  const nodeRefs = useRef(new Map<T, HTMLElement>());
  const prevOffsets = useRef(new Map<T, number>());

  function setNodeRef(key: T) {
    return (el: HTMLElement | null) => {
      if (el) nodeRefs.current.set(key, el);
      else nodeRefs.current.delete(key);
    };
  }

  useLayoutEffect(() => {
    const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    for (const key of orderedKeys) {
      const el = nodeRefs.current.get(key);
      if (!el) continue;
      const prevTop = prevOffsets.current.get(key);
      const newTop = el.offsetTop;

      if (prevTop != null && prevTop !== newTop && !reduceMotion) {
        const delta = prevTop - newTop;
        el.style.transition = "none";
        el.style.transform = `translateY(${delta}px)`;
        // Force reflow so the browser commits the inverted position before
        // the transition below is applied — without this the two styles
        // would be batched into one paint and nothing would visibly move.
        el.getBoundingClientRect();
        el.style.transition = "transform 600ms cubic-bezier(0.22, 1, 0.36, 1)";
        el.style.transform = "";
      }
    }

    for (const key of orderedKeys) {
      const el = nodeRefs.current.get(key);
      if (el) prevOffsets.current.set(key, el.offsetTop);
    }
  }, [orderedKeys.join(",")]);

  return setNodeRef;
}
