import type { SVGProps } from 'react';

interface LogoProps extends SVGProps<SVGSVGElement> {
  animated?: boolean;
}

export function Logo({ className, animated, ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 100 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`logo-svg ${className ?? ''}`}
      {...props}
    >
      <path
        d="M 0 0 H 100 C 100 12.8, 82.5 3.2, 82.5 16 V 22 Q 82.5 32, 72.5 32 H 27.5 Q 17.5 32, 17.5 22 V 16 C 17.5 3.2, 0 12.8, 0 0 Z"
        fill="black"
        className="logo-shape"
      />
      <circle
        cx="50"
        cy="16"
        r="2.8"
        fill="#4CD964"
        className={animated ? 'logo-dot-vibe' : undefined}
      />
    </svg>
  );
}
