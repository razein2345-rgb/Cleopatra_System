import { useState } from 'react';
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';

// Vite bundles Leaflet's default marker icon URLs incorrectly out of the
// box (a long-standing leaflet+bundler issue) — pointing them at the
// bundled asset URLs explicitly is the standard fix.
const markerIconDefault = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const DEFAULT_CENTER: [number, number] = [30.0444, 31.2357]; // Cairo — a reasonable default, not a real location.

function ClickToPlacePin({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * FEATURE-013 (2026-08-14, owner: "يكون في خريطة تفاعلية اقدر احدد المكان
 * منها") — click-to-drop-a-pin location picker, no API key/billing
 * (OpenStreetMap tiles via Leaflet, not Google Maps). Purely a lat/long
 * input widget — the caller owns the actual `latitude`/`longitude` state.
 */
export function LocationPickerMap({
  latitude,
  longitude,
  onChange,
}: {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
}) {
  const [center] = useState<[number, number]>(
    latitude !== null && longitude !== null ? [latitude, longitude] : DEFAULT_CENTER,
  );

  return (
    <div className="border-input overflow-hidden rounded-md border">
      <MapContainer center={center} zoom={13} style={{ height: '280px', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickToPlacePin onPick={onChange} />
        {latitude !== null && longitude !== null && (
          <Marker position={[latitude, longitude]} icon={markerIconDefault} />
        )}
      </MapContainer>
      <div className="text-muted-foreground bg-muted/30 p-2 text-xs">
        {latitude !== null && longitude !== null
          ? `الموقع المختار: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
          : 'دوس على الخريطة لتحديد المكان'}
      </div>
    </div>
  );
}
