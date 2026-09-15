import { getFlowers, formatDate } from "./data.js";
import { buildStrokePath, createReplayPlayer } from "./draw.js";

const plantLayer = document.getElementById("plantLayer");
const params = new URLSearchParams(location.search);
const justPlantedId = params.get("planted");

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function paintScenery() {
  const rand = seededRandom(7);
  const far = document.getElementById("farTrees");
  const mid = document.getElementById("midTrees");
  [far, mid].forEach((group, gi) => {
    if (!group) return;
    const n = gi === 0 ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const x = 60 + rand() * 1320;
      const y = (gi === 0 ? 380 : 480) + rand() * 40;
      const r = (gi === 0 ? 26 : 40) + rand() * 20;
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      [0, 1, 2].forEach((n2) => {
        const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        c.setAttribute("cx", x + (n2 - 1) * r * 0.5);
        c.setAttribute("cy", y - r * 0.3);
        c.setAttribute("r", r * 0.55);
        g.appendChild(c);
      });
      group.appendChild(g);
    }
  });

  const grass = document.getElementById("grassTufts");
  if (grass) {
    const rg = seededRandom(21);
    for (let i = 0; i < 26; i++) {
      const x = rg() * 1440;
      const y = 640 + rg() * 220;
      const blade = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const h = 12 + rg() * 14;
      blade.setAttribute("d", `M${x},${y} Q${x + 4},${y - h / 2} ${x + 7},${y - h}`);
      blade.setAttribute("stroke", "#5f7a45");
      blade.setAttribute("stroke-width", "2");
      blade.setAttribute("fill", "none");
      blade.setAttribute("opacity", "0.45");
      grass.appendChild(blade);
    }
  }

  const shrooms = document.getElementById("mushrooms");
  if (shrooms) {
    [[300, 760], [980, 700], [1310, 800]].forEach(([x, y]) => {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.innerHTML = `
        <ellipse cx="${x}" cy="${y}" rx="10" ry="5" fill="#c98a7d"/>
        <rect x="${x - 2}" y="${y}" width="4" height="8" fill="#e8e0c8"/>
      `;
      shrooms.appendChild(g);
    });
  }
}

function spawnFireflies() {
  const layer = document.getElementById("fireflyLayer");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const count = reduce ? 3 : 8;
  for (let i = 0; i < count; i++) {
    const fly = document.createElement("div");
    fly.className = "firefly";
    fly.style.left = `${5 + Math.random() * 90}%`;
    fly.style.top = `${35 + Math.random() * 55}%`;
    fly.style.setProperty("--fx", `${(Math.random() - 0.5) * 120}px`);
    fly.style.setProperty("--fy", `${-40 - Math.random() * 80}px`);
    fly.style.setProperty("--fx2", `${(Math.random() - 0.5) * 160}px`);
    fly.style.setProperty("--fy2", `${-100 - Math.random() * 120}px`);
    fly.style.animationDuration = `${8 + Math.random() * 6}s`;
    fly.style.animationDelay = `${Math.random() * 6}s`;
    layer.appendChild(fly);
  }
}

function flowerThumb(flower) {
  const wrap = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  wrap.setAttribute("viewBox", "0 0 120 120");
  wrap.setAttribute("width", "64");
  wrap.setAttribute("height", "64");
  flower.strokes.forEach((s) => wrap.appendChild(buildStrokePath(s)));
  return wrap;
}

function renderFlowers() {
  const flowers = getFlowers();
  flowers.forEach((flower, i) => {
    const btn = document.createElement("button");
    btn.className = "garden-plot";
    if (flower.id === justPlantedId) btn.classList.add("garden-plot--new");
    btn.style.left = `${flower.plotX}%`;
    btn.style.top = `${flower.plotY}%`;
    btn.style.setProperty("--sway-delay", `${(i % 5) * 0.6}s`);
    btn.style.setProperty("transform-origin", "bottom center");
    btn.setAttribute("aria-label", `${flower.name}, planted by ${flower.author}`);
    btn.appendChild(flowerThumb(flower));
    btn.addEventListener("click", () => openDetail(flower));
    plantLayer.appendChild(btn);
  });
}

// --- Detail panel + replay wiring ---
const overlay = document.getElementById("detailOverlay");
const replaySvg = document.getElementById("replaySvg");
let player = null;

function openDetail(flower) {
  document.getElementById("detailName").textContent = flower.name;
  document.getElementById("detailMeta").textContent =
    `Planted by ${flower.author} · ${formatDate(flower.createdAt)}`;
  document.getElementById("detailMessage").textContent = `"${flower.message}"`;
  player = createReplayPlayer(replaySvg, flower.strokes);
  overlay.classList.add("is-open");
  setTimeout(() => player.play(), 250);
}

function closeDetail() {
  overlay.classList.remove("is-open");
  player?.pause();
}

document.getElementById("detailClose").addEventListener("click", closeDetail);
overlay.addEventListener("click", (e) => { if (e.target === overlay) closeDetail(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });

document.getElementById("replayPlay").addEventListener("click", () => player?.play());
document.getElementById("replayPause").addEventListener("click", () => player?.pause());
document.getElementById("replayAgain").addEventListener("click", () => player?.replay());
document.getElementById("replaySpeed").addEventListener("change", (e) => {
  player?.setSpeed(parseFloat(e.target.value));
});

paintScenery();
spawnFireflies();
renderFlowers();

// If we just arrived from planting, open that flower's story automatically.
if (justPlantedId) {
  const planted = getFlowers().find((f) => f.id === justPlantedId);
  if (planted) setTimeout(() => openDetail(planted), 900);
}
