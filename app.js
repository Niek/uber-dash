const state = {
  tripsByDay: new Map(),
  selectedDay: null,
  isDarkMode: false,
  map: null,
  mapLayer: null,
  mapRenderId: 0,
  geocodeCache: loadGeocodeCache(),
  geocodeQueue: Promise.resolve(),
  failedGeocodeQueries: new Set(),
  tripRows: new Map(),
  tripMapLayers: new Map(),
  tripNumberById: new Map(),
  hoveredTripId: null,
};

const dom = {
  appRoot: document.getElementById("appRoot"),
  dropZone: document.getElementById("dropZone"),
  fileInput: document.getElementById("fileInput"),
  fileName: document.getElementById("fileName"),
  statusMessage: document.getElementById("statusMessage"),
  dashboard: document.getElementById("dashboard"),
  kpiCards: document.getElementById("kpiCards"),
  dayList: document.getElementById("dayList"),
  selectedDayTitle: document.getElementById("selectedDayTitle"),
  selectedDayMeta: document.getElementById("selectedDayMeta"),
  daySummary: document.getElementById("daySummary"),
  dayTrips: document.getElementById("dayTrips"),
  map: document.getElementById("map"),
};

const CSV_HEADER = [
  "Request Date (UTC)",
  "Request Time (UTC)",
  "First Name",
  "Last Name",
  "Employee ID",
  "Service",
  "City",
  "Pickup Address",
  "Drop-off Address",
  "Transaction Type",
  "Transaction Amount (Local Currency)",
  "Transaction Amount EUR",
];

const ROUTE_STYLE = {
  color: "#3273dc",
  weight: 3,
  opacity: 0.65,
};

const ROUTE_HIGHLIGHT_STYLE = {
  color: "#ffdd57",
  weight: 6,
  opacity: 0.95,
};

const PICKUP_STYLE = {
  radius: 5,
  color: "#209cee",
  fillColor: "#209cee",
  fillOpacity: 0.9,
};

const PICKUP_HIGHLIGHT_STYLE = {
  radius: 7,
  color: "#ffdd57",
  fillColor: "#ffdd57",
  fillOpacity: 1,
};

const DROPOFF_STYLE = {
  radius: 5,
  color: "#23d160",
  fillColor: "#23d160",
  fillOpacity: 0.9,
};

const DROPOFF_HIGHLIGHT_STYLE = {
  radius: 7,
  color: "#ffdd57",
  fillColor: "#ffdd57",
  fillOpacity: 1,
};

setupFileHandlers();
setupTheme();

function setupTheme() {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  applyTheme(mediaQuery.matches);

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", (event) => {
      applyTheme(event.matches);
    });
    return;
  }

  if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener((event) => {
      applyTheme(event.matches);
    });
  }
}

function applyTheme(isDarkMode) {
  state.isDarkMode = Boolean(isDarkMode);

  document.body.classList.toggle("has-background-black-bis", state.isDarkMode);
  dom.appRoot.classList.toggle("has-background-black-bis", state.isDarkMode);
  dom.appRoot.classList.toggle("has-text-light", state.isDarkMode);
  dom.appRoot.classList.toggle("has-background-white-bis", !state.isDarkMode);

  applyThemeToCurrentDom();
}

function applyThemeToCurrentDom() {
  const dark = state.isDarkMode;

  document.querySelectorAll(".box").forEach((element) => {
    element.classList.toggle("has-background-grey-darker", dark);
    element.classList.toggle("has-text-light", dark);
  });

  document.querySelectorAll(".table").forEach((element) => {
    element.classList.toggle("has-background-grey-darker", dark);
    element.classList.toggle("has-text-light", dark);
  });

  dom.dropZone.classList.toggle("has-background-white", !dark);
  dom.dropZone.classList.toggle("has-background-grey-dark", dark);
  dom.statusMessage.classList.toggle("has-text-light", dark);
}

