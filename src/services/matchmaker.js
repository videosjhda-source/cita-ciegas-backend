const { v4: uuidv4 } = require('uuid');
const { createRoom } = require('./chatEngine');

// Colas en memoria
let waitingMen = [];
let waitingWomen = [];
let isGateOpen = false; // Bandera para saber si ya se superó la masa crítica inicial

const REQUIRED_MASS = 20; // Masa crítica para iniciar los emparejamientos la primera vez

const broadcastQueueStatus = (io) => {
  // Mostramos la realidad para evitar confusión durante las pruebas
  // Pero mantenemos la bandera isGateOpen para la UI
  io.emit('queue_status', {
    men: waitingMen.length,
    women: waitingWomen.length,
    required: REQUIRED_MASS,
    isGateOpen
  });
};

const joinQueue = (socket, userId, gender, io) => {
  // Limpiar cualquier conexión previa de este usuario en las colas (evita duplicados)
  waitingMen = waitingMen.filter(u => u.userId !== userId);
  waitingWomen = waitingWomen.filter(u => u.userId !== userId);

  const userObj = { socket, userId, gender };

  if (gender === 'male') {
    waitingMen.push(userObj);
  } else {
    waitingWomen.push(userObj);
  }

  console.log(`[Matchmaker] + ${userId} (${gender}) entró a la cola. Hombres: ${waitingMen.length} | Mujeres: ${waitingWomen.length}`);
  
  // Primero intentamos emparejar
  attemptMatch(io);
  // Luego informamos el estado (que puede haber cambiado tras el match)
  broadcastQueueStatus(io);
};

const attemptMatch = (io) => {
  // En modo pruebas, la puerta se abre si hay al menos 1 de cada uno
  if (!isGateOpen) {
    if (waitingMen.length >= 1 && waitingWomen.length >= 1) {
      isGateOpen = true;
      console.log('[Matchmaker] ¡Puertas abiertas! Iniciando emparejamientos.');
    } else {
      return;
    }
  }

  // Emparejar mientras haya gente de ambos géneros
  while (waitingMen.length > 0 && waitingWomen.length > 0) {
    const man = waitingMen.shift();
    const woman = waitingWomen.shift();

    // Verificar si siguen conectados antes de emparejar
    if (!man.socket.connected) {
      waitingWomen.unshift(woman);
      continue;
    }
    if (!woman.socket.connected) {
      waitingMen.unshift(man);
      continue;
    }

    const roomId = uuidv4();
    man.socket.join(roomId);
    woman.socket.join(roomId);

    console.log(`[Matchmaker] MATCH: ${man.userId} ❤️ ${woman.userId} -> ${roomId}`);
    createRoom(roomId, man.userId, woman.userId);

    man.socket.emit('match_found', { roomId, partnerGender: 'female' });
    woman.socket.emit('match_found', { roomId, partnerGender: 'male' });
  }
};

const leaveQueue = (userId, io) => {
  waitingMen = waitingMen.filter(u => u.userId !== userId);
  waitingWomen = waitingWomen.filter(u => u.userId !== userId);
  if (io) broadcastQueueStatus(io);
};

const handleDisconnect = (socket, userId, io) => {
  leaveQueue(userId, io);
};

module.exports = {
  joinQueue,
  leaveQueue,
  handleDisconnect
};
