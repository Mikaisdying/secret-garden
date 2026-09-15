// Landing page: procedurally scatters trees/grass into the SVG hero
// layers and floats a handful of fireflies. Kept deliberately gentle —
// nothing here should distract from the headline.

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function paintTrees() {
  const rand = seededRandom(11);
  const group = document.getElementById("treeGroup");
  if (!group) return;
  const positions = [80, 260, 520, 980, 1180, 1350];
  positions.forEach((x, i) => {
    const y = 150 + rand() * 20;
    const r = 34 + rand() * 22;
    const trunk = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    trunk.setAttribute("x", x - 3);
    trunk.setAttribute("y", y);
    trunk.setAttribute("width", 6);
    trunk.setAttribute("height", 40);
    trunk.setAttribute("fill", "#6b5940");
    trunk.setAttribute("opacity", "0.55");
    group.appendChild(trunk);

    const canopy = document.createElementNS("http://www.w3.org/2000/svg", "g");
    canopy.setAttribute("opacity", i % 2 === 0 ? "0.85" : "0.7");
    [0, 1, 2].forEach((n) => {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("cx", x + (n - 1) * r * 0.5);
      c.setAttribute("cy", y - r * 0.4 + (n === 1 ? -8 : 0));
      c.setAttribute("r", r * 0.55);
      canopy.appendChild(c);
    });
    group.appendChild(canopy);
  });
}

function paintGrass() {
  const rand = seededRandom(42);
  const group = document.getElementById("grassBlades");
  if (!group) return;
  for (let i = 0; i < 40; i++) {
    const x = rand() * 1440;
    const y = 70 + rand() * 90;
    const h = 10 + rand() * 16;
    const lean = (rand() - 0.5) * 10;
    const blade = document.createElementNS("http://www.w3.org/2000/svg", "path");
    blade.setAttribute("d", `M${x},${y} Q${x + lean},${y - h / 2} ${x + lean * 1.6},${y - h}`);
    blade.setAttribute("stroke", "#5f7a45");
    blade.setAttribute("stroke-width", "2");
    blade.setAttribute("fill", "none");
    blade.setAttribute("opacity", "0.5");
    blade.style.transformOrigin = `${x}px ${y}px`;
    blade.style.animation = `sway ${4 + rand() * 3}s ease-in-out ${rand() * 2}s infinite`;
    group.appendChild(blade);
  }
  const styleTag = document.createElement("style");
  styleTag.textContent = `
    @keyframes sway { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(4deg); } }
    @media (prefers-reduced-motion: reduce) { #grassBlades path { animation: none !important; } }
  `;
  document.head.appendChild(styleTag);
}

function spawnFireflies() {
  const layer = document.getElementById("fireflyLayer");
  if (!layer) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const count = reduce ? 4 : 10;
  for (let i = 0; i < count; i++) {
    const fly = document.createElement("div");
    fly.className = "firefly";
    fly.style.left = `${5 + Math.random() * 90}%`;
    fly.style.top = `${20 + Math.random() * 60}%`;
    fly.style.setProperty("--fx", `${(Math.random() - 0.5) * 120}px`);
    fly.style.setProperty("--fy", `${-40 - Math.random() * 80}px`);
    fly.style.setProperty("--fx2", `${(Math.random() - 0.5) * 160}px`);
    fly.style.setProperty("--fy2", `${-100 - Math.random() * 120}px`);
    fly.style.animationDuration = `${8 + Math.random() * 6}s`;
    fly.style.animationDelay = `${Math.random() * 6}s`;
    layer.appendChild(fly);
  }
}

paintTrees();
paintGrass();
spawnFireflies();
