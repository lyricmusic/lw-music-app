import { useParams, useSearchParams } from 'react-router-dom'

import { VideoPlayer3 } from '@/core/media-zone/VideoPlayer3'
import { Button } from '@mui/material'

export function Room() {
  const { id = 'demo-room' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const isHost = searchParams.get('role') !== 'viewer'

  const setRole = (role: 'host' | 'viewer') => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('role', role)
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <div className="h-full overflow-hidden">
      <main className="h-full w-full overflow-y-auto rounded-[20px] bg-[#ECEDF2] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-3">
          <div>
            <p className="font-neue">Режим локальной проверки</p>
            <p className="text-xs text-secondary-text">
              В первом окне выберите ведущего, во втором — слушателя.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => setRole('host')}
              variant={isHost ? 'contained' : 'outlined'}
            >
              Ведущий
            </Button>
            <Button
              onClick={() => setRole('viewer')}
              variant={isHost ? 'outlined' : 'contained'}
            >
              Слушатель
            </Button>
          </div>
        </div>

        <VideoPlayer3
          isHost={isHost}
          key={`${id}-${isHost ? 'host' : 'viewer'}`}
          roomId={id}
        />

        <div className="mt-3 rounded-2xl bg-white p-4 text-sm text-secondary-text">
          Очередь будет следующим слоем. Сейчас документ комнаты хранит только
          общее состояние YouTube-плеера.
        </div>
      </main>
    </div>
  )
}
