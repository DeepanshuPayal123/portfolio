import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

// Smooth scrolling and gentle reveals — skipped entirely for reduced motion.
// Reveals animate opacity only (never visibility), so content stays in the accessibility tree.
if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  gsap.registerPlugin(ScrollTrigger);

  const lenis = new Lenis({ autoRaf: true, anchors: { offset: -72 } });
  lenis.on("scroll", ScrollTrigger.update);

  for (const el of document.querySelectorAll<HTMLElement>("[data-reveal]")) {
    gsap.from(el, {
      opacity: 0,
      y: 24,
      duration: 0.7,
      ease: "power2.out",
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
  }
}
