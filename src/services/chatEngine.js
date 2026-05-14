const activeRooms = new Map();
// Estructura de room:
// { id, user1, user2, phase: 1, timer: 300, intervalId: null, decisions: {} }

const createRoom = (roomId, user1, user2) => {
  console.log(`[ChatEngine] Creando sala ${roomId} para ${user1} y ${user2}`);
  const room = {
    id: roomId,
    user1,
    user2,
    phase: 1,
    timer: 300, 
    decisions: {}, 
    intervalId: null,
    connectedUsers: new Set()
  };
  activeRooms.set(roomId, room);
};

const initChatEvents = (socket, io, userId) => {
  socket.on('join_room', ({ roomId }) => {
    const room = activeRooms.get(roomId);
    if (!room) {
      console.log(`[ChatEngine] Intento de unión a sala inexistente: ${roomId}`);
      return;
    }

    socket.join(roomId);
    room.connectedUsers.add(userId);
    console.log(`[ChatEngine] Usuario ${userId} unido a sala ${roomId}. Miembros: ${room.connectedUsers.size}`);
    
    // Si el timer no ha iniciado para esta sala, lo iniciamos
    if (!room.intervalId) {
      console.log(`[ChatEngine] Iniciando temporizador para sala ${roomId}`);
      room.intervalId = setInterval(() => {
        room.timer -= 1;
        io.to(roomId).emit('timer_update', room.timer);

        if (room.timer <= 0) {
          handlePhaseEnd(roomId, io);
        } else if (room.phase === 2 && room.timer % 60 === 0) {
          sendDeepQuestion(roomId, io);
        }
      }, 1000);
    }
  });

  socket.on('send_message', ({ roomId, message }) => {
    // Filtro básico anti-spam / groserías aquí (se puede mover a un utils/moderator)
    // Emitir mensaje al compañero (broadcast en el room excepto al emisor)
    socket.to(roomId).emit('receive_message', message);
  });

  socket.on('make_decision', ({ roomId, choice }) => {
    const room = activeRooms.get(roomId);
    if (!room) return;

    room.decisions[userId] = choice;

    // Comprobar si ambos tomaron decisión
    if (Object.keys(room.decisions).length === 2) {
      const decision1 = room.decisions[room.user1];
      const decision2 = room.decisions[room.user2];

      if (decision1 === 'continue' && decision2 === 'continue') {
        // Avanzar de fase
        room.phase += 1;
        room.timer = 300; // Reset timer
        room.decisions = {}; // Reset decisiones
        io.to(roomId).emit('phase_change', room.phase);
        
        if (room.phase === 2) {
          io.to(roomId).emit('system_message', { content: '¡Fase 2 desbloqueada! Nivel de conexión profundo activado.' });
          sendDeepQuestion(roomId, io);
        } else if (room.phase === 3) {
          io.to(roomId).emit('system_message', { content: '¡Fase 3 alcanzada! Pueden revelar sus identidades cuando lo deseen.' });
        }
      } else {
        // Alguien pasó
        io.to(roomId).emit('system_message', { content: 'La conexión ha terminado. Cerrando cápsula...' });
        io.to(roomId).emit('partner_disconnected');
        clearInterval(room.intervalId);
        activeRooms.delete(roomId);
      }
    }
  });

  socket.on('disconnecting', () => {
    const { isQueue } = socket.handshake.auth;
    
    for (const roomId of socket.rooms) {
      const room = activeRooms.get(roomId);
      if (room) {
        // IMPORTANTE: Solo disolver la sala si NO es una conexión de cola
        // o si ya estaban en fase de chat activo.
        if (!isQueue) {
          console.log(`[ChatEngine] Usuario ${userId} salió del chat. Disolviendo sala ${roomId}`);
          socket.to(roomId).emit('partner_disconnected');
          if (room.intervalId) clearInterval(room.intervalId);
          activeRooms.delete(roomId);
        } else {
          console.log(`[ChatEngine] Desconexión de socket de cola para ${userId} (ignorando disolución de sala)`);
        }
      }
    }
  });
};

const handlePhaseEnd = (roomId, io) => {
  const room = activeRooms.get(roomId);
  if (!room) return;

  // Si se acabó el tiempo y no han decidido ambos continuar, se cierra.
  io.to(roomId).emit('system_message', { content: 'Se agotó el tiempo. Cerrando conexión...' });
  io.to(roomId).emit('partner_disconnected');
  clearInterval(room.intervalId);
  activeRooms.delete(roomId);
};

const sendDeepQuestion = (roomId, io) => {
  const questions = [
    "¿Qué es lo más valiente que has hecho por amor?",
    "¿Qué te quita el sueño últimamente?",
    "Si pudieras revivir un solo día de tu vida, ¿cuál sería y por qué?",
    "¿Cuál es tu mayor miedo irracional?",
    "¿En qué situación te has sentido más vivo/a?"
  ];
  const rand = questions[Math.floor(Math.random() * questions.length)];
  io.to(roomId).emit('system_message', { content: `Pregunta profunda: ${rand}` });
};

module.exports = {
  createRoom,
  initChatEvents
};
