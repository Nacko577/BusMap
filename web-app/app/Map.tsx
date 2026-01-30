"use client";

import { MapContainer, Marker, TileLayer, Popup, Polyline } from "react-leaflet";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { LatLngTuple } from "leaflet";

import { SUCEAVA_BUS_STOPS } from "@/lib/busStops";

type LatLng = [number, number];

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

type PlanResponse =
  | { ok: false; error: string }
  | {
      ok: true;
      kind: "direct" | "transfer";
      lineA: string;
      lineB?: string;
      boardStopId: string;
      transferStopId?: string;
      destStopId: string;
      walk: LatLng[];
      rideA: LatLng[];
      rideB?: LatLng[];
    };

type LineMode = "BUSES_ONLY" | "ALL_ROUTES" | string;

function toLatLngTupleArray(coords: LatLng[]): LatLngTuple[] {
  return coords.map((c) => [c[0], c[1]] as LatLngTuple);
}

// ---------- math helpers ----------
function approxMetersPerDegLng(latDeg: number) {
  return 111320 * Math.cos((latDeg * Math.PI) / 180);
}
function approxMetersPerDegLat() {
  return 110540;
}
function distMeters(a: LatLng, b: LatLng) {
  const lat0 = (a[0] + b[0]) / 2;
  const mx = approxMetersPerDegLng(lat0);
  const my = approxMetersPerDegLat();
  const ax = a[1] * mx,
    ay = a[0] * my;
  const bx = b[1] * mx,
    by = b[0] * my;
  return Math.hypot(bx - ax, by - ay);
}

// ---------- route projection + direction ----------
function nearestIndexOnPolyline(coords: LatLng[], p: LatLng) {
  let bestI = 0;
  let bestD = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = distMeters(coords[i], p);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return bestI;
}

function cumulativeDistances(coords: LatLng[]) {
  const out: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    out.push(out[i - 1] + distMeters(coords[i - 1], coords[i]));
  }
  return out;
}

// forward distance along polyline, with wrap
function forwardArcMeters(cum: number[], iFrom: number, iTo: number) {
  const total = cum[cum.length - 1];
  if (iTo >= iFrom) return cum[iTo] - cum[iFrom];
  return total - cum[iFrom] + cum[iTo];
}

// Trim a polyline so it ends at the target stop, but avoid accidental early cuts on loop routes.
function trimPolylineToStop(poly: LatLng[] | undefined, stopPos: LatLng | undefined) {
  if (!poly || poly.length < 2 || !stopPos) return poly ?? null;

  // If it already ends close to the stop, keep it (server slice is usually correct).
  const END_OK_M = 90;
  const endDist = distMeters(poly[poly.length - 1], stopPos);
  if (endDist <= END_OK_M) return poly;

  // Prefer a match near the end: scan backwards for first point within radius.
  const HIT_M = 120;
  for (let i = poly.length - 1; i >= 0; i--) {
    if (distMeters(poly[i], stopPos) <= HIT_M) {
      const trimmed = poly.slice(0, i + 1);
      trimmed[trimmed.length - 1] = stopPos; // snap visually to marker
      return trimmed.length >= 2 ? trimmed : poly;
    }
  }

  // Fallback: closest point but end-biased (last 60%).
  const start = Math.floor(poly.length * 0.4);
  let bestI = start;
  let bestD = Infinity;
  for (let i = start; i < poly.length; i++) {
    const d = distMeters(poly[i], stopPos);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }

  const trimmed = poly.slice(0, bestI + 1);
  if (trimmed.length >= 2) trimmed[trimmed.length - 1] = stopPos;
  return trimmed.length >= 2 ? trimmed : poly;
}

