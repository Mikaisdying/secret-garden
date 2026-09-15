// ===========================================================
// Secret Garden — day/night + weather
// Night is decided from the visitor's own device clock (local
// timezone, no geolocation needed). Rain is decided from a rough,
// city-level location guessed from the visitor's IP address (via
// ipwho.is) plus the free, key-less Open-Meteo forecast endpoint.
// Deliberately not using the browser Geolocation API: that asks
// for a permission prompt and precise coordinates, when only an
// approximate location is actually needed here. Nothing in this
// file reads or writes cookies/localStorage — each check is just
// two plain fetches, and if either one fails for any reason we
// simply assume a clear sky rather than guess.
// ===========================================================

const RAIN_WEATHER_CODES = new Set([
  51, 53, 55, 56, 57, // drizzle
  61, 63, 65, 66, 67, // rain
  80, 81, 82,          // rain showers
  95, 96, 99,          // thunderstorm
]);

function isNightNow() {
  const hour = new Date().getHours();
  return hour < 6 || hour >= 19;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const giveUp = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`request failed: ${url}`);
    return await res.json();
  } finally {
    clearTimeout(giveUp);
  }
}

// Two independent IP-geolocation providers, tried in order: ad blockers /
// privacy extensions commonly blocklist one or another of these domains, so
// a single provider silently failing shouldn't mean rain can never show up.
const LOCATION_PROVIDERS = [
  async (timeoutMs) => {
    const data = await fetchWithTimeout("https://ipwho.is/", timeoutMs);
    if (!data?.success) return null;
    const { latitude, longitude } = data;
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  },
  async (timeoutMs) => {
    const data = await fetchWithTimeout("https://get.geojs.io/v1/ip/geo.json", timeoutMs);
    const latitude = parseFloat(data?.latitude);
    const longitude = parseFloat(data?.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  },
];

/** Rough (city-level) lat/lon guessed from the visitor's IP — no permission prompt, no cookies. */
async function approxLocation(timeoutMs) {
  for (const provider of LOCATION_PROVIDERS) {
    try {
      const loc = await provider(timeoutMs);
      if (loc) return loc;
    } catch (err) {
      console.warn("Secret Garden: a location provider failed, trying the next one.", err);
    }
  }
  return null;
}

/** Resolves to true only if we could positively confirm rain nearby; false (never rejects) otherwise. */
async function checkRain({ timeoutMs = 6000 } = {}) {
  const loc = await approxLocation(timeoutMs);
  if (!loc) return false;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=precipitation,weather_code`;
    const data = await fetchWithTimeout(url, timeoutMs);
    const precipitation = data?.current?.precipitation ?? 0;
    const code = data?.current?.weather_code;
    return precipitation > 0 || RAIN_WEATHER_CODES.has(code);
  } catch (err) {
    console.warn("Secret Garden: couldn't read the weather forecast, assuming clear skies.", err);
    return false;
  }
}

/**
 * Applies is-day/is-night (kept in sync with the local clock) and
 * is-rainy (resolved once per page load) classes to `sceneEl`.
 */
export function initEnvironment(sceneEl) {
  if (!sceneEl) return;

  function applyTimeOfDay() {
    const night = isNightNow();
    sceneEl.classList.toggle("is-night", night);
    sceneEl.classList.toggle("is-day", !night);
  }
  applyTimeOfDay();
  setInterval(applyTimeOfDay, 5 * 60 * 1000);

  checkRain().then((rainy) => sceneEl.classList.toggle("is-rainy", rainy));
}
