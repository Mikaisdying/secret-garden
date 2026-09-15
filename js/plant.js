import { addFlower, getFlowers } from "./data.js";
import { createDrawingCanvas, buildStrokePath } from "./draw.js";

const state = {
  step: 1,
  plotX: null,
  plotY: null,
  name: "",
  author: "",
  message: "",
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
    eraseColor: "#fffdf6",
    onChange: (strokes) => { toStep2.disabled = strokes.length === 0; },
  });
}
initCanvasOnce();

document.querySelectorAll(".swatch").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".swatch").forEach((b) => b.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    canvas.setColor(btn.dataset.color);
  });
});
document.getElementById("brushSize").addEventListener("input", (e) => {
  canvas.setSize(Number(e.target.value));
});
document.getElementById("eraseBtn").addEventListener("click", (e) => {
  canvas.setErasing(true);
  e.currentTarget.classList.add("is-selected");
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

// ---- Step 5: preview + plant ----
function drawInto(svgEl, strokes) {
  svgEl.innerHTML = "";
  strokes.forEach((s) => svgEl.appendChild(buildStrokePath(s)));
}

function buildPreview() {
  drawInto(document.getElementById("previewSvg"), canvas.getStrokes());
  document.getElementById("previewName").textContent = state.name;
  document.getElementById("previewBy").textContent = `Planted by ${state.author}`;
  document.getElementById("previewMsg").textContent = `"${state.message}"`;
}

document.getElementById("backTo4").addEventListener("click", () => goTo(4));

document.getElementById("plantBtn").addEventListener("click", () => {
  const flower = addFlower({
    name: state.name,
    author: state.author,
    message: state.message,
    plotX: state.plotX,
    plotY: state.plotY,
    scale: 0.9 + Math.random() * 0.3,
    hue: 0,
    strokes: canvas.getStrokes(),
  });

  const confirm = document.getElementById("growConfirm");
  drawInto(document.getElementById("growSvg"), flower.strokes);
  confirm.hidden = false;

  setTimeout(() => {
    window.location.href = `garden.html?planted=${encodeURIComponent(flower.id)}`;
  }, 1600);
});

goTo(1);
