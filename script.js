/* ═══════════════════════════════════════════════
   WorldClock — script.js
   Global Time, Date & Weather Comparison App
   APIs used:
     - Open-Meteo  (free, no key): weather
     - Open-Meteo Geocoding API  : city search
     - ip-api.com  (free, no key): local IP geolocation
     - Intl API (built-in)       : timezone / formatting
   ═══════════════════════════════════════════════ */

'use strict';

/* ────────────────────────────────────────────────
   STATE
   ──────────────────────────────────────────────── */
const state = {
  local: {
    lat: null,
    lon: null,
    city: null,
    country: null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  cards: [],          // array of { id, city, country, lat, lon, timezone, flag }
  darkMode: false,
  clockInterval: null,
  timeCache: new Map(),
  searchCache: new Map(),
  pendingTimeRequests: new Map(),
  pendingSearchRequests: new Map(),
};

/* ────────────────────────────────────────────────
   DOM REFS
   ──────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const els = {
  localTime:    $('localTime'),
  localDate:    $('localDate'),
  localTz:      $('localTz'),
  localLocation:$('localLocation'),
  localWeather: $('localWeather'),
  citySearch:   $('citySearch'),
  suggestions:  $('suggestionsList'),
  grid:         $('comparisonGrid'),
  darkToggle:   $('darkToggle'),
  toggleIcon:   $('toggleIcon'),
};

/* ────────────────────────────────────────────────
   WEATHER CODE MAP  (WMO codes → emoji + label)
   ──────────────────────────────────────────────── */
const WMO = {
  0:  ['☀️', 'Clear sky'],
  1:  ['🌤️', 'Mainly clear'],
  2:  ['⛅', 'Partly cloudy'],
  3:  ['☁️', 'Overcast'],
  45: ['🌫️', 'Foggy'],
  48: ['🌫️', 'Icy fog'],
  51: ['🌦️', 'Light drizzle'],
  53: ['🌦️', 'Drizzle'],
  55: ['🌧️', 'Heavy drizzle'],
  61: ['🌧️', 'Light rain'],
  63: ['🌧️', 'Rain'],
  65: ['🌧️', 'Heavy rain'],
  71: ['🌨️', 'Light snow'],
  73: ['🌨️', 'Snow'],
  75: ['❄️', 'Heavy snow'],
  77: ['🌨️', 'Snow grains'],
  80: ['🌦️', 'Showers'],
  81: ['🌧️', 'Heavy showers'],
  82: ['⛈️', 'Violent showers'],
  85: ['🌨️', 'Snow showers'],
  86: ['🌨️', 'Heavy snow showers'],
  95: ['⛈️', 'Thunderstorm'],
  96: ['⛈️', 'Thunderstorm + hail'],
  99: ['⛈️', 'Thunderstorm + hail'],
};

const wmo = code => WMO[code] ?? ['🌡️', 'Unknown'];

const TIME_API_ENDPOINTS = [
  timezone => `https://time.now/developer/api/timezone/${encodeURIComponent(timezone)}`,
  timezone => `https://worldtimeapi.org/api/timezone/${encodeURIComponent(timezone)}`,
];

const QUERY_ALIASES = {
  argentina: { name: 'Buenos Aires', country: 'Argentina', countryCode: 'AR', timezone: 'America/Argentina/Buenos_Aires', admin1: 'Buenos Aires' },
  bolivia: { name: 'La Paz', country: 'Bolivia', countryCode: 'BO', timezone: 'America/La_Paz', admin1: 'La Paz' },
  brazil: { name: 'Brasilia', country: 'Brazil', countryCode: 'BR', timezone: 'America/Sao_Paulo', admin1: 'Federal District' },
  chile: { name: 'Santiago', country: 'Chile', countryCode: 'CL', timezone: 'America/Santiago', admin1: 'Santiago Metropolitan Region' },
  colombia: { name: 'Bogota', country: 'Colombia', countryCode: 'CO', timezone: 'America/Bogota', admin1: 'Bogota D.C.' },
  ecuador: { name: 'Quito', country: 'Ecuador', countryCode: 'EC', timezone: 'America/Guayaquil', admin1: 'Pichincha' },
  paraguay: { name: 'Asuncion', country: 'Paraguay', countryCode: 'PY', timezone: 'America/Asuncion', admin1: 'Asuncion' },
  peru: { name: 'Lima', country: 'Peru', countryCode: 'PE', timezone: 'America/Lima', admin1: 'Lima' },
  mexico: { name: 'Mexico City', country: 'Mexico', countryCode: 'MX', timezone: 'America/Mexico_City', admin1: 'Ciudad de México' },
  uruguay: { name: 'Montevideo', country: 'Uruguay', countryCode: 'UY', timezone: 'America/Montevideo', admin1: 'Montevideo' },
  venezuela: { name: 'Caracas', country: 'Venezuela', countryCode: 'VE', timezone: 'America/Caracas', admin1: 'Capital District' },
  oklahoma: { name: 'Oklahoma City', country: 'United States', countryCode: 'US', timezone: 'America/Chicago', admin1: 'Oklahoma' },
  'kansas city': { name: 'Kansas City', country: 'United States', countryCode: 'US', timezone: 'America/Chicago', admin1: 'Missouri' },
  'las cruces nm': { name: 'Las Cruces', country: 'United States', countryCode: 'US', timezone: 'America/Denver', admin1: 'New Mexico' },
  'el paso tx': { name: 'El Paso', country: 'United States', countryCode: 'US', timezone: 'America/Denver', admin1: 'Texas' },
  oregon: { name: 'Portland', country: 'United States', countryCode: 'US', timezone: 'America/Los_Angeles', admin1: 'Oregon' },
  'new york': { name: 'New York', country: 'United States', countryCode: 'US', timezone: 'America/New_York', admin1: 'New York' },
  'los angeles': { name: 'Los Angeles', country: 'United States', countryCode: 'US', timezone: 'America/Los_Angeles', admin1: 'California' },
  london: { name: 'London', country: 'United Kingdom', countryCode: 'GB', timezone: 'Europe/London', admin1: 'England' },
  dubai: { name: 'Dubai', country: 'United Arab Emirates', countryCode: 'AE', timezone: 'Asia/Dubai', admin1: 'Dubai' },
  tokyo: { name: 'Tokyo', country: 'Japan', countryCode: 'JP', timezone: 'Asia/Tokyo', admin1: 'Tokyo' },
  karachi: { name: 'Karachi', country: 'Pakistan', countryCode: 'PK', timezone: 'Asia/Karachi', admin1: 'Sindh' },
  sydney: { name: 'Sydney', country: 'Australia', countryCode: 'AU', timezone: 'Australia/Sydney', admin1: 'New South Wales' },
};

function normalizeQuery(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function makeRequestKey(value) {
  return normalizeQuery(value);
}

function uniqueByKey(items, getKey) {
  const seen = new Set();
  return items.filter(item => {
    const key = getKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createLocationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function safeTimezone(timezone) {
  return timezone && typeof timezone === 'string' ? timezone : Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function buildLocationKey(loc) {
  return normalizeQuery([loc.name, loc.admin1, loc.country].filter(Boolean).join('|'));
}

function aliasFromQuery(query) {
  const key = makeRequestKey(query);
  if (QUERY_ALIASES[key]) return QUERY_ALIASES[key];

  const compact = key.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (QUERY_ALIASES[compact]) return QUERY_ALIASES[compact];

  const cleaned = compact
    .replace(/\b(city|state|province|department|district|region)\b/g, '')
    .replace(/\b(nm|tx|ok)\b/g, token => token.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();

  return QUERY_ALIASES[cleaned] || null;
}

function mergeSuggestionLists(primary, secondary) {
  return uniqueByKey([...primary, ...secondary], buildLocationKey);
}

async function fetchJsonWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function parseTimeResponse(payload, fallbackTimezone) {
  if (!payload || typeof payload !== 'object') return null;
  const timezone = safeTimezone(payload.timezone || payload.time_zone || fallbackTimezone);
  const datetime = payload.datetime || payload.dateTime || payload.currentDateTime || payload.utc_datetime || payload.currentDate || payload.local_datetime;
  if (!datetime) return { timezone, datetime: new Date().toISOString(), source: 'fallback' };
  return { timezone, datetime, source: 'api' };
}

function formatLocalTime(date, timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimezone(timezone),
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function formatLocalDate(date, timezone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimezone(timezone),
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function setTimeFallback(elTime, elDate, timezone, message) {
  const tz = safeTimezone(timezone);
  const now = new Date();
  elTime.textContent = formatLocalTime(now, tz);
  elDate.textContent = formatLocalDate(now, tz);
  if (message) elTime.title = message;
}

async function fetchCityTime(timezone) {
  const tz = safeTimezone(timezone);
  const cacheKey = tz;
  const cached = state.timeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 60_000) return cached.data;

  if (state.pendingTimeRequests.has(cacheKey)) return state.pendingTimeRequests.get(cacheKey);

  const request = (async () => {
    let lastError = null;
    for (const buildUrl of TIME_API_ENDPOINTS) {
      try {
        const payload = await fetchJsonWithTimeout(buildUrl(tz), 8000);
        const parsed = parseTimeResponse(payload, tz);
        if (parsed && parsed.datetime) {
          state.timeCache.set(cacheKey, { at: Date.now(), data: parsed });
          return parsed;
        }
      } catch (error) {
        lastError = error;
      }
    }

    const fallback = {
      timezone: tz,
      datetime: new Date().toISOString(),
      source: 'local-fallback',
      error: lastError ? lastError.message : 'Unknown time lookup failure',
    };
    state.timeCache.set(cacheKey, { at: Date.now(), data: fallback });
    return fallback;
  })();

  state.pendingTimeRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    state.pendingTimeRequests.delete(cacheKey);
  }
}

function inferTimezoneFromRegion(countryCode, admin1) {
  const country = normalizeQuery(countryCode);
  const region = normalizeQuery(admin1);
  if (country === 'us') {
    if (/(new mexico|colorado|texas|arizona)/.test(region)) return 'America/Denver';
    if (/(california|oregon|washington|nevada)/.test(region)) return 'America/Los_Angeles';
    if (/(oklahoma|kansas|illinois|missouri|minnesota|wisconsin)/.test(region)) return 'America/Chicago';
    return 'America/New_York';
  }
  if (country === 'br') return 'America/Sao_Paulo';
  if (country === 'ar') return 'America/Argentina/Buenos_Aires';
  if (country === 'bo') return 'America/La_Paz';
  if (country === 'cl') return 'America/Santiago';
  if (country === 'co') return 'America/Bogota';
  if (country === 'ec') return 'America/Guayaquil';
  if (country === 'py') return 'America/Asuncion';
  if (country === 'pe') return 'America/Lima';
  if (country === 'mx') return 'America/Mexico_City';
  if (country === 'uy') return 'America/Montevideo';
  if (country === 've') return 'America/Caracas';
  if (country === 'gb') return 'Europe/London';
  if (country === 'ae') return 'Asia/Dubai';
  if (country === 'jp') return 'Asia/Tokyo';
  if (country === 'pk') return 'Asia/Karachi';
  if (country === 'au') return 'Australia/Sydney';
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function mapGeocodeResult(result) {
  return {
    name: result.name,
    country: result.country || '',
    countryCode: result.countryCode || '',
    lat: result.latitude,
    lon: result.longitude,
    timezone: safeTimezone(result.timezone || inferTimezoneFromRegion(result.countryCode, result.admin1)),
    admin1: result.admin1 || '',
  };
}

/* ────────────────────────────────────────────────
   UTILITIES
   ──────────────────────────────────────────────── */

/** Format time in a given timezone */
function formatTime(tz) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date());
}

/** Format date in a given timezone */
function formatDate(tz) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
}

/** Get UTC offset string like "UTC+5:30" for display */
function getUTCOffset(tz) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(now);
  const tzPart = parts.find(p => p.type === 'timeZoneName');
  return tzPart ? tzPart.value : tz;
}

/** Calculate difference in minutes between two timezones */
function tzOffsetMinutes(tz) {
  const now = new Date();
  // Get local time in tz as a fake date
  const inTz = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const inLocal = new Date(now.toLocaleString('en-US', { timeZone: state.local.timezone }));
  return Math.round((inTz - inLocal) / 60000);
}

/** Render a "±X h Ym" human diff string */
function humanDiff(minutes) {
  if (minutes === 0) return { label: '● Same time', cls: 'same' };
  const sign = minutes > 0 ? '+' : '–';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  let label = sign;
  if (h > 0) label += `${h}h `;
  if (m > 0) label += `${m}m`;
  label += minutes > 0 ? ' ahead' : ' behind';
  return { label: label.trim(), cls: minutes > 0 ? 'ahead' : 'behind' };
}

/** Simple country → flag emoji */
function countryFlag(isoCode) {
  if (!isoCode || isoCode.length !== 2) return '🌐';
  return isoCode.toUpperCase().replace(/./g, c =>
    String.fromCodePoint(c.charCodeAt(0) + 127397)
  );
}

/** Show a toast message */
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 3200);
}

/* ────────────────────────────────────────────────
   API CALLS
   ──────────────────────────────────────────────── */

/**
 * Fetch weather from Open-Meteo (free, no key required)
 * Returns { temp, weatherCode, humidity, wind }
 */
async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
    + `&wind_speed_unit=kmh&temperature_unit=celsius&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Weather fetch failed');
  const data = await r.json();
  const c = data.current;
  return {
    temp: Math.round(c.temperature_2m),
    weatherCode: c.weather_code,
    humidity: c.relative_humidity_2m,
    wind: Math.round(c.wind_speed_10m),
  };
}

/**
 * Geocode a query using Open-Meteo Geocoding API (free)
 * Returns array of { name, country, countryCode, lat, lon, timezone, admin1 }
 */
async function searchCities(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=en&format=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Geocoding failed');
  const data = await r.json();
  return (data.results || []).map(d => ({
    name: d.name,
    country: d.country || '',
    countryCode: d.country_code || '',
    lat: d.latitude,
    lon: d.longitude,
    timezone: d.timezone,
    admin1: d.admin1 || '',
  }));
}

/**
 * Detect user location via IP geolocation (ip-api.com, free)
 */
async function detectLocalLocation() {
  try {
    const r = await fetch('https://ip-api.com/json/?fields=city,country,countryCode,lat,lon,timezone');
    if (!r.ok) throw new Error();
    const d = await r.json();
    state.local.city    = d.city || 'Unknown City';
    state.local.country = d.country || 'Unknown';
    state.local.lat     = d.lat;
    state.local.lon     = d.lon;
    // prefer actual detected timezone but fallback to browser
    if (d.timezone) state.local.timezone = d.timezone;
    const flag = countryFlag(d.countryCode);
    els.localLocation.textContent = `${flag} ${d.city}, ${d.country}`;
  } catch {
    // Fallback: just use browser timezone
    els.localLocation.textContent = `🌐 ${state.local.timezone}`;
  }
  // Fetch local weather if we have coords
  if (state.local.lat && state.local.lon) {
    renderLocalWeather(state.local.lat, state.local.lon);
  } else {
    els.localWeather.innerHTML = '<span style="font-size:0.78rem;color:var(--text-muted)">Weather unavailable</span>';
  }
  hydrateLocalClock();
}

async function hydrateLocalClock() {
  const tz = safeTimezone(state.local.timezone);
  try {
    const info = await fetchCityTime(tz);
    if (info && info.timezone) state.local.timezone = info.timezone;
  } catch {
    state.local.timezone = tz;
  }
  tickLocalClock();
}

/* ────────────────────────────────────────────────
   RENDER: LOCAL PANEL
   ──────────────────────────────────────────────── */

function renderLocalWeather(lat, lon) {
  fetchWeather(lat, lon).then(w => {
    const [icon, desc] = wmo(w.weatherCode);
    els.localWeather.innerHTML = `
      <div class="weather-block">
        <div class="weather-icon">${icon}</div>
        <div class="weather-temp">${w.temp}°C</div>
        <div class="weather-desc">${desc}</div>
        <div class="weather-meta">
          <span class="weather-meta-item">💧 ${w.humidity}%</span>
          <span class="weather-meta-item">💨 ${w.wind} km/h</span>
        </div>
      </div>`;
  }).catch(() => {
    els.localWeather.innerHTML = '<span style="font-size:0.78rem;color:var(--text-muted)">Weather unavailable</span>';
  });
}

function tickLocalClock() {
  const tz = safeTimezone(state.local.timezone);
  els.localTime.textContent = formatLocalTime(new Date(), tz);
  els.localDate.textContent = formatLocalDate(new Date(), tz);
  els.localTz.textContent   = `${tz} · ${getUTCOffset(tz)}`;
}

/* ────────────────────────────────────────────────
   RENDER: COMPARISON CARD
   ──────────────────────────────────────────────── */

function renderCard(loc) {
  const timezone = safeTimezone(loc.timezone);
  const diff = tzOffsetMinutes(timezone);
  const { label, cls } = humanDiff(diff);

  const card = document.createElement('div');
  card.className = 'loc-card';
  card.dataset.id = loc.id;

  const displayName = loc.admin1
    ? `${loc.name}, ${loc.admin1}`
    : loc.name;

  card.innerHTML = `
    <button class="loc-remove" title="Remove" data-id="${loc.id}">✕</button>
    <div class="loc-flag">${loc.flag}</div>
    <div class="loc-city">${displayName}</div>
    <div class="loc-country">${loc.country} · ${timezone}</div>
    <div class="loc-time" data-tz="${timezone}">Loading time…</div>
    <div class="loc-date" data-tz="${timezone}">Fetching date…</div>
    <div class="loc-tz">${getUTCOffset(timezone)}</div>
    <div class="loc-status" id="status-${loc.id}" style="font-size:0.74rem;color:var(--text-muted)">Checking live time…</div>
    <div class="time-diff ${cls}">${label}</div>
    <div class="loc-divider"></div>
    <div class="loc-weather" id="lw-${loc.id}">
      <div class="weather-skeleton pulse" style="width:40px;height:40px;border-radius:8px;"></div>
    </div>`;

  els.grid.appendChild(card);

  // Bind remove
  card.querySelector('.loc-remove').addEventListener('click', () => removeCard(loc.id));

  // Hydrate the live time immediately so the card never stays blank.
  hydrateCardTime(card, loc, timezone);

  // Fetch weather
  fetchWeather(loc.lat, loc.lon).then(w => {
    const [icon, desc] = wmo(w.weatherCode);
    const wEl = $(`lw-${loc.id}`);
    if (wEl) {
      wEl.innerHTML = `
        <div class="loc-weather-icon">${icon}</div>
        <div class="loc-weather-info">
          <div class="loc-weather-temp">${w.temp}°C</div>
          <div class="loc-weather-desc">${desc}</div>
        </div>
        <div class="loc-weather-extras">
          <span>💧 ${w.humidity}%</span>
          <span>💨 ${w.wind} km/h</span>
        </div>`;
    }
  }).catch(() => {
    const wEl = $(`lw-${loc.id}`);
    if (wEl) wEl.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted)">Weather unavailable</span>';
  });
}

async function hydrateCardTime(card, loc, initialTimezone) {
  const tz = safeTimezone(initialTimezone || loc.timezone);
  const timeEl = card.querySelector('.loc-time');
  const dateEl = card.querySelector('.loc-date');
  const statusEl = card.querySelector(`#status-${loc.id}`);

  setTimeFallback(timeEl, dateEl, tz);
  if (statusEl) statusEl.textContent = 'Checking live time…';

  try {
    const timeInfo = await fetchCityTime(tz);
    loc.timezone = safeTimezone(timeInfo.timezone || tz);
    timeEl.dataset.tz = loc.timezone;
    dateEl.dataset.tz = loc.timezone;
    setTimeFallback(timeEl, dateEl, loc.timezone);
    if (statusEl) {
      statusEl.textContent = timeInfo.source === 'api' ? 'Live time loaded' : 'Local fallback in use';
    }
    timeEl.title = timeInfo.source === 'api' ? 'Live timezone confirmed' : (timeInfo.error || 'Local fallback time');
  } catch (error) {
    setTimeFallback(timeEl, dateEl, tz, error.message || 'Time lookup failed');
    if (statusEl) statusEl.textContent = 'Time lookup failed, using local fallback';
  }
}

function removeCard(id) {
  state.cards = state.cards.filter(c => c.id !== id);
  const card = els.grid.querySelector(`[data-id="${id}"]`);
  if (card) {
    card.style.opacity = '0';
    card.style.transform = 'scale(0.95)';
    card.style.transition = 'opacity 0.25s, transform 0.25s';
    setTimeout(() => {
      card.remove();
      renderEmptyState();
    }, 250);
  }
}

function renderEmptyState() {
  const hasEmpty = els.grid.querySelector('.empty-state');
  if (state.cards.length === 0 && !hasEmpty) {
    els.grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🗺️</span>
        <p>Search for a city above to start comparing times and weather worldwide.</p>
      </div>`;
  }
}

/* ────────────────────────────────────────────────
   MASTER CLOCK TICK — runs every second
   ──────────────────────────────────────────────── */
function tick() {
  // Local
  tickLocalClock();

  // All comparison cards
  const timeEls = els.grid.querySelectorAll('[data-tz]');
  timeEls.forEach(el => {
    const tz = safeTimezone(el.dataset.tz);
    if (el.classList.contains('loc-time')) {
      el.textContent = formatLocalTime(new Date(), tz);
    } else if (el.classList.contains('loc-date')) {
      el.textContent = formatLocalDate(new Date(), tz);
    }
  });
}

/* ────────────────────────────────────────────────
   SEARCH / AUTOCOMPLETE
   ──────────────────────────────────────────────── */
let searchDebounce = null;
let currentSuggestions = [];
let activeSuggIdx = -1;

els.citySearch.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  const val = els.citySearch.value.trim();
  if (val.length < 2) {
    closeSuggestions();
    return;
  }
  searchDebounce = setTimeout(() => doSearch(val), 280);
});

async function doSearch(query) {
  try {
    els.suggestions.innerHTML = '<li style="color:var(--text-muted);cursor:default;">Searching…</li>';
    els.suggestions.classList.add('open');
    const results = await searchLocations(query);
    currentSuggestions = results;
    activeSuggIdx = -1;
    renderSuggestions(results);
  } catch (error) {
    currentSuggestions = [];
    els.suggestions.innerHTML = `<li style="color:var(--text-muted);cursor:default;">${error.message || 'Search failed'}</li>`;
    els.suggestions.classList.add('open');
  }
}

async function searchLocations(query) {
  const requestKey = makeRequestKey(query);
  const cached = state.searchCache.get(requestKey);
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached.data;

  if (state.pendingSearchRequests.has(requestKey)) return state.pendingSearchRequests.get(requestKey);

  const request = (async () => {
    const alias = aliasFromQuery(query);
    const aliasResults = alias ? [{ ...alias, lat: alias.lat ?? null, lon: alias.lon ?? null, alias: true }] : [];
    let apiResults = [];

    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=en&format=json`;
      const payload = await fetchJsonWithTimeout(url, 8000);
      apiResults = (payload.results || []).map(mapGeocodeResult);
    } catch {
      apiResults = [];
    }

    const merged = mergeSuggestionLists(aliasResults, apiResults);
    state.searchCache.set(requestKey, { at: Date.now(), data: merged });
    return merged;
  })();

  state.pendingSearchRequests.set(requestKey, request);
  try {
    return await request;
  } finally {
    state.pendingSearchRequests.delete(requestKey);
  }
}