async function handleCsvFile(file) {
  if (!file) {
    return;
  }

  dom.fileName.textContent = file.name;
  setStatus("Parsing file...", "info");

  try {
    const csvText = await file.text();
    const rows = parseCsv(csvText);
    const dataRows = findDataRows(rows);
    const trips = normalizeTrips(dataRows);

    if (trips.length === 0) {
      throw new Error("No trip rows were found in this CSV.");
    }

    state.tripsByDay = groupTripsByDay(trips);
    state.selectedDay = null;

    renderDashboard();
    setStatus(`Loaded ${trips.length} trips across ${state.tripsByDay.size} day(s).`, "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Failed to parse CSV.", "danger");
  }
}

function setupFileHandlers() {
  dom.fileInput.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    handleCsvFile(file);
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dom.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dom.dropZone.classList.add("has-background-link-light");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dom.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dom.dropZone.classList.remove("has-background-link-light");
    });
  });

  dom.dropZone.addEventListener("drop", (event) => {
    const [file] = event.dataTransfer.files || [];
    if (file) {
      handleCsvFile(file);
    }
  });
}

function setStatus(message, kind = "info") {
  const classMap = {
    info: "is-info",
    success: "is-success",
    danger: "is-danger",
    warning: "is-warning",
  };

  dom.statusMessage.className = `message ${classMap[kind] || classMap.info}`;
  dom.statusMessage.querySelector(".message-body").textContent = message;
  dom.statusMessage.classList.remove("is-hidden");
  applyThemeToCurrentDom();
}

function parseCsv(text) {
  const input = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (char === '"') {
      if (inQuotes && input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && input[i + 1] === "\n") {
        i += 1;
      }
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows.filter((currentRow) => currentRow.some((value) => value !== ""));
}

function findDataRows(rows) {
  const headerIndex = rows.findIndex((row) => row.length >= CSV_HEADER.length
    && CSV_HEADER.every((column, index) => row[index] === column));

  if (headerIndex === -1) {
    throw new Error("Could not find the Uber transactions header in this CSV.");
  }

  return rows.slice(headerIndex + 1).filter((row) => row.length >= CSV_HEADER.length);
}

function normalizeTrips(rows) {
  const grouped = new Map();
  let nextTripId = 1;

  for (const row of rows) {
    const trip = rowToTrip(row);
    if (!trip) {
      continue;
    }

    const key = [
      trip.dateKey,
      trip.time,
      trip.service,
      trip.city,
      trip.pickup,
      trip.dropoff,
    ].join("||");

    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        id: `trip-${nextTripId}`,
        ...trip,
        totalLocal: trip.localAmount,
        totalEur: trip.eurAmount,
        transactions: [{ type: trip.transactionType, local: trip.localAmount, eur: trip.eurAmount }],
      });
      nextTripId += 1;
      continue;
    }

    existing.totalLocal += trip.localAmount;
    existing.totalEur += trip.eurAmount;
    existing.transactions.push({ type: trip.transactionType, local: trip.localAmount, eur: trip.eurAmount });
  }

  const trips = [...grouped.values()].sort((a, b) => {
    const tsA = toTimestamp(a.dateKey, a.time);
    const tsB = toTimestamp(b.dateKey, b.time);
    return tsB - tsA;
  });

  return trips;
}

function rowToTrip(row) {
  const [dateRaw, timeRaw, firstName, lastName, employeeId, service, city, pickup, dropoff, transactionType, localAmountRaw, eurAmountRaw] = row;

  if (!dateRaw || !timeRaw || !pickup || !dropoff) {
    return null;
  }

  const dateKey = parseUsDateToIso(dateRaw);
  if (!dateKey) {
    return null;
  }

  return {
    dateKey,
    time: timeRaw,
    firstName,
    lastName,
    employeeId,
    service,
    city,
    pickup,
    dropoff,
    transactionType,
    localAmount: parseAmount(localAmountRaw),
    eurAmount: parseAmount(eurAmountRaw),
  };
}

