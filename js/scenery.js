export function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// Scatters the lawn's grass tufts into `group`, an SVG <g> inside a
// 1440×900 viewBox. Seeded, so every page that shows the lawn (the garden
// itself, the plot picker) gets the exact same blades in the same places.
export function paintGrassTufts(group) {
  const rg = seededRandom(21);
  const leafColors = ["#5f7a45", "#6f8f52", "#7a9b5e"];
  const fanAngles = { 1: [0], 2: [-10, 10], 3: [-13, 0, 13] };
  const fanSpread = { 1: [0], 2: [-4, 4], 3: [-7, 0, 7] };
  const totalBlades = 220;
  const minClusterDist = 32;
  const placedCenters = [];
  let planted = 0;
  let guard = 0;
  while (planted < totalBlades && guard < totalBlades * 40) {
    guard++;
    const cx = rg() * 1440;
    const cy = rg() * 900;
    const tooClose = placedCenters.some(
      (p) => Math.hypot(p.x - cx, p.y - cy) < minClusterDist
    );
    if (tooClose) continue;
    placedCenters.push({ x: cx, y: cy });

    const clusterSize = 1 + Math.floor(rg() * 3);
    const angles = fanAngles[clusterSize];
    const spread = fanSpread[clusterSize];
    for (let j = 0; j < clusterSize && planted < totalBlades; j++) {
      const len = 10 + rg() * 6;
      const width = len * 0.5;
      const angle = angles[j];
      const bx = cx + spread[j];
      const color = leafColors[Math.floor(rg() * leafColors.length)];
      const blade = document.createElementNS("http://www.w3.org/2000/svg", "path");
      blade.setAttribute(
        "d",
        `M0,0 C${width},${-len * 0.4} ${width * 0.6},${-len * 0.85} 0,${-len} C${-width * 0.2},${-len * 0.85} ${-width * 0.1},${-len * 0.4} 0,0 Z`
      );
      blade.setAttribute("fill", color);
      blade.setAttribute("opacity", "0.65");
      blade.setAttribute("transform", `translate(${bx},${cy}) rotate(${angle})`);
      group.appendChild(blade);
      planted++;
    }
  }
}
