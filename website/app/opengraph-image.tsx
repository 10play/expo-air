import { ImageResponse } from 'next/og';

export const dynamic = 'force-static';

export const alt = 'expo-air - Vibe Coding for React Native';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default function Image() {
  const svg = `<svg viewBox="0 0 100 32" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="1" stdDeviation="3" flood-color="rgba(255,255,255,0.08)"/>
      </filter>
    </defs>
    <g filter="url(#shadow)">
      <path d="M 0 0 H 100 C 100 12.8, 82.5 3.2, 82.5 16 V 22 Q 82.5 32, 72.5 32 H 27.5 Q 17.5 32, 17.5 22 V 16 C 17.5 3.2, 0 12.8, 0 0 Z" fill="black" stroke="rgba(255,255,255,0.22)" stroke-width="0.8"/>
      <circle cx="50" cy="16" r="2.8" fill="#4CD964"/>
    </g>
  </svg>`;
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'black',
        }}
      >
        {/* eslint-disable-next-line */}
        <img src={dataUri} width={600} height={192} alt="" />
      </div>
    ),
    {
      ...size,
    },
  );
}
