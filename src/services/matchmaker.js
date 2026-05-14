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
  console.log(`[Matchmaker] + ${userId} (${gender}) desde ${userObj.area}.`);
  
  // Primero informamos el estado actual a todos (incluyendo al nuevo)
  broadcastQueueStatus(io);
  
  // Luego intentamos emparejar
  setTimeout(() => attemptMatch(io), 500); 
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
    // Solo emparejamos a quienes NO tienen un targetUserId (o que ya pasaron la fase directa)
    const availableMen = waitingMen.filter(u => !u.targetUserId);
    const availableWomen = waitingWomen.filter(u => !u.targetUserId);

    while (availableMen.length > 0 && availableWomen.length > 0) {
      const man = availableMen.shift();
      const woman = availableWomen.shift();

      // Remover de las colas reales
      waitingMen = waitingMen.filter(u => u.userId !== man.userId);
      waitingWomen = waitingWomen.filter(u => u.userId !== woman.userId);

      if (!man.socket.connected) {
        waitingWomen.unshift(woman); // Devolver a la mujer si el hombre se desconectó
        continue;
      }
      if (!woman.socket.connected) {
        waitingMen.unshift(man); // Devolver al hombre si la mujer se desconectó
        continue;
      }

      executeMatch(man, woman, io);
    }
};

const executeMatch = (user1, user2, io) => {
  const roomId = uuidv4();
  // ELIMINADO: user1.socket.join(roomId); 
  // ELIMINADO: user2.socket.join(roomId);
  // Los sockets se unirán en ChatRoom con su nueva conexión.

  console.log(`[Matchmaker] !!! MATCH ENCONTRADO: ${user1.userId} ❤️ ${user2.userId} -> Room: ${roomId}`);
  createRoom(roomId, user1.userId, user2.userId);

  user1.socket.emit('match_found', { 
    roomId, 
    partnerGender: user2.gender, 
    partnerArea: user2.area, 
    partnerUserId: user2.userId 
  });
  
  user2.socket.emit('match_found', { 
    roomId, 
    partnerGender: user1.gender, 
    partnerArea: user1.area, 
    partnerUserId: user1.userId 
  });
  
  // Actualizar estado después del match
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
