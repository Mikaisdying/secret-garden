import { getFlowers, formatDate } from "./data.js";
import { buildStrokesGroup, createReplayPlayer } from "./draw.js";
import { initI18n, t, getLocale, onLanguageChange } from "./i18n/index.js";
import { initEnvironment } from "./environment.js";
import { sealSvgMarkup } from "./seals.js";
import { canOpenPrivateLetters } from "./access.js";

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
  const grass = document.getElementById("grassTufts");
  if (grass) {
    const rg = seededRandom(21);
    for (let i = 0; i < 60; i++) {
      const x = rg() * 1440;
      const y = rg() * 900;
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
    const rs = seededRandom(33);
    for (let i = 0; i < 6; i++) {
      const x = 80 + rs() * 1280;
      const y = 60 + rs() * 780;
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.innerHTML = `
        <ellipse cx="${x}" cy="${y}" rx="10" ry="5" fill="#c98a7d"/>
        <rect x="${x - 2}" y="${y}" width="4" height="8" fill="#e8e0c8"/>
      `;
      shrooms.appendChild(g);
    }
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

function spawnWindLeaves() {
  const layer = document.getElementById("windLayer");
  if (!layer) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const count = reduce ? 3 : 10;
  for (let i = 0; i < count; i++) {
    const leaf = document.createElement("div");
    leaf.className = "wind-leaf";
    leaf.style.left = `${-5 + Math.random() * 10}%`;
    leaf.style.top = `${10 + Math.random() * 55}%`;
    leaf.style.setProperty("--wx", `${50 + Math.random() * 30}vw`);
    leaf.style.setProperty("--wy", `${(Math.random() - 0.5) * 60}px`);
    leaf.style.setProperty("--wx2", `${90 + Math.random() * 30}vw`);
    leaf.style.setProperty("--wy2", `${(Math.random() - 0.5) * 100}px`);
    leaf.style.animationDuration = `${7 + Math.random() * 6}s`;
    leaf.style.animationDelay = `${Math.random() * 8}s`;
    layer.appendChild(leaf);
  }
}

function spawnRainDrops() {
  const layer = document.getElementById("rainLayer");
  if (!layer) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;
  for (let i = 0; i < 46; i++) {
    const drop = document.createElement("div");
    drop.className = "rain-drop";
    drop.style.left = `${Math.random() * 100}%`;
    drop.style.animationDuration = `${0.55 + Math.random() * 0.4}s`;
    drop.style.animationDelay = `${Math.random() * 1.2}s`;
    layer.appendChild(drop);
  }
}

function flowerThumb(flower) {
  const wrap = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  wrap.setAttribute("viewBox", "0 0 120 120");
  wrap.setAttribute("width", "64");
  wrap.setAttribute("height", "64");
  wrap.appendChild(buildStrokesGroup(flower.strokes));
  return wrap;
}

function flowerAriaLabel(flower) {
  const key = flower.isPrivate ? "garden.flowerAriaSealed" : "garden.flowerAria";
  return t(key, { name: flower.name, author: flower.author });
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
    btn.dataset.name = flower.name;
    btn.dataset.author = flower.author;
    btn.dataset.private = flower.isPrivate ? "1" : "";
    btn.setAttribute("aria-label", flowerAriaLabel(flower));
    btn.appendChild(flowerThumb(flower));
    btn.addEventListener("click", () => openDetail(flower));
    plantLayer.appendChild(btn);
  });
}

// --- Detail panel + replay wiring ---
const overlay = document.getElementById("detailOverlay");
const detailPanel = document.getElementById("detailPanel");
const replaySvg = document.getElementById("replaySvg");
const stampCard = document.getElementById("stampCard");
const polaroidCard = document.getElementById("polaroidCard");
const storyStack = document.getElementById("storyStack");
const storyEnvelope = document.getElementById("storyEnvelope");
let player = null;
let currentFlower = null;

function bringToFront(card) {
  [stampCard, polaroidCard].forEach((c) => c.classList.toggle("is-front", c === card));
}