function parseUsDateToIso(dateRaw) {
  const match = dateRaw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  const [, mm, dd, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function parseAmount(raw) {
  const normalized = String(raw ?? "").replace(/[^0-9.-]/g, "");
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function toTimestamp(dateKey, time12h) {
  const match = String(time12h).trim().match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
  if (!match) {
    return Number.NaN;
  }

  let hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const suffix = match[3].toUpperCase();

  if (suffix === "PM" && hours < 12) {
    hours += 12;
  }
  if (suffix === "AM" && hours === 12) {
    hours = 0;
  }

  return Date.parse(`${dateKey}T${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00Z`);
}

function groupTripsByDay(trips) {
  const grouped = new Map();

  for (const trip of trips) {
    const day = grouped.get(trip.dateKey);
    if (!day) {
      grouped.set(trip.dateKey, {
        dateKey: trip.dateKey,
        trips: [trip],
        totals: {
          eur: trip.totalEur,
          local: trip.totalLocal,
        },
      });
      continue;
    }

    day.trips.push(trip);
    day.totals.eur += trip.totalEur;
    day.totals.local += trip.totalLocal;
  }

  for (const day of grouped.values()) {
    day.trips.sort((a, b) => {
      const tsA = toTimestamp(a.dateKey, a.time);
      const tsB = toTimestamp(b.dateKey, b.time);
      return tsA - tsB;
    });
  }

  return new Map([...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0])));
}

function renderDashboard() {
  dom.dashboard.classList.remove("is-hidden");

  renderKpis();
  renderDayList();

  const firstDay = [...state.tripsByDay.keys()][0];
  if (firstDay) {
    selectDay(firstDay);
  }

  applyThemeToCurrentDom();
}

function renderKpis() {
  const days = [...state.tripsByDay.values()];
  const tripCount = days.reduce((sum, day) => sum + day.trips.length, 0);
  const totalEur = days.reduce((sum, day) => sum + day.totals.eur, 0);
  const avgTripEur = tripCount > 0 ? totalEur / tripCount : 0;

  const cards = [
    { label: "Days", value: String(days.length) },
    { label: "Trips", value: String(tripCount) },
    { label: "Total (EUR)", value: formatCurrency(totalEur, "EUR") },
    { label: "Avg / Trip", value: formatCurrency(avgTripEur, "EUR") },
  ];

  dom.kpiCards.innerHTML = cards.map((card) => `
    <div class="column is-6-mobile is-3-desktop">
      <div class="box has-text-centered">
        <p class="heading">${escapeHtml(card.label)}</p>
        <p class="title is-4">${escapeHtml(card.value)}</p>
      </div>
    </div>
  `).join("");

  applyThemeToCurrentDom();
}

function renderDayList() {
  const items = [...state.tripsByDay.values()].map((day) => {
    const isActive = day.dateKey === state.selectedDay;
    return `
      <li>
        <a class="${isActive ? "is-active" : ""}" data-day="${day.dateKey}">
          <span>${formatDay(day.dateKey)}</span>
          <span class="tag is-info">${day.trips.length} trips</span>
        </a>
      </li>
    `;
  }).join("");

  dom.dayList.innerHTML = `
    <p class="menu-label">Trip Days</p>
    <ul class="menu-list">
      ${items}
    </ul>
  `;

  dom.dayList.querySelectorAll("a[data-day]").forEach((link) => {
    link.addEventListener("click", () => {
      const { day } = link.dataset;
      selectDay(day);
    });
  });

  applyThemeToCurrentDom();
}

async function selectDay(dayKey) {
  if (!state.tripsByDay.has(dayKey)) {
    return;
  }

  setHoveredTrip(null);
  state.tripRows.clear();
  state.tripMapLayers.clear();
  state.tripNumberById.clear();

  state.selectedDay = dayKey;
  renderDayList();

  const day = state.tripsByDay.get(dayKey);
  dom.selectedDayTitle.textContent = formatDay(dayKey);
  dom.selectedDayMeta.textContent = `${day.trips.length} trips | ${formatCurrency(day.totals.eur, "EUR")}`;

  renderDaySummary(day);
  renderDayTrips(day);
  await renderDayMap(day);
}

function renderDaySummary(day) {
  const totals = day.trips.reduce((acc, trip) => {
    for (const transaction of trip.transactions) {
      const type = String(transaction.type || "").toLowerCase();
      if (type.includes("fare")) {
        acc.fare += transaction.eur;
      } else if (type.includes("tip")) {
        acc.tip += transaction.eur;
      }
    }
    return acc;
  }, { fare: 0, tip: 0 });

  const cards = [
    { label: "Fare (EUR)", value: formatCurrency(totals.fare, "EUR") },
    { label: "Tips (EUR)", value: formatCurrency(totals.tip, "EUR") },
    { label: "Total (EUR)", value: formatCurrency(day.totals.eur, "EUR") },
  ];

  dom.daySummary.innerHTML = cards.map((card) => `
    <div class="column is-4">
      <div class="box has-text-centered py-4 px-3">
        <p class="heading">${escapeHtml(card.label)}</p>
        <p class="title is-5">${escapeHtml(card.value)}</p>
      </div>
    </div>
  `).join("");

  applyThemeToCurrentDom();
}

function renderDayTrips(day) {
  state.tripNumberById.clear();

  const rows = day.trips.map((trip, index) => {
    const tripNumber = index + 1;
    state.tripNumberById.set(trip.id, tripNumber);

    const transactionSummary = trip.transactions
      .map((entry) => `${entry.type}: ${formatCurrency(entry.eur, "EUR")}`)
      .join(" · ");

    return `
      <tr data-trip-id="${escapeHtml(trip.id)}">
        <td>${tripNumber}</td>
        <td>${escapeHtml(trip.time)}</td>
        <td>${escapeHtml(trip.service)}</td>
        <td>${escapeHtml(trip.city)}</td>
        <td>${escapeHtml(trip.pickup)}</td>
        <td>${escapeHtml(trip.dropoff)}</td>
        <td>${escapeHtml(transactionSummary)}</td>
        <td>${escapeHtml(formatCurrency(trip.totalEur, "EUR"))}</td>
      </tr>
    `;
  }).join("");

  dom.dayTrips.innerHTML = `
    <table class="table is-fullwidth is-striped is-hoverable is-size-7-mobile">
      <thead>
        <tr>
          <th>#</th>
          <th>Time (UTC)</th>
          <th>Service</th>
          <th>City</th>
          <th>Pickup</th>
          <th>Drop-off</th>
          <th>Transactions</th>
          <th>Total EUR</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  state.tripRows.clear();
  dom.dayTrips.querySelectorAll("tr[data-trip-id]").forEach((row) => {
    const { tripId } = row.dataset;
    if (!tripId) {
      return;
    }

    state.tripRows.set(tripId, row);
    row.addEventListener("mouseenter", () => {
      setHoveredTrip(tripId);
    });
    row.addEventListener("mouseleave", () => {
      if (state.hoveredTripId === tripId) {
        setHoveredTrip(null);
      }
    });
  });

  applyThemeToCurrentDom();
}

async function renderDayMap(day) {
  const renderId = Date.now();
  state.mapRenderId = renderId;

  if (!state.map) {
    state.map = L.map("map", { preferCanvas: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(state.map);
    state.map.setView([20, 0], 2);
  }

  if (state.mapLayer) {
    state.mapLayer.remove();
  }

  const layer = L.layerGroup();
  state.mapLayer = layer;
  state.tripMapLayers.clear();

  setStatus("Resolving addresses for map...", "info");

  const bounds = [];
  let plottedTrips = 0;

  for (const trip of day.trips) {
    if (state.mapRenderId !== renderId) {
      return;
    }

    const [fromPoint, toPoint] = await Promise.all([
      geocodeAddress(trip.pickup, trip.city),
      geocodeAddress(trip.dropoff, trip.city),
    ]);

    if (!fromPoint || !toPoint) {
      continue;
    }

    const fromLatLng = L.latLng(fromPoint.lat, fromPoint.lon);
    const toLatLng = L.latLng(toPoint.lat, toPoint.lon);
    const midpoint = L.latLng(
      (fromLatLng.lat + toLatLng.lat) / 2,
      (fromLatLng.lng + toLatLng.lng) / 2,
    );
    const tripNumber = state.tripNumberById.get(trip.id) || plottedTrips + 1;

    bounds.push(fromLatLng, toLatLng);
    plottedTrips += 1;

    const route = L.polyline([fromLatLng, toLatLng], {
      ...ROUTE_STYLE,
    }).bindPopup(`
      <strong>${escapeHtml(trip.service)}</strong><br>
      Trip #${tripNumber}<br>
      ${escapeHtml(trip.time)}<br>
      ${escapeHtml(formatCurrency(trip.totalEur, "EUR"))}
    `).addTo(layer);

    const pickupMarker = L.circleMarker(fromLatLng, {
      ...PICKUP_STYLE,
    }).bindPopup(`<strong>Trip #${tripNumber} Pickup</strong><br>${escapeHtml(trip.pickup)}`).addTo(layer);

    const dropoffMarker = L.circleMarker(toLatLng, {
      ...DROPOFF_STYLE,
    }).bindPopup(`<strong>Trip #${tripNumber} Drop-off</strong><br>${escapeHtml(trip.dropoff)}`).addTo(layer);

    const numberMarker = L.marker(midpoint, {
      icon: createTripNumberIcon(tripNumber, false),
      keyboard: false,
      title: `Trip #${tripNumber}`,
    }).bindPopup(`
      <strong>Trip #${tripNumber}</strong><br>
      ${escapeHtml(trip.pickup)}<br>
      to<br>
      ${escapeHtml(trip.dropoff)}
    `).addTo(layer);

    [route, pickupMarker, dropoffMarker, numberMarker].forEach((mapLayerItem) => {
      mapLayerItem.on("mouseover", () => {
        setHoveredTrip(trip.id);
      });
      mapLayerItem.on("mouseout", () => {
        if (state.hoveredTripId === trip.id) {
          setHoveredTrip(null);
        }
      });
    });

    state.tripMapLayers.set(trip.id, {
      number: tripNumber,
      route,
      pickupMarker,
      dropoffMarker,
      numberMarker,
    });

    if (state.hoveredTripId === trip.id) {
      applyTripHighlight(trip.id, true);
    }
  }

  layer.addTo(state.map);

  if (bounds.length > 0) {
    state.map.fitBounds(bounds, { padding: [30, 30] });
    setStatus(`Showing ${plottedTrips} of ${day.trips.length} trip route(s) for ${formatDay(day.dateKey)}.`, "success");
  } else {
    state.map.setView([20, 0], 2);
    setStatus("Could not geocode enough addresses to plot this day.", "warning");
  }
}

