export function Globe() {
  return <div className="globe-art" aria-hidden="true">
    <div className="globe-orbit orbit-one" /><div className="globe-orbit orbit-two" />
    <svg viewBox="0 0 600 600" fill="none">
      <defs><radialGradient id="globe-shade" cx="30%" cy="25%"><stop stopColor="#34483d" /><stop offset=".67" stopColor="#182d2b" /><stop offset="1" stopColor="#0b181c" /></radialGradient><clipPath id="globe-clip"><circle cx="300" cy="300" r="234" /></clipPath><linearGradient id="land" x1="120" x2="500" y1="90" y2="490" gradientUnits="userSpaceOnUse"><stop stopColor="#bfb993" /><stop offset="1" stopColor="#557e69" /></linearGradient></defs>
      <circle cx="300" cy="300" r="234" fill="url(#globe-shade)" stroke="#96a591" strokeOpacity=".22" />
      <g clipPath="url(#globe-clip)">
        <g stroke="#c9ceaf" strokeOpacity=".13"><ellipse cx="300" cy="300" rx="82" ry="234" /><ellipse cx="300" cy="300" rx="165" ry="234" /><ellipse cx="300" cy="300" rx="234" ry="55" /><ellipse cx="300" cy="300" rx="234" ry="151" /><path d="M66 300h468M300 66v468M87 200h426M87 400h426" /></g>
        <g fill="url(#land)" fillOpacity=".66" stroke="#adbda0" strokeOpacity=".3" strokeWidth="1.5" transform="rotate(-12 300 300)">
          <path d="m107 163 31-21 29 3 27-23 46 12 7 20-24 19-2 24-29 20-6 36 17 18-8 20-24-4-9-25-24-15-9-32-27-17z" />
          <path d="m206 282 25 3 31 25 34 15-5 39-28 26-7 39-25 36-9-23 7-41-14-27-2-28-19-22z" />
          <path d="m266 108 27-20 29 6-1 27-19 19-30-8z" />
          <path d="m317 175 23-25 25 5 17-20 42 9 29 28 42 13 29 36-15 31-32-7-6 25-24-4-17-29-24 7-19-13-23 7-5-23-32 5-17-16 9-15z" />
          <path d="m331 241 36-4 26 25 17 5 3 39-15 13-9 40-20 25-16-19 1-27-25-19-16-36z" />
          <path d="m434 265 20 14 4 30-11 14-8-25zM466 320l15 12 8 23-15-6zM462 371l33-12 24 26-7 33-28 5-26-18zM393 362l8 16-8 28-8-8z" />
        </g>
      </g>
      <circle cx="300" cy="300" r="248" stroke="#bfa97a" strokeOpacity=".19" strokeDasharray="2 9" />
      <g fill="#e1c894"><circle cx="349" cy="243" r="4" /><circle cx="206" cy="337" r="3" /><circle cx="441" cy="201" r="3" /></g>
      <circle cx="349" cy="243" r="13" stroke="#e1c894" strokeOpacity=".5" /><path d="m349 243 79-68h92" stroke="#bfa97a" strokeOpacity=".6" />
    </svg>
    <span className="globe-note">A CURIOSIDADE NÃO TEM FRONTEIRAS.</span>
  </div>;
}
