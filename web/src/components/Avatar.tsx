import { useEffect, useState } from 'react';
import { avatarGradient, initialOf } from '@/utils';
import { Avatar as ShadcnAvatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface AvatarProps {
  src?: string;
  name?: string;
  seed?: string | number;
  size?: number;
  className?: string;
}

export function Avatar({ src, name, seed, size = 40, className = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  const showImg = src && !failed && loaded;
  const showFallback = !src || failed || !loaded;

  return (
    <ShadcnAvatar
      className={cn('shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {showFallback && (
        <AvatarFallback
          className="flex items-center justify-center font-medium text-white"
          style={{
            background: avatarGradient(seed, name),
            fontSize: size * 0.4,
          }}
        >
          {initialOf(name)}
        </AvatarFallback>
      )}
      {src && !failed && (
        <AvatarImage
          src={src}
          alt={name || ''}
          className="object-cover"
          style={{ opacity: showImg ? 1 : 0 }}
          onLoadingStatusChange={(status) => {
            if (status === 'loaded') setLoaded(true);
            if (status === 'error') setFailed(true);
          }}
        />
      )}
    </ShadcnAvatar>
  );
}