// ---------- icons ----------
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
      width:36px;height:36px;
      display:flex;align-items:center;justify-content:center;
      font-weight:800;font-size:12px;
      box-shadow:0 4px 8px rgba(0,0,0,0.35);
    ">${line || "?"}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function createNearestBusIcon(line: string, isDark: boolean) {
  const bg = isDark ? "#db2777" : "#e11d48";
  const border = isDark ? "#111827" : "#ffffff";
  const pulse = isDark ? "rgba(236,72,153,0.35)" : "rgba(225,29,72,0.30)";

  return L.divIcon({
    className: "bus-icon-nearest",
    html: `
      <div style="position:relative;width:46px;height:46px;">
        <style>
          @keyframes busPulse { 0% { transform: scale(0.65); opacity: .65; } 100% { transform: scale(1.35); opacity: 0; } }
        </style>
        <div style="position:absolute;inset:-10px;border-radius:9999px;background:${pulse};animation: busPulse 1.35s ease-out infinite;"></div>
        <div style="position:absolute;inset:0;background:${bg};color:#fff;border:3px solid ${border};border-radius:9999px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;box-shadow:0 8px 16px rgba(0,0,0,0.45);">${line || "?"}</div>
      </div>
    `,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
  });
}

type StopKind = "normal" | "board" | "transfer" | "dest";

