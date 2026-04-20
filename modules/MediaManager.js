import VolumeBoostManager from './VolumeBoostManager.js';
import UIManager from './UIManager.js';
import RnnoiseManager from './RnnoiseManager.js';

const TRANSPORT_CONNECT_TIMEOUT = 20000;
const PRODUCE_TIMEOUT = 15000;
const CONSUME_TIMEOUT = 10000;

class MediaManager {
  static async getMediasoupClient() {
    const msClient =
      window.mediasoupClient ||
      (typeof globalThis !== 'undefined' && globalThis.mediasoupClient) ||
      (typeof global !== 'undefined' && global.mediasoupClient);

    if (msClient) return msClient;

    return new Promise((resolve, reject) => {
      const maxAttempts = 50;
      let attempts = 0;

      const checkInterval = setInterval(() => {
        const client =
          window.mediasoupClient ||
          (typeof globalThis !== 'undefined' && globalThis.mediasoupClient) ||
          (typeof global !== 'undefined' && global.mediasoupClient);

        if (client) {
          clearInterval(checkInterval);
          resolve(client);
        } else if (++attempts >= maxAttempts) {
          clearInterval(checkInterval);
          reject(new Error('mediasoup-client not loaded'));
        }
      }, 100);
    });
  }

  static async connect(client, roomId, mediaData) {
    try {
      const mediasoupClient = await this.getMediasoupClient();

      if (!mediasoupClient.Device) {
        throw new Error('mediasoupClient.Device is not available');
      }

      if (!client.device || client.device.loaded === false) {
        client.device = new mediasoupClient.Device();
        await client.device.load({ routerRtpCapabilities: mediaData.rtpCapabilities });
      }

      await this.createTransports(client, mediaData);

      client.isConnected = true;
      client.isMicActive = false;
      client.isMicPaused = true;
      client.consumerState = new Map();

      client._micInitInProgress = false;
      client._micInitPromise = null;

      if (client.socket) {
        client.socket.emit('request-mic-states', { roomId });
      }
    } catch (error) {
      console.error('Media connection failed:', error.message);
      client.device = null;
      client.sendTransport = null;
      client.recvTransport = null;
      client.audioProducer = null;
      throw new Error(`Media connection failed: ${error.message}`);
    }
  }

  static async createTransports(client, mediaData) {
    if (!client.sendTransport) {
      const sendOptions = {
        id: mediaData.sendTransport.id,
        iceParameters: mediaData.sendTransport.iceParameters,
        iceCandidates: mediaData.sendTransport.iceCandidates,
        dtlsParameters: mediaData.sendTransport.dtlsParameters,
        iceServers: mediaData.iceServers || [],
      };
      client.sendTransport = client.device.createSendTransport(sendOptions);
      this.setupTransportConnectHandler(client, client.sendTransport);
      this.setupTransportStateChangeHandler(client, client.sendTransport);
      this.setupSendTransportHandlers(client);
    }
    if (!client.recvTransport) {
      const recvOptions = {
        id: mediaData.recvTransport.id,
        iceParameters: mediaData.recvTransport.iceParameters,
        iceCandidates: mediaData.recvTransport.iceCandidates,
        dtlsParameters: mediaData.recvTransport.dtlsParameters,
        iceServers: mediaData.iceServers || [],
      };
      client.recvTransport = client.device.createRecvTransport(recvOptions);
      this.setupTransportConnectHandler(client, client.recvTransport);
      this.setupTransportStateChangeHandler(client, client.recvTransport);
    }
  }

