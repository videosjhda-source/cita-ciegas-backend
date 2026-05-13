const { v4: uuidv4 } = require('uuid');
const { createRoom } = require('./chatEngine');

// Colas en memoria
let waitingMen = [];
let waitingWomen = [];

const REQUIRED_MASS = 50; // Masa crítica para iniciar los emparejamientos

const broadcastQueueStatus = (io) => {
  io.emit('queue_status', {
    men: waitingMen.length,
    women: waitingWomen.length,
    required: REQUIRED_MASS
  });
};

const joinQueue = (socket, userId, gender, io) => {
  const userObj = { socket, userId, gender };
  
  if (gender === 'male') {
    waitingMen.push(userObj);
  } else {
    waitingWomen.push(userObj);
  }

  console.log(`[Matchmaker] Colas -> Hombres: ${waitingMen.length} | Mujeres: ${waitingWomen.length}`);
  broadcastQueueStatus(io);
  attemptMatch(io);
};

const attemptMatch = (io) => {
  // Solo iniciar si ambas colas han alcanzado la masa crítica de 50
  if (waitingMen.length < REQUIRED_MASS || waitingWomen.length < REQUIRED_MASS) {
    return;
  }

  // Emparejar a todos los posibles
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
