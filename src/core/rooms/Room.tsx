import { useState } from 'react';
// import { useParams } from 'react-router-dom';

import { VideoPlayer3 } from '@/core/media-zone/VideoPlayer3';

import { Chat } from '@/components/chat/Chat';
import { UsersList } from '@/components/users/UsersList';

export function Room() {
  // const { id } = useParams();            // если нужен id из маршрута
  const [isHost, setIsHost] = useState<boolean>(true);

  return (
    <div className="flex h-full gap-x-2">
      {/* левая колонка: список юзеров + чат */}
      <div className="flex flex-col gap-2 max-w-[320px]">
        <UsersList />
        <Chat />
      </div>

      {/* правая колонка: видео + очередь */}
      <div className="w-full space-y-2">
        {/* чекбокс‑переключатель роли */}
        <label className="inline-flex items-center gap-2">
          <input
            checked={isHost}
            onChange={() => setIsHost((prev) => !prev)}
            type="checkbox"
          />
          Я ведущий (Host)
        </label>

        {/* сам плеер.
            key заставляет React пересоздать компонент при смене роли */}
        <VideoPlayer3
          isHost={isHost}
          key={isHost ? 'host' : 'viewer'}
          roomId="demo-room"
        />

        <div>ОЧЕРЕДЬ</div>
      </div>
    </div>
  );
}
