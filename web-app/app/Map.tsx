"use client";

import { MapContainer, Marker, TileLayer, Popup} from "react-leaflet";
import { useState, useEffect } from "react";
import "leaflet/dist/leaflet.css"; 
import L from 'leaflet';

interface Bus {
    id: string;
    status: string;
    latitude: number;
    longitude: number;
    line: string;
}

export default function Map() {
    const [buses, setBuses] = useState<Bus[]>([]);

    const fetchBuses = async () => {
        const response = await fetch('/api');
        const data = await response.json();
        
        const buses: Bus[] = [];
        Object.entries(data).forEach(([busId, busData]) => {
            const bus = busData as any;
                if(bus['1'] === 'on') {
                    const lat = parseFloat(bus['2']);
                    const long = parseFloat(bus['3']);
                    const line = bus['4']?.trim();
                    buses.push({
                        id: busId,
                        status: 'on',
                        latitude: lat,
                        longitude: long,
                        line: line
                    });
                    }
            });
        setBuses(buses);
}
    useEffect(() => {
        fetchBuses();
        const interval = setInterval(fetchBuses, 1000);
        return () => clearInterval(interval);
    }, []); 

    useEffect(()=> {
        navigator.geolocation.getCurrentPosition(function(position) {
          console.log("Latitude is :", position.coords.latitude);
          console.log("Longitude is :", position.coords.longitude);
        });
      })


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

return (  
    <MapContainer center={[47.67109, 26.27769]} zoom={13} scrollWheelZoom={true}>
  <TileLayer
    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    url="https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"
  />
    {buses.map((bus) => (
        <Marker position={[bus.latitude, bus.longitude]} key={bus.id} icon={createBusIcon(bus.line)}>
        </Marker>       
    ))}
    </MapContainer>
)};
