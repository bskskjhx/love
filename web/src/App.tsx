import { useEffect, useState } from 'react';
import { parseHash, setHash } from '@/utils';
import { useIsMobile } from '@/hooks/useIsMobile';
import { ChatList } from '@/components/ChatList';
import { ChatDetail } from '@/components/ChatDetail';

export default function App() {
  const [hash, setHashState] = useState(() => parseHash());
  const isMobile = useIsMobile();

  useEffect(() => {
    const onHash = () => setHashState(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Version check
  useEffect(() => {
    fetch('./version.json').then((r) => r.json()).then((data: { v?: string }) => {
      const stored = localStorage.getItem('app_version');
      if (data.v && stored && data.v !== stored) {
        localStorage.setItem('app_version', data.v);
        window.location.reload();
      } else if (data.v && !stored) {
        localStorage.setItem('app_version', data.v);
      }
    }).catch(() => {});
  }, []);

  const selectChat = (username: string) => setHash(username);
  const goBack = () => setHash();

  const showList = !isMobile || !hash.username;
  const showDetail = !isMobile || !!hash.username;

  return (
    <div className="app-viewport flex overflow-hidden bg-background">
      {showList && (
        <div
          className={`h-full min-h-0 min-w-0 ${isMobile ? 'w-full' : 'w-80 md:w-96'} border-r border-border`}
        >
          <ChatList activeUsername={hash.username} onSelect={selectChat} />
        </div>
      )}
      {showDetail && hash.username && (
        <div className="h-full min-h-0 min-w-0 flex-1">
          <ChatDetail
            key={hash.username + (hash.msgId ? `-${hash.msgId}` : '')}
            username={hash.username}
            initialMsgId={hash.msgId}
            onBack={goBack}
          />
        </div>
      )}
      {showDetail && !hash.username && !isMobile && (
        <div className="flex h-full min-h-0 min-w-0 flex-1 items-center justify-center bg-secondary">
          <p className="text-muted-foreground">选择一个群聊开始查看</p>
        </div>
      )}
    </div>
  );
}
