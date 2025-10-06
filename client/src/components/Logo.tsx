interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Logo({ className = "", size = "md" }: LogoProps) {
  const sizeClasses = {
    sm: "h-8",
    md: "h-10",
    lg: "h-12"
  };

  return (
    <div className={`flex items-center ${className}`}>
      <svg 
        viewBox="0 0 320 110" 
        className={`${sizeClasses[size]} w-auto`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="carGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#FCD34D', stopOpacity: 1 }} />
            <stop offset="50%" style={{ stopColor: '#FB923C', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#F97316', stopOpacity: 1 }} />
          </linearGradient>
          <linearGradient id="textGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: '#FCD34D', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#FB923C', stopOpacity: 1 }} />
          </linearGradient>
          <linearGradient id="archGradient" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: '#FCD34D', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#FB923C', stopOpacity: 1 }} />
          </linearGradient>
        </defs>
        
        <g transform="translate(160, 50)">
          <path 
            d="M -70 -25 Q -70 -45 -30 -48 Q 0 -48 30 -48 Q 70 -45 70 -25" 
            stroke="url(#archGradient)" 
            strokeWidth="4.5" 
            fill="none" 
            strokeLinecap="round"
          />
          <path 
            d="M -60 -22 Q -60 -38 -25 -40 Q 0 -40 25 -40 Q 60 -38 60 -22" 
            stroke="#000" 
            strokeWidth="3" 
            fill="none" 
            strokeLinecap="round"
          />
          <path 
            d="M -55 -20 Q -55 -32 -22 -34 Q 0 -34 22 -34 Q 55 -32 55 -20" 
            stroke="url(#archGradient)" 
            strokeWidth="2.5" 
            fill="none" 
            strokeLinecap="round"
          />
          
          <path 
            d="M -45 -15 Q -48 -22 -45 -24 L -15 -28 Q -10 -28 -8 -24 L -5 -15 Q -5 -12 -8 -12 L 8 -12 Q 10 -12 10 -15 L 13 -24 Q 15 -28 20 -28 L 45 -24 Q 48 -22 45 -15 L 40 8 Q 40 12 36 12 L -36 12 Q -40 12 -40 8 Z" 
            fill="url(#carGradient)" 
            stroke="#000" 
            strokeWidth="2"
          />
          
          <ellipse cx="-32" cy="12" rx="7" ry="7" fill="#1F2937" stroke="#000" strokeWidth="1.5" />
          <ellipse cx="-32" cy="12" rx="3" ry="3" fill="#4B5563" />
          
          <ellipse cx="32" cy="12" rx="7" ry="7" fill="#1F2937" stroke="#000" strokeWidth="1.5" />
          <ellipse cx="32" cy="12" rx="3" ry="3" fill="#4B5563" />
          
          <path 
            d="M -42 -18 L -16 -22 L -14 -12 L -40 -10 Z" 
            fill="#87CEEB" 
            opacity="0.7" 
            stroke="#000" 
            strokeWidth="0.8"
          />
          <path 
            d="M 16 -22 L 42 -18 L 40 -10 L 14 -12 Z" 
            fill="#87CEEB" 
            opacity="0.7" 
            stroke="#000" 
            strokeWidth="0.8"
          />
          
          <ellipse cx="0" cy="-5" rx="2.5" ry="2.5" fill="#FFF" opacity="0.9" />
          
          <path 
            d="M -35 3 L -28 3 M 28 3 L 35 3" 
            stroke="#F97316" 
            strokeWidth="1.5" 
            strokeLinecap="round"
          />
        </g>
        
        <text 
          x="160" 
          y="80" 
          fontFamily="Inter, system-ui, sans-serif" 
          fontSize="20" 
          fontWeight="800"
          textAnchor="middle"
          fill="url(#textGradient)"
          stroke="#000"
          strokeWidth="0.4"
          letterSpacing="1"
        >
          RONAK
        </text>
        
        <text 
          x="160" 
          y="98" 
          fontFamily="Inter, system-ui, sans-serif" 
          fontSize="11" 
          fontWeight="700"
          textAnchor="middle"
          fill="#1F2937"
          letterSpacing="2"
        >
          MOTOR
        </text>
      </svg>
    </div>
  );
}
