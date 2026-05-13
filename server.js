require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { joinQueue, leaveQueue, handleDisconnect } = require('./src/services/matchmaker');
const { initChatEvents } = require('./src/services/chatEngine');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // En producción, restringir a la URL del frontend
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  const { userId, gender } = socket.handshake.auth;
  
  if (!userId || !gender) {
    console.log('[Auth] Conexión rechazada: Faltan credenciales');
    return socket.disconnect();
  }

  console.log(`[Connect] Usuario ${userId} (${gender}) conectado. Socket ID: ${socket.id}`);
  
  // Agregar a la cola de emparejamiento solo si viene de la Sala de Espera
  const { isQueue } = socket.handshake.auth;
  if (isQueue) {
    joinQueue(socket, userId, gender, io);
  } else {
    console.log(`[Queue] Usuario ${userId} conectado para chat (saltando cola)`);
  }

  // Inicializar eventos de chat (mensajes, timers, decisiones)
  initChatEvents(socket, io, userId);

  socket.on('disconnect', () => {
    console.log(`[Disconnect] Usuario ${userId} desconectado.`);
    handleDisconnect(socket, userId, io);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`[Server] Servidor Cita a Ciegas corriendo en el puerto ${PORT}`);
});
