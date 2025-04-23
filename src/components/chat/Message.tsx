// import { useSelector } from 'react-redux'
//
// import { clsx } from 'clsx'
//
// import { MemberIcon } from '@/components/icons/MemberIcon.tsx'
//
// // TODO поправить типы
// export function Message({ message, user }: { message: any; user: any }) {
//   const userUid = useSelector(state => state.user?.uid)
//   const isMyMessage = message.uid === userUid
//
//   return (
//     <div className={clsx('flex', isMyMessage && 'justify-end')}>
//       {!isMyMessage && (
//         <div className="flex justify-center items-center w-7 h-7 rounded-full mr-2 bg-accent">
//           {user?.avatar ? (
//             <img alt="Аватар" src={user?.avatar} />
//           ) : (
//             <MemberIcon className="fill-brand-color" sx={{ width: '14px' }} />
//           )}
//         </div>
//       )}
//
//       <div className="">
//         {!isMyMessage && (
//           <span className="text-secondary-text text-xs font-neue">
//             {user?.login}
//           </span>
//         )}
//
//         <div
//           className={clsx(
//             'flex',
//             'justify-between',
//             'items-end',
//             'rounded-tr-xl',
//             'rounded-bl-xl',
//             'py-3',
//             'px-4',
//             isMyMessage
//               ? 'bg-accent rounded-br rounded-tl-xl'
//               : 'bg-white rounded-tl rounded-br-xl',
//           )}
//         >
//           <span>{message.text}</span>
//           <span
//             className={clsx(
//               'text-xs',
//               'ml-2',
//               isMyMessage ? 'text-secondary-text' : 'text-light-brand',
//             )}
//           >
//             {message.formattedTimestamp}
//           </span>
//         </div>
//       </div>
//     </div>
//   )
// }
