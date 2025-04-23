import { Room as RoomType } from '@/core/rooms/types/Room.ts'
// import { Room } from '@/core/rooms/types/Room.ts'

import { MembersIcon } from '@/components/icons/MembersIcon'

export function RoomItem({
  onClick,
  room,
}: {
  onClick: () => void
  room: RoomType
}) {
  return (
    <div
      className="flex items-center justify-between bg-white rounded-xl pr-8 hover:bg-hover-brand cursor-pointer duration-300"
      onClick={onClick}
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
            {room.categories?.map((category:any, index:any) => (
              <div className="flex items-center" key={index}>
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
    </div>
  )
}
