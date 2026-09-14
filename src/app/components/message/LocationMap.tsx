import { Icon } from 'leaflet';
import type { LatLngExpression } from 'leaflet';
import markerIconPng from 'leaflet/dist/images/marker-icon.png';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import { getTileUrl, TILE_ATTRIBUTION } from '$utils/tileUrl';

const markerIcon = new Icon({
  iconUrl: markerIconPng,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

type LocationMapProps = {
  coordinates: [number, number];
  className?: string;
};

export function LocationMap({ coordinates, className }: LocationMapProps) {
  const position: LatLngExpression = coordinates;

  return (
    <MapContainer
      center={position}
      zoom={16}
      scrollWheelZoom
      className={className}
      attributionControl
    >
      <TileLayer attribution={TILE_ATTRIBUTION} url={getTileUrl()} />
      <Marker
        position={position}
        eventHandlers={{
          mousedown: (event) => {
            event.originalEvent.preventDefault();
            event.originalEvent.stopPropagation();
          },
        }}
        icon={markerIcon}
      />
    </MapContainer>
  );
}
