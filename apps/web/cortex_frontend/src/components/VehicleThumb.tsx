"use client";

import React from 'react';
import Image from 'next/image';

import { vehicleImageSrc } from '@/lib/media';
import { vehicleLabel } from '@/lib/vehicleLabels';

type Row = Record<string, any> | null | undefined;

type VehicleThumbProps = {
  row: Row;
  width?: number;
  height?: number;
  borderRadius?: number;
};

export function VehicleThumb({ row, width = 116, height = 72, borderRadius = 10 }: VehicleThumbProps) {
  const [failed, setFailed] = React.useState(false);
  const src = vehicleImageSrc(row);
  const label = vehicleLabel(row) || 'Vehículo';

  React.useEffect(() => {
    setFailed(false);
  }, [src]);

  const baseStyle: React.CSSProperties = React.useMemo(() => ({
    width,
    height,
    borderRadius,
    border: '1px solid #e2e8f0',
    background: '#f8fafc',
  }), [width, height, borderRadius]);

  if (!src || failed) {
    return (
      <div
        style={{
          ...baseStyle,
          borderStyle: 'dashed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94a3b8',
          fontSize: 11,
        }}
      >
        Sin foto
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={label}
      width={width}
      height={height}
      loading="lazy"
      style={{ ...baseStyle, objectFit: 'cover', display: 'block' }}
      onError={() => setFailed(true)}
      onLoadingComplete={(result) => {
        if (result.naturalWidth === 0) {
          setFailed(true);
        }
      }}
    />
  );
}