function createTripNumberIcon(number, highlighted) {
  const background = highlighted ? "#ffdd57" : "#363636";
  const textColor = highlighted ? "#363636" : "#ffffff";

  return L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    html: `<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:999px;background:${background};color:${textColor};font-size:12px;font-weight:700;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.35);">${number}</span>`,
  });
}

function setHoveredTrip(tripId) {
  const nextTripId = tripId || null;
  if (state.hoveredTripId === nextTripId) {
    return;
  }

  const previousTripId = state.hoveredTripId;
  state.hoveredTripId = nextTripId;

  if (previousTripId) {
    applyTripHighlight(previousTripId, false);
  }

  if (nextTripId) {
    applyTripHighlight(nextTripId, true);
  }
}

function applyTripHighlight(tripId, isHighlighted) {
  const row = state.tripRows.get(tripId);
  if (row) {
    row.classList.toggle("is-selected", isHighlighted);
  }

  const mapLayers = state.tripMapLayers.get(tripId);
  if (!mapLayers) {
    return;
  }

  mapLayers.route.setStyle(isHighlighted ? ROUTE_HIGHLIGHT_STYLE : ROUTE_STYLE);
  mapLayers.pickupMarker.setStyle(isHighlighted ? PICKUP_HIGHLIGHT_STYLE : PICKUP_STYLE);
  mapLayers.dropoffMarker.setStyle(isHighlighted ? DROPOFF_HIGHLIGHT_STYLE : DROPOFF_STYLE);
  mapLayers.numberMarker.setIcon(createTripNumberIcon(mapLayers.number, isHighlighted));

  if (isHighlighted) {
    mapLayers.route.bringToFront();
    mapLayers.pickupMarker.bringToFront();
    mapLayers.dropoffMarker.bringToFront();
    mapLayers.numberMarker.setZIndexOffset(1000);
  } else {
    mapLayers.numberMarker.setZIndexOffset(0);
  }
}