function renderSuggestions(results) {
  els.suggestions.innerHTML = '';
  if (!results.length) {
    els.suggestions.innerHTML = '<li style="color:var(--text-muted);cursor:default;">No results found</li>';
    els.suggestions.classList.add('open');
    return;
  }
  results.forEach((r, i) => {
    const li = document.createElement('li');
    li.dataset.idx = i;
    const secondary = r.admin1 ? `${r.admin1}, ${r.country}` : r.country;
    li.innerHTML = `
      <span class="suggestion-flag">${countryFlag(r.countryCode)}</span>
      <span class="suggestion-name">${r.name}</span>
      <span class="suggestion-country">${secondary}</span>`;
    li.addEventListener('click', () => selectSuggestion(i));
    els.suggestions.appendChild(li);
  });
  els.suggestions.classList.add('open');
}

function closeSuggestions() {
  els.suggestions.classList.remove('open');
  els.suggestions.innerHTML = '';
  activeSuggIdx = -1;
}

function selectSuggestion(idx) {
  const r = currentSuggestions[idx];
  if (!r) return;

  // Check duplicate
  const locationKey = buildLocationKey(r);
  const exists = state.cards.some(c => (r.lat != null && r.lon != null && c.lat === r.lat && c.lon === r.lon) || c.locationKey === locationKey);
  if (exists) {
    showToast(`${r.name} is already in the comparison!`);
    closeSuggestions();
    els.citySearch.value = '';
    return;
  }

  const loc = {
    id: createLocationId(),
    name: r.name,
    country: r.country,
    countryCode: r.countryCode,
    lat: r.lat,
    lon: r.lon,
    timezone: safeTimezone(r.timezone),
    flag: countryFlag(r.countryCode),
    admin1: r.admin1,
    locationKey,
  };

  // Remove empty state
  const emptyEl = els.grid.querySelector('.empty-state');
  if (emptyEl) emptyEl.remove();

  state.cards.push(loc);
  renderCard(loc);

  els.citySearch.value = '';
  closeSuggestions();
}

