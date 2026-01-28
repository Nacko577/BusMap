"use client";

import { MapContainer, Marker, TileLayer, Popup, Polyline } from "react-leaflet";
import { useState, useEffect, useMemo } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { LatLngTuple } from "leaflet";

interface Bus {
  id: string;
  status: string;
  latitude: number;
  longitude: number;
  line: string;
  route: [number, number][];
}

interface BusRoute {
  line: string;
  coord: [number, number][];
  sourceBusId?: string;
}

interface BusStop {
  id: string;
  name: string;
  position: [number, number];
}

const SUCEAVA_BUS_STOPS: BusStop[] = [
  { id: "cinema", name: "Cinema Burdujeni", position: [47.674534, 26.283158] },
  { id: "orizont-1", name: "Orizont", position: [47.671512, 26.27846] },
  { id: "orizont-2", name: "Orizont", position: [47.671554, 26.27839] },
  { id: "iric", name: "Iric", position: [47.669977, 26.2758] },
  { id: "carrefour-1", name: "Carrefour", position: [47.66348, 26.268229] },
  { id: "carrefour-2", name: "Carrefour", position: [47.664137, 26.269163] },
  { id: "bazar-1", name: "Bazar", position: [47.659398, 26.26473] },
  { id: "bazar-2", name: "Bazar", position: [47.660635, 26.266064] },
  { id: "sala-sporturi-1", name: "Sala Sporturilor", position: [47.65675, 26.262612] },
  { id: "sala-sporturi-2", name: "Sala Sporturilor", position: [47.656195, 26.26185] },
  { id: "petru-musat-1", name: "Petru Musat", position: [47.65276, 26.260102] },
  { id: "petru-musat-2", name: "Petru Musat", position: [47.653026, 26.260349] },
  { id: "centru-1", name: "Centru", position: [47.645007, 26.262699] },
  { id: "centru-2", name: "Centru", position: [47.644943, 26.262692] },
  { id: "banca-1", name: "Banca", position: [47.640853, 26.258401] },
  { id: "banca-2", name: "Banca", position: [47.640782, 26.258611] },
  { id: "policlinica-1", name: "Policlinica", position: [47.640655, 26.249686] },
  { id: "policlinica-2", name: "Policlinica", position: [47.640599, 26.250251] },
  { id: "spital", name: "Spitalul Judetean", position: [47.638321, 26.241398] },
  { id: "obcini-flori-1", name: "Obcini flori", position: [47.639259, 26.236147] },
  { id: "obcini-flori-2", name: "Obcini Flori", position: [47.638987, 26.236239] },
  { id: "mobila", name: "Mobila", position: [47.641671, 26.236309] },
  { id: "curcubeu", name: "Curcubeu", position: [47.64392, 26.240043] },
  { id: "nordic", name: "Nordic", position: [47.645752, 26.243032] },
  { id: "catedrala", name: "Catedrala", position: [47.646579, 26.248128] },
  { id: "gara-burdujeni", name: "Gara Burdujeni", position: [47.671365, 26.267088] },
  { id: "comlemn", name: "Comlemn", position: [47.674117, 26.269413] },
  { id: "cantina-1", name: "Cantina", position: [47.674325, 26.273063] },
  { id: "metro", name: "Metro", position: [47.636665, 26.236753] },
  { id: "cordus", name: "Cordus", position: [47.633495, 26.228043] },
  { id: "ion-creanga", name: "Ion Creanga", position: [47.63594, 26.231479] },
  { id: "moldova-1", name: "Moldova", position: [47.673304, 26.277998] },
  { id: "cantina-2", name: "Cantina", position: [47.674278, 26.273629] },
  { id: "ramiro", name: "Ramiro", position: [47.675144, 26.268476] },
  { id: "putna", name: "Putna", position: [47.673608, 26.266807] },
  { id: "centura", name: "Centura", position: [47.653478, 26.216904] },
  { id: "bloc-ire", name: "Bloc I.R.E.", position: [47.635752, 26.225468] },
  { id: "confectia", name: "Confectia", position: [47.644845, 26.243226] },
  { id: "torino-1", name: "Torino", position: [47.67107, 26.286509] },
  { id: "torino-2", name: "Torino", position: [47.671543, 26.287359] },
  { id: "depozit", name: "Depozit", position: [47.674128, 26.286894] },
  { id: "spital-neuro", name: "Spital Neuro", position: [47.675638, 26.286902] },
  { id: "gara-itcani", name: "Gara Itcani", position: [47.67581, 26.236741] },
  { id: "pasarela", name: "Pasarela", position: [47.674954, 26.240714] },
  { id: "straduinta", name: "Straduinta", position: [47.673506, 26.243686] },
  { id: "betty-ice", name: "Betty Ice", position: [47.669486, 26.242919] },
  { id: "petrom-1", name: "Petrom", position: [47.665321, 26.245956] },
  { id: "petrom-2", name: "Petrom", position: [47.664745, 26.246531] },
  { id: "autogara", name: "Autogara", position: [47.661197, 26.251567] },
  { id: "autobaza-tpl", name: "Autobaza TPL", position: [47.66133, 26.251033] },
  { id: "sticla-1", name: "Sticla", position: [47.658297, 26.256241] },
  { id: "sticla-2", name: "Sticla", position: [47.657852, 26.257459] },
  { id: "selgros", name: "Selgros", position: [47.668214, 26.244019] },
  { id: "coramed", name: "Coramed", position: [47.632214, 26.226952] },
  { id: "castel", name: "Castelul de apa", position: [47.632214, 26.226952] },
  { id: "profi", name: "Profi", position: [47.628222, 26.217233] },
  { id: "universitar-moara", name: "Campus Universitar Moara", position: [47.618179, 26.209817] },
  { id: "universitate", name: "Universitate", position: [47.64147, 26.245936] },
  { id: "piata-burdujeni", name: "Piata Burdujeni", position: [47.670847, 26.2844] },
  { id: "aeroport", name: "Aeroport Suceava", position: [47.685726, 26.349862] },
  { id: "burdujeni-sat-spac", name: "Burdujeni Sat Spac", position: [47.693204, 26.291595] },
  { id: "scoala-6", name: "Scoala 6", position: [47.685696, 26.29086] },
  { id: "tabita", name: "Tabita", position: [47.680546, 26.290181] },
  { id: "piata-mare", name: "Piata Mare", position: [47.646992, 26.261166] },
  { id: "parc-policlinica", name: "Parc Policlinica", position: [47.641, 26.248511] },
  { id: "pompe-apa", name: "Pompe Apa", position: [47.697686, 26.24466] },
  { id: "restaurant-Claudia", name: "Restaurant Claudia", position: [47.691485, 26.242767] },
  { id: "moara-veche", name: "Moara Veche", position: [47.68772, 26.241552] },
  { id: "pasarela-itcani", name: "Pasarela Itcani", position: [47.678041, 26.238278] },
  { id: "cinema-modern", name: "Cinema Modern", position: [47.646362, 26.255543] },
  { id: "sf-nicolae", name: "Sfantul Nicolae", position: [47.646168, 26.256344] },
  { id: "gostat-itcani", name: "Gostat Itcani", position: [47.6849, 26.230216] },
  { id: "defelcom", name: "Defelcom", position: [47.682104, 26.234404] },
  { id: "scoala-itcani", name: "Scoala Itcani", position: [47.67651, 26.24532] },
  { id: "centrofarm", name: "Centrofarm", position: [47.676957, 26.251409] },
  { id: "aleea-dumbravii", name: "Aleea Dumbravii", position: [47.676034, 26.262821] },
  { id: "iulis", name: "Iulius Mall", position: [47.658755, 26.269398] },
];

