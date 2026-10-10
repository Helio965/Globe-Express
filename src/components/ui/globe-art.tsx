export default function GlobeArt({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`globe-art ${compact ? 'globe-art-compact' : ''}`} aria-hidden="true">
      <div className="globe-halo" />
      <svg className="orbital-globe" viewBox="0 0 760 760" fill="none">
        <defs>
          <radialGradient id="planet-fill" cx="0.3" cy="0.25" r="0.8">
            <stop offset="0" stopColor="#384b44" />
            <stop offset="0.58" stopColor="#1c302b" />
            <stop offset="1" stopColor="#101b19" />
          </radialGradient>
          <linearGradient id="planet-line" x1="170" y1="110" x2="650" y2="650" gradientUnits="userSpaceOnUse">
            <stop stopColor="#a2b0a3" stopOpacity="0.55" />
            <stop offset="1" stopColor="#84978a" stopOpacity="0.07" />
          </linearGradient>
          <clipPath id="planet-clip"><circle cx="380" cy="380" r="276" /></clipPath>
        </defs>
        <g className="orbit-lines" stroke="#c9bda5" strokeOpacity="0.22">
          <circle cx="380" cy="380" r="339" strokeDasharray="1 10" />
          <circle cx="380" cy="380" r="316" strokeDasharray="102 650" transform="rotate(-35 380 380)" />
          <ellipse cx="380" cy="380" rx="369" ry="152" transform="rotate(-30 380 380)" />
        </g>
        <circle cx="380" cy="380" r="276" fill="url(#planet-fill)" stroke="url(#planet-line)" />
        <g clipPath="url(#planet-clip)" stroke="url(#planet-line)" strokeWidth="0.9">
          <ellipse cx="380" cy="380" rx="210" ry="276" />
          <ellipse cx="380" cy="380" rx="107" ry="276" />
          <path d="M380 104V656M104 380H656" />
          <ellipse cx="380" cy="240" rx="244" ry="38" />
          <ellipse cx="380" cy="320" rx="269" ry="49" />
          <ellipse cx="380" cy="440" rx="269" ry="49" />
          <ellipse cx="380" cy="520" rx="244" ry="38" />
          <path fill="#7c9682" fillOpacity="0.24" stroke="#a9b99f" strokeOpacity="0.3" d="m203 198 23-20 46 3 35 18 19 31-24 23-8 31-25 12-14 35 18 17 12 26-16 19-29-9-27-34-34-20-18-43-23-31 10-30 27-8Zm96 204 31 15 25 9 19 33-13 45-21 21-11 49-20 32-13-21-4-36-20-29-12-45 10-41 29-32Zm90-201 23-16 27 10 8 24 24-9 33 17 21-13 44 22 39 3 39 37 18 45-21 31-47-10-23 17-27-5-20 28-14-18-24-28-35-20-24 7-22-10-25 1-15-35-26-9 2-36 21-25Zm4 108 33 11 24 18 27 34-5 38-25 21-15 43-22 14-19-27-12-43-20-24-4-33 18-28 20-24Zm132 156 23-19 43 14 17 27-17 15-31-2-12 12-30-19 7-28Z" />
          <g stroke="#dcc091" strokeOpacity="0.45" strokeDasharray="2 9"><path d="M180 250Q355 110 557 288M304 482Q395 315 505 291M433 382Q528 365 564 475" /></g>
        </g>
        <g fill="#efc892">
          <circle cx="256" cy="266" r="3" /><circle cx="429" cy="254" r="3" /><circle cx="449" cy="371" r="3" /><circle cx="315" cy="461" r="3" /><circle cx="542" cy="475" r="3" />
          <circle cx="675" cy="211" r="4" /><circle cx="85" cy="494" r="3" />
        </g>
        <g stroke="#c9bda5" strokeOpacity="0.45"><path d="M379 27v18m-9-9h18M379 715v18m-9-9h18M27 379h18m-9-9v18M715 379h18m-9-9v18" /></g>
        <g fill="#aaa897" fontSize="10" fontFamily="monospace" letterSpacing="3"><text x="368" y="73">N</text><text x="367" y="696">S</text><text x="66" y="384">W</text><text x="686" y="384">E</text></g>
      </svg>
      <span className="globe-orbit-label">UM PLANETA. INFINITAS DESCOBERTAS.</span>
    </div>
  );
}