function createBusStopIcon(isDark: boolean, kind: StopKind = "normal") {
  const cfg: Record<StopKind, { fill: string; stroke: string; size: number; ring: string }> = {
    normal: {
      fill: isDark ? "#fbbf24" : "#fde047",
      stroke: isDark ? "#0f172a" : "#1f2937",
      size: 12,
      ring: "transparent",
    },
    board: {
      fill: isDark ? "#22c55e" : "#16a34a",
      stroke: isDark ? "#0f172a" : "#052e16",
      size: 16,
      ring: isDark ? "rgba(34,197,94,0.25)" : "rgba(22,163,74,0.22)",
    },
    transfer: {
      fill: isDark ? "#a855f7" : "#7c3aed",
      stroke: isDark ? "#0f172a" : "#2e1065",
      size: 16,
      ring: isDark ? "rgba(168,85,247,0.25)" : "rgba(124,58,237,0.22)",
    },
    dest: {
      fill: isDark ? "#ef4444" : "#dc2626",
      stroke: isDark ? "#0f172a" : "#7f1d1d",
      size: 18,
      ring: isDark ? "rgba(239,68,68,0.25)" : "rgba(220,38,38,0.22)",
    },
  };

  const { fill, stroke, size, ring } = cfg[kind];

  return L.divIcon({
    className: "bus-stop-icon",
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;">
        <div style="position:absolute;inset:-10px;border-radius:9999px;background:${ring};"></div>
        <div style="position:absolute;inset:0;background-color:${fill};border:2px solid ${stroke};border-radius:9999px;box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createUserIcon(isDark: boolean) {
  const bg = isDark ? "#ffffff" : "#111827";
  const ring = isDark ? "#15803d" : "#2563eb";
  const dot = isDark ? "#15803d" : "#2563eb";

  return L.divIcon({
    className: "user-icon",
    html: `<div style="width:16px;height:16px;border-radius:9999px;background:${bg};border:3px solid ${ring};box-shadow:0 4px 10px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
      <div style="width:6px;height:6px;border-radius:9999px;background:${dot};"></div>
    </div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function isSpecificLine(x: LineMode) {
  return x !== "BUSES_ONLY" && x !== "ALL_ROUTES";
}

export default function BusMap() {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Record<string, BusRoute>>({});

  // ✅ Default: show only buses, no routes
  const [selectedLine, setSelectedLine] = useState<LineMode>("BUSES_ONLY");

  const [isDarkMap, setIsDarkMap] = useState(false);

  // --- nearest bus to me (filter-aware) ---
  const [trackingNearest, setTrackingNearest] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const [userPos, setUserPos] = useState<LatLng | null>(null);
  const [nearestBusId, setNearestBusId] = useState<string | null>(null);
  const [nearestDistanceM, setNearestDistanceM] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  // --- planner ---
  const [destStopId, setDestStopId] = useState<string>("");
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  // Closest bus (direction-aware) during planning
  const [closestPlannedBusId, setClosestPlannedBusId] = useState<string | null>(null);
  const busPrevRef = useRef<Map<string, { idx: number; ts: number }>>(new Map());

  useEffect(() => {
    const saved = localStorage.getItem("mapTheme");
    if (saved === "dark") setIsDarkMap(true);
    if (saved === "light") setIsDarkMap(false);
  }, []);
  useEffect(() => {
    localStorage.setItem("mapTheme", isDarkMap ? "dark" : "light");
  }, [isDarkMap]);

  const tileConfig = isDarkMap
    ? {
        url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }
    : {
        url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      };

  const fetchBuses = useCallback(async () => {
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
  }, []);

  const fetchRoutes = useCallback(async () => {
    const res = await fetch("/api/routes", { cache: "no-store" });
    if (!res.ok) return;
    const data: Record<string, BusRoute> = await res.json();
    setRoutes(data);
  }, []);

  useEffect(() => {
    fetchRoutes();
    fetchBuses();
    const interval = setInterval(fetchBuses, 2500);
    const routesInterval = setInterval(fetchRoutes, 20000);
    return () => {
      clearInterval(interval);
      clearInterval(routesInterval);
    };
  }, [fetchRoutes, fetchBuses]);

  const availableLines = useMemo(() => {
    const fromRoutes = Object.keys(routes);
    const fromBuses = buses.map((b) => b.line).filter(Boolean);
    return Array.from(new Set([...fromRoutes, ...fromBuses]))
      .filter((x) => x && x !== "?" && x !== "NO_LINE" && !x.startsWith("NO_"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [routes, buses]);

  const showOnlyPlannedRoute = useMemo(() => Boolean(plan && plan.ok), [plan]);

  // Precompute cumulative distances for each route polyline (for "distance along route")
  const routeCumByLine = useMemo(() => {
    const out: Record<string, number[]> = {};
    for (const [line, r] of Object.entries(routes)) {
      if (r?.coord && r.coord.length >= 2) out[line] = cumulativeDistances(r.coord as LatLng[]);
    }
    return out;
  }, [routes]);

  // --- buses to render ---
  const busesToRender = useMemo(() => {
    if (plan && plan.ok) {
      const bus = buses.find((b) => b.id === closestPlannedBusId);
      return bus ? [bus] : [];
    }

    if (isSpecificLine(selectedLine)) return buses.filter((b) => b.line === selectedLine);
    return buses; // BUSES_ONLY or ALL_ROUTES => show all buses
  }, [plan, buses, closestPlannedBusId, selectedLine]);

  // --- base route polylines (only if not planning) ---
  const routePolylines = useMemo(() => {
    if (showOnlyPlannedRoute) return null;

    const style = { color: isDarkMap ? "#15803d" : "#2563eb", weight: isDarkMap ? 5 : 4, opacity: 1 };

    if (selectedLine === "ALL_ROUTES") {
      return Object.entries(routes).map(([line, route]) => {
        if (!route?.coord || route.coord.length < 2) return null;
        return (
          <Polyline
            key={`all-${line}`}
            positions={toLatLngTupleArray(route.coord as LatLng[])}
            pathOptions={style}
          />
        );
      });
    }

    if (isSpecificLine(selectedLine)) {
      const route = routes[selectedLine];
      if (!route?.coord || route.coord.length < 2) return null;
      return (
        <Polyline
          key={`one-${selectedLine}`}
          positions={toLatLngTupleArray(route.coord as LatLng[])}
          pathOptions={{ ...style, weight: 5 }}
        />
      );
    }

    // BUSES_ONLY => no routes
    return null;
  }, [routes, selectedLine, isDarkMap, showOnlyPlannedRoute]);

  // --- planner polylines ---
  const planPolylines = useMemo(() => {
    if (!plan || !plan.ok) return null;

    const walkStyle = {
      color: isDarkMap ? "#eab308" : "#ca8a04",
      weight: 4,
      opacity: 1,
      dashArray: "8 8",
    } as const;

    const rideAStyle = {
      color: isDarkMap ? "#22c55e" : "#16a34a",
      weight: 6,
      opacity: 1,
    } as const;

    const rideBStyle = {
      color: isDarkMap ? "#a855f7" : "#7c3aed",
      weight: 6,
      opacity: 1,
    } as const;

    const out: any[] = [];

    if (plan.walk?.length >= 2) {
      out.push(<Polyline key="plan-walk" positions={toLatLngTupleArray(plan.walk)} pathOptions={walkStyle} />);
    }

    const getStopPos = (id?: string) =>
      id ? (SUCEAVA_BUS_STOPS.find((s) => s.id === id)?.position as LatLng | undefined) : undefined;

    const rideAEndPos = plan.kind === "transfer" ? getStopPos(plan.transferStopId) : getStopPos(plan.destStopId);
    const rideATrimmed = trimPolylineToStop(plan.rideA, rideAEndPos);

    if (rideATrimmed && rideATrimmed.length >= 2) {
      out.push(<Polyline key="plan-rideA" positions={toLatLngTupleArray(rideATrimmed)} pathOptions={rideAStyle} />);
    }

    if (plan.kind === "transfer" && plan.rideB) {
      const rideBEndPos = getStopPos(plan.destStopId);
      const rideBTrimmed = trimPolylineToStop(plan.rideB, rideBEndPos);
      if (rideBTrimmed && rideBTrimmed.length >= 2) {
        out.push(<Polyline key="plan-rideB" positions={toLatLngTupleArray(rideBTrimmed)} pathOptions={rideBStyle} />);
      }
    }

    return out;
  }, [plan, isDarkMap]);

  // ---------- nearest bus to me (filter-aware) ----------
  const computeNearest = useCallback(
    (me: LatLng) => {
      const candidates = isSpecificLine(selectedLine) ? buses.filter((b) => b.line === selectedLine) : buses;

      if (!candidates.length) {
        setNearestBusId(null);
        setNearestDistanceM(null);
        setGeoError("No buses available to compare right now.");
        return;
      }

      let bestBus: Bus | null = null;
      let bestDist = Infinity;

      for (const b of candidates) {
        const d = distMeters(me, [b.latitude, b.longitude]);
        if (d < bestDist) {
          bestDist = d;
          bestBus = b;
        }
      }

      if (!bestBus || !Number.isFinite(bestDist)) {
        setGeoError("Could not compute nearest bus.");
        setNearestBusId(null);
        setNearestDistanceM(null);
        return;
      }

      setGeoError(null);
      setNearestBusId(bestBus.id);
      setNearestDistanceM(bestDist);
    },
    [buses, selectedLine]
  );

  const stopTrackingNearest = useCallback(() => {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTrackingNearest(false);
    setNearestBusId(null);
    setNearestDistanceM(null);
    setUserPos(null);
    setGeoError(null);
  }, []);

  const startTrackingNearest = useCallback(() => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser.");
      return;
    }
    if (watchIdRef.current != null) return;

    setTrackingNearest(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const me: LatLng = [pos.coords.latitude, pos.coords.longitude];
        setUserPos(me);
        computeNearest(me);
      },
      (err) => {
        setGeoError(err.message || "Failed to get location.");
        stopTrackingNearest();
      },
      { enableHighAccuracy: true, maximumAge: 1500, timeout: 12000 }
    );
  }, [computeNearest, stopTrackingNearest]);

  useEffect(() => {
    if (!trackingNearest || !userPos) return;
    computeNearest(userPos);
  }, [trackingNearest, userPos, buses, selectedLine, computeNearest]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // ---------- planner ----------
  const getMeOnce = useCallback(async (): Promise<LatLng> => {
    if (userPos) return userPos;
    return await new Promise<LatLng>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("Geolocation is not supported by your browser."));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
        (err) => reject(new Error(err.message || "Failed to get location.")),
        { enableHighAccuracy: true, maximumAge: 1500, timeout: 12000 }
      );
    });
  }, [userPos]);

  const runPlan = useCallback(
    async (nextDestStopId: string) => {
      setPlanError(null);
      setPlanLoading(true);

      try {
        const me = await getMeOnce();
        setUserPos(me);

        const res = await fetch("/api/plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ me, destStopId: nextDestStopId }),
        });

        const raw = await res.text();
        const ct = res.headers.get("content-type") || "";
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.slice(0, 300)}`);
        if (!ct.includes("application/json")) throw new Error(`Non-JSON response (${ct}): ${raw.slice(0, 300)}`);

        const data = JSON.parse(raw) as PlanResponse;
        setPlan(data);
        if (!data.ok) setPlanError(data.error);
      } catch (e: any) {
        const msg = e?.message || "Failed to plan route.";
        setPlan({ ok: false, error: msg });
        setPlanError(msg);
      } finally {
        setPlanLoading(false);
      }
    },
    [getMeOnce]
  );

  const clearPlan = useCallback(() => {
    setPlan(null);
    setPlanError(null);
    setPlanLoading(false);
    setDestStopId("");
    setClosestPlannedBusId(null);
    busPrevRef.current.clear();
  }, []);

  useEffect(() => {
    if (!destStopId) return;
    runPlan(destStopId);
  }, [destStopId, runPlan]);

  // ---------- direction-aware bus selection for planning ----------
  useEffect(() => {
    if (!plan || !plan.ok) {
      setClosestPlannedBusId(null);
      busPrevRef.current.clear();
      return;
    }

    const boardStop = SUCEAVA_BUS_STOPS.find((s) => s.id === plan.boardStopId);
    if (!boardStop) {
      setClosestPlannedBusId(null);
      return;
    }

    const lineRoute = routes[plan.lineA]?.coord as LatLng[] | undefined;
    const cum = routeCumByLine[plan.lineA];
    if (!lineRoute || lineRoute.length < 2 || !cum) {
      setClosestPlannedBusId(null);
      return;
    }

    const stopIdx = nearestIndexOnPolyline(lineRoute, boardStop.position);
    const candidates = buses.filter((b) => b.line === plan.lineA);
    if (!candidates.length) {
      setClosestPlannedBusId(null);
      return;
    }

    const now = Date.now();

    let bestId: string | null = null;
    let bestMeters = Infinity;

    for (const b of candidates) {
      const currIdx = nearestIndexOnPolyline(lineRoute, [b.latitude, b.longitude]);
      const prev = busPrevRef.current.get(b.id);
      busPrevRef.current.set(b.id, { idx: currIdx, ts: now });

      // Need at least 2 points in time to infer direction
      if (!prev) continue;

      const fwdMove = forwardArcMeters(cum, prev.idx, currIdx);
      const backMove = forwardArcMeters(cum, currIdx, prev.idx);
      const goingForward = fwdMove <= backMove;

      // ignore buses going away (for this polyline orientation)
      if (!goingForward) continue;

      const metersToBoard = forwardArcMeters(cum, currIdx, stopIdx);
      if (metersToBoard < bestMeters) {
        bestMeters = metersToBoard;
        bestId = b.id;
      }
    }

    // fallback (first tick / no history): closest by air distance to the board stop
    if (!bestId) {
      let fallback: string | null = null;
      let bestD = Infinity;
      for (const b of candidates) {
        const d = distMeters([b.latitude, b.longitude], boardStop.position);
        if (d < bestD) {
          bestD = d;
          fallback = b.id;
        }
      }
      setClosestPlannedBusId(fallback);
      return;
    }

    setClosestPlannedBusId(bestId);
  }, [plan, buses, routes, routeCumByLine]);

  // ---------- stop markers ----------
  const busStopMarkers = useMemo(() => {
    const boardId = plan && plan.ok ? plan.boardStopId : null;
    const transferId = plan && plan.ok && plan.kind === "transfer" ? plan.transferStopId ?? null : null;
    const destId = plan && plan.ok ? plan.destStopId : destStopId || null;

    return SUCEAVA_BUS_STOPS.map((stop) => {
      const kind: StopKind =
        destId === stop.id
          ? "dest"
          : transferId === stop.id
          ? "transfer"
          : boardId === stop.id
          ? "board"
          : "normal";

      const icon = createBusStopIcon(isDarkMap, kind);

      return (
        <Marker key={stop.id} position={stop.position as unknown as LatLngTuple} icon={icon}>
          <Popup>
            <div style={{ minWidth: 220 }}>
              <strong>{stop.name}</strong>
              <br />
              <strong>ID:</strong> {stop.id}
              <br />
              <strong>Lines:</strong> {stop.lines?.length ? stop.lines.join(", ") : "—"}
              <hr style={{ margin: "10px 0" }} />
              <button
                onClick={() => setDestStopId(stop.id)}
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#f9fafb",
                  fontSize: 13,
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                🧭 Plan to this stop
              </button>
            </div>
          </Popup>
        </Marker>
      );
    });
  }, [isDarkMap, plan, destStopId]);

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
          minWidth: 280,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, color: "#1f2937", textAlign: "center" }}>Linii</div>

        <select
          value={selectedLine}
          onChange={(e) => setSelectedLine(e.target.value as LineMode)}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #cbd5e1",
            fontSize: 14,
            background: "#ffffff",
            color: "#111827",
            fontWeight: 700,
            outline: "none",
            cursor: "pointer",
          }}
          disabled={showOnlyPlannedRoute}
          title={showOnlyPlannedRoute ? "Disabled while planning (planned route overrides)" : undefined}
        >
          <option value="BUSES_ONLY">Doar busuri</option>
          <option value="ALL_ROUTES">Toate rutele</option>
          {availableLines.map((line) => (
            <option key={line} value={line}>
              Linia {line}
            </option>
          ))}
        </select>

        <button
          onClick={trackingNearest ? stopTrackingNearest : startTrackingNearest}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: trackingNearest ? "#fff1f2" : "#ecfeff",
            color: "#111827",
            fontSize: 13,
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          {trackingNearest ? "⛔ Opreste busul cel mai apropiat" : "📍 Busul cel mai apropiat de mine"}
        </button>

        {trackingNearest && nearestDistanceM != null && nearestBusId && (
          <div style={{ fontSize: 12, fontWeight: 900, color: "#374151", textAlign: "center" }}>
            Aproape: {Math.round(nearestDistanceM)} m
          </div>
        )}

        {geoError && <div style={{ fontSize: 12, fontWeight: 900, color: "#b91c1c" }}>{geoError}</div>}

        <div style={{ height: 1, background: "#e5e7eb", margin: "4px 0" }} />

        <div style={{ fontSize: 14, fontWeight: 900, color: "#111827", textAlign: "center" }}>
          Planner (me → stație)
        </div>

        <select
          value={destStopId}
          onChange={(e) => setDestStopId(e.target.value)}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #cbd5e1",
            fontSize: 14,
            background: "#ffffff",
            color: "#111827",
            fontWeight: 700,
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="">Alege stația destinație…</option>
          {SUCEAVA_BUS_STOPS.slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.id})
              </option>
            ))}
        </select>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={clearPlan}
            disabled={!plan && !destStopId}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              color: "#374151",
              fontSize: 13,
              fontWeight: 900,
              cursor: !plan && !destStopId ? "not-allowed" : "pointer",
              opacity: !plan && !destStopId ? 0.6 : 1,
            }}
          >
            ✖ Clear
          </button>

          <button
            onClick={() => setIsDarkMap((v) => !v)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: isDarkMap ? "#111827" : "#f9fafb",
              color: isDarkMap ? "#f9fafb" : "#374151",
              fontSize: 13,
              fontWeight: 900,
              cursor: "pointer",
              minWidth: 120,
            }}
          >
            {isDarkMap ? "☀️ Lumina" : "🌙 Intuneric"}
          </button>
        </div>

        {planLoading && <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>⏳ Planning…</div>}
        {planError && <div style={{ fontSize: 12, fontWeight: 900, color: "#b91c1c" }}>{planError}</div>}
      </div>

      <MapContainer center={[47.67109, 26.27769]} zoom={13} scrollWheelZoom preferCanvas>
        <TileLayer key={isDarkMap ? "dark" : "light"} attribution={tileConfig.attribution} url={tileConfig.url} />

        {/* Planned route overrides everything */}
        {showOnlyPlannedRoute ? planPolylines : routePolylines}

        {busStopMarkers}

        {trackingNearest && userPos && (
          <Marker position={userPos} icon={createUserIcon(isDarkMap)}>
            <Popup>
              <strong>Locatia mea</strong>
            </Popup>
          </Marker>
        )}

        {/* live buses (always); in plan-mode only the chosen bus is shown */}
        {busesToRender.map((bus) => {
          const isPlannedClosest = showOnlyPlannedRoute && bus.id === closestPlannedBusId;
          const isNearestToMe = trackingNearest && bus.id === nearestBusId && !showOnlyPlannedRoute;

          const icon = isPlannedClosest || isNearestToMe ? createNearestBusIcon(bus.line, isDarkMap) : createBusIcon(bus.line, isDarkMap);

          return (
            <Marker key={bus.id} position={[bus.latitude, bus.longitude]} icon={icon}>
              <Popup>
                <div>
                  <strong>Line:</strong> {bus.line || "?"} <br />
                  <strong>Lat:</strong> {bus.latitude.toFixed(6)} <br />
                  <strong>Lng:</strong> {bus.longitude.toFixed(6)} <br />
                  {isNearestToMe && nearestDistanceM != null && (
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
