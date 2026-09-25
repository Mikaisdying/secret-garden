import { getFlowers, getFlowerActions, deleteFlower, formatDate } from "./data.js";
import { buildStrokesGroup, createReplayPlayer } from "./draw.js";
import { initI18n, t, getLocale, onLanguageChange } from "./i18n/index.js";
import { initEnvironment } from "./environment.js";
import { sealSvgMarkup } from "./seals.js";
import { canOpenPrivateLetters, getAccessKey } from "./access.js";
import { seededRandom, paintGrassTufts } from "./scenery.js";

document.body.addEventListener("touchstart", () => {}, { passive: true });

const plantLayer = document.getElementById("plantLayer");
const params = new URLSearchParams(location.search);
const justPlantedId = params.get("planted");

function paintScenery() {
  const grass = document.getElementById("grassTufts");
  if (grass) paintGrassTufts(grass);

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
    const duration = 8 + Math.random() * 6;
    fly.style.animationDuration = `${duration}s`;
    fly.style.animationDelay = `${-Math.random() * duration}s`;
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
    const duration = 7 + Math.random() * 6;
    leaf.style.animationDuration = `${duration}s`;
    leaf.style.animationDelay = `${-Math.random() * duration}s`;
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
    const duration = 0.55 + Math.random() * 0.4;
    drop.style.animationDuration = `${duration}s`;
    drop.style.animationDelay = `${-Math.random() * duration}s`;
    layer.appendChild(drop);
  }
}

function flowerThumb(flower) {
  const wrap = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  wrap.setAttribute("viewBox", "0 0 120 120");
  wrap.setAttribute("width", "60");
  wrap.setAttribute("height", "60");
  wrap.appendChild(buildStrokesGroup(flower.strokes));
  return wrap;
}

function flowerAriaLabel(flower) {
  const key = flower.isPrivate ? "garden.flowerAriaSealed" : "garden.flowerAria";
  return t(key, { name: flower.name, author: flower.author });
}

const gardenStatus = document.getElementById("gardenStatus");

function showStatus(key) {
  gardenStatus.dataset.i18nKey = key;
  gardenStatus.textContent = t(key);
  gardenStatus.hidden = false;
}

async function loadFlowers() {
  try {
    return await getFlowers();
  } catch (e) {
    console.warn("Secret Garden: could not load flowers", e);
    showStatus("garden.loadError");
    return [];
  }
}

async function renderFlowers() {
  const flowers = await loadFlowers();
  flowers.forEach((flower, i) => {
    const btn = document.createElement("button");
    btn.className = "garden-plot";
    btn.dataset.id = flower.id;
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
  return flowers;
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
let selectedSpeed = 1;

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

// Bumped on every open/close so a slow actions fetch for a flower the viewer
// has already closed (or moved on from) never hijacks the replay.
let openToken = 0;

async function openDetail(flower, { front = "drawing" } = {}) {
  const token = ++openToken;
  currentFlower = flower;
  detailPanel.setAttribute("aria-label", flower.name);
  document.getElementById("detailName").textContent = flower.name;
  renderDetailMeta(flower);
  const locked = renderLetter(flower);
  overlay.classList.add("is-open");
  player?.pause();
  player = null;
  setReplayToggleState(false);
  if (locked) return;
  bringToFront(front === "letter" ? stampCard : polaroidCard);
  // The action log is only loaded here, when a flower is actually opened —
  // the garden itself only needs `strokes` for the thumbnails.
  const [actions] = await Promise.all([
    getFlowerActions(flower.id),
    new Promise((resolve) => setTimeout(resolve, 250)),
  ]);
  if (token !== openToken) return;
  player = createReplayPlayer(replaySvg, flower.strokes, {
    actions,
    speed: selectedSpeed,
    onDone: () => setReplayToggleState(false),
  });
  player.play();
  setReplayToggleState(true);
}

function closeDetail() {
  openToken++;
  overlay.classList.remove("is-open");
  player?.pause();
  setReplayToggleState(false);
  closeSpeedDropdown();
  if (!galleryOverlay.hidden) lastGalleryCard?.focus();
}

overlay.addEventListener("click", (e) => { if (e.target === overlay) closeDetail(); });
// On mobile the panel stretches to fill the overlay, so its empty background
// (not the story card/envelope itself) is the only "outside" a tap can hit.
detailPanel.addEventListener("click", (e) => { if (e.target === detailPanel) closeDetail(); });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!deleteConfirm.hidden) { if (!deleteCancelBtn.disabled) closeDeleteConfirm(); }
  else if (overlay.classList.contains("is-open")) closeDetail();
  else if (!galleryOverlay.hidden) closeGallery();
});

