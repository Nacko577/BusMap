"use client";

import { MapContainer, Marker, TileLayer, Popup, Polyline } from "react-leaflet";
import { useState, useEffect, useMemo } from "react";
import "leaflet/dist/leaflet.css"; 
import L from 'leaflet';
import { LatLngTuple } from 'leaflet';

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
  coord: number[][];
}

//Converting coords to LatLngTuple
function toLatLngTupleArray(coords: number[][]): LatLngTuple[] {
  return coords
    .filter(c => c.length === 2)
    .map(c => [c[0], c[1]]);
}

//Bus icon
function createBusIcon(line: string) {
    return L.divIcon({
        className: 'bus-icon',
        html: `<div style = "
        background-color:rgb(18, 71, 158);
        color: white;
        border: 2px solid white;
        border-radius: 50%;
        width: 35px;
        height: 35px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 12px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        text-align: center;
        ">${line || '?'}</div>`,
        iconSize: [30, 30],
    })
}

function coordsEqual(a: number[], b: number[], tolerance = 0.00005) {
  return Math.abs(a[0] - b[0]) < tolerance && Math.abs(a[1] - b[1]) < tolerance;
}

//Approximate distance between to points in meters
function distance([lat1, lng1]: [number, number], [lat2, lng2]: [number, number]) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function detectBusStops(coords: number[][], minRepeats = 10, tolerance = 0.00005, minDistance = 500): [number, number][] {
  const stops: [number, number][] = [];
  let repeatCount = 1;
  let lastStop: [number, number] | null = null;

  // only keep valid [lat, lng] pairs
  const validCoords: [number, number][] = coords
    .filter(c => Array.isArray(c) && c.length === 2)
    .map(c => [c[0], c[1]] as [number, number]);

  for (let i = 1; i < validCoords.length; i++) {
    if (coordsEqual(validCoords[i], validCoords[i - 1], tolerance)) {
      repeatCount++;
    } else {
      if (repeatCount >= minRepeats) {
        const candidate = validCoords[i - 1];
        if (!lastStop || distance(candidate, lastStop) >= minDistance) {
          stops.push(candidate);
          lastStop = candidate;
        }
      }
      repeatCount = 1;
    }
  }

  // check last sequence
  if (repeatCount >= minRepeats) {
    const candidate = validCoords[validCoords.length - 1];
    if (!lastStop || distance(candidate, lastStop) >= minDistance) {
      stops.push(candidate);
    }
  }

  return stops;
}

function clusterStops(stops: [number, number][], maxDistance = 50): [number, number][] {
  const clusters: [number, number][][] = [];

  stops.forEach(stop => {
    let added = false;

    for(const cluster of clusters) {
      if(distance(cluster[0], stop) <= maxDistance) {
        cluster.push(stop);
        added = true;
        break;
      }
    }
    if(!added) 
      clusters.push([stop]);
  });
  return clusters.map(cluster => {
    const sum = cluster.reduce(
      (acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng],
      [0, 0]
    );
    return [sum[0] / cluster.length, sum[1] / cluster.length] as [number, number];
  });
}


export default function BusMap() {
    const [buses, setBuses] = useState<Bus[]>([]);
    const [routes, setRoutes] = useState<Record<string, BusRoute>>({});
    const [busStops, setBusStops] = useState<Record<string, [number, number][]>>({});

    useEffect(() =>{
      fetch('api/routes')
        .then(res => res.json())
        .then((data: Record<string, BusRoute>) => {
          setRoutes(data);

          const stops: Record<string, [number, number][]> = {};
          Object.entries(data).forEach(([line, route]) => {
            if(Array.isArray(route.coord) && route.coord.length > 0) {
              stops[line] = detectBusStops(route.coord, 3);
            } else {
              stops[line] = [];
            }
          });
          setBusStops(stops);
          })
        .catch(console.error);
        }, []);

    //Fetch live bus positions
    const fetchBuses = async () => {
        const response = await fetch('/api/buses');
        const data = await response.json();
      
        setBuses(prevBuses => {
          const busMap = new Map(prevBuses.map(b => [b.id, b]));
          const updatedBuses: Bus[] = [];
      
          Object.entries(data).forEach(([busId, busData]) => {
            const bus = busData as any;
      
            if (bus['1'] === 'on') {
              const lat = parseFloat(bus['2']);
              const lng = parseFloat(bus['3']);
              const line = bus['4']?.trim();
      
              updatedBuses.push({
                id: busId,
                status: 'on',
                latitude: lat,
                longitude: lng,
                line,
                route: [[lat, lng]],
              });
            }
          });
      

          fetch('/api/buses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedBuses)
          })

          return updatedBuses;
        });
      };

      

    useEffect(() => {
        fetchBuses();
        const interval = setInterval(fetchBuses, 2500);
        return () => clearInterval(interval);
    }, []); 

    useEffect(() => {
      fetch('/api/routes')
        .then(res => res.json())
        .then(data => setRoutes(data));
    })

    //Pre-load the bus routes as polylines
    const routePolylines = useMemo(() => {
      return Object.entries(routes).map(([line, route]) => {
        if (!route.coord || route.coord.length < 2) return null;

      return (
          <Polyline
          key={line}
          positions={toLatLngTupleArray(route.coord)}
          pathOptions={{ color: "#12479E", weight: 4 }}
          />
        );
      });
    }, [routes]);

    const busStopMarkers = useMemo(() => {
      if(!busStops) 
        return [];

      const markers: React.ReactNode[] = [];
      Object.entries(busStops).forEach(([line, stops]) => {
        stops.forEach((stop, idx) => {
          markers.push(
            <Marker
              key={`${line}-stop-${idx}`}
              position={stop}
              icon={L.divIcon({
                className: "bus-stop-icon",
                html: `<div style="
                  background-color: yellow;
                  border: 2px solid black;
                  border-radius: 50%;
                  width: 12px;
                  height: 12px;
                "></div>`,
                iconSize: [12, 12],
              })}
            />
          );
        });
      });
      return markers;
    }, [busStops]);

return (  
    <MapContainer center={[47.67109, 26.27769]} zoom={13} scrollWheelZoom={true} preferCanvas={true}>
  <TileLayer
    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
  />


    //Routes
    {routePolylines}


    //Bus stops
    {busStopMarkers}

    {buses.map((bus) => (
    <Marker
      key={bus.id}
      position={[bus.latitude, bus.longitude]}
      icon={createBusIcon(bus.line)}
    >

    //Buses
    <Popup>
        <div>
            <strong> Line: </strong> {bus.line || '?'} <br />
            <strong> Coordinates: </strong> <br />
            Lat: {bus.latitude.toFixed(6)} <br />
            Lng: {bus.longitude.toFixed(6)} <br />
        </div>
    </Popup>

    </Marker>
    ))}
    </MapContainer>
)};