function toLatLngTupleArray(coords: [number, number][]): LatLngTuple[] {
  return coords
    .filter((c) => Array.isArray(c) && c.length === 2)
    .map((c) => [c[0], c[1]] as LatLngTuple);
}

function haversineMeters(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function dedupeConsecutive(coords: [number, number][]) {
  if (coords.length <= 1) return coords;
  const out: [number, number][] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const last = out[out.length - 1];
    const cur = coords[i];
    if (last[0] !== cur[0] || last[1] !== cur[1]) out.push(cur);
  }
  return out;
}

function createBusIcon(line: string, isDark: boolean) {
  const bg = isDark ? "#15803d" : "#2563eb";
  const border = isDark ? "#052e16" : "#ffffff";
  const text = "#ffffff";

  return L.divIcon({
    className: "bus-icon",
    html: `<div style="
      background-color:${bg};
      color:${text};
      border:2px solid ${border};
      border-radius:50%;
      width:36px;
      height:36px;
      display:flex;
      align-items:center;
      justify-content:center;
      font-weight:800;
      font-size:12px;
      box-shadow:0 4px 8px rgba(0,0,0,0.35);
    ">${line || "?"}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function createBusStopIcon(isDark: boolean) {
  const fill = isDark ? "#fbbf24" : "#fde047";
  const stroke = isDark ? "#0f172a" : "#1f2937";

  return L.divIcon({
    className: "bus-stop-icon",
    html: `<div style="
      background-color:${fill};
      border:2px solid ${stroke};
      border-radius:9999px;
      width:12px;
      height:12px;
      box-shadow:0 2px 6px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

function createUserIcon(isDark: boolean) {
  const bg = isDark ? "#ffffff" : "#111827";
  const ring = isDark ? "#15803d" : "#2563eb";
  const dot = isDark ? "#15803d" : "#2563eb";

  return L.divIcon({
    className: "user-icon",
    html: `<div style="
      width:16px;height:16px;border-radius:9999px;
      background:${bg};
      border:3px solid ${ring};
      box-shadow:0 4px 10px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
    ">
      <div style="width:6px;height:6px;border-radius:9999px;background:${dot};"></div>
    </div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export default function BusMap() {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Record<string, BusRoute>>({});
  const [snappedRoutes, setSnappedRoutes] = useState<Record<string, [number, number][]>>({});
  const [selectedLine, setSelectedLine] = useState<string>("ALL");
  const [isDarkMap, setIsDarkMap] = useState(false);
  const [userPos, setUserPos] = useState<[number, number] | null>(null);
  const [nearestBusId, setNearestBusId] = useState<string | null>(null);
  const [nearestDistanceM, setNearestDistanceM] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  // ✅ NEW: toggle for nearest feature
  const [nearestEnabled, setNearestEnabled] = useState<boolean>(true);

  // Persist theme
  useEffect(() => {
    const saved = localStorage.getItem("mapTheme");
    if (saved === "dark") setIsDarkMap(true);
    if (saved === "light") setIsDarkMap(false);
  }, []);

  useEffect(() => {
    localStorage.setItem("mapTheme", isDarkMap ? "dark" : "light");
  }, [isDarkMap]);

  // ✅ NEW: when turning OFF, clear nearest state + user marker + errors
  useEffect(() => {
    if (!nearestEnabled) {
      setNearestBusId(null);
      setNearestDistanceM(null);
      setUserPos(null);
      setGeoError(null);
    }
  }, [nearestEnabled]);

  const tileConfig = isDarkMap
    ? {
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }
    : {
        url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      };

  const routeColor = isDarkMap ? "#15803d" : "#2563eb";

  const fetchBuses = async () => {
    const response = await fetch("/api/buses", { cache: "no-store" });
    if (!response.ok) return;

    const data = await response.json();

    const updatedBuses: Bus[] = [];
    Object.entries(data as Record<string, any>).forEach(([busId, busData]) => {
      const bus = busData as any;
      if (bus?.["1"] !== "on") return;

      const lat = parseFloat(bus["2"]);
      const lng = parseFloat(bus["3"]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const rawLine = bus["4"]?.trim() || "";
      if (rawLine === "" || rawLine === "NO_LINE" || rawLine.startsWith("NO_")) return;

      updatedBuses.push({
        id: busId,
        status: "on",
        latitude: lat,
        longitude: lng,
        line: rawLine,
        route: [[lat, lng]],
      });
    });

    setBuses(updatedBuses);
  };

  const fetchRoutesAndSnap = async () => {
    const res = await fetch("/api/routes", { cache: "no-store" });
    if (!res.ok) return;

    const data: Record<string, BusRoute> = await res.json();
    setRoutes(data);

    const entries = Object.entries(data);
    const snappedUpdates: Record<string, [number, number][]> = {};

    for (const [line, route] of entries) {
      if (!route?.coord || route.coord.length < 2) continue;
      if (line === "NO_LINE" || line.startsWith("NO_")) continue;

      const lastN = dedupeConsecutive(route.coord.slice(-90));

      const snapRes = await fetch("/api/osrm-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coords: lastN }),
      });

      let snapJson: any = null;
      try {
        snapJson = await snapRes.json();
      } catch {}

      if (snapRes.ok && Array.isArray(snapJson?.coords) && snapJson.coords.length >= 2) {
        snappedUpdates[line] = snapJson.coords;
      }
    }

    setSnappedRoutes((prev) => ({ ...prev, ...snappedUpdates }));
  };

  useEffect(() => {
    fetchRoutesAndSnap();
    fetchBuses();

    const interval = setInterval(fetchBuses, 2500);
    return () => clearInterval(interval);
  }, []);

  const availableLines = useMemo(() => {
    const fromRoutes = Object.keys(routes);
    const fromBuses = buses.map((b) => b.line).filter(Boolean);
    return Array.from(new Set([...fromRoutes, ...fromBuses]))
      .filter((x) => x && x !== "?" && x !== "NO_LINE" && !x.startsWith("NO_"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [routes, buses]);

  const filteredBuses = useMemo(() => {
    if (selectedLine === "ALL") return buses;
    return buses.filter((b) => b.line === selectedLine);
  }, [buses, selectedLine]);

  const routePolylines = useMemo(() => {
    const makePolyline = (key: string, coords: [number, number][], weight: number) => {
      if (!coords || coords.length < 2) return null;
      return (
        <Polyline
          key={key}
          positions={toLatLngTupleArray(coords)}
          pathOptions={{ color: routeColor, weight }}
        />
      );
    };

    if (selectedLine === "ALL") {
      return Object.entries(routes).map(([line, route]) => {
        if (line === "NO_LINE" || line.startsWith("NO_")) return null;
        const coords = snappedRoutes[line] ?? route.coord;
        return makePolyline(line, coords, isDarkMap ? 5 : 4);
      });
    }

    const route = routes[selectedLine];
    if (!route?.coord || route.coord.length < 2) return null;

    const coords = snappedRoutes[selectedLine] ?? route.coord;
    return makePolyline(selectedLine, coords, 5);
  }, [routes, snappedRoutes, selectedLine, routeColor, isDarkMap]);

  const busStopMarkers = useMemo(() => {
    const icon = createBusStopIcon(isDarkMap);
    return SUCEAVA_BUS_STOPS.map((stop) => (
      <Marker key={stop.id} position={stop.position} icon={icon}>
        <Popup>
          <div>
            <strong>{stop.name}</strong>
            <br />
            <strong>Lat:</strong> {stop.position[0].toFixed(6)}
            <br />
            <strong>Lng:</strong> {stop.position[1].toFixed(6)}
          </div>
        </Popup>
      </Marker>
    ));
  }, [isDarkMap]);

  const findClosestBus = () => {
    // ✅ NEW: if feature is off, ignore
    if (!nearestEnabled) return;

    setGeoError(null);

    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const me: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserPos(me);

        const candidates =
          selectedLine === "ALL" ? buses : buses.filter((b) => b.line === selectedLine);

        if (!candidates.length) {
          setGeoError("No buses available to compare right now.");
          return;
        }

        let bestBus: Bus | null = null;
        let bestDist = Infinity;

        for (const b of candidates) {
          const d = haversineMeters(me, [b.latitude, b.longitude]);
          if (d < bestDist) {
            bestDist = d;
            bestBus = b;
          }
        }

        if (!bestBus || !Number.isFinite(bestDist)) {
          setGeoError("Could not compute nearest bus.");
          return;
        }

        setNearestBusId(bestBus.id);
        setNearestDistanceM(bestDist);
      },
      (err) => {
        setGeoError(err.message || "Failed to get location.");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
    );
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* UI overlay */}
      <div
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 1000,
          background: "#ffffff",
          padding: "14px 16px",
          borderRadius: 14,
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          minWidth: 220,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: "#1f2937",
            letterSpacing: 0.3,
            textAlign: "center",
          }}
        >
          Linii
        </div>

        <select
          value={selectedLine}
          onChange={(e) => setSelectedLine(e.target.value)}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #cbd5e1",
            fontSize: 14,
            background: "#ffffff",
            color: "#111827",
            fontWeight: 600,
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="ALL">Toate liniile</option>
          {availableLines.map((line) => (
            <option key={line} value={line}>
              {line}
            </option>
          ))}
        </select>

        <button
          onClick={() => setIsDarkMap((v) => !v)}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: isDarkMap ? "#111827" : "#f9fafb",
            color: isDarkMap ? "#f9fafb" : "#374151",
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {isDarkMap ? "☀️ Mod lumina" : "🌙 Mod intuneric"}
        </button>

        {/* ✅ NEW: Nearest toggle */}
        <button
          onClick={() => setNearestEnabled((v) => !v)}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: nearestEnabled ? "#ecfeff" : "#fff1f2",
            color: "#111827",
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {nearestEnabled ? "✅ Cel mai apropiat autobuz: ON" : "⛔ Cel mai apropiat autobuz: OFF"}
        </button>

        {selectedLine !== "ALL" && (
          <button
            onClick={() => setSelectedLine("ALL")}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              color: "#374151",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Sterge
          </button>
        )}

        <button
          onClick={findClosestBus}
          disabled={!nearestEnabled} // ✅ NEW
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: nearestEnabled ? "#f9fafb" : "#e5e7eb",
            color: nearestEnabled ? "#374151" : "#6b7280",
            fontSize: 13,
            fontWeight: 800,
            cursor: nearestEnabled ? "pointer" : "not-allowed",
          }}
        >
          📍 Cel mai apropiat autobuz
        </button>

        {nearestEnabled && nearestDistanceM != null && nearestBusId && (
          <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", textAlign: "center" }}>
            Nearest: {Math.round(nearestDistanceM)} m
          </div>
        )}

        {nearestEnabled && geoError && (
          <div style={{ fontSize: 12, fontWeight: 700, color: "#b91c1c" }}>
            {geoError}
          </div>
        )}
      </div>

      <MapContainer center={[47.67109, 26.27769]} zoom={13} scrollWheelZoom preferCanvas>
        <TileLayer
          key={isDarkMap ? "dark" : "light"}
          attribution={tileConfig.attribution}
          url={tileConfig.url}
        />

        {/* Routes */}
        {routePolylines}

        {/* Bus stops */}
        {busStopMarkers}

        {/* ✅ only show user marker when feature on */}
        {nearestEnabled && userPos && (
          <Marker position={userPos} icon={createUserIcon(isDarkMap)}>
            <Popup>
              <strong>Locatia mea</strong>
            </Popup>
          </Marker>
        )}

        {/* Buses */}
        {filteredBuses.map((bus) => {
          const isNearest = nearestEnabled && bus.id === nearestBusId; // ✅ NEW

          const icon = isNearest
            ? L.divIcon({
                className: "bus-icon-nearest",
                html: `<div style="
                  background-color:${isDarkMap ? "#166534" : "#1d4ed8"};
                  color:#ffffff;
                  border:3px solid ${isDarkMap ? "#052e16" : "#ffffff"};
                  border-radius:50%;
                  width:46px;height:46px;
                  display:flex;align-items:center;justify-content:center;
                  font-weight:900;font-size:13px;
                  box-shadow:0 8px 16px rgba(0,0,0,0.45);
                ">${bus.line || "?"}</div>`,
                iconSize: [46, 46],
                iconAnchor: [23, 23],
              })
            : createBusIcon(bus.line, isDarkMap);

          return (
            <Marker key={bus.id} position={[bus.latitude, bus.longitude]} icon={icon}>
              <Popup>
                <div>
                  <strong>Line:</strong> {bus.line || "?"} <br />
                  <strong>Lat:</strong> {bus.latitude.toFixed(6)} <br />
                  <strong>Lng:</strong> {bus.longitude.toFixed(6)} <br />
                  {isNearest && nearestDistanceM != null && (
                    <>
                      <strong>Distance:</strong> {Math.round(nearestDistanceM)} m
                      <br />
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
