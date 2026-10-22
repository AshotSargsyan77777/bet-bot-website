import { useState } from "react";

/** Team / league logo from API-Football's image CDN; hidden if it fails to load. */
export function TeamLogo({ src, size = 24, alt = "" }: { src?: string | null; size?: number; alt?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return (
    <img
      className="team-logo"
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
