// WebRTC call between the customer and the agent.
//
// 1. Both browsers connect to the server's Socket.IO room for the session.
// 2. The CUSTOMER always makes the offer (so the two sides never both offer at once).
// 3. Offer, answer and ICE candidates travel through the server ("signaling").
// 4. After that, video flows browser-to-browser, or via the TURN relay if a
//    direct path is blocked. The server never sees the video.
import { io } from 'socket.io-client';
import { api, API_BASE } from './api.js';

export async function startCall({
  role,
  sessionId,
  auth,
  localStream,
  onRemoteStream,
  onState,
  onCallEnded,
  onRoute,
  onCustomerLeft,
}) {
  const iceServers = await api(`/api/ice-servers?sessionId=${encodeURIComponent(sessionId)}`, {
    token: auth?.staffToken,
    secret: auth?.secret,
  });
  const socket = io(API_BASE || undefined, { auth: { sessionId, ...auth } });

  let pc = null;
  let pendingCandidates = [];

  async function checkRoute() {
    if (!pc) return;
    try {
      const stats = await pc.getStats();
      let selectedPair;
      stats.forEach((report) => {
        if (report.type === 'transport' && report.selectedCandidatePairId) {
          selectedPair = stats.get(report.selectedCandidatePairId);
        } else if (
          report.type === 'candidate-pair' &&
          (report.selected || (report.state === 'succeeded' && report.nominated))
        ) {
          selectedPair = report;
        }
      });
      if (selectedPair) {
        const localCand = stats.get(selectedPair.localCandidateId);
        if (localCand?.candidateType) {
          onRoute?.(localCand.candidateType === 'relay' ? 'relay' : 'direct');
          return true;
        }
      }
    } catch {}
    return false;
  }

  function newPeer() {
    if (pc) pc.close();
    pendingCandidates = [];
    pc = new RTCPeerConnection({ iceServers });
    localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
    pc.ontrack = (e) => onRemoteStream(e.streams[0]);
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('signal', { candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      onState(pc.connectionState);
      if (pc.connectionState === 'connected') {
        checkRoute();
        setTimeout(checkRoute, 1000);
      }
    };
    return pc;
  }

  async function flushCandidates() {
    for (const c of pendingCandidates) await pc.addIceCandidate(c).catch(() => {});
    pendingCandidates = [];
  }

  async function makeOffer() {
    newPeer();
    await pc.setLocalDescription(await pc.createOffer());
    socket.emit('signal', { description: pc.localDescription });
    onState('connecting');
  }

  socket.on('connect', () => onState('waiting'));
  socket.on('connect_error', (err) => onState(`error: ${err.message}`));

  // Who is already in the room when we join, and who arrives later.
  socket.on('peers', (roles) => {
    if (role === 'customer' && roles.includes('agent')) makeOffer();
  });
  socket.on('peer-joined', (who) => {
    if (role === 'customer' && who === 'agent') makeOffer();
  });
  socket.on('peer-left', () => {
    onRemoteStream(null);
    onState('peer-left');
  });

  socket.on('signal', async ({ description, candidate }) => {
    try {
      if (description?.type === 'offer') {
        newPeer();
        await pc.setRemoteDescription(description);
        await flushCandidates();
        await pc.setLocalDescription(await pc.createAnswer());
        socket.emit('signal', { description: pc.localDescription });
      } else if (description?.type === 'answer' && pc) {
        await pc.setRemoteDescription(description);
        await flushCandidates();
      } else if (candidate) {
        // Candidates can arrive before the offer/answer is applied: keep them until then.
        if (pc?.remoteDescription) await pc.addIceCandidate(candidate).catch(() => {});
        else pendingCandidates.push(candidate);
      }
    } catch (err) {
      console.error('signaling error', err);
      onState('error: could not connect the call');
    }
  });

  socket.on('call-ended', () => onCallEnded?.());
  socket.on('customer-left', () => onCustomerLeft?.());

  return {
    endCall: () => socket.emit('call-ended'),
    leaveCall: () => socket.emit('customer-left'),
    close: () => {
      if (pc) pc.close();
      socket.disconnect();
    },
  };
}

export async function getCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot access the camera. Use Chrome, Edge, Firefox or Safari over HTTPS.');
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch (err) {
    if (err.name === 'NotAllowedError') throw new Error('Camera/microphone permission was denied. Allow it in the browser and try again.');
    if (err.name === 'NotFoundError') throw new Error('No camera or microphone found.');
    throw new Error(`Could not start camera: ${err.message}`);
  }
}

export const stopStream = (stream) => stream?.getTracks().forEach((t) => t.stop());
