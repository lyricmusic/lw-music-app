import { Route, Routes } from 'react-router-dom'

import { Room } from '@/core/rooms/Room.tsx'
import { Rooms } from '@/core/rooms/Rooms'

import { Header } from '@/components/Header'

export function MainScreen() {
  return (
    <div className="flex flex-col justify-between bg-brand-color h-screen p-0.5 gap-y-[6px]">
      <Header />
      {/*<Rooms />*/}
      <div className="h-full">
        <Routes>
          <Route element={<Rooms />} path="/rooms" />
          <Route element={<Room />} path="/rooms/:id" />
        </Routes>
      </div>
    </div>
  )
}
