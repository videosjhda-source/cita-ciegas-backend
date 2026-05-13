const { v4: uuidv4 } = require('uuid');
const { createRoom } = require('./chatEngine');

// Colas en memoria
let waitingMen = [];
let waitingWomen = [];
let isGateOpen = false; // Bandera para saber si ya se superó la masa crítica inicial

const REQUIRED_MASS = 20; // Masa crítica para iniciar los emparejamientos la primera vez

const broadcastQueueStatus = (io) => {
  // Falsificamos los números para pruebas: parecerá que casi se alcanza la masa crítica
  const displayMen = isGateOpen ? REQUIRED_MASS : (waitingMen.length > 0 ? REQUIRED_MASS - 1 : REQUIRED_MASS - 5);
  const displayWomen = isGateOpen ? REQUIRED_MASS : (waitingWomen.length > 0 ? REQUIRED_MASS - 1 : REQUIRED_MASS - 4);

  io.emit('queue_status', {
    men: displayMen,
    women: displayWomen,
    required: REQUIRED_MASS,
    isGateOpen
  });
};

const joinQueue = (socket, userId, gender, io) => {
  const userObj = { socket, userId, gender };

  if (gender === 'male') {
    waitingMen.push(userObj);
  } else {
    waitingWomen.push(userObj);
  }

  console.log(`[Matchmaker] Colas -> Hombres: ${waitingMen.length} | Mujeres: ${waitingWomen.length} | Puerta Abierta: ${isGateOpen}`);
  broadcastQueueStatus(io);
  attemptMatch(io);
};

const attemptMatch = (io) => {
  // Si la puerta aún está cerrada, verificamos si ya se alcanzó la masa crítica
  if (!isGateOpen) {
    // MODO PRUEBAS: Reducimos la masa crítica real a 1 y 1 para probar rápidamente
    if (waitingMen.length >= 1 && waitingWomen.length >= 1) {
      isGateOpen = true; // Se abre la puerta permanentemente
      console.log('[Matchmaker] ¡Masa crítica simulada alcanzada (1 y 1)! Puertas abiertas permanentemente.');
    } else {
      return; // Aún no hay suficientes para la primera oleada
    }
  }

  // Si llegamos aquí, la puerta está abierta. Emparejar de a 1 en 1 a todos los posibles.
  while (waitingMen.length > 0 && waitingWomen.length > 0) {
    const man = waitingMen.shift();
    const woman = waitingWomen.shift();

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

    console.log(`[Matchmaker] Match exitoso: ${man.userId} y ${woman.userId} -> Sala: ${roomId}`);
    createRoom(roomId, man.userId, woman.userId);

    man.socket.emit('match_found', { roomId, partnerGender: 'female' });
    woman.socket.emit('match_found', { roomId, partnerGender: 'male' });
  }

  broadcastQueueStatus(io);
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
