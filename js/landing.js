// Landing page intro: a dot traces the sprout mark stroke-by-stroke,
// then a clip-path circle grows from the icon's center to reveal the
// garden page — which has been quietly loading in a hidden iframe the
// whole time, so the reveal uncovers real, already-rendered content
// instead of racing a fresh page load. Once the circle covers the
// screen we hand off to a real navigation; because garden.html and its
// assets are already cached from the iframe, that swap is effectively
// instant. The whole intro is a real <a href="garden.html">, so
// clicking/tapping or disabling JS still gets you there right away.

import { initI18n } from "./i18n/index.js";

const DRAW_MS = 1600;
const REVEAL_MS = 900;
const DESTINATION = "garden.html";

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function runIntro() {
  const path = document.getElementById("introSproutPath");
  const dot = document.getElementById("introDot");
  const preload = document.getElementById("gardenPreload");
  if (!path || !dot || !preload) return;

  let navigated = false;
  const goToGarden = () => {
    if (navigated) return;
    navigated = true;
    window.location.href = DESTINATION;
  };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    path.style.opacity = "1";
    window.setTimeout(goToGarden, 260);
    return;
  }

  const total = path.getTotalLength();
  path.style.strokeDasharray = `${total}`;
  path.style.strokeDashoffset = `${total}`;
  path.style.opacity = "1";
  dot.classList.add("is-active");

  let start = null;
  function frame(ts) {
    if (start === null) start = ts;
    const progress = Math.min((ts - start) / DRAW_MS, 1);
    const eased = easeInOutCubic(progress);
    path.style.strokeDashoffset = `${total * (1 - eased)}`;
    const point = path.getPointAtLength(total * eased);
    dot.setAttribute("transform", `translate(${point.x} ${point.y})`);

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      dot.classList.remove("is-active");
      preload.classList.add("is-active");
      preload.addEventListener("transitionend", goToGarden, { once: true });
      // Fallback in case transitionend never fires (tab loses focus, the
      // iframe steals the event, etc.) — never leave the visitor stuck.
      window.setTimeout(goToGarden, REVEAL_MS + 400);
    }
  }
  requestAnimationFrame(frame);
}

initI18n();
runIntro();
