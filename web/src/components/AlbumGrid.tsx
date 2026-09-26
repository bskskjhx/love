import { useState } from 'react';
import { Play } from 'lucide-react';
import type { AlbumItem } from '@/types';
import { fmtDur } from '@/utils';

interface AlbumGridProps {
  items: AlbumItem[];
  onOpen: (index: number) => void;
}

export function AlbumGrid({ items, onOpen }: AlbumGridProps) {
  const count = items.length;
  const cols = count <= 1 ? 1 : count === 2 ? 2 : count <= 4 ? 2 : 3;

  return (
    <div
      className="grid w-full max-w-[320px] gap-0.5 overflow-hidden rounded-xl"
      // minmax(0,1fr) keeps every column shrinkable so a wide thumbnail cannot
      // push the bubble past the screen edge.
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {items.map((item, idx) => (
        <Thumb key={item.id} item={item} index={idx} total={count} onClick={() => onOpen(idx)} />
      ))}
    </div>
  );
}

function Thumb({
  item, index, total, onClick,
}: {
  item: AlbumItem;
  index: number;
  total: number;
  onClick: () => void;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex aspect-square items-center justify-center bg-muted text-xs text-muted-foreground">
        [图片]
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`查看第 ${index + 1} / ${total} 张媒体`}
      className="relative aspect-square w-full overflow-hidden bg-muted transition-opacity active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <img
        src={item.thumbSrc}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
        onError={() => setFailed(true)}
      />
      {item.kind === 'video' && (
        <>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white">
              <Play size={16} aria-hidden="true" />
            </div>
          </div>
          {item.dur && (
            <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">
              {fmtDur(item.dur)}
            </span>
          )}
        </>
      )}
    </button>
  );
}
