'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { Photo } from '@/types/explorer';

export default function PhotoFrame({ photo, className = '', priority = false, thumbnail = false, sizes = '100vw' }: { photo: Photo; className?: string; priority?: boolean; thumbnail?: boolean; sizes?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`photo-frame ${className} ${failed ? 'photo-unavailable' : ''}`}>
      {failed ? <div className="photo-failure"><ImageOff size={22} aria-hidden="true" /><span>Fotografia indisponível</span></div> : (
        <Image src={thumbnail ? photo.thumbnailUrl : photo.url} alt={photo.alt} fill unoptimized loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : 'auto'} sizes={sizes} onError={() => setFailed(true)} />
      )}
    </div>
  );
}