  static setupTransportStateChangeHandler(client, transport) {
    let hasBeenConnected = false;
    const transportCreatedAt = Date.now();

    transport.on('connectionstatechange', (state) => {
      if (transport.closed) return;

      const isRecvTransport = transport === client.recvTransport;
      const isSendTransport = transport === client.sendTransport;
      const transportType = isRecvTransport ? 'recv' : 'send';

      if ((state === 'failed' || state === 'disconnected') && !hasBeenConnected) {
        return;
      }

      if (state === 'connected') {
        hasBeenConnected = true;

        if (isSendTransport) {
          client._sendTransportRecreateAttempts = 0;
          client._isSendTransportRecreating = false;
          client._sendTransportReady = true;
        }

        if (isRecvTransport && client._transportReadyForConsume !== undefined) {
          client._transportReadyForConsume = true;
          if (client._processPendingConsumeQueue) {
            client._processPendingConsumeQueue();
          }
        }

        if (client.iceRestartState) {
          client.iceRestartState.delete(transport.id);
        }
        return;
      }

      if (state === 'failed' || state === 'disconnected') {
        if (isSendTransport) {
          const timeSinceCreation = Date.now() - transportCreatedAt;
          if (timeSinceCreation < 15000) {
            return;
          }

          if (client._scheduleIceRestart && !client._isSendTransportRecreating) {
            client._scheduleIceRestart(transport, 'send');
          }
        } else if (isRecvTransport) {
          if (client._scheduleIceRestart) {
            client._scheduleIceRestart(transport, 'recv');
          } else if (client.currentRoom && !client.isReconnecting && !client._isMediaReconnecting) {
            client._isMediaReconnecting = true;
            client.reconnectToRoom(client.currentRoom).finally(() => {
              client._isMediaReconnecting = false;
            });
          }
        }
      }
    });
  }