const wateringCan = document.getElementById("wateringCan");
const galleryOverlay = document.getElementById("galleryOverlay");
const galleryGrid = document.getElementById("galleryGrid");
const galleryClose = document.getElementById("galleryClose");
let lastGalleryCard = null;

function galleryCard(flower) {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "gallery-card";
  btn.setAttribute("aria-label", t("garden.galleryCardAria", { name: flower.name, author: flower.author }));

  const frame = document.createElement("span");
  frame.className = "gallery-card__frame";
  frame.appendChild(flowerThumb(flower));
  if (flower.isPrivate) {
    const seal = document.createElement("span");
    seal.className = "gallery-card__seal";
    seal.innerHTML = sealSvgMarkup(flower.seal);
    frame.appendChild(seal);
  }

  const name = document.createElement("span");
  name.className = "gallery-card__name";
  name.textContent = flower.name;
  const author = document.createElement("span");
  author.className = "gallery-card__author";
  author.textContent = flower.author;

  btn.append(frame, name, author);
  btn.addEventListener("click", () => {
    lastGalleryCard = btn;
    openDetail(flower, { front: "letter" });
  });
  li.appendChild(btn);
  return li;
}

async function renderGallery() {
  const flowers = await loadFlowers();
  if (!flowers.length) {
    const empty = document.createElement("li");
    empty.className = "gallery-grid__empty";
    empty.textContent = t("garden.galleryEmpty");
    galleryGrid.replaceChildren(empty);
    return;
  }
  galleryGrid.replaceChildren(...flowers.map(galleryCard));
}

async function openGallery() {
  await renderGallery();
  galleryOverlay.hidden = false;
  requestAnimationFrame(() => galleryOverlay.classList.add("is-open"));
  galleryClose.focus();
}

function closeGallery() {
  galleryOverlay.classList.remove("is-open");
  galleryOverlay.hidden = true;
  lastGalleryCard = null;
  wateringCan.focus();
}

wateringCan.addEventListener("click", openGallery);
galleryClose.addEventListener("click", closeGallery);
galleryOverlay.addEventListener("click", (e) => { if (e.target === galleryOverlay) closeGallery(); });

// --- Delete (unlock mode only; the server re-checks the key) ---
const deleteFlowerBtn = document.getElementById("deleteFlowerBtn");
const deleteConfirm = document.getElementById("deleteConfirm");
const deleteConfirmText = document.getElementById("deleteConfirmText");
const deleteConfirmError = document.getElementById("deleteConfirmError");
const deleteConfirmBtn = document.getElementById("deleteConfirmBtn");
const deleteCancelBtn = document.getElementById("deleteCancelBtn");

function setDeleteBusy(busy) {
  deleteConfirmBtn.disabled = busy;
  deleteCancelBtn.disabled = busy;
}

function openDeleteConfirm() {
  if (!currentFlower) return;
  deleteConfirmText.textContent = t("garden.deleteConfirmText", { name: currentFlower.name });
  deleteConfirmError.hidden = true;
  setDeleteBusy(false);
  deleteConfirm.hidden = false;
  deleteCancelBtn.focus();
}

function closeDeleteConfirm() {
  deleteConfirm.hidden = true;
  deleteFlowerBtn.focus();
}

