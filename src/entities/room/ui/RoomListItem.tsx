import { MembersIcon } from '@/shared/ui/icons'

import type { Room } from '../model/types'

export function RoomListItem({
  onClick,
  room,
}: {
  onClick: () => void
  room: Room
}) {
  return (
    <button
      className="flex w-full items-center justify-between rounded-xl bg-white pr-8 text-left duration-300 hover:bg-hover-brand"
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center">
        <div className="mr-7 h-[100px] w-[100px] overflow-hidden rounded-2xl">
          <img
            alt={`Обложка комнаты «${room.name}»`}
            className="h-full w-full object-cover"
            src={room.imageUrl}
          />
        </div>

        <div>
          <p className="text-2xl font-bold">{room.name}</p>
          <div className="flex items-center">
            {room.categories.map((category, index) => (
              <div className="flex items-center" key={category.id}>
                {index > 0 && (
                  <div className="mx-2 h-[6px] w-[6px] rounded-full bg-secondary-text" />
                )}
                <span className="text-[#5C5866]">{category.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center">
        <MembersIcon className="mr-2" />
        <span>{room.participantCount}</span>
      </div>
    </button>
  )
}
