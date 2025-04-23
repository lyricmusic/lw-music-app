import express from 'express';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const rooms = {};

io.on('connection', (socket) => {
  console.log('Подключился', socket.id);

  /** Клиент сообщает, в какую комнату он входит */
  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
    // если комнаты ещё нет — создаём с пустым состоянием
    if (!rooms[roomId]) {
      rooms[roomId] = {
        masterSocketId: null,
        state: { currentTime: 0, isPlaying: false, videoUrl: '' },
      };
    }
    // сразу отдаем текущее состояние
    socket.emit('syncTime', rooms[roomId].state);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  /** Обновление времени приходит только от мастера */
  socket.on('updateTime', ({ roomId, ...data }) => {
    if (!rooms[roomId]) return;

    // назначаем мастера, если его ещё нет
    if (!rooms[roomId].masterSocketId) {
      rooms[roomId].masterSocketId = socket.id;
    }

    // игнорируем, если это не мастер
    if (socket.id !== rooms[roomId].masterSocketId) return;

    // обновляем состояние комнаты
    rooms[roomId].state = { ...rooms[roomId].state, ...data };
    socket.broadcast.to(roomId).emit('syncTime', rooms[roomId].state);
  });

  /** Запрос на синхронизацию (Viewer только слушает) */
  socket.on('requestSync', ({ roomId }) => {
    if (rooms[roomId]) socket.emit('syncTime', rooms[roomId].state);
  });

  /** Если мастер ушёл — выбираем нового (первый попавшийся) */
  socket.on('disconnect', async () => {
    for (const [roomId, room] of Object.entries(rooms)) {
      if (room.masterSocketId === socket.id) {
        const others = await io.in(roomId).fetchSockets();
        room.masterSocketId = others[0]?.id ?? null;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on ${PORT}`));