// Keyboard navigation
els.citySearch.addEventListener('keydown', e => {
  const items = els.suggestions.querySelectorAll('li');
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeSuggIdx = Math.min(activeSuggIdx + 1, items.length - 1);
    updateActiveSugg(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeSuggIdx = Math.max(activeSuggIdx - 1, 0);
    updateActiveSugg(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeSuggIdx >= 0) selectSuggestion(activeSuggIdx);
    else if (currentSuggestions.length > 0) selectSuggestion(0);
  } else if (e.key === 'Escape') {
    closeSuggestions();
  }
});

function updateActiveSugg(items) {
  items.forEach(li => li.classList.remove('active'));
  if (activeSuggIdx >= 0) items[activeSuggIdx].classList.add('active');
}

// Close suggestions on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrapper')) closeSuggestions();
});

/* ────────────────────────────────────────────────
   DARK MODE
   ──────────────────────────────────────────────── */
els.darkToggle.addEventListener('click', () => {
  state.darkMode = !state.darkMode;
  document.body.classList.toggle('dark', state.darkMode);
  els.toggleIcon.textContent = state.darkMode ? '☀' : '☽';
  localStorage.setItem('worldclock-dark', state.darkMode);
});

function restoreDarkMode() {
  const saved = localStorage.getItem('worldclock-dark');
  if (saved === 'true') {
    state.darkMode = true;
    document.body.classList.add('dark');
    els.toggleIcon.textContent = '☀';
  }
}

