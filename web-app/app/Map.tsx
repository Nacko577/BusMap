"use client";

import { MapContainer, Marker, TileLayer, Popup } from "react-leaflet";
import { useState, useEffect } from "react";
import "leaflet/dist/leaflet.css"; 
import L from 'leaflet';

interface Bus {
    id: string;
    status: string;
    latitude: number;
    longitude: number;
    line: string;
    route: [number, number][];
}

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

export default function BusMap() {
    const [buses, setBuses] = useState<Bus[]>([]);

    const fetchBuses = async () => {
        const response = await fetch('/api');
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
      
              const existingBus = busMap.get(busId);
      
              updatedBuses.push({
                id: busId,
                status: 'on',
                latitude: lat,
                longitude: lng,
                line,
                route: existingBus
                  ? [...existingBus.route, [lat, lng]]
                  : [[lat, lng]],
              });
            }
          });
      

          fetch('/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedBuses)
          })

          return updatedBuses;
        });
      };

      

    useEffect(() => {
        fetchBuses();
        const interval = setInterval(fetchBuses, 2000);
        return () => clearInterval(interval);
    }, []); 

return (  
    <MapContainer center={[47.67109, 26.27769]} zoom={13} scrollWheelZoom={true}>
  <TileLayer
    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
  />
    {buses.map((bus) => (
    <Marker
      key={bus.id}
      position={[bus.latitude, bus.longitude]}
      icon={createBusIcon(bus.line)}
    >
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