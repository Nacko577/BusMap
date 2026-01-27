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
  coord: [number, number][];
}

interface  BusStop {
  id: string;
  name: string;
  position: [number, number];
}

const SUCEAVA_BUS_STOPS: BusStop[] = [
  { id: "cinema", name: "Cinema Burdujeni", position: [47.674534, 26.283158] },
  { id: "orizont-1", name: "Orizont", position: [47.671512, 26.278460] },
  { id: "orizont-2", name: "Orizont", position: [47.671554, 26.278390] },
  { id: "iric", name: "Iric", position: [47.669977, 26.275800] },
  { id: "carrefour-1", name: "Carrefour", position: [47.663480, 26.268229] },
  { id: "carrefour-2", name: "Carrefour", position: [47.664137, 26.269163] },
  { id: "bazar-1", name: "Bazar", position: [47.659398, 26.264730] },
  { id: "bazar-2", name: "Bazar", position: [47.660635, 26.266064] },
  { id: "sala-sporturi-1", name: "Sala Sporturilor", position: [47.656750, 26.262612] },
  { id: "sala-sporturi-2", name: "Sala Sporturilor", position: [47.656195, 26.261850] },
  { id: "petru-musat-1", name: "Petru Musat", position: [47.652760, 26.260102] },
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
  { id: "curcubeu", name: "Curcubeu", position: [47.643920, 26.240043] },
  { id: "nordic", name: "Nordic", position: [47.645752, 26.243032] },
  { id: "catedrala", name: "Catedrala", position: [47.646579, 26.248128 ] },
  { id: "gara-burdujeni", name: "Gara Burdujeni", position: [47.671365, 26.267088] },
  { id: "comlemn", name: "Comlemn", position: [47.674117, 26.269413] },
  { id: "cantina-1", name: "Cantina", position: [47.674325, 26.273063] },
  { id: "metro", name: "Metro", position: [47.636665, 26.236753] },
  { id: "cordus", name: "Cordus", position: [47.633495, 26.228043] },
  { id: "ion-creanga", name: "Ion Creanga", position: [47.635940, 26.231479] },
  { id: "moldova-1", name: "Moldova", position: [47.673304, 26.277998] },
  { id: "cantina-2", name: "Cantina", position: [47.674278, 26.273629] },
  { id: "ramiro", name: "Ramiro", position: [47.675144, 26.268476] },
  { id: "putna", name: "Putna", position: [47.673608, 26.266807] },
  { id: "centura", name: "Centura", position: [47.653478, 26.216904] },
  { id: "rulmentul", name: "Rulmentul", position: [47.652425, 26.208973] },
  { id: "bloc-ire", name: "Bloc I.R.E.", position: [47.635752, 26.225468] },
  { id: "confectia", name: "Confectia", position: [47.644845, 26.243226] },
  { id: "alimentara", name: "Alimentara Obcini", position: [47.635936, 26.229118] },
  { id: "torino-1", name: "Torino", position: [47.671070, 26.286509] },
  { id: "torino-2", name: "Torino", position: [47.671543, 26.287359] },
  { id: "depozit", name: "Depozit", position: [47.674128, 26.286894] },
  { id: "spital-neuro", name: "Spital Neuro", position: [47.675638, 26.286902] },
  { id: "gara-itcani", name: "Gara Itcani", position: [47.675810, 26.236741] },
  { id: "pasarela", name: "Pasarela", position: [47.674954, 26.240714] },
  { id: "straduinta", name: "Straduinta", position: [47.673506, 26.243686] },
  { id: "betty-ice", name: "Betty Ice", position: [47.669486, 26.242919] },
  { id: "petrom-1", name: "Petrom", position: [47.665321, 26.245956] },
  { id: "petrom-2", name: "Petrom", position: [47.664745, 26.246531] },
  { id: "autogara", name: "Autogara", position: [47.661197, 26.251567] },
  { id: "autobaza-tpl", name: "Autobaza TPL", position: [47.661330, 26.251033] },
  { id: "sticla-1", name: "Sticla", position: [47.658297, 26.256241] },
  { id: "sticla-2", name: "Sticla", position: [47.657852, 26.257459] },
  { id: "selgros", name: "Selgros", position: [47.668214, 26.244019] },
  { id: "coramed", name: "Coramed", position: [47.632214, 26.226952] },
  { id: "castel", name: "Castelul de apa", position: [47.632214, 26.226952] },
  { id: "profi", name: "Profi", position: [47.628222, 26.217233 ] },
  { id: "universitar-moara", name: "Campus Universitar Moara", position: [47.618179, 26.209817] },
  { id: "universitate", name: "Universitate", position: [47.641470, 26.245936] },
  { id: "piata-burdujeni", name: "Piata Burdujeni", position: [47.670847, 26.284400] },
  { id: "aeroport", name: "Aeroport Suceava", position: [47.685726, 26.349862] },
  { id: "eugen-dobrila-gropi", name: "Eugen Dobrila Gropi", position: [47.697393, 26.285325] },
  { id: "eugen-dobrila-centru", name: "Eugen Dobrila Centru", position: [47.695861, 26.286901] },
  { id: "burdujeni-sat-spac", name: "Burdujeni Sat Spac", position: [47.693204, 26.291595] },
  { id: "scoala-6", name: "Scoala 6", position: [47.685696, 26.290860] },
  { id: "tabita", name: "Tabita", position: [47.680546, 26.290181] },
  { id: "piata-mare", name: "Piata Mare", position: [47.646992, 26.261166] },
  { id: "parc-policlinica", name: "Parc Policlinica", position: [47.641000, 26.248511] },
  { id: "colegiu-alimentar", name: "Colegiul Alimentar", position: [47.647712, 26.244737] },
  { id: "narciselor", name: "Narciselor", position: [47.650227, 26.244218] },
  { id: "radio-as", name: "Radio As", position: [47.651363, 26.246125] },
  { id: "casa-pensii", name: "Casa de pensii", position: [47.653799, 26.247222] },
  { id: "pod-piatra", name: "Podul de piatra", position: [47.682412, 26.293926] },
  { id: "plevnei", name: "Burdujeni Sat / Plevnei", position: [47.691273, 26.298899] },
  { id: "traian-popovici", name: "Traian Popovici", position: [47.666893, 26.288315] },
  { id: "eroilor", name: "Eroilor", position: [47.668306, 26.285459] },
  { id: "stejari", name: "La Stejari", position: [47.684973, 26.270765] },
  { id: "fabrica-sucuri", name: "Fabrica Sucuri", position: [47.680084, 26.266239] },
  { id: "colt-doja", name: "Colt Gheorghe Doja", position: [47.676737, 26.263506] },
  { id: "pompe-apa", name: "Pompe Apa", position: [47.697686, 26.244660] },
  { id: "restaurant-Claudia", name: "Restaurant Claudia", position: [47.691485, 26.242767] },
  { id: "moara-veche", name: "Moara Veche", position: [47.687720, 26.241552] },
  { id: "pasarela-itcani", name: "Pasarela Itcani", position: [47.678041, 26.238278] },
  { id: "cernauti", name: "Cernauti", position: [47.653089, 26.257074] },
  { id: "cinema-modern", name: "Cinema Modern", position: [47.646362, 26.255543] },
  { id: "dimitrie-cantemir", name: "Dimitrie Cantemir", position: [47.644931, 26.246203] },
  { id: "zamca", name: "Hotel Zamca", position: [47.651407, 26.244795] },
  { id: "arcadia", name: "Clinica Arcadia", position: [47.650696, 26.248782] },
  { id: "grigore-ureche", name: "Grigore Ureche", position: [47.648750, 26.248351] },
  { id: "sf-nicolae", name: "Sfantul Nicolae", position: [47.646168, 26.256344] },
  { id: "gostat-itcani", name: "Gostat Itcani", position: [47.684900, 26.230216] },
  { id: "defelcom", name: "Defelcom", position: [47.682104, 26.234404] },
  { id: "scoala-itcani", name: "Scoala Itcani", position: [47.676510, 26.245320] },
  { id: "centrofarm", name: "Centrofarm", position: [7.676957, 26.251409] },
  { id: "aleea-dumbravii", name: "Aleea Dumbravii", position: [47.676034, 26.262821] },
  { id: "iulis", name: "Iulius Mall", position: [47.658755, 26.269398] },
];
//Converting coords to LatLngTuple
function toLatLngTupleArray(coords: [number, number][]): LatLngTuple[] {
  return coords
    .filter((c) => Array.isArray(c) && c.length === 2)
    .map((c) => [c[0], c[1]] as LatLngTuple);
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

function createBusStopIcon() {
  return L.divIcon({
    className: "bus-stop-icon",
    html: `<div style="
      background-color: yellow;
      border: 2px solid black;
      border-radius: 9999px;
      width: 12px;
      height: 12px;
      "></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
  });
}

export default function BusMap() {
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Record<string, BusRoute>>({});

  const fetchBuses = async () => {
    const response = await fetch("/api/buses", { cache: "no-store" });
    const data = await response.json(); 

    const updatedBuses: Bus[] = [];

    Object.entries(data).forEach(([busId, busData]) => {
      const bus = busData as any;

      if (bus["1"] === "on") {
        const lat = parseFloat(bus["2"]);
        const lng = parseFloat(bus["3"]);
        const line = bus["4"]?.trim();

        updatedBuses.push({
          id: busId,
          status: "on",
          latitude: lat,
          longitude: lng,
          line,
          route: [[lat, lng]],
        });
      }
    });

    setBuses(updatedBuses);
  };

  // Pre-load the bus routes as polylines
  const routePolylines = useMemo(() => {
    return Object.entries(routes).map(([busId, route]) => {
      if (!route?.coord || route.coord.length < 2) return null;

      return (
        <Polyline
          key={busId}
          positions={toLatLngTupleArray(route.coord)}
          pathOptions={{ color: "#12479E", weight: 4 }}
        />
      );
    });
  }, [routes]);

  useEffect(() => {
    const fetchRoutes = async () => {
      try {
        const res = await fetch("/api/routes", { cache: "no-store" });
        const data: Record<string, BusRoute> = await res.json();
        setRoutes(data);
      } catch (err) {
        console.error(err);
      }
    };
  
    fetchRoutes();
    fetchBuses();
  
    const interval = setInterval(fetchBuses, 2500);
  
    return () => clearInterval(interval);
  }, []);
  

  const busStopMarkers = useMemo(() => {
    return SUCEAVA_BUS_STOPS.map((stop) => (
      <Marker key={stop.id} position={stop.position} icon={createBusStopIcon()}>
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
  }, []);

  return (
    <MapContainer center={[47.67109, 26.27769]} zoom={13} scrollWheelZoom={true} preferCanvas={true}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
      />

      {/* Routes */}
      {routePolylines}

      {/* Bus stops */}
      {busStopMarkers}

      {/* Buses */}
      {buses.map((bus) => (
        <Marker key={bus.id} position={[bus.latitude, bus.longitude]} icon={createBusIcon(bus.line)}>
          <Popup>
            <div>
              <strong> Line: </strong> {bus.line || "?"} <br />
              <strong> Coordinates: </strong> <br />
              Lat: {bus.latitude.toFixed(6)} <br />
              Lng: {bus.longitude.toFixed(6)} <br />
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}