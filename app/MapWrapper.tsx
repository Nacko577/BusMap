"use client";
import dynamic from "next/dynamic";

const BusMap = dynamic(() => import("./Map"), { ssr: false });

export default function MapWrapper() {
    return <BusMap />;
}