stampCard.addEventListener("click", () => bringToFront(stampCard));
stampCard.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bringToFront(stampCard); }
});
polaroidCard.addEventListener("click", (e) => {
  if (e.target.closest("button, select")) return;
  bringToFront(polaroidCard);
});
polaroidCard.addEventListener("keydown", (e) => {
  if (e.target !== polaroidCard) return;
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); bringToFront(polaroidCard); }
});

function renderDetailMeta(flower) {
  document.getElementById("detailMeta").textContent =
    t("garden.plantedBy", { author: flower.author, date: formatDate(flower.createdAt, getLocale()) });
}

function renderLetter(flower) {
  const locked = flower.isPrivate && !canOpenPrivateLetters();
  storyStack.hidden = locked;
  storyEnvelope.hidden = !locked;
  if (locked) {
    document.getElementById("envelopeAuthor").textContent = flower.author;
    document.getElementById("envelopeSealMount").innerHTML = sealSvgMarkup(flower.seal);
    document.getElementById("envelopeLabel").textContent = t("garden.envelopeFrom");
    document.getElementById("envelopeNote").textContent = t("garden.sealedNotice");
  } else {
    document.getElementById("detailMessage").textContent = `"${flower.message}"`;
  }
  return locked;
}

const replayToggle = document.getElementById("replayToggle");

function setReplayToggleState(isPlaying) {
  const key = isPlaying ? "garden.replayPause" : "garden.replayPlay";
  replayToggle.textContent = isPlaying ? "❚❚" : "▶";
  replayToggle.dataset.i18nAriaLabel = key;
  replayToggle.setAttribute("aria-label", t(key));
}

function openDetail(flower) {
  currentFlower = flower;
  detailPanel.setAttribute("aria-label", flower.name);
  document.getElementById("detailName").textContent = flower.name;
  renderDetailMeta(flower);
  const locked = renderLetter(flower);
  overlay.classList.add("is-open");
  player?.pause();
  player = null;
  setReplayToggleState(false);
  if (!locked) {
    bringToFront(polaroidCard);
    player = createReplayPlayer(replaySvg, flower.strokes, {
      actions: flower.actions,
      onDone: () => setReplayToggleState(false),
    });
    setTimeout(() => {
      player.play();
      setReplayToggleState(true);
    }, 250);
  }
}

function closeDetail() {
  overlay.classList.remove("is-open");
  player?.pause();
  setReplayToggleState(false);
}

overlay.addEventListener("click", (e) => { if (e.target === overlay) closeDetail(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDetail(); });

replayToggle.addEventListener("click", () => {
  if (!player) return;
  const willPlay = replayToggle.textContent !== "❚❚";
  if (willPlay) player.play();
  else player.pause();
  setReplayToggleState(willPlay);
});
document.getElementById("replayAgain").addEventListener("click", () => {
  player?.replay();
  setReplayToggleState(true);
});
document.getElementById("replaySpeed").addEventListener("change", (e) => {
  player?.setSpeed(parseFloat(e.target.value));
});

initI18n();
paintScenery();
spawnFireflies();
spawnWindLeaves();
spawnRainDrops();
renderFlowers();
initEnvironment(document.getElementById("gardenScene"));

onLanguageChange(() => {
  plantLayer.querySelectorAll(".garden-plot").forEach((btn) => {
    const key = btn.dataset.private ? "garden.flowerAriaSealed" : "garden.flowerAria";
    btn.setAttribute("aria-label", t(key, { name: btn.dataset.name, author: btn.dataset.author }));
  });
  if (currentFlower && overlay.classList.contains("is-open")) {
    renderDetailMeta(currentFlower);
    renderLetter(currentFlower);
  }
});

// A quiet welcome for whoever finds the one doorway that opens every
// sealed letter — this page's own gate, not a security boundary.
if (canOpenPrivateLetters()) {
  const banner = document.createElement("div");
  banner.className = "unlock-banner";
  banner.textContent = t("garden.unlockedBanner");
  document.body.appendChild(banner);
  onLanguageChange(() => { banner.textContent = t("garden.unlockedBanner"); });
}

// If we just arrived from planting, open that flower's story automatically.
if (justPlantedId) {
  const planted = getFlowers().find((f) => f.id === justPlantedId);
  if (planted) setTimeout(() => openDetail(planted), 900);
}
