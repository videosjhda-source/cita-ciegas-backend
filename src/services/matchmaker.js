const { v4: uuidv4 } = require('uuid');
const { createRoom } = require('./chatEngine');

// Colas en memoria
let waitingMen = [];
let waitingWomen = [];
let totalHistoricalUsers = 0; // Contador total de ingresos

const broadcastQueueStatus = (io) => {
  io.emit('queue_status', {
    men: waitingMen.length,
    women: waitingWomen.length,
    total: totalHistoricalUsers, // Nuevo contador total
    isGateOpen: true 
  });
};

const getAreaFromIP = (socket) => {
  // En producción (Render/Cloud), la IP real suele venir en x-forwarded-for
  const ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  // Por ahora, como es un experimento local/regional, usaremos una etiqueta genérica
  // o podrías integrar un servicio de GeoIP aquí. 
  // Para el "toque picante", diremos "Zona detectada"
  return "Área Quindío"; // O "Colombia" o "Latam" según prefieras
};

const joinQueue = (socket, userId, gender, io, targetUserId = null) => {
  // Limpiar cualquier conexión previa de este usuario en las colas (evita duplicados)
  waitingMen = waitingMen.filter(u => u.userId !== userId);
  waitingWomen = waitingWomen.filter(u => u.userId !== userId);

  const userObj = { 
    socket, 
    userId, 
    gender, 
    targetUserId,
    area: getAreaFromIP(socket)
  };

  if (gender === 'male') {
    waitingMen.push(userObj);
  } else {
    waitingWomen.push(userObj);
  }

  totalHistoricalUsers++; // Incrementar contador total
  console.log(`[Matchmaker] + ${userId} (${gender}) desde ${userObj.area}. Total: ${totalHistoricalUsers}`);
  
  // Primero intentamos emparejar
  attemptMatch(io);
  // Luego informamos el estado
  broadcastQueueStatus(io);
};

const attemptMatch = (io) => {
  // 1. INTENTAR EMPAREJAMIENTOS DIRECTOS PRIMERO
  const allWaiting = [...waitingMen, ...waitingWomen];
  
  for (let i = 0; i < allWaiting.length; i++) {
    const userA = allWaiting[i];
    for (let j = i + 1; j < allWaiting.length; j++) {
      const userB = allWaiting[j];
      
      // ¿User A busca a User B? ¿O User B busca a User A?
      const isDirectMatch = (userA.targetUserId === userB.userId) || (userB.targetUserId === userA.userId);
      
      if (isDirectMatch) {
        console.log(`[Matchmaker] DIRECT MATCH ENCONTRADO: ${userA.userId} ❤️ ${userB.userId}`);
        
        // Remover de sus respectivas colas originales
        waitingMen = waitingMen.filter(u => u.userId !== userA.userId && u.userId !== userB.userId);
        waitingWomen = waitingWomen.filter(u => u.userId !== userA.userId && u.userId !== userB.userId);
        
        executeMatch(userA, userB, io);
        return attemptMatch(io); // Recursión para seguir emparejando el resto
      }
    }
  }

  // 2. EMPAREJAMIENTO NORMAL POR GÉNERO
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

    executeMatch(man, woman, io);
  }
};

const executeMatch = (user1, user2, io) => {
  const roomId = uuidv4();
  user1.socket.join(roomId);
  user2.socket.join(roomId);

  console.log(`[Matchmaker] MATCH: ${user1.userId} ❤️ ${user2.userId} -> ${roomId}`);
  createRoom(roomId, user1.userId, user2.userId);

  user1.socket.emit('match_found', { roomId, partnerGender: user2.gender, partnerArea: user2.area });
  user2.socket.emit('match_found', { roomId, partnerGender: user1.gender, partnerArea: user1.area });
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
