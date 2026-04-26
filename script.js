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
  const tz = state.local.timezone;
  els.localTime.textContent = formatTime(tz);
  els.localDate.textContent = formatDate(tz);
  els.localTz.textContent   = `${tz} · ${getUTCOffset(tz)}`;
}

/* ────────────────────────────────────────────────
   RENDER: COMPARISON CARD
   ──────────────────────────────────────────────── */

function renderCard(loc) {
  const diff = tzOffsetMinutes(loc.timezone);
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
    <div class="loc-country">${loc.country} · ${loc.timezone}</div>
    <div class="loc-time" data-tz="${loc.timezone}">--:--:--</div>
    <div class="loc-date" data-tz="${loc.timezone}">---</div>
    <div class="loc-tz">${getUTCOffset(loc.timezone)}</div>
    <div class="time-diff ${cls}">${label}</div>
    <div class="loc-divider"></div>
    <div class="loc-weather" id="lw-${loc.id}">
      <div class="weather-skeleton pulse" style="width:40px;height:40px;border-radius:8px;"></div>
    </div>`;

  els.grid.appendChild(card);

  // Bind remove
  card.querySelector('.loc-remove').addEventListener('click', () => removeCard(loc.id));

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
    const tz = el.dataset.tz;
    if (el.classList.contains('loc-time')) {
      el.textContent = formatTime(tz);
    } else if (el.classList.contains('loc-date')) {
      el.textContent = formatDate(tz);
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
    const results = await searchCities(query);
    currentSuggestions = results;
    activeSuggIdx = -1;
    renderSuggestions(results);
  } catch {
    closeSuggestions();
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
  const exists = state.cards.some(c => c.lat === r.lat && c.lon === r.lon);
  if (exists) {
    showToast(`${r.name} is already in the comparison!`);
    closeSuggestions();
    els.citySearch.value = '';
    return;
  }

  const loc = {
    id: Date.now() + Math.random(),
    name: r.name,
    country: r.country,
    countryCode: r.countryCode,
    lat: r.lat,
    lon: r.lon,
    timezone: r.timezone,
    flag: countryFlag(r.countryCode),
    admin1: r.admin1,
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

init();
