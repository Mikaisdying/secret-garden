import { addFlower, getFlowers } from "./data.js";
import { createDrawingCanvas, buildStrokesGroup } from "./draw.js";
import { initI18n, t, onLanguageChange } from "./i18n/index.js";
import { SEALS, sealSvgMarkup } from "./seals.js";

initI18n();

const state = {
  step: 1,
  plotX: null,
  plotY: null,
  name: "",
  author: "",
  message: "",
  isPrivate: false,
  seal: SEALS[0].id,
};

const steps = Array.from(document.querySelectorAll(".plant-step"));
const dots = Array.from(document.querySelectorAll(".plant-steps__dot"));

function goTo(stepNum) {
  state.step = stepNum;
  steps.forEach((el) => el.classList.toggle("is-active", Number(el.dataset.step) === stepNum));
  dots.forEach((d, i) => {
    d.classList.toggle("is-active", i === stepNum - 1);
    d.classList.toggle("is-done", i < stepNum - 1);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---- Step 1: draw ----
const drawSvg = document.getElementById("drawSvg");
const toStep2 = document.getElementById("toStep2");
let canvas = null;

function initCanvasOnce() {
  if (canvas) return;
  canvas = createDrawingCanvas(drawSvg, {
    color: "#5b6f4e",
    size: 6,
    onChange: (strokes) => { toStep2.disabled = strokes.length === 0; },
  });
}
initCanvasOnce();

// Exactly one tool button (a color swatch, custom color, eraser or fill) is
// ever marked active at a time, kept in sync with canvas.setColor()/setTool()
// switching the actual tool — so the UI never shows "brush" while the canvas
// is still in erase/fill mode, or vice versa.
function toolButtons() {
  return [
    ...document.querySelectorAll(".swatch"),
    document.getElementById("customColorBtn"),
    document.getElementById("eraseBtn"),
    document.getElementById("fillBtn"),
  ];
}
function setActiveToolButton(active) {
  toolButtons().forEach((b) => b.classList.toggle("is-selected", b === active));
}

document.querySelectorAll(".swatch[data-color]").forEach((btn) => {
  btn.addEventListener("click", () => {
    setActiveToolButton(btn);
    canvas.setColor(btn.dataset.color);
    closeColorPopover();
  });
});

// ---- Custom color: hue is free across the full wheel, but saturation and
// lightness are locked to a "safe" range via the <input type="range">'s own
// min/max, so no combination of sliders can produce a color that clashes
// with the garden's palette. ----
const customColorBtn = document.getElementById("customColorBtn");
const colorPopover = document.getElementById("colorPopover");
const colorPreview = document.getElementById("colorPreview");
const hueRange = document.getElementById("hueRange");
const satRange = document.getElementById("satRange");
const lightRange = document.getElementById("lightRange");

function currentCustomHsl() {
  return `hsl(${hueRange.value} ${satRange.value}% ${lightRange.value}%)`;
}
function openColorPopover() {
  colorPopover.hidden = false;
  customColorBtn.setAttribute("aria-expanded", "true");
}
function closeColorPopover() {
  colorPopover.hidden = true;
  customColorBtn.setAttribute("aria-expanded", "false");
}
function selectCustomColor() {
  const hsl = currentCustomHsl();
  colorPreview.style.background = hsl;
  setActiveToolButton(customColorBtn);
  canvas.setColor(hsl);
}
colorPreview.style.background = currentCustomHsl();

customColorBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  selectCustomColor();
  if (colorPopover.hidden) openColorPopover(); else closeColorPopover();
});
[hueRange, satRange, lightRange].forEach((input) => {
  input.addEventListener("input", selectCustomColor);
});
document.addEventListener("click", (e) => {
  if (!colorPopover.hidden && !e.target.closest(".custom-color-wrap")) closeColorPopover();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !colorPopover.hidden) {
    closeColorPopover();
    customColorBtn.focus();
  }
});

document.getElementById("brushSize").addEventListener("input", (e) => {
  canvas.setSize(Number(e.target.value));
});
const eraseBtn = document.getElementById("eraseBtn");
const fillBtn = document.getElementById("fillBtn");
eraseBtn.addEventListener("click", () => {
  canvas.setTool("erase");
  setActiveToolButton(eraseBtn);
});
fillBtn.addEventListener("click", () => {
  canvas.setTool("fill");
  setActiveToolButton(fillBtn);
});
document.getElementById("undoBtn").addEventListener("click", () => canvas.undo());
document.getElementById("redoBtn").addEventListener("click", () => canvas.redo());
document.getElementById("clearBtn").addEventListener("click", () => canvas.clear());

toStep2.addEventListener("click", () => goTo(2));

// ---- Step 2: choose a plot ----
const plotPicker = document.getElementById("plotPicker");
const plotMarker = document.getElementById("plotMarker");
const existingDotsLayer = document.getElementById("existingDots");
const toStep3 = document.getElementById("toStep3");