  static setupTransportConnectHandler(client, transport) {
    let connectSent = false;
    transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      if (connectSent || transport.__connected) {
        if (errback) errback(new Error('Connect already sent or completed'));
        return;
      }
      connectSent = true;
      if (!client.socket?.connected) {
        if (errback) errback(new Error('Socket not connected'));
        return;
      }

      const responseTimeout = setTimeout(() => {
        if (errback) errback(new Error('Server response timeout'));
      }, TRANSPORT_CONNECT_TIMEOUT);

      client.socket.emit(
        'transport-connect',
        {
          transportId: transport.id,
          dtlsParameters,
          clientId: client.clientID,
        },
        (response) => {
          clearTimeout(responseTimeout);
          if (response?.success) {
            transport.__connected = true;
            if (callback) callback();
          } else {
            const errorMsg = response?.error || 'Server rejected handshake';
            if (errback) errback(new Error(errorMsg));
          }
        }
      );
    });
  }

  static setupSendTransportHandlers(client) {
    client.sendTransport.on('produce', async (parameters, callback, errback) => {
      try {
        const responseTimeout = setTimeout(() => {
          if (errback) errback(new Error('Produce response timeout'));
        }, PRODUCE_TIMEOUT);

        client.socket.emit(
          'produce',
          {
            transportId: client.sendTransport.id,
            kind: parameters.kind,
            rtpParameters: parameters.rtpParameters,
            clientId: client.clientID,
            roomId: client.currentRoom,
          },
          (response) => {
            clearTimeout(responseTimeout);
            if (response?.success) {
              if (typeof callback === 'function') callback({ id: response.producerId });
            } else {
              const errorMsg = response?.error || 'Server rejected produce';
              if (errback) errback(new Error(errorMsg));
            }
          }
        );
      } catch (error) {
        if (typeof errback === 'function') errback(error);
      }
    });
  }

  static async initMicrophone(client) {
    if (client._micInitInProgress) {
      return client._micInitPromise;
    }

    client._micInitInProgress = true;
    client._micInitPromise = this._doInitMicrophone(client);

    try {
      const result = await client._micInitPromise;
      return result;
    } finally {
      client._micInitInProgress = false;
      client._micInitPromise = null;
    }
  }

  static async _doInitMicrophone(client) {
    try {
      if (!client.sendTransport) {
        throw new Error('Send transport not initialized');
      }

      if (client.sendTransport.connectionState !== 'connected') {
        const notification = UIManager.showNotification('🔗 Устанавливаем защищённое соединение...', 'info', 0);

        try {
          await this._waitForTransportReady(client.sendTransport, 'send', 3000);

          if (notification) {
            notification.textContent = '✅ Защищённое соединение установлено!';
            notification.style.background = '#2ecc71';
            setTimeout(() => {
              notification.classList.add('fade-out');
              setTimeout(() => notification.remove(), 300);
            }, 2000);
          }
        } catch (e) {
          if (notification) {
            notification.textContent = '🌐 Продолжаем подключение...';
            notification.style.background = '#faa61a';
            setTimeout(() => {
              notification.classList.add('fade-out');
              setTimeout(() => notification.remove(), 300);
            }, 2000);
          }
        }
      }

      if (client.audioProducer && !client.audioProducer.closed) {
        return true;
      }

      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      };

      if (client.stream) {
        client.stream.getTracks().forEach((t) => t.stop());
        client.stream = null;
      }

      let rawStream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = rawStream.getAudioTracks()[0];

      if (!track) {
        throw new Error('No audio track available');
      }

      const isNoiseSuppressionEnabled = client.isNoiseSuppressionEnabled !== false;

      if (isNoiseSuppressionEnabled) {
        try {
          const RnnoiseManager = (await import('./RnnoiseManager.js')).default;
          const isAvailable = await RnnoiseManager.isAvailable();

          if (isAvailable) {
            const noiseNotification = UIManager.showNotification('🎧 Включаем шумоподавление...', 'info', 2000);
            const processedStream = await RnnoiseManager.enable(rawStream);
            rawStream = processedStream;

            if (noiseNotification) {
              noiseNotification.textContent = '✅ Шумоподавление активировано';
              noiseNotification.style.background = '#2ecc71';
              setTimeout(() => {
                noiseNotification.classList.add('fade-out');
                setTimeout(() => noiseNotification.remove(), 300);
              }, 1500);
            }
          } else {
            UIManager.showNotification('⚠️ Шумоподавление недоступно', 'error', 3000);
          }
        } catch (noiseError) {
          console.error('Failed to apply RNNoise:', noiseError);
          UIManager.showNotification('⚠️ Шумоподавление не включено', 'error', 3000);
        }
      }

      client.stream = rawStream;
      const finalTrack = client.stream.getAudioTracks()[0];

      if (!finalTrack) {
        throw new Error('No audio track available after processing');
      }

      finalTrack.enabled = true;

      client.audioProducer = await client.sendTransport.produce({
        track: finalTrack,
        encodings: [{ maxBitrate: 24000, dtx: true }],
        appData: { clientID: client.clientID, roomId: client.currentRoom },
      });

      if (!client.audioProducer || client.audioProducer.closed) {
        throw new Error('Producer creation failed or closed immediately');
      }

      client.audioProducer.on('transportclose', () => {
        client.audioProducer = null;
        client.isMicActive = false;
        client.isMicPaused = true;
        if (client.updateMicButtonState) {
          client.updateMicButtonState();
        }
      });

      client.audioProducer.on('trackended', () => {
        client.audioProducer = null;
        client.isMicActive = false;
        client.isMicPaused = true;
        if (client.updateMicButtonState) {
          client.updateMicButtonState();
        }
      });

      client.isMicActive = true;
      client.isMicPaused = false;

      if (client.socket) {
        client.socket.emit('new-producer-notification', {
          roomId: client.currentRoom,
          producerId: client.audioProducer.id,
          clientID: client.clientID,
          userId: client.userId,
          kind: 'audio',
        });

        client.socket.emit('mic-indicator-state', {
          roomId: client.currentRoom,
          isActive: true,
        });
      }

      return true;
    } catch (error) {
      console.error('Failed to init microphone:', error.message);

      client.isMicActive = false;
      client.isMicPaused = true;
      client.audioProducer = null;

      if (client.stream) {
        client.stream.getTracks().forEach((t) => t.stop());
        client.stream = null;
      }

      try {
        const RnnoiseManager = (await import('./RnnoiseManager.js')).default;
        RnnoiseManager.disable();
      } catch (e) {
        // Ignore
      }

      UIManager.showNotification('❌ Ошибка микрофона: ' + error.message, 'error', 4000);
      throw error;
    }
  }

  static _waitForTransportReady(transport, type, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      if (transport.connectionState === 'connected') {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Transport ${type} ready timeout`));
      }, timeoutMs);

      const onStateChange = (state) => {
        if (state === 'connected') {
          cleanup();
          resolve();
        } else if (state === 'failed' || state === 'closed') {
          cleanup();
          reject(new Error(`Transport ${type} entered ${state}`));
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        transport.off('connectionstatechange', onStateChange);
      };

      transport.on('connectionstatechange', onStateChange);
    });
  }

  static async pauseMicrophone(client) {
    if (!client.audioProducer || client.audioProducer.closed) return false;
    await client.audioProducer.pause();
    if (client.audioProducer.track) client.audioProducer.track.enabled = false;
    client.isMicPaused = true;
    client.socket?.emit('mic-indicator-state', { roomId: client.currentRoom, isActive: false });
    client.socket?.emit('producerPaused', { producerId: client.audioProducer.id });
    return true;
  }

  static async resumeMicrophone(client) {
    if (!client.audioProducer || client.audioProducer.closed) {
      return false;
    }
    await client.audioProducer.resume();
    if (client.audioProducer.track) client.audioProducer.track.enabled = true;
    client.isMicPaused = false;
    client.socket?.emit('mic-indicator-state', { roomId: client.currentRoom, isActive: true });
    client.socket?.emit('producerResumed', { producerId: client.audioProducer.id });
    return true;
  }

  static async stopMicrophone(client, closeTransport = true) {
    if (client.audioProducer) {
      try {
        client.audioProducer.close();
      } catch {}
      client.audioProducer = null;
    }
    if (client.stream) {
      client.stream.getTracks().forEach((t) => t.stop());
      client.stream = null;
    }
    if (closeTransport && client.sendTransport) {
      try {
        if (!client.sendTransport.closed) client.sendTransport.close();
      } catch {}
      client.sendTransport = null;
    }
    client.isMicActive = false;
    client.isMicPaused = true;
  }

static async createConsumer(client, consumerParams) {
  if (!client.recvTransport || client.recvTransport.closed || client.recvTransport.connectionState === 'failed') {
    throw new Error('Recv transport is missing, closed, or failed');
  }

  if (client.audioProducer?.id === consumerParams.producerId || consumerParams.clientID === client.clientID) {
    throw new Error('Cannot consume own audio');
  }

  const existingAudio = document.getElementById(`audio-${consumerParams.producerId}`);
  if (existingAudio) {
    existingAudio.remove();
  }

  const consumer = await client.recvTransport.consume({
    id: consumerParams.id,
    producerId: consumerParams.producerId,
    kind: consumerParams.kind,
    rtpParameters: consumerParams.rtpParameters,
  });

  consumer.on('trackended', () => {
    if (client._scheduleConsumerRetry) {
      client._scheduleConsumerRetry(
        consumerParams.producerId,
        { producerId: consumerParams.producerId, kind: consumerParams.kind },
        'track_ended'
      );
    }
  });

  consumer.on('transportclose', () => {
    if (client._scheduleConsumerRetry) {
      client._scheduleConsumerRetry(
        consumerParams.producerId,
        { producerId: consumerParams.producerId, kind: consumerParams.kind },
        'transport_closed'
      );
    }
  });

  consumer.on('producerclose', () => {
    if (client._resetConsumerRecoveryState) {
      client._resetConsumerRecoveryState(consumerParams.producerId);
    }
  });

  const audioElement = document.createElement('audio');
  audioElement.id = `audio-${consumerParams.producerId}`;
  audioElement.autoplay = true;
  audioElement.playsInline = true;
  audioElement.muted = false;

  audioElement.style.cssText = `
    position: fixed !important;
    top: -9999px !important;
    left: -9999px !important;
    width: 1px !important;
    height: 1px !important;
    opacity: 0 !important;
    pointer-events: none !important;
    visibility: hidden !important;
  `;

  document.body.appendChild(audioElement);
  audioElement.srcObject = new MediaStream([consumer.track]);

  const playPromise = audioElement.play();
  if (playPromise !== undefined) {
    playPromise.catch(() => {
      VolumeBoostManager.resume().catch(() => {});
      const retryPlay = () => audioElement.play().catch(() => {});
      document.addEventListener('click', retryPlay, { once: true });
      document.addEventListener('touchstart', retryPlay, { once: true });
    });
  }

  return { consumer, audioElement };
}

  static disconnect(client) {
    client._micInitInProgress = false;
    client._micInitPromise = null;
    client._sendTransportReady = false;

    this.stopMicrophone(client, true);

    if (client.recvTransport) {
      try {
        if (!client.recvTransport.closed) client.recvTransport.close();
      } catch {}
      client.recvTransport = null;
    }
    if (client.consumerState) {
      client.consumerState.forEach((state) => {
        if (state?.audioElement && state.audioElement.parentNode) {
          state.audioElement.remove();
        }
        if (state?.consumer && !state.consumer.closed) {
          try {
            state.consumer.close();
          } catch {}
        }
      });
      client.consumerState.clear();
    }

    client.device = null;
    client.isConnected = false;
    client.isMicActive = false;
    client.isMicPaused = true;
  }
}

export default MediaManager;
