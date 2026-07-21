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
      className="flex w-full min-w-0 items-center gap-3 rounded-2xl border border-[#3D2759] bg-[#24143D] p-2 text-left text-[#F8F3FF] transition duration-300 hover:border-[#8F6CB5] hover:bg-[#32204B] sm:gap-5 sm:p-3 lg:pr-6"
      onClick={onClick}
      type="button"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-5 lg:gap-7">
        <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl sm:h-[88px] sm:w-[88px] lg:h-[100px] lg:w-[100px] lg:rounded-2xl">
          <img
            alt={`Обложка комнаты «${room.name}»`}
            className="h-full w-full object-cover"
            src={room.imageUrl}
          />
        </div>

        <div className="min-w-0">
          <p className="truncate text-lg font-bold sm:text-xl lg:text-2xl">
            {room.name}
          </p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            {room.categories.map((category, index) => (
              <div className="flex items-center" key={category.id}>
                {index > 0 && (
                  <div className="mr-2 h-1 w-1 rounded-full bg-[#8F6CB5]" />
                )}
                <span className="text-xs text-[#CDBCE2] sm:text-sm lg:text-base">
                  {category.title}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center rounded-full bg-[#32204B] px-2.5 py-2 text-sm text-[#E7DDF4] sm:px-3">
        <MembersIcon className="mr-1.5" sx={{ width: { xs: 18, sm: 22 } }} />
        <span aria-label={`Участников: ${room.participantCount}`}>
          {room.participantCount}
        </span>
      </div>
    </button>
  )
}