getFlowers().forEach((f) => {
  const dot = document.createElement("div");
  dot.className = "plot-picker__existing";
  dot.style.left = `${f.plotX}%`;
  dot.style.top = `${f.plotY}%`;
  existingDotsLayer.appendChild(dot);
});

plotPicker.addEventListener("click", (e) => {
  const rect = plotPicker.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  state.plotX = Math.min(96, Math.max(4, x));
  state.plotY = Math.min(96, Math.max(15, y));
  plotMarker.hidden = false;
  plotMarker.style.left = `${state.plotX}%`;
  plotMarker.style.top = `${state.plotY}%`;
  toStep3.disabled = false;
});

document.getElementById("backTo1").addEventListener("click", () => goTo(1));
toStep3.addEventListener("click", () => goTo(3));

// ---- Step 3: name ----
const nameInput = document.getElementById("flowerName");
const authorInput = document.getElementById("flowerAuthor");
const toStep4 = document.getElementById("toStep4");

function checkStep3() {
  toStep4.disabled = !(nameInput.value.trim() && authorInput.value.trim());
}
nameInput.addEventListener("input", checkStep3);
authorInput.addEventListener("input", checkStep3);

document.getElementById("backTo2").addEventListener("click", () => goTo(2));
toStep4.addEventListener("click", () => {
  state.name = nameInput.value.trim();
  state.author = authorInput.value.trim();
  goTo(4);
});

// ---- Step 4: message ----
const messageInput = document.getElementById("flowerMessage");
const msgCount = document.getElementById("msgCount");
const toStep5 = document.getElementById("toStep5");

messageInput.addEventListener("input", () => {
  msgCount.textContent = String(messageInput.value.length);
  toStep5.disabled = messageInput.value.trim().length === 0;
});

document.getElementById("backTo3").addEventListener("click", () => goTo(3));
toStep5.addEventListener("click", () => {
  state.message = messageInput.value.trim();
  buildPreview();
  goTo(5);
});

// ---- Step 4b: private letter + wax seal ----
const isPrivateToggle = document.getElementById("isPrivateToggle");
const sealPicker = document.getElementById("sealPicker");

function renderSealOption(btn, seal) {
  btn.innerHTML = sealSvgMarkup(seal.id);
  btn.setAttribute("aria-label", t(seal.labelKey));
}

SEALS.forEach((seal, i) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "seal-option" + (seal.id === state.seal ? " is-selected" : "");
  btn.dataset.seal = seal.id;
  renderSealOption(btn, seal);
  btn.addEventListener("click", () => {
    sealPicker.querySelectorAll(".seal-option").forEach((b) => b.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    state.seal = seal.id;
    if (state.step === 5) buildPreview();
  });
  sealPicker.appendChild(btn);
});

isPrivateToggle.addEventListener("change", () => {
  state.isPrivate = isPrivateToggle.checked;
  sealPicker.hidden = !state.isPrivate;
});

onLanguageChange(() => {
  sealPicker.querySelectorAll(".seal-option").forEach((btn) => {
    const seal = SEALS.find((s) => s.id === btn.dataset.seal);
    if (seal) btn.setAttribute("aria-label", t(seal.labelKey));
  });
});

// ---- Step 5: preview + plant ----
function drawInto(svgEl, strokes) {
  svgEl.innerHTML = "";
  svgEl.appendChild(buildStrokesGroup(strokes));
}

function buildPreview() {
  drawInto(document.getElementById("previewSvg"), canvas.getStrokes());
  document.getElementById("previewName").textContent = state.name;
  document.getElementById("previewBy").textContent = t("plant.previewBy", { author: state.author });
  document.getElementById("previewMsg").textContent = `"${state.message}"`;
  const privateNote = document.getElementById("previewPrivateNote");
  privateNote.hidden = !state.isPrivate;
  if (state.isPrivate) {
    document.getElementById("previewPrivateSeal").innerHTML = sealSvgMarkup(state.seal);
  }
}

onLanguageChange(() => {
  if (state.step === 5) buildPreview();
});

document.getElementById("backTo4").addEventListener("click", () => goTo(4));

document.getElementById("plantBtn").addEventListener("click", (e) => {
  if (e.currentTarget.disabled) return;
  e.currentTarget.disabled = true;

  const flower = addFlower({
    name: state.name,
    author: state.author,
    message: state.message,
    plotX: state.plotX,
    plotY: state.plotY,
    scale: 0.9 + Math.random() * 0.3,
    hue: 0,
    strokes: canvas.getStrokes(),
    actions: canvas.getActions(),
    isPrivate: state.isPrivate,
    seal: state.isPrivate ? state.seal : null,
  });

  const confirm = document.getElementById("growConfirm");
  drawInto(document.getElementById("growSvg"), flower.strokes);
  confirm.hidden = false;

  setTimeout(() => {
    window.location.href = `garden.html?planted=${encodeURIComponent(flower.id)}`;
  }, 1600);
});

goTo(1);
