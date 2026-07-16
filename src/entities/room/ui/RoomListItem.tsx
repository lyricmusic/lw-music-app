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
        <div className="w-[100px] h-[100px] rounded-2xl overflow-hidden mr-7">
          <img
            alt="Превью комнаты"
            className="w-full h-full object-cover"
            src={room.image}
          />
        </div>

        <div>
          <p className="text-2xl font-ultrabold">{room.name}</p>
          <div className="flex items-center">
            {room.categories?.map((category, index) => (
              <div className="flex items-center" key={category.id}>
                {index > 0 && (
                  <div className="w-[6px] h-[6px] bg-secondary-text mx-2 rounded-full"></div>
                )}
                <span className="text-[#5C5866]">{category.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center">
        <MembersIcon className="mr-2" />
        <span>27</span>
      </div>
    </button>
  )
}
