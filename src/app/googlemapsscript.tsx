"use client";

import { LoadScript, StandaloneSearchBox } from '@react-google-maps/api';
import { useRef } from 'react';

export default function GoogleMapsSearch({ onPlaceSelected }: { onPlaceSelected: (place: google.maps.places.PlaceResult) => void }) {
  const inputRef = useRef(null);
  const searchBoxRef = useRef<google.maps.places.SearchBox | null>(null);

  const handleLoad = (ref: google.maps.places.SearchBox) => {
    searchBoxRef.current = ref;
  };

  const handlePlacesChanged = () => {
    const places = searchBoxRef.current?.getPlaces();
    if (places && places[0]) {
      onPlaceSelected(places[0]);
    }
  };

  return (
    <LoadScript googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!} libraries={['places']}>
      <StandaloneSearchBox onLoad={handleLoad} onPlacesChanged={handlePlacesChanged}>
      <input
        type="text"
        ref={inputRef}
        placeholder="Введите адрес..."
        style={{ width: '100%' }}
        className="text-base p-2 border rounded w-[100ch]"
      />

      </StandaloneSearchBox>
    </LoadScript>
  );
}
