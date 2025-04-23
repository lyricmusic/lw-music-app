import { Authorization } from '@/components/authorization/Authorization'

export function StartScreen() {
  return (
    <div className="h-screen flex justify-end bg-[url('@/assets/start-bg.png')] bg-no-repeat bg-left">
      <Authorization />
    </div>
  )
}