async function confirmDelete() {
  const flower = currentFlower;
  if (!flower) return;
  setDeleteBusy(true);
  try {
    await deleteFlower(flower.id, getAccessKey());
  } catch (e) {
    console.warn("Secret Garden: could not remove flower", e);
    deleteConfirmError.textContent = t("garden.deleteError");
    deleteConfirmError.hidden = false;
    setDeleteBusy(false);
    return;
  }
  plantLayer.querySelector(`.garden-plot[data-id="${CSS.escape(flower.id)}"]`)?.remove();
  deleteConfirm.hidden = true;
  closeDetail();
  if (!galleryOverlay.hidden) {
    lastGalleryCard = null;
    await renderGallery();
    galleryClose.focus();
  }
}

deleteFlowerBtn.addEventListener("click", openDeleteConfirm);
deleteCancelBtn.addEventListener("click", closeDeleteConfirm);
deleteConfirmBtn.addEventListener("click", confirmDelete);
deleteConfirm.addEventListener("click", (e) => {
  if (e.target === deleteConfirm && !deleteCancelBtn.disabled) closeDeleteConfirm();
});

replayToggle.addEventListener("click", () => {
  if (!player) return;
  const willPlay = replayToggle.textContent !== "❚❚";
  if (willPlay) player.play();
  else player.pause();
  setReplayToggleState(willPlay);
});
const replayAgain = document.getElementById("replayAgain");
replayAgain.addEventListener("click", () => {
  player?.replay();
  setReplayToggleState(true);
});
const speedDropdown = document.getElementById("speedDropdown");
const speedTrigger = document.getElementById("speedDropdownTrigger");
const speedValue = document.getElementById("speedDropdownValue");
const speedList = document.getElementById("speedDropdownList");
const speedOptions = Array.from(speedList.querySelectorAll("li"));

function closeSpeedDropdown() {
  speedList.hidden = true;
  speedTrigger.setAttribute("aria-expanded", "false");
}
speedTrigger.addEventListener("click", () => {
  const willOpen = speedList.hidden;
  speedList.hidden = !willOpen;
  speedTrigger.setAttribute("aria-expanded", String(willOpen));
});
speedOptions.forEach((li) => {
  li.addEventListener("click", () => {
    speedOptions.forEach((o) => o.setAttribute("aria-selected", String(o === li)));
    speedValue.textContent = li.textContent;
    player?.setSpeed(parseFloat(li.dataset.value));
    closeSpeedDropdown();
    speedTrigger.focus();
  });
});
document.addEventListener("click", (e) => {
  if (!speedDropdown.contains(e.target)) closeSpeedDropdown();
});
speedDropdown.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !speedList.hidden) {
    e.stopPropagation();
    closeSpeedDropdown();
    speedTrigger.focus();
  }
});

initI18n();
paintScenery();
spawnFireflies();
spawnWindLeaves();
spawnRainDrops();
const flowersReady = renderFlowers();
const gardenScene = document.getElementById("gardenScene");
initEnvironment(gardenScene);
requestAnimationFrame(() => requestAnimationFrame(() => gardenScene.classList.remove("is-booting")));

onLanguageChange(() => {
  if (!gardenStatus.hidden) gardenStatus.textContent = t(gardenStatus.dataset.i18nKey);
  if (!deleteConfirm.hidden && currentFlower) {
    deleteConfirmText.textContent = t("garden.deleteConfirmText", { name: currentFlower.name });
    if (!deleteConfirmError.hidden) deleteConfirmError.textContent = t("garden.deleteError");
  }
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
  document.getElementById("shovelFab").hidden = true;
  wateringCan.hidden = false;
  deleteFlowerBtn.hidden = false;
  onLanguageChange(() => { if (!galleryOverlay.hidden) renderGallery(); });
}

// If we just arrived from planting, open that flower's story automatically.
if (justPlantedId) {
  flowersReady.then((flowers) => {
    const planted = flowers.find((f) => f.id === justPlantedId);
    if (planted) setTimeout(() => openDetail(planted), 900);
  });
  params.delete("planted");
  const cleanQuery = params.toString();
  history.replaceState(null, "", location.pathname + (cleanQuery ? `?${cleanQuery}` : "") + location.hash);
}
