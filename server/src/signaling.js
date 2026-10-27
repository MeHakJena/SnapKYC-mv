// WebRTC signaling over Socket.IO.
// The server never touches the video. It only passes "how to reach me" messages
// (SDP offer/answer and ICE candidates) between the customer and the agent of
// ONE session. Each session is its own room, and only its two owners can join.
import { Server } from 'socket.io';
import { getSession } from './db.js';
import { customerOwnsSession, verifyStaffToken } from './auth.js';
import { STATUS } from './rules.js';
import { config } from './config.js';

export function attachSignaling(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.clientOrigins.length ? config.clientOrigins : true },
  });

  // Decide who this socket is before letting it in.
  io.use(async (socket, next) => {
    try {
      const { sessionId, secret, staffToken } = socket.handshake.auth || {};
      const session = await getSession(sessionId);
      if (!session) return next(new Error('Session not found'));

      if (staffToken) {
        const user = verifyStaffToken(staffToken);
        if (session.agent_id !== user.id || session.status !== STATUS.IN_CALL) {
          return next(new Error('Pick up this call first'));
        }
        socket.data = { role: 'agent', sessionId, userId: user.id };
      } else if (customerOwnsSession(session, secret)) {
        socket.data = { role: 'customer', sessionId };
      } else {
        return next(new Error('Not allowed'));
      }
      next();
    } catch {
      next(new Error('Not allowed'));
    }
  });

  io.on('connection', async (socket) => {
    const { role, sessionId } = socket.data;
    const room = `session:${sessionId}`;

    // One socket per role per room: a newer tab replaces an older one.
    for (const other of await io.in(room).fetchSockets()) {
      if (other.data.role === role) other.disconnect(true);
    }
    socket.join(room);

    const others = (await io.in(room).fetchSockets()).filter((s) => s.id !== socket.id);
    socket.emit('peers', others.map((s) => s.data.role)); // who is already here
    socket.to(room).emit('peer-joined', role); // tell the other side we arrived

    // Relay offer/answer/candidates to the other person in the room.
    socket.on('signal', (payload) => socket.to(room).emit('signal', payload));

    // Agent tells the customer the call is over (customer then waits for the review).
    socket.on('call-ended', () => {
      if (role === 'agent') socket.to(room).emit('call-ended');
    });

    socket.on('disconnect', () => socket.to(room).emit('peer-left', role));
  });

  return io;
}