async function runSelfTests() {
  const results = [];
  const assert = (name, condition, details = '') => {
    results.push({ name, passed: Boolean(condition), details });
  };

  assert('normalizeQuery strips accents and spacing', normalizeQuery('  Qu\u00e9b\u00e9c  City ') === 'quebec city');
  assert('aliasFromQuery resolves Argentina', aliasFromQuery('Argentina')?.timezone === 'America/Argentina/Buenos_Aires');
  assert('aliasFromQuery resolves Oklahoma', aliasFromQuery('Oklahoma')?.timezone === 'America/Chicago');
  assert('aliasFromQuery resolves New York', aliasFromQuery('New York')?.timezone === 'America/New_York');
  assert('parseTimeResponse accepts datetime payload', !!parseTimeResponse({ datetime: '2026-04-27T12:34:56Z', timezone: 'Asia/Tokyo' }, 'Asia/Tokyo'));

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    const value = String(url);
    if (value.includes('geocoding-api.open-meteo.com')) {
      return { ok: true, json: async () => ({ results: [{ name: 'Tokyo', country: 'Japan', country_code: 'JP', latitude: 35.6762, longitude: 139.6503, timezone: 'Asia/Tokyo', admin1: 'Tokyo' }] }) };
    }
    if (value.includes('time.now') || value.includes('worldtimeapi.org')) {
      return { ok: true, json: async () => ({ datetime: '2026-04-27T12:34:56Z', timezone: 'Asia/Tokyo' }) };
    }
    throw new Error('Unexpected self-test fetch URL: ' + value);
  };

  try {
    const time = await fetchCityTime('Asia/Tokyo');
    assert('fetchCityTime returns timezone and datetime', time.timezone === 'Asia/Tokyo' && Boolean(time.datetime));

    const locations = await searchLocations('Tokyo');
    assert('searchLocations returns results', Array.isArray(locations) && locations.length > 0);
  } catch (error) {
    assert('mocked fetch paths', false, error.message || String(error));
  } finally {
    globalThis.fetch = originalFetch;
  }

  return results;
}

/* ────────────────────────────────────────────────
   INIT
   ──────────────────────────────────────────────── */
async function init() {
  restoreDarkMode();

  // Start clock immediately
  tick();
  state.clockInterval = setInterval(tick, 1000);

  // Detect local location + weather
  await detectLocalLocation();

  // Show empty state in comparison grid
  renderEmptyState();
}

window.worldClock = {
  normalizeQuery,
  aliasFromQuery,
  searchLocations,
  fetchCityTime,
  parseTimeResponse,
  inferTimezoneFromRegion,
  runSelfTests,
};

init();