function geocodeAddress(address, city = "") {
  if (!address) {
    return Promise.resolve(null);
  }

  const candidates = buildGeocodeCandidates(address, city);
  for (const candidate of candidates) {
    const cached = state.geocodeCache.get(candidate);
    if (cached) {
      return Promise.resolve(cached);
    }
  }

  state.geocodeQueue = state.geocodeQueue.then(async () => {
    for (const candidate of candidates) {
      if (state.failedGeocodeQueries.has(candidate)) {
        continue;
      }

      const location = await fetchGeocode(candidate);
      if (location) {
        for (const item of candidates) {
          state.geocodeCache.set(item, location);
        }
        saveGeocodeCache(state.geocodeCache);
        return location;
      }

      state.failedGeocodeQueries.add(candidate);
    }
    return null;
  }).catch(() => null);

  return state.geocodeQueue;
}

async function fetchGeocode(query) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("q", query);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const results = await response.json();
    if (!Array.isArray(results) || results.length === 0) {
      return null;
    }

    const location = {
      lat: Number.parseFloat(results[0].lat),
      lon: Number.parseFloat(results[0].lon),
    };

    if (Number.isFinite(location.lat) && Number.isFinite(location.lon)) {
      return location;
    }
    return null;
  } finally {
    // Keep requests polite for public Nominatim instances.
    await wait(1100);
  }
}

