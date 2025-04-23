// import React, { useEffect, useRef, useState } from 'react'
// import YouTube, { YouTubeProps } from 'react-youtube'
//
// // import { db } from '@/firebase'
// import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore'
//
// // Интерфейс для описания состояния видео
// interface VideoState {
//   currentTime: number
//   playing: boolean
//   videoId: string
// }
//
// const VideoSync: React.FC = () => {
//   // Начальное состояние: видео запускается автоматически
//   const [started, setStarted] = useState<boolean>(false)
//   const [videoState, setVideoState] = useState<VideoState>({
//     currentTime: 0,
//     playing: true,
//     videoId: 'dQw4w9WgXcQ', // пример идентификатора YouTube
//   })
//
//   // Ссылка на YouTube плеер
//   const playerRef = useRef<any>(null)
//   // Документ Firestore для хранения текущего видео
//   // const videoDocRef = doc(db, 'videos', 'currentVideo')
//
//   // При монтировании проверяем наличие документа и создаём его при отсутствии
//   useEffect(() => {
//     // getDoc(videoDocRef).then(docSnap => {
//     //   if (!docSnap.exists()) {
//     //     setDoc(videoDocRef, videoState)
//     //   }
//     // })
//   }, [])
//
//   // Подписка на изменения в Firestore для синхронизации состояния видео
//   useEffect(() => {
//     // const unsubscribe = onSnapshot(videoDocRef, docSnap => {
//     //   if (docSnap.exists()) {
//     //     const data = docSnap.data() as VideoState
//     //     setVideoState(data)
//     //     if (playerRef.current) {
//     //       const currentVideoId = playerRef.current.getVideoData().video_id
//     //       // Если идентификатор видео изменился, загружаем новый клип
//     //       if (data.videoId !== currentVideoId) {
//     //         playerRef.current.loadVideoById(data.videoId)
//     //       } else {
//     //         // Синхронизация времени воспроизведения, если необходимо
//     //         playerRef.current.seekTo(data.currentTime, true)
//     //       }
//     //     }
//     //   }
//     // })
//     // return () => unsubscribe()
//   }, [])
//
//   // Когда плеер готов, запускаем воспроизведение
//   const onPlayerReady: YouTubeProps['onReady'] = event => {
//     playerRef.current = event.target
//     event.target.playVideo()
//   }
//
//   // Обработчик окончания видео: загружаем следующий клип
//   const handleVideoEnd: YouTubeProps['onEnd'] = async () => {
//     // Для демонстрации переключаемся между двумя видео,
//     // в реальном приложении можно использовать очередь клипов из Firestore
//     // const nextVideoId =
//     //   videoState.videoId === 'dQw4w9WgXcQ' ? '9bZkp7q19f0' : 'dQw4w9WgXcQ'
//     // await setDoc(videoDocRef, {
//     //   currentTime: 0,
//     //   playing: true,
//     //   videoId: nextVideoId,
//     // })
//   }
//
//   // Опции плеера: автозапуск и отключенные элементы управления
//   const opts: YouTubeProps['opts'] = {
//     playerVars: {
//       autoplay: 1,
//       controls: 0, // отключаем элементы управления (без возможности поставить на паузу)
//       enablejsapi: 1,
//       mute: 1, // изначально мьютим для разрешения автозапуска
//       origin: window.location.origin,
//     },
//   }
//
//   // const startPlayback = () => {
//   //   setStarted(true)
//   //   if (playerRef.current) {
//   //     playerRef.current.playVideo()
//   //     playerRef.current.unMute() // включаем звук после клика
//   //   }
//   // }
//   const handleOverlayClick = (e: React.MouseEvent) => {
//     e.stopPropagation()
//     e.preventDefault()
//   }
//   return (
//     <div>
//       {/*{!started && <button onClick={startPlayback}>Начать просмотр</button>}*/}
//
//       <div style={{ display: 'inline-block', position: 'relative' }}>
//         <YouTube
//           onEnd={handleVideoEnd}
//           onReady={onPlayerReady}
//           opts={opts}
//           videoId={videoState.videoId}
//         />
//         {/* Прозрачный оверлей для перехвата кликов, активный после начала воспроизведения */}
//
//         <div
//           onClick={handleOverlayClick}
//           style={{
//             cursor: 'default',
//             height: '100%',
//             left: 0,
//             position: 'absolute',
//             top: 0,
//             width: '100%',
//             zIndex: 10,
//           }}
//         />
//       </div>
//     </div>
//   )
// }
//
// export default VideoSync
