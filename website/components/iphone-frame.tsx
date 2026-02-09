import type { SVGProps } from 'react';

interface IPhoneFrameProps extends SVGProps<SVGSVGElement> {}

export function IPhoneFrame({ className, ...props }: IPhoneFrameProps) {
  return (
    <svg
      viewBox="0 0 430 884"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`iphone-frame ${className ?? ''}`}
      {...props}
    >
      {/* Side buttons */}
      {/* Silent switch (left) */}
      <rect x="-2" y="145" width="4" height="20" rx="2" fill="#2C2C2E" />
      {/* Volume up (left) */}
      <rect x="-2" y="180" width="4" height="35" rx="2" fill="#2C2C2E" />
      {/* Volume down (left) */}
      <rect x="-2" y="230" width="4" height="35" rx="2" fill="#2C2C2E" />
      {/* Power button (right) */}
      <rect x="428" y="200" width="4" height="65" rx="2" fill="#2C2C2E" />

      {/* Outer device frame */}
      <rect
        x="0"
        y="0"
        width="430"
        height="884"
        rx="55"
        ry="55"
        fill="#1C1C1E"
        className="iphone-frame-border"
      />

      {/* Screen */}
      <rect
        x="7"
        y="7"
        width="416"
        height="870"
        rx="50"
        ry="50"
        fill="#FFFFFF"
      />

      {/* Dynamic Island */}
      <rect
        x="152"
        y="21"
        width="126"
        height="37"
        rx="18.5"
        ry="18.5"
        fill="#1C1C1E"
      />
    </svg>
  );
}
