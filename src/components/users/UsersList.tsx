import { ArrowUpIcon } from '@/components/icons/ArrowUpIcon.tsx'

export function UsersList() {
  return (
    <div className="flex flex-col pt-6 pb-2 px-7 h-1/2 bg-gray-block rounded-[20px]">
      <h2 className="flex justify-between items-center font-ultrabold text-[28px] mb-4 cursor-pointer">
        Пользователи{' '}
        <ArrowUpIcon className="fill-brand-color" sx={{ width: '16px' }} />
      </h2>
    </div>
  )
}