function buildGeocodeCandidates(address, city) {
  const addressPart = String(address || "").trim();
  const cityPart = String(city || "").trim();
  const fullQuery = [addressPart, cityPart].filter(Boolean).join(", ");
  const asciiAddress = addressPart.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
  const dashParts = asciiAddress.split(" - ").map((part) => part.trim()).filter(Boolean);
  const commaParts = asciiAddress.split(",").map((part) => part.trim()).filter(Boolean);

  const firstDash = dashParts[0] || "";
  const firstComma = commaParts[0] || "";
  const shortAddress = [firstDash || firstComma, cityPart].filter(Boolean).join(", ");

  return uniqueNonEmpty([
    fullQuery,
    addressPart,
    asciiAddress,
    shortAddress,
    firstDash,
    [firstComma, cityPart].filter(Boolean).join(", "),
  ]);
}

function uniqueNonEmpty(values) {
  const seen = new Set();
  const output = [];

  for (const value of values) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }

  return output;
}

function loadGeocodeCache() {
  try {
    const value = localStorage.getItem("uber-trip-geocode-cache");
    if (!value) {
      return new Map();
    }

    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return new Map();
    }

    return new Map(parsed);
  } catch {
    return new Map();
  }
}

function saveGeocodeCache(cache) {
  try {
    const serialized = JSON.stringify([...cache.entries()]);
    localStorage.setItem("uber-trip-geocode-cache", serialized);
  } catch {
    // Ignore storage errors.
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatDay(dateKey) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
}

function formatCurrency(value, currency) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
