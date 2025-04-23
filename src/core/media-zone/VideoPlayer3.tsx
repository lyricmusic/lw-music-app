/* VideoPlayer3.tsx */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import throttle from 'lodash.throttle';
import { Socket, io } from 'socket.io-client';

interface Props {
  isHost?: boolean;
  roomId: string;
}

export function VideoPlayer3({ isHost = true, roomId }: Props) {
  const defaultUrl =
    'https://rutube.ru/video/2ca0735554dc75a6d41014183a520e51/?r=plwd';

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const socket = useRef<Socket>();
  const curTime = useRef(0);
  const playing = useRef(false);

  /* ---------- helpers ---------- */
  const extractID = (u: string) => u.match(/video\/([^/?]+)/)?.[1] ?? null;
  const masterUrl = defaultUrl;
  const hash = extractID(masterUrl);
  const src = hash ? `https://rutube.ru/play/embed/${hash}` : '';

  const post = (msg: object) =>
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify(msg),
      '*',
    );

  /* ---------- send updateTime (Host) ---------- */
  const sendUpdate = useMemo(
    () =>
      throttle((time: number, force = false) => {
        if (!isHost) return;
        // первая отправка без throttle
        if (force) socket.current?.emit('updateTime', { currentTime: time, isPlaying: playing.current, roomId, videoUrl: masterUrl });
        else socket.current?.emit('updateTime', { currentTime: time, isPlaying: playing.current, roomId, videoUrl: masterUrl });
      }, 1000),
    [isHost, roomId, masterUrl],
  );

  /* ---------- message from player ---------- */
  const onPlayerMsg = useCallback(
    (e: MessageEvent) => {
      let msg: any;
      try {
        msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }

      switch (msg.type) {
        case 'player:currentTime':
          curTime.current = msg.data.time;
          sendUpdate(msg.data.time);                // по throttle
          break;

        case 'player:changeState':
          if (msg.data.state === 'playing') {
            playing.current = true;
            sendUpdate(curTime.current, true);      // первая отправка сразу
          }
          if (msg.data.state === 'paused') {
            playing.current = false;
            sendUpdate(curTime.current, true);
          }
          break;
        default:
          break;
      }
    },
    [sendUpdate],
  );

  /* ---------- iframe ready ---------- */
  const onLoad = () => {
    // post({ type: 'player:play' });
    post({ type: 'player:mute' });
    socket.current?.emit('requestSync', { roomId });
  };

  /* ---------- socket.io ---------- */
  useEffect(() => {
    socket.current = io('http://localhost:3000');
    socket.current.emit('joinRoom', roomId);

    socket.current.on('syncTime', (d: any) => {
      if (isHost) return;

      const localTime = curTime.current;
      const needSeek = Math.abs(d.currentTime - localTime) > 1;
      const needPlayState = d.isPlaying !== playing.current;

      if (needSeek) {
        post({
          data: { time: d.currentTime },
          type: 'player:setCurrentTime',
        });
      }

      if (needPlayState) {
        post({ type: d.isPlaying ? 'player:play' : 'player:pause' });
      }
    });

    // Теперь функция-очистки возвращает void
    return () => {
      socket.current?.disconnect();
    };
  }, [isHost, roomId]);

  /* ---------- window message listener ---------- */
  useEffect(() => {
    window.addEventListener('message', onPlayerMsg);
    return () => window.removeEventListener('message', onPlayerMsg);
  }, [onPlayerMsg]);

  /* ---------- render ---------- */
  return (
    <div>
      {src && (
        <iframe
          allow="autoplay; encrypted-media"
          allowFullScreen
          frameBorder={0}
          height="390"
          onLoad={onLoad}
          ref={iframeRef}
          src={src}
          title="Rutube Player"
          width="640"
        />
      )}
    </div>
  );
}
