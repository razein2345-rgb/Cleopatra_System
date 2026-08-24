import { useEffect, useState } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Search } from 'lucide-react';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

/** Owner (2026-08-17, "زرار بحث... يركز على المكان أوتوماتيك") — pans/zooms the live map instance whenever a search result lands, without re-mounting `MapContainer` (which would reset the user's own pan/zoom on every render). */
function FlyToOnSearch({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 15);
  }, [target, map]);
  return null;
}

/**
 * Owner (2026-08-17, "زرار بحث... يقدر يكتب اسم مكان ويركز عليه أوتوماتيك")
 * — free-text place-name search via Nominatim (OpenStreetMap's own
 * geocoder), matching this component's existing "no API key/billing"
 * constraint (FEATURE-013) exactly — same reasoning as the tile layer
 * above, not a new external dependency. A found result both pans the map
 * AND calls `onPick` — searching for a place IS picking it, same as
 * clicking the map directly.
 */
function LocationSearchBar({ onFound }: { onFound: (lat: number, lng: number) => void }) {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    const trimmed = query.trim();
    if (!trimmed || searching) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(trimmed)}`,
      );
      if (!res.ok) throw new Error('تعذر البحث عن الموقع');
      const results = (await res.json()) as { lat: string; lon: string }[];
      if (results.length === 0) {
        setError('مفيش نتايج لـ"' + trimmed + '"');
        return;
      }
      onFound(parseFloat(results[0].lat), parseFloat(results[0].lon));
    } catch {
      setError('تعذر البحث عن الموقع — تأكد من الاتصال بالإنترنت');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex gap-2 p-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          // Owner (2026-08-24, "لما بعمل سيرش عن مكان بيعمل ريفرش للصفحة
          // مش سيرش") — this bar sits inside the page's own <form> (the
          // Field Assignment creation form), so it was never allowed to be
          // a <form> of its own (nested <form>s are invalid HTML; the
          // browser routes the submit to the OUTER form instead of running
          // this bar's own search, which looks exactly like an unwanted
          // page refresh/save). A plain input + explicit Enter handling
          // avoids the whole class of bug rather than working around it.
          if (e.key === 'Enter') {
            e.preventDefault();
            void search();
          }
        }}
        placeholder="ابحث عن اسم مكان… مثال: ميدان التحرير، القاهرة"
        className="flex-1"
      />
      <Button type="button" variant="secondary" size="icon" disabled={searching} aria-label="بحث" onClick={() => void search()}>
        <Search className="size-4" />
      </Button>
      {error && <p className="text-destructive absolute mt-10 text-xs">{error}</p>}
    </div>
  );
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
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);

  const handleSearchResult = (lat: number, lng: number) => {
    onChange(lat, lng);
    setFlyTarget([lat, lng]);
  };

  return (
    <div className="border-input overflow-hidden rounded-md border">
      <div className="border-input relative border-b">
        <LocationSearchBar onFound={handleSearchResult} />
      </div>
      <MapContainer center={center} zoom={13} style={{ height: '280px', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickToPlacePin onPick={onChange} />
        <FlyToOnSearch target={flyTarget} />
        {latitude !== null && longitude !== null && (
          <Marker position={[latitude, longitude]} icon={markerIconDefault} />
        )}
      </MapContainer>
      <div className="text-muted-foreground bg-muted/30 p-2 text-xs">
        {latitude !== null && longitude !== null
          ? `الموقع المختار: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
          : 'دوس على الخريطة أو ابحث عن اسم مكان لتحديد الموقع'}
      </div>
    </div>
  );
}
