import SettingsManager from './SettingsManager.js';
import MediaManager from './MediaManager.js';
import RoomManager from './RoomManager.js';
import ServerManager from './ServerManager.js';
import UIManager from './UIManager.js';
import Utils from './Utils.js';
import TextChatManager from './TextChatManager.js';
import InviteManager from './InviteManager.js';
import MembersManager from './MembersManager.js';
import AuthManager from './AuthManager.js';
import VolumeBoostManager from './VolumeBoostManager.js';
import ModalManager from './ModalManager.js';
import SecondaryChatManager from './SecondaryChatManager.js';
import DiagnosticPanel from './DiagnosticPanel.js';
import MessageRenderer from './MessageRenderer.js';
import CreatePollModal from './CreatePollModal.js';
import SoundManager from './SoundManager.js';
import ScrollTracker from './ScrollTracker.js';
import ChatSocketHandler from './ChatSocketHandler.js';
import MediaSocketHandler from './MediaSocketHandler.js';
import SystemSocketHandler from './SystemSocketHandler.js';
import PollSocketHandler from './PollSocketHandler.js';
import NoteStateManager from './NoteStateManager.js';
import NoteAPI from './NoteAPI.js';
import NoteUIManager from './NoteUIManager.js';
import NoteSocketHandler from './NoteSocketHandler.js';
import MobileOnlineBar from './MobileOnlineBar.js';
import AvatarManager from './AvatarManager.js';
import ConsoleCommandManager from './ConsoleCommandManager.js';

const NETWORK_RECONNECT_CONFIG = { BASE_DELAY: 1000, MAX_DELAY: 16000, JITTER_FACTOR: 0.2 };
const PING_INTERVAL = 10000;
const JOIN_TIMEOUT = 9000;
const CONNECTION_STATE = { DISCONNECTED: 'disconnected', CONNECTING: 'connecting', CONNECTED: 'connected', ERROR: 'error' };
const CONSUMER_RETRY_CONFIG = { BASE_DELAY: 1000, MAX_DELAY: 32000, MAX_ATTEMPTS: 8, JITTER_FACTOR: 0.3 };
const ICE_RESTART_CONFIG = { BASE_DELAY: 2000, MAX_DELAY: 30000, MAX_ATTEMPTS: 20, JITTER_FACTOR: 0.2 };
const TRANSPORT_RECONNECT_CONFIG = { BASE_DELAY: 1000, MAX_DELAY: 16000, MAX_ATTEMPTS: 6, JITTER_FACTOR: 0.25 };

class VoiceChatClient {
  constructor() {
    if (window._voiceClientInstance) {
      return window._voiceClientInstance;
    }
    window._voiceClientInstance = this;
    this.API_SERVER_URL = 'https://ns.fiber-gate.ru';
    this.CHAT_API_URL = `${this.API_SERVER_URL}/api/join`;
    this.clientID = Utils.generateClientID();
    this.device = null;
    this.sendTransport = null;
    this.recvTransport = null;
    this.audioProducer = null;
    window.voiceClient = this;
    this.consumerState = new Map();
    this.stream = null;
    this.isMicActive = false;
    this.isMicPaused = false;
    this.currentRoom = null;
    this.currentServerId = null;
    this.currentServer = null;
    this.servers = [];
    this.rooms = [];
    this.pingInterval = null;
    this.isConnected = false;
    this.mediaData = null;
    this.userId = null;
    this.token = null;
    this.username = null;
    this.tokenVersion = 1;
    this.activePanel = 'servers';
    this.inviteServerId = null;
    this.isCreatingRoom = false;
    this.socket = null;
    this.wasMicActiveBeforeReconnect = false;
    this.isReconnecting = false;
    this.pendingInviteCode = null;
    this.elements = {};
    this.socketRoom = null;
    this.connectionState = CONNECTION_STATE.DISCONNECTED;
    this.requestIdCounter = 0;
    this.pendingRequests = new Map();
    this.pendingProducersRef = [];
    this.consumedProducerIdsRef = new Set();
    this.joinAbortController = null;
    this._micToggleDebounce = null;
    this._mediaFetchController = null;
    this._isProcessingConsumers = false;
    this._isMediaReconnecting = false;
    this.isHistoryLoading = false;
    this.hasMoreHistory = true;
    this.oldestMessageId = null;
    this.historyObserver = null;
    this.secondaryChat = { enabled: false, roomId: null, isLoading: false, hasMore: true, oldestMessageId: null };
    this._authFetchController = null;
    this.diagnosticActive = false;
    this.pinnedMessages = new Map();
    this.currentPinnedIndex = new Map();
    this._touchStartX = 0;
    this._touchStartY = 0;
    this.consumerRecoveryState = new Map();
    this.iceRestartState = new Map();
    this.transportRecoveryState = new Map();
    this._producersPendingConsume = [];
    this._transportReadyForConsume = false;
    this._recoveryTimers = new Set();
    this.savedMaxSeenId = null;
    this.savedFirstUnreadId = null;
    this.chatHandler = new ChatSocketHandler(this);
    this.mediaHandler = new MediaSocketHandler(this);
    this.systemHandler = new SystemSocketHandler(this);
    this.pollHandler = new PollSocketHandler(this);
    this.noteHandler = new NoteSocketHandler(this);
    this._isMediaInitializing = false;
    this._pendingMicAction = null;
    this._trafficMonitorInterval = null;
    this._lastBytesReceived = new Map();
    this._trafficActiveProducers = new Set();

    this.selectedMicDeviceId = null;
    this.audioMaxBitrate = 48;
    this.audioDTX = true;
    this.audioNoiseSuppression = true;
    this.audioEchoCancellation = true;
    this.audioAutoGainControl = true;
    this.audioRNNoise = true;
    this.audioChannelMode = 'mono';
    this.audioEchoCancellationType = 'browser';
    this.audioInputGain = 1.0;

    this.loadAudioSettings();
    this.init();
  }

  loadAudioSettings() {
    try {
      const saved = localStorage.getItem('voicechat_audio_settings');
      if (saved) {
        const settings = JSON.parse(saved);
        this.selectedMicDeviceId = settings.selectedMicDeviceId || null;
        this.audioMaxBitrate = settings.audioMaxBitrate ?? 48;
        this.audioDTX = settings.audioDTX ?? true;
        this.audioNoiseSuppression = settings.audioNoiseSuppression ?? true;
        this.audioEchoCancellation = settings.audioEchoCancellation ?? true;
        this.audioAutoGainControl = settings.audioAutoGainControl ?? true;
        this.audioRNNoise = settings.audioRNNoise ?? true;
        this.audioChannelMode = settings.audioChannelMode || 'mono';
        this.audioEchoCancellationType = settings.audioEchoCancellationType || 'browser';
        this.audioInputGain = settings.audioInputGain ?? 1.0;
      }
    } catch (e) {
      console.error('Failed to load audio settings:', e);
    }
  }

  saveAudioSettings() {
    try {
      const settings = {
        selectedMicDeviceId: this.selectedMicDeviceId,
        audioMaxBitrate: this.audioMaxBitrate,
        audioDTX: this.audioDTX,
        audioNoiseSuppression: this.audioNoiseSuppression,
        audioEchoCancellation: this.audioEchoCancellation,
        audioAutoGainControl: this.audioAutoGainControl,
        audioRNNoise: this.audioRNNoise,
        audioChannelMode: this.audioChannelMode,
        audioEchoCancellationType: this.audioEchoCancellationType,
        audioInputGain: this.audioInputGain
      };
      localStorage.setItem('voicechat_audio_settings', JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save audio settings:', e);
    }
  }

  resetAudioSettingsToDefaults() {
    this.selectedMicDeviceId = null;
    this.audioMaxBitrate = 48;
    this.audioDTX = true;
    this.audioNoiseSuppression = true;
    this.audioEchoCancellation = true;
    this.audioAutoGainControl = true;
    this.audioRNNoise = true;
    this.audioChannelMode = 'mono';
    this.audioEchoCancellationType = 'browser';
    this.audioInputGain = 1.0;
    this.saveAudioSettings();
  }

  async showMicDeviceMenu(event, buttonElement) {
    event.preventDefault();
    event.stopPropagation();

    const existingMenu = document.querySelector('.mic-device-menu');
    if (existingMenu) existingMenu.remove();

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput' && d.deviceId);

      const menu = document.createElement('div');
      menu.className = 'mic-device-menu';
      menu.style.cssText = `
        position: fixed;
        background: #2d2d44;
        border: 1px solid #404060;
        border-radius: 8px;
        padding: 4px 0;
        min-width: 220px;
        z-index: 10001;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      `;

      const rect = buttonElement.getBoundingClientRect();
      menu.style.left = `${rect.left}px`;
      menu.style.top = `${rect.bottom + 5}px`;

      if (audioInputs.length === 0) {
        const item = document.createElement('div');
        item.className = 'mic-device-item';
        item.textContent = 'Микрофоны не найдены';
        item.style.color = '#888';
        item.style.cursor = 'default';
        menu.appendChild(item);
      } else {
        const defaultItem = document.createElement('div');
        defaultItem.className = 'mic-device-item' + (this.selectedMicDeviceId === null ? ' active' : '');
        defaultItem.innerHTML = '<span>🎤</span><span>По умолчанию</span>';
        defaultItem.addEventListener('click', () => {
          this.selectedMicDeviceId = null;
          this.saveAudioSettings();
          UIManager.addMessage('System', '🎤 Выбран микрофон по умолчанию');
          menu.remove();
        });
        menu.appendChild(defaultItem);

        audioInputs.forEach(device => {
          const item = document.createElement('div');
          item.className = 'mic-device-item' + (this.selectedMicDeviceId === device.deviceId ? ' active' : '');
          const label = device.label || `Микрофон ${device.deviceId.slice(0, 8)}`;
          item.innerHTML = `<span>🎙️</span><span>${UIManager.escapeHtml(label)}</span>`;
          item.addEventListener('click', () => {
            this.selectedMicDeviceId = device.deviceId;
            this.saveAudioSettings();
            UIManager.addMessage('System', `🎤 Выбран микрофон: ${label}`);
            menu.remove();
          });
          menu.appendChild(item);
        });
      }

      document.body.appendChild(menu);

      const closeHandler = (e) => {
        if (!menu.contains(e.target) && !buttonElement.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closeHandler);
          document.removeEventListener('contextmenu', closeHandler);
        }
      };

      setTimeout(() => {
        document.addEventListener('click', closeHandler);
        document.addEventListener('contextmenu', closeHandler);
      }, 10);
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
      UIManager.showError('Не удалось получить список микрофонов');
    }
  }

  _calculateBackoffDelay(attempt, baseDelay, maxDelay, jitterFactor) {
    const exponential = baseDelay * Math.pow(2, attempt);
    const capped = Math.min(exponential, maxDelay);
    const jitter = capped * jitterFactor * (Math.random() * 2 - 1);
    return Math.floor(Math.max(baseDelay, Math.min(maxDelay, capped + jitter)));
  }

  _safeSetTimeout(callback, delay, description = 'unknown') {
    const timer = setTimeout(() => {
      this._recoveryTimers.delete(timer);
      callback();
    }, delay);
    this._recoveryTimers.add(timer);
    return timer;
  }

  _clearAllRecoveryTimers() {
    for (const timer of this._recoveryTimers) {
      clearTimeout(timer);
    }
    this._recoveryTimers.clear();
  }

  _resetConsumerRecoveryState(producerId) {
    const state = this.consumerRecoveryState.get(producerId);
    if (state?.nextRetryTimer) {
      clearTimeout(state.nextRetryTimer);
    }
    this.consumerRecoveryState.delete(producerId);
  }

  _resetAllRecoveryState() {
    this._clearAllRecoveryTimers();
    for (const [, state] of this.consumerRecoveryState.entries()) {
      if (state.nextRetryTimer) {
        clearTimeout(state.nextRetryTimer);
      }
    }
    this.consumerRecoveryState.clear();
    this.iceRestartState.clear();
    this.transportRecoveryState.clear();
    this._producersPendingConsume = [];
    this._transportReadyForConsume = false;
  }

  _scheduleConsumerRetry(producerId, producerData, errorReason = 'unknown') {
    let state = this.consumerRecoveryState.get(producerId);
    if (!state) {
      state = { attempts: 0, nextRetryTimer: null, lastError: errorReason, producerData: producerData };
    } else {
      state.attempts++;
      state.lastError = errorReason;
    }
    if (state.attempts >= CONSUMER_RETRY_CONFIG.MAX_ATTEMPTS) {
      state.exhausted = true;
      this.consumerRecoveryState.set(producerId, state);
      if (this.diagnosticActive) {
        this._notifyDiagnosticUpdate();
      }
      return;
    }
    if (state.nextRetryTimer) {
      clearTimeout(state.nextRetryTimer);
    }
    const delay = this._calculateBackoffDelay(
      state.attempts,
      CONSUMER_RETRY_CONFIG.BASE_DELAY,
      CONSUMER_RETRY_CONFIG.MAX_DELAY,
      CONSUMER_RETRY_CONFIG.JITTER_FACTOR
    );
    state.nextRetryTimer = this._safeSetTimeout(() => {
      if (this.consumedProducerIdsRef.has(producerId)) {
        this._resetConsumerRecoveryState(producerId);
        return;
      }
      if (!this.recvTransport || this.recvTransport.closed) {
        this._producersPendingConsume.push({ producerId, producerData, addedAt: Date.now() });
        return;
      }
      this._attemptConsumeWithRetry(producerId, producerData);
    }, delay, `consumer-retry-${producerId.substring(0, 8)}`);
    this.consumerRecoveryState.set(producerId, state);
    if (this.diagnosticActive) {
      this._notifyDiagnosticUpdate();
    }
  }

  _attemptConsumeWithRetry(producerId, producerData) {
    if (!this.socket || !this.socket.connected) {
      this._scheduleConsumerRetry(producerId, producerData, 'socket_disconnected');
      return;
    }
    if (!this.recvTransport || this.recvTransport.closed || this.recvTransport.connectionState === 'failed') {
      this._scheduleConsumerRetry(producerId, producerData, 'transport_not_ready');
      return;
    }
    
    document.querySelectorAll(`audio[id^="audio-${producerId}"]`).forEach(el => el.remove());
    
    this.socket.emit(
      'consume',
      {
        producerId,
        rtpCapabilities: this.device.rtpCapabilities,
        transportId: this.recvTransport.id,
        clientId: this.clientID,
      },
      async (response) => {
        if (!response?.success) {
          const errorMsg = response?.error || 'unknown_error';
          this._scheduleConsumerRetry(producerId, producerData, errorMsg);
          return;
        }
        if (!response.consumerParameters) {
          this._scheduleConsumerRetry(producerId, producerData, 'no_parameters');
          return;
        }
        try {
          const { consumer, audioElement } = await MediaManager.createConsumer(this, response.consumerParameters);
          this._resetConsumerRecoveryState(producerId);
          this.consumerState.set(response.consumerParameters.producerId, {
            status: 'active',
            consumer,
            audioElement,
            lastError: null,
            recoveryAttempts: 0,
          });
          this.consumedProducerIdsRef.add(response.consumerParameters.producerId);

          const members = MembersManager.getMembers();
          let userId = response.consumerParameters.userId;
          if (!userId) {
            const member = members.find(
              (m) => m.clientId === response.consumerParameters.peerId || m.userId === response.consumerParameters.peerId
            );
            userId = member?.userId || response.consumerParameters.peerId;
          }

          if (userId) {
            if (!window.producerUserMap) window.producerUserMap = new Map();

            if (userId.startsWith('client_')) {
              const domMember = Array.from(document.querySelectorAll('.member-item')).find(
                (el) => el.dataset.clientId === userId
              );
              if (domMember?.dataset.userId) {
                userId = domMember.dataset.userId;
              }
            }

            window.producerUserMap.set(response.consumerParameters.producerId, userId);
            UIManager.showVolumeSliderByUserId(response.consumerParameters.producerId, userId);
            
            setTimeout(async () => {
              try {
                const VBM = (await import('./VolumeBoostManager.js')).default;
                await VBM._ensureAudioContext();
                const ctx = VBM.audioCtx;
                
                const track = consumer.track;
                if (track && track.readyState === 'live' && audioElement) {
                  audioElement.volume = 0;
                  audioElement.muted = true;
                  
                  const source = ctx.createMediaStreamSource(audioElement.srcObject);
                  
                  let gainNode = VBM.gainNodes.get(userId);
                  if (!gainNode) {
                    gainNode = ctx.createGain();
                    gainNode.gain.value = 1.0;
                    gainNode.connect(ctx.destination);
                    VBM.gainNodes.set(userId, gainNode);
                  }
                  
                  const oldSource = VBM.sourceNodes.get(userId);
                  if (oldSource) {
                    try { oldSource.disconnect(); } catch(e) {}
                  }
                  
                  source.connect(gainNode);
                  VBM.sourceNodes.set(userId, source);
                }
              } catch (e) {
                console.error('AudioContext setup error for', userId, e);
              }
            }, 500);
          }

          if (this.diagnosticActive) {
            this._notifyDiagnosticUpdate();
          }
        } catch (error) {
          this._scheduleConsumerRetry(producerId, producerData, error.message);
        }
      }
    );
  }

  _processPendingConsumeQueue() {
    if (!this._transportReadyForConsume) return;
    if (this._producersPendingConsume.length === 0) return;
    const toProcess = [...this._producersPendingConsume];
    this._producersPendingConsume = [];
    for (const item of toProcess) {
      if (Date.now() - item.addedAt > 30000) continue;
      if (this.consumedProducerIdsRef.has(item.producerId)) continue;
      this._attemptConsumeWithRetry(item.producerId, item.producerData);
    }
  }

  _scheduleIceRestart(transport, transportType) {
    const transportId = transport.id;
    let state = this.iceRestartState.get(transportId);
    if (!state) {
      state = { attempts: 0, lastAttempt: 0, state: 'pending' };
    } else {
      state.attempts++;
    }
    if (state.attempts >= ICE_RESTART_CONFIG.MAX_ATTEMPTS) {
      this.iceRestartState.delete(transportId);
      this._scheduleTransportReconnect(transportType);
      return;
    }
    const delay = this._calculateBackoffDelay(
      state.attempts,
      ICE_RESTART_CONFIG.BASE_DELAY,
      ICE_RESTART_CONFIG.MAX_DELAY,
      ICE_RESTART_CONFIG.JITTER_FACTOR
    );
    state.lastAttempt = Date.now();
    state.nextRetryTimer = this._safeSetTimeout(async () => {
      try {
        if (!transport || transport.closed) {
          this.iceRestartState.delete(transportId);
          this._scheduleTransportReconnect(transportType);
          return;
        }
        const iceParameters = await this._requestIceRestart(transportId);
        if (iceParameters) {
          await transport.restartIce({ iceParameters });
          this.iceRestartState.delete(transportId);
          if (transportType === 'recv') {
            this._transportReadyForConsume = true;
            this._processPendingConsumeQueue();
          }
        } else {
          throw new Error('Не удалось получить ICE параметры');
        }
      } catch (error) {
        const currentState = this.iceRestartState.get(transportId);
        if (currentState) {
          this._scheduleIceRestart(transport, transportType);
        }
      }
    }, delay, `ice-restart-${transportType}`);
    this.iceRestartState.set(transportId, state);
  }

  startTrafficMonitor() {
    if (this._trafficMonitorInterval) return;

    this._trafficMonitorInterval = setInterval(async () => {
      await this._checkConsumersTraffic();
    }, 200);
  }

  stopTrafficMonitor() {
    if (this._trafficMonitorInterval) {
      clearInterval(this._trafficMonitorInterval);
      this._trafficMonitorInterval = null;
    }
    this._lastBytesReceived.clear();
    this._trafficActiveProducers.clear();

    document.querySelectorAll('.member-avatar.speaking').forEach((avatar) => {
      avatar.style.animation = '';
      avatar.style.boxShadow = '';
      avatar.style.transform = '';
      avatar.classList.remove('speaking');
    });

    document.querySelectorAll('.mobile-online-icon.speaking').forEach((icon) => {
      icon.style.animation = '';
      icon.style.boxShadow = '';
      icon.style.transform = '';
      icon.classList.remove('speaking');
    });
  }

  async _checkConsumersTraffic() {
    if (!this.consumerState || this.consumerState.size === 0) return;

    const nowActiveProducers = new Set();

    for (const [producerId, state] of this.consumerState.entries()) {
      if (state.status !== 'active' || !state.consumer || state.consumer.closed) {
        continue;
      }

      try {
        const stats = await state.consumer.getStats();
        let currentBytes = 0;

        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            currentBytes = report.bytesReceived || 0;
          }
        });

        const lastBytes = this._lastBytesReceived.get(producerId) || currentBytes;
        this._lastBytesReceived.set(producerId, currentBytes);

        const hasTraffic = currentBytes - lastBytes > 100;

        if (hasTraffic) {
          nowActiveProducers.add(producerId);
        }

        const producerUserMap = window.producerUserMap || new Map();
        const userId = producerUserMap.get(producerId);

        if (userId) {
          this._updateAvatarSpeakingState(userId, hasTraffic);
        }
      } catch (e) {
      }
    }

    this._trafficActiveProducers = nowActiveProducers;
  }

  _updateAvatarSpeakingState(userId, isSpeaking) {
    if (!userId) return;

    if (!isSpeaking && this._speakingTimeouts?.has(userId)) {
      return;
    }

    const applyState = (speaking) => {
      const memberItems = document.querySelectorAll(`.member-item[data-user-id="${userId}"]`);
      memberItems.forEach((memberItem) => {
        const avatar = memberItem.querySelector('.member-avatar');
        if (!avatar) return;

        if (speaking) {
          avatar.style.animation = 'speak-pulse 0.6s ease-in-out infinite alternate';
          avatar.style.boxShadow = '0 0 12px #2ecc71, 0 0 24px #2ecc71';
          avatar.style.transform = 'scale(1.05)';
          avatar.classList.add('speaking');
        } else {
          avatar.style.animation = '';
          avatar.style.boxShadow = '';
          avatar.style.transform = '';
          avatar.classList.remove('speaking');
        }
      });

      const mobileIcon = document.querySelector(`.mobile-online-icon[data-user-id="${userId}"]`);
      if (mobileIcon) {
        if (speaking) {
          mobileIcon.style.animation = 'speak-pulse 0.6s ease-in-out infinite alternate';
          mobileIcon.style.boxShadow = '0 0 12px #2ecc71, 0 0 24px #2ecc71';
          mobileIcon.style.transform = 'scale(1.1)';
          mobileIcon.classList.add('speaking');
        } else {
          mobileIcon.style.animation = '';
          mobileIcon.style.boxShadow = '';
          mobileIcon.style.transform = '';
          mobileIcon.classList.remove('speaking');
        }
      }
    };

    if (isSpeaking) {
      if (this._speakingTimeouts?.has(userId)) {
        clearTimeout(this._speakingTimeouts.get(userId));
        this._speakingTimeouts.delete(userId);
      }
      applyState(true);
    } else {
      if (!this._speakingTimeouts) this._speakingTimeouts = new Map();

      if (this._speakingTimeouts.has(userId)) {
        clearTimeout(this._speakingTimeouts.get(userId));
      }

      const timeout = setTimeout(() => {
        applyState(false);
        this._speakingTimeouts.delete(userId);
      }, 300);

      this._speakingTimeouts.set(userId, timeout);
    }
  }

  isProducerSendingTraffic(producerId) {
    return this._trafficActiveProducers.has(producerId);
  }

  isUserSendingTraffic(userId) {
    const producerUserMap = window.producerUserMap || new Map();

    for (const [producerId, uid] of producerUserMap.entries()) {
      if (uid === userId) {
        return this._trafficActiveProducers.has(producerId);
      }
    }
    return false;
  }

  async _requestIceRestart(transportId) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        reject(new Error('Socket not connected'));
        return;
      }
      const timeout = setTimeout(() => {
        reject(new Error('ICE restart timeout'));
      }, 5000);
      this.socket.emit('restart-ice', { transportId, roomId: this.currentRoom }, (response) => {
        clearTimeout(timeout);
        if (response?.success && response.iceParameters) {
          resolve(response.iceParameters);
        } else {
          reject(new Error(response?.error || 'ICE restart failed'));
        }
      });
    });
  }

  _scheduleTransportReconnect(transportType) {
    let state = this.transportRecoveryState.get(transportType);
    if (!state) {
      state = { attempts: 0, timer: null };
    } else {
      state.attempts++;
    }
    if (state.attempts >= TRANSPORT_RECONNECT_CONFIG.MAX_ATTEMPTS) {
      this.transportRecoveryState.delete(transportType);
      if (this.currentRoom && !this.isReconnecting) {
        this.reconnectToRoom(this.currentRoom);
      }
      return;
    }
    const delay = this._calculateBackoffDelay(
      state.attempts,
      TRANSPORT_RECONNECT_CONFIG.BASE_DELAY,
      TRANSPORT_RECONNECT_CONFIG.MAX_DELAY,
      TRANSPORT_RECONNECT_CONFIG.JITTER_FACTOR
    );
    if (state.timer) {
      clearTimeout(state.timer);
    }
    state.timer = this._safeSetTimeout(async () => {
      try {
        if (transportType === 'recv' && this.mediaData) {
          await this._recreateRecvTransport();
        } else if (transportType === 'send' && this.mediaData) {
          await this._recreateSendTransport();
        }
        this.transportRecoveryState.delete(transportType);
      } catch (error) {
        const currentState = this.transportRecoveryState.get(transportType);
        if (currentState) {
          this._scheduleTransportReconnect(transportType);
        }
      }
    }, delay, `transport-reconnect-${transportType}`);
    this.transportRecoveryState.set(transportType, state);
  }

  async _recreateRecvTransport() {
    if (!this.mediaData || !this.device) {
      throw new Error('No media data or device');
    }
    if (this.recvTransport && !this.recvTransport.closed) {
      try {
        this.recvTransport.close();
      } catch (e) {
      }
    }
    const recvOptions = {
      id: this.mediaData.recvTransport.id,
      iceParameters: this.mediaData.recvTransport.iceParameters,
      iceCandidates: this.mediaData.recvTransport.iceCandidates,
      dtlsParameters: this.mediaData.recvTransport.dtlsParameters,
      iceServers: this.mediaData.iceServers || [],
    };
    this.recvTransport = this.device.createRecvTransport(recvOptions);
    MediaManager.setupTransportConnectHandler(this, this.recvTransport);
    MediaManager.setupTransportStateChangeHandler(this, this.recvTransport);
    await this._waitForTransportReady(this.recvTransport, 'recv');
    this._transportReadyForConsume = true;
    this._reconnectAllProducers();
  }

  async _recreateSendTransport() {
    if (!this.mediaData || !this.device) {
      throw new Error('No media data or device');
    }
    if (this.sendTransport && !this.sendTransport.closed) {
      try {
        this.sendTransport.close();
      } catch (e) {
      }
    }
    const sendOptions = {
      id: this.mediaData.sendTransport.id,
      iceParameters: this.mediaData.sendTransport.iceParameters,
      iceCandidates: this.mediaData.sendTransport.iceCandidates,
      dtlsParameters: this.mediaData.sendTransport.dtlsParameters,
      iceServers: this.mediaData.iceServers || [],
    };
    this.sendTransport = this.device.createSendTransport(sendOptions);
    MediaManager.setupTransportConnectHandler(this, this.sendTransport);
    MediaManager.setupTransportStateChangeHandler(this, this.sendTransport);
    MediaManager.setupSendTransportHandlers(this);
    await this._waitForTransportReady(this.sendTransport, 'send');
    if (this.isMicActive && this.stream) {
      await MediaManager.initMicrophone(this);
    }
  }

  _waitForTransportReady(transport, type, timeoutMs = 10000) {
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

  _reconnectAllProducers() {
    this.consumedProducerIdsRef.clear();
    this.consumerState.clear();
    this.pendingProducersRef = [];
    if (this.socket && this.socket.connected) {
      this.socket.emit('request-room-snapshot', { roomId: this.currentRoom }, (response) => {
        if (response?.success && response.producers) {
          for (const producer of response.producers) {
            if (producer.clientID !== this.clientID) {
              this.pendingProducersRef.push(producer);
            }
          }
          this._processPendingProducers();
        }
      });
    }
  }

  _notifyDiagnosticUpdate() {
    if (!this.diagnosticActive) return;
    const recoveryInfo = {
      consumers: [],
      transports: {
        recv: { state: this.recvTransport?.connectionState || 'none', recoveryAttempts: this.transportRecoveryState.get('recv')?.attempts || 0 },
        send: { state: this.sendTransport?.connectionState || 'none', recoveryAttempts: this.transportRecoveryState.get('send')?.attempts || 0 },
      },
      pendingConsumeQueue: this._producersPendingConsume.length,
      transportReadyForConsume: this._transportReadyForConsume,
    };
    for (const [producerId, state] of this.consumerRecoveryState.entries()) {
      recoveryInfo.consumers.push({
        producerId: producerId.substring(0, 8),
        attempts: state.attempts,
        exhausted: state.exhausted || false,
        lastError: state.lastError,
      });
    }
    DiagnosticPanel.updateRecoveryInfo?.(recoveryInfo);
  }

  _abortMediaRequests() {
    if (this.joinAbortController) {
      this.joinAbortController.abort();
      this.joinAbortController = null;
    }
    if (this._mediaFetchController) this._mediaFetchController.abort();
    this._mediaFetchController = new AbortController();
    return this._mediaFetchController;
  }

  _abortAuthRequests() {
    if (this._authFetchController) this._authFetchController.abort();
    this._authFetchController = new AbortController();
    return this._authFetchController;
  }

  async _fetchWithTimeout(url, options = {}, timeoutMs = JOIN_TIMEOUT, abortable = true) {
    const controller = abortable ? this._abortMediaRequests() : this._abortAuthRequests();
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

    let retryCount = 0;
    const MAX_RETRIES = 2;

    const executeRequest = async (currentToken) => {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${currentToken}`,
        ...(options.headers || {}),
      };

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal || timeoutController.signal,
      });

      return response;
    };

    try {
      let response = await executeRequest(this.token);

      if (response.status === 401 && retryCount < MAX_RETRIES) {
        const refreshed = await this._refreshToken();

        if (refreshed) {
          retryCount++;
          response = await executeRequest(this.token);
        } else {
          throw new Error('Не удалось обновить токен');
        }
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = text || errorMessage;
        }
        throw new Error(errorMessage);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        if (abortable) throw new Error('Request cancelled');
        throw error;
      }
      throw error;
    }
  }

  async _refreshToken() {
    try {
      const isValid = await AuthManager.validateToken(this, this.userId, this.token, this.tokenVersion);

      if (isValid) {
        return true;
      }
    } catch (e) {
    }

    const lastUser = AuthManager.loadLastUser();
    if (lastUser && lastUser.username === this.username) {
      try {
        const response = await fetch(`${this.API_SERVER_URL}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: this.userId,
            refreshToken: lastUser.refreshToken || this.token,
            tokenVersion: this.tokenVersion,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          this.token = data.token;
          this.tokenVersion = data.tokenVersion || this.tokenVersion;

          AuthManager.saveLastUser({
            username: this.username,
            userId: this.userId,
            token: this.token,
            tokenVersion: this.tokenVersion,
          });

          return true;
        }
      } catch (e) {
      }
    }

    const currentRoomId = this.currentRoom;
    const currentServerId = this.currentServerId;

    AuthManager.showAuthModal(this);

    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.token && this.userId) {
          clearInterval(checkInterval);

          if (currentRoomId && this.currentRoom !== currentRoomId) {
            this.joinRoom(currentRoomId, true).catch(console.error);
          }

          resolve(true);
        }
      }, 500);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(false);
      }, 30000);
    });
  }

  logToRoomChat(message, type = 'system') {
    if (!this.currentRoom || !this.socket) return false;
    const requestId = `req_${Date.now()}_${this.requestIdCounter++}`;
    this.socket.emit('send-message', {
      roomId: this.currentRoom,
      text: message,
      type: 'system',
      isSystem: true,
      requestId,
      timestamp: new Date().toISOString(),
    });
    this.pendingRequests.set(requestId, { message, type, timestamp: Date.now(), roomId: this.currentRoom });
    setTimeout(() => this.pendingRequests.delete(requestId), 5000);
    return requestId;
  }

  setConnectionState(state, roomId = null) {
    const previousState = this.connectionState;
    this.connectionState = state;
    if (previousState !== state) {
      const stateMessages = { [CONNECTION_STATE.ERROR]: '❌ Ошибка подключения' };
      const message = stateMessages[state];
      if (message && (roomId || this.currentRoom)) {
        this.logToRoomChat(message, 'connection');
      }
      UIManager.updateStatus(
        message || '',
        state === CONNECTION_STATE.CONNECTED ? 'connected' : state === CONNECTION_STATE.ERROR ? 'error' : 'connecting'
      );
    }
  }

  playSound(soundName) {
    if (window.ELECTRON_CUSTOM_SOUNDS_ENABLED) {
      if (window.ipcRenderer) {
        try {
          window.ipcRenderer.sendToHost('play-sound', soundName);
          return;
        } catch (e) {
        }
      }
      window.postMessage({ type: 'ELECTRON_PLAY_SOUND', soundType: soundName, source: 'webview' }, '*');
      return;
    }
    if (typeof Audio === 'undefined') return;
    const audio = new Audio(`/sounds/${soundName}.mp3`);
    audio.volume = 1.0;
    audio.play().catch(() => {});
  }

  async init() {
    this.initElements();
    this.initEventListeners();
    this.setupElectronBridge();
    UIManager.setClient(this);
    SoundManager.init(this);
    SettingsManager.init();
    UIManager.initDesktopSwipe();
    InviteManager.init(this);
    AvatarManager.init(this);
    MobileOnlineBar.init();
    ConsoleCommandManager.init(this);
    try {
      const NoteAPI = (await import('./NoteAPI.js')).default;
      const NoteUIManager = (await import('./NoteUIManager.js')).default;
      NoteUIManager.init(this, new NoteAPI(this));
    } catch (err) {
      console.error('Failed to initialize notes:', err.message);
    }
    await this.initAutoConnect();
  }

  initElements() {
    this.elements.micButton = document.querySelector('.mic-button');
    this.elements.micToggleBtn = document.querySelector('.mic-toggle-btn');
    this.elements.messageInput = document.querySelector('.message-input');
    this.elements.sendButton = document.querySelector('.send-btn');
    this.elements.currentRoomTitle = document.querySelector('.current-room-title');
    this.elements.toggleSidebarBtn = document.querySelector('.toggle-sidebar-btn');
    this.elements.toggleMembersBtn = document.querySelector('.toggle-members-btn');
    this.elements.settingsBtn = document.querySelector('.settings-btn');
    this.elements.closePanelBtn = document.querySelector('.close-panel-btn');
    this.elements.closeSidebarBtn = document.querySelector('.close-sidebar-btn');
    this.elements.createServerBtn = document.querySelector('.create-server-btn');
    this.elements.createRoomBtn = document.querySelector('.create-room-btn');
    this.elements.serversToggleBtn = document.querySelector('#serversToggle');
    this.elements.roomsToggleBtn = document.querySelector('#roomsToggle');
    this.elements.serversList = document.querySelector('.servers-list');
    this.elements.roomsList = document.querySelector('.rooms-list');
    this.elements.membersList = document.querySelector('.members-list');
    this.elements.messagesContainer = document.querySelector('.messages-container');
    this.elements.serversPanel = document.getElementById('servers-panel');
    this.elements.roomsPanel = document.getElementById('rooms-panel');
    this.elements.sidebar = document.querySelector('.sidebar');
    this.elements.membersPanel = document.querySelector('.members-panel');
    this.elements.serverSearchInput = document.querySelector('#serverSearch');
    this.elements.clearSearchBtn = document.querySelector('#clearSearchBtn');
    this.elements.backBtn = document.querySelector('.back-btn');
    this.elements.splitToggleBtn = document.querySelector('.split-toggle-btn');
    this.elements.pollCreateBtn = document.querySelector('.poll-create-btn');
    if (!this.elements.splitToggleBtn) {
      const headerControls = document.querySelector('.header-controls');
      const micBtn = headerControls?.querySelector('.mic-toggle-btn');
      if (headerControls) {
        const splitBtn = document.createElement('button');
        splitBtn.className = 'split-toggle-btn';
        splitBtn.innerHTML = '🔲';
        splitBtn.title = 'Разделить чат';
        splitBtn.id = 'splitToggleBtn';
        if (micBtn) headerControls.insertBefore(splitBtn, micBtn);
        else headerControls.appendChild(splitBtn);
        this.elements.splitToggleBtn = splitBtn;
      }
    }
    if (!this.elements.pollCreateBtn) {
      const headerControls = document.querySelector('.header-controls');
      if (headerControls) {
        const pollBtn = document.createElement('button');
        pollBtn.className = 'poll-create-btn';
        pollBtn.innerHTML = '📊';
        pollBtn.title = 'Создать опрос';
        pollBtn.id = 'pollCreateBtn';
        const splitBtn = headerControls.querySelector('.split-toggle-btn');
        if (splitBtn) headerControls.insertBefore(pollBtn, splitBtn);
        else headerControls.appendChild(pollBtn);
        this.elements.pollCreateBtn = pollBtn;
      }
    }
    if (this.elements.messagesContainer) {
      let sentinel = this.elements.messagesContainer.querySelector('.history-sentinel');
      if (!sentinel) {
        sentinel = document.createElement('div');
        sentinel.className = 'history-sentinel';
        sentinel.style.cssText = 'height: 1px; width: 1px; margin: 0; padding: 0; overflow: hidden; visibility: hidden;';
        this.elements.messagesContainer.prepend(sentinel);
        this.elements.historySentinel = sentinel;
      }
    }
    if (this.elements.clearSearchBtn) {
      this.elements.clearSearchBtn.addEventListener('click', () => ServerManager.clearSearchAndShowAllServers(this));
    }
    if (this.elements.messagesContainer) {
      MessageRenderer.initReactionHover(this.elements.messagesContainer);
    }
  }

  resetHistoryState() {
    this.removeHistorySentinel();
    this.hasMoreHistory = true;
    this.isHistoryLoading = false;
    this.oldestMessageId = null;
    if (this.elements.messagesContainer) {
      const sentinel = document.createElement('div');
      sentinel.className = 'history-sentinel';
      sentinel.style.cssText = 'height: 1px; width: 1px; margin: 0; padding: 0; overflow: hidden; visibility: hidden;';
      this.elements.messagesContainer.prepend(sentinel);
      this.elements.historySentinel = sentinel;
    }
  }

  _initSwipeGestures() {
    const SWIPE_THRESHOLD = 50;
    const ANGLE_THRESHOLD = 30;
    document.addEventListener(
      'touchstart',
      (e) => {
        this._touchStartX = e.touches[0].clientX;
        this._touchStartY = e.touches[0].clientY;
      },
      { passive: true }
    );
    document.addEventListener(
      'touchend',
      (e) => {
        if (!this._touchStartX || !this._touchStartY) return;
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const diffX = touchEndX - this._touchStartX;
        const diffY = touchEndY - this._touchStartY;
        const absDiffX = Math.abs(diffX);
        const absDiffY = Math.abs(diffY);
        if (absDiffX < SWIPE_THRESHOLD) {
          this._touchStartX = 0;
          this._touchStartY = 0;
          return;
        }
        const angle = Math.abs((Math.atan2(diffY, diffX) * 180) / Math.PI);
        if (angle > ANGLE_THRESHOLD && angle < 180 - ANGLE_THRESHOLD) {
          this._touchStartX = 0;
          this._touchStartY = 0;
          return;
        }
        const isSwipeRight = diffX > 0;
        const isSwipeLeft = diffX < 0;
        const leftPanelOpen = this.elements.sidebar.classList.contains('open');
        const rightPanelOpen = this.elements.membersPanel.classList.contains('open');
        if (!leftPanelOpen && !rightPanelOpen) {
          if (isSwipeRight) this.elements.sidebar.classList.add('open');
          else if (isSwipeLeft) this.elements.membersPanel.classList.add('open');
        } else if (leftPanelOpen) {
          if (isSwipeLeft) this.elements.sidebar.classList.remove('open');
        } else if (rightPanelOpen) {
          if (isSwipeRight) this.elements.membersPanel.classList.remove('open');
        }
        this._touchStartX = 0;
        this._touchStartY = 0;
      },
      { passive: true }
    );
    document.addEventListener(
      'touchcancel',
      () => {
        this._touchStartX = 0;
        this._touchStartY = 0;
      },
      { passive: true }
    );
  }

  initEventListeners() {
    const userGestureHandler = async () => {
      await VolumeBoostManager.resume();
      if (/Android/i.test(navigator.userAgent)) {
        await VolumeBoostManager.unlockAndroidAudio();
      }
      document.removeEventListener('click', userGestureHandler, { once: true });
      document.removeEventListener('touchstart', userGestureHandler, { once: true });
    };
    document.addEventListener('click', userGestureHandler, { once: true });
    document.addEventListener('touchstart', userGestureHandler, { once: true });
    this._initSwipeGestures();
    const micHandler = async () => await this.toggleMicrophone();
    if (this.elements.micButton) {
      this.elements.micButton.addEventListener('click', micHandler);
      this.elements.micButton.title = 'Микрофон (основной)';
      this.elements.micButton.addEventListener('contextmenu', (e) => this.showMicDeviceMenu(e, this.elements.micButton));
    }
    if (this.elements.micToggleBtn) {
      this.elements.micToggleBtn.addEventListener('click', micHandler);
      this.elements.micToggleBtn.title = 'Микрофон (быстрый)';
      this.elements.micToggleBtn.addEventListener('contextmenu', (e) => this.showMicDeviceMenu(e, this.elements.micToggleBtn));
    }
    if (this.elements.messageInput) {
      this.elements.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const text = this.elements.messageInput.value.trim();
          if (text) {
            if (text.startsWith('/poll')) {
              this.handlePollCommand(text);
            } else {
              this.sendMessage(text);
            }
            this.elements.messageInput.value = '';
            this.elements.messageInput.style.height = '40px';
          }
        }
      });
      this.elements.messageInput.addEventListener('input', () => {
        const el = this.elements.messageInput;
        el.style.height = '40px';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
      });
    }
    if (this.elements.sendButton) {
      this.elements.sendButton.addEventListener('click', () => {
        const text = this.elements.messageInput.value.trim();
        if (text) {
          if (text.startsWith('/poll')) {
            this.handlePollCommand(text);
          } else {
            this.sendMessage(text);
          }
          this.elements.messageInput.value = '';
          this.elements.messageInput.style.height = '40px';
          this.elements.messageInput.focus();
        }
      });
    }
    if (this.elements.toggleSidebarBtn) {
      this.elements.toggleSidebarBtn.addEventListener('click', () => this.elements.sidebar.classList.toggle('open'));
    }
    if (this.elements.toggleMembersBtn) {
      this.elements.toggleMembersBtn.addEventListener('click', () => this.elements.membersPanel.classList.toggle('open'));
    }
    if (this.elements.closePanelBtn) {
      this.elements.closePanelBtn.addEventListener('click', () => this.elements.membersPanel.classList.remove('open'));
    }
    if (this.elements.closeSidebarBtn) {
      this.elements.closeSidebarBtn.addEventListener('click', () => this.elements.sidebar.classList.remove('open'));
    }
    if (this.elements.settingsBtn) {
      this.elements.settingsBtn.addEventListener('click', () => ModalManager.openSettingsModal(this));
    }
    if (this.elements.createServerBtn) {
      this.elements.createServerBtn.addEventListener('click', () => ServerManager.createServer(this));
    }
    if (this.elements.createRoomBtn) {
      this.elements.createRoomBtn.addEventListener('click', () => {
        if (!this.currentServerId) return UIManager.showError('Сначала выберите дерево');
        ModalManager.openCreateRoomModal(this, (name) => RoomManager.createRoom(this, this.currentServerId, name));
      });
    }
    if (this.elements.pollCreateBtn) {
      this.elements.pollCreateBtn.addEventListener('click', () => {
        if (!this.currentRoom) return UIManager.showError('Сначала займите гнездо');
        CreatePollModal.open(this, this.currentRoom);
      });
    }
    if (this.elements.serversToggleBtn) {
      this.elements.serversToggleBtn.addEventListener('click', () => {
        ServerManager.clearSearchAndShowAllServers(this);
        this.showPanel('servers');
      });
    }
    if (this.elements.roomsToggleBtn) {
      this.elements.roomsToggleBtn.addEventListener('click', () => this.showPanel('rooms'));
    }
    if (this.elements.serverSearchInput) {
      this.elements.serverSearchInput.addEventListener('input', (e) => this.searchServers(e.target.value));
    }
    if (this.elements.splitToggleBtn) {
      this.elements.splitToggleBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        SecondaryChatManager.showDirectionPopup(this, e);
      });
    }
    const headerControls = document.querySelector('.header-controls');
    if (headerControls) {
      let diagBtn = document.querySelector('.diag-toggle-btn');
      if (!diagBtn) {
        diagBtn = document.createElement('button');
        diagBtn.className = 'diag-toggle-btn';
        diagBtn.innerHTML = '📊';
        diagBtn.title = 'Диагностика комнаты';
        diagBtn.style.cssText = 'background:none; border:none; font-size:18px; cursor:pointer; margin-right:8px;';
        const micBtn = headerControls.querySelector('.mic-toggle-btn');
        if (micBtn) headerControls.insertBefore(diagBtn, micBtn);
        else headerControls.appendChild(diagBtn);
      }
      diagBtn.addEventListener('click', () => {
        if (this.diagnosticActive) this.stopDiagnostic();
        else this.startDiagnostic();
      });
      const notesBtn = document.querySelector('#notesToggle');
      const dropdown = document.getElementById('notes-dropdown-menu');
      if (notesBtn && dropdown) {
        const newBtn = notesBtn.cloneNode(true);
        notesBtn.parentNode.replaceChild(newBtn, notesBtn);
        newBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const rect = newBtn.getBoundingClientRect();
          dropdown.style.left = `${rect.left}px`;
          dropdown.style.top = `${rect.bottom + 5}px`;
          dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });
      }
      const dropdownItems = document.querySelectorAll('.notes-dropdown-item');
      dropdownItems.forEach((item) => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const type = item.dataset.type;
          const dropdown = document.getElementById('notes-dropdown-menu');
          if (dropdown) dropdown.style.display = 'none';
          this.switchToNotes(type);
        });
      });
    }
    const mainContent = document.querySelector('.main-content');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept =
      'image/jpeg,image/jpg,image/png,image/webp,image/gif,image/bmp,image/tiff,image/svg+xml,image/heic,image/heif,image/avif,audio/mpeg,audio/mp3,audio/wav,audio/wave,audio/x-wav,audio/ogg,audio/webm,audio/aac,audio/flac,audio/x-m4a,audio/mp4,audio/x-ms-wma,video/webm,.webm,.opus,.ogg,.flac,.m4a';
    fileInput.style.display = 'none';
    fileInput.id = 'image-upload-input';
    document.body.appendChild(fileInput);
    const attachBtn = document.querySelector('.attach-btn');
    if (mainContent) {
      mainContent.addEventListener('click', (e) => {
        if (
          !e.target.closest(
            '.message-input, .send-btn, .mic-toggle-btn, .settings-btn, .toggle-members-btn, .current-room-title, .toggle-sidebar-btn, .attach-btn, .split-toggle-btn, .poll-create-btn'
          )
        ) {
          this.elements.sidebar.classList.remove('open');
          this.elements.membersPanel.classList.remove('open');
        }
      });
      mainContent.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        mainContent.classList.add('drag-over');
      });
      mainContent.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        mainContent.classList.remove('drag-over');
      });
      mainContent.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        mainContent.classList.remove('drag-over');
        if (!this.currentRoom) return UIManager.showError('Сначала займите гнездо');
        const file = e.dataTransfer.files[0];
        if (!file) return;
        const allowedImageTypes = [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/webp',
          'image/gif',
          'image/bmp',
          'image/tiff',
          'image/svg+xml',
          'image/heic',
          'image/heif',
          'image/avif',
        ];
        const allowedAudioTypes = [
          'audio/mpeg',
          'audio/mp3',
          'audio/wav',
          'audio/wave',
          'audio/x-wav',
          'audio/ogg',
          'audio/webm',
          'audio/aac',
          'audio/flac',
          'audio/x-m4a',
          'audio/mp4',
          'audio/x-ms-wma',
          'video/webm',
          'audio/webm;codecs=opus',
          'audio/opus',
          'application/ogg',
          'audio/x-flac',
          'audio/x-aac',
        ];
        try {
          const isImage = allowedImageTypes.includes(file.type);
          const isAudio = allowedAudioTypes.some((type) =>
            type.includes(';') ? file.type === type : file.type === type || file.type.startsWith(type.split(';')[0])
          );
          if (isImage) {
            if (file.size > 10 * 1024 * 1024) return UIManager.showError('Файл слишком большой (макс. 10 МБ)');
            const urls = await TextChatManager.uploadImage(this, this.currentRoom, file);
            await TextChatManager.sendMessage(this, urls, 'image');
          } else if (isAudio) {
            if (file.size > 50 * 1024 * 1024) return UIManager.showError('Аудиофайл слишком большой (макс. 50 МБ)');
            const result = await TextChatManager.uploadAudio(this, this.currentRoom, file);
            await TextChatManager.sendMessage(this, { audioUrl: result.audioUrl }, 'audio');
          } else {
            return UIManager.showError('Поддерживаются только изображения и аудиофайлы');
          }
        } catch (error) {
          UIManager.showError('Не удалось отправить файл: ' + error.message);
        }
      });
    }
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!this.currentRoom) {
        fileInput.value = '';
        return UIManager.showError('Сначала займите гнездо');
      }
      const allowedImageTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/bmp',
        'image/tiff',
        'image/svg+xml',
        'image/heic',
        'image/heif',
        'image/avif',
      ];
      const allowedAudioTypes = [
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'audio/wave',
        'audio/x-wav',
        'audio/ogg',
        'audio/webm',
        'audio/aac',
        'audio/flac',
        'audio/x-m4a',
        'audio/mp4',
        'audio/x-ms-wma',
        'video/webm',
        'audio/webm;codecs=opus',
        'audio/opus',
        'application/ogg',
        'audio/x-flac',
        'audio/x-aac',
      ];
      try {
        const isImage = allowedImageTypes.includes(file.type);
        const isAudio = allowedAudioTypes.some((type) =>
          type.includes(';') ? file.type === type : file.type === type || file.type.startsWith(type.split(';')[0])
        );
        if (isImage) {
          if (file.size > 10 * 1024 * 1024) {
            fileInput.value = '';
            return UIManager.showError('Файл слишком большой (макс. 10 МБ)');
          }
          const urls = await TextChatManager.uploadImage(this, this.currentRoom, file);
          await TextChatManager.sendMessage(this, urls, 'image');
        } else if (isAudio) {
          if (file.size > 50 * 1024 * 1024) {
            fileInput.value = '';
            return UIManager.showError('Аудиофайл слишком большой (макс. 50 МБ)');
          }
          const result = await TextChatManager.uploadAudio(this, this.currentRoom, file);
          await TextChatManager.sendMessage(this, { audioUrl: result.audioUrl }, 'audio');
        } else {
          fileInput.value = '';
          return UIManager.showError('Поддерживаются только изображения и аудиофайлы');
        }
      } catch (error) {
        UIManager.showError('Не удалось отправить файл: ' + error.message);
      } finally {
        fileInput.value = '';
      }
    });
    if (attachBtn) attachBtn.addEventListener('click', () => fileInput.click());
    document.addEventListener('paste', async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      let imageFile = null;
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            imageFile = file;
            break;
          }
        }
      }
      if (!imageFile) return;
      e.preventDefault();
      if (!this.currentRoom) return UIManager.showError('Сначала займите гнездо');
      const allowedImageTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/bmp',
        'image/tiff',
        'image/svg+xml',
        'image/heic',
        'image/heif',
        'image/avif',
      ];
      if (!allowedImageTypes.includes(imageFile.type)) {
        return UIManager.showError('Поддерживаются только изображения: JPEG, PNG, WebP, GIF, BMP, TIFF, SVG, HEIC, HEIF, AVIF');
      }
      if (imageFile.size > 10 * 1024 * 1024) return UIManager.showError('Файл слишком большой (макс. 10 МБ)');
      try {
        const urls = await TextChatManager.uploadImage(this, this.currentRoom, imageFile);
        await TextChatManager.sendMessage(this, urls, 'image');
      } catch (error) {
        UIManager.showError('Не удалось отправить изображение: ' + error.message);
      }
    });
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isAndroid && !document.getElementById('android-audio-unlock')) {
      const androidUnlockBtn = document.createElement('button');
      androidUnlockBtn.id = 'android-audio-unlock';
      androidUnlockBtn.textContent = '🔊 Включить звук';
      androidUnlockBtn.style.cssText =
        'position:fixed;bottom:80px;right:20px;z-index:9999;padding:12px 24px;background:#4CAF50;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);display:none;';
      androidUnlockBtn.addEventListener('click', async () => {
        const success = await VolumeBoostManager.unlockAndroidAudio();
        if (success) {
          androidUnlockBtn.style.display = 'none';
          UIManager.addMessage('System', '✅ Звук разблокирован');
        }
      });
      document.body.appendChild(androidUnlockBtn);
      const originalJoinRoom = this.joinRoom.bind(this);
      this.joinRoom = async (...args) => {
        const result = await originalJoinRoom(...args);
        if (result && isAndroid) {
          const ctx = VolumeBoostManager.audioCtx;
          if (!ctx || ctx.state === 'suspended') androidUnlockBtn.style.display = 'block';
        }
        return result;
      };
    }
  }

  handlePollCommand(text) {
    const currentRoomData = this.rooms?.find((r) => r.id === this.currentRoom);
    if (currentRoomData?.imagesOnly && this.userId !== currentRoomData?.ownerId) {
      UIManager.showError('📷 В этом гнезде разрешены только картинки, опросы недоступны');
      return;
    }
    const args = text.slice(5).trim();
    if (!args) {
      UIManager.showError('Использование: /poll "Вопрос" "Вариант 1" "Вариант 2" ...');
      return;
    }
    const matches = args.match(/"([^"]*)"/g);
    if (!matches || matches.length < 3) {
      UIManager.showError('Требуется вопрос и минимум два варианта в кавычках');
      return;
    }
    const parsed = matches.map((m) => m.replace(/"/g, '').trim());
    const question = parsed[0];
    const options = parsed.slice(1);
    if (question.length < 1 || question.length > 256) {
      UIManager.showError('Вопрос должен быть от 1 до 256 символов');
      return;
    }
    if (options.length < 2 || options.length > 10) {
      UIManager.showError('Нужно от 2 до 10 вариантов ответа');
      return;
    }
    for (const opt of options) {
      if (opt.length < 1 || opt.length > 100) {
        UIManager.showError('Каждый вариант должен быть от 1 до 100 символов');
        return;
      }
    }
    this.createPoll(this.currentRoom, question, options, { multiple: false });
  }

  initHistoryObserver() {
    if (this.historyObserver) this.historyObserver.disconnect();
    const sentinel = this.elements.historySentinel || this.elements.messagesContainer?.querySelector('.history-sentinel');
    if (!sentinel || !this.elements.messagesContainer) return;
    this.historyObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && this.hasMoreHistory && !this.isHistoryLoading) {
          this.loadHistory();
        }
      },
      { root: this.elements.messagesContainer, rootMargin: '150px 0px 0px 0px', threshold: 0.01 }
    );
    this.historyObserver.observe(sentinel);
  }

  async loadHistory() {
    if (this.isHistoryLoading || !this.hasMoreHistory || !this.currentRoom) return;
    this.isHistoryLoading = true;
    this.updateHistorySentinel(true);
    try {
      const result = await TextChatManager.loadMoreMessages(this, this.currentRoom, this.oldestMessageId);
      if (result && result.messages && result.messages.length > 0) {
        this.oldestMessageId = result.messages[0].id;
        this.hasMoreHistory = result.hasMore;
      } else {
        this.hasMoreHistory = false;
      }
      if (!this.hasMoreHistory) {
        this.removeHistorySentinel();
      }
    } catch (error) {
      this.hasMoreHistory = true;
    } finally {
      this.isHistoryLoading = false;
      this.updateHistorySentinel(false);
    }
  }

  updateHistorySentinel(isLoading) {
    const sentinel = this.elements.historySentinel || this.elements.messagesContainer?.querySelector('.history-sentinel');
    if (sentinel) {
      sentinel.innerHTML = isLoading ? '⏳ Загрузка...' : '';
    }
  }

  removeHistorySentinel() {
    if (this.historyObserver) {
      this.historyObserver.disconnect();
      this.historyObserver = null;
    }
    const sentinel = this.elements.historySentinel || this.elements.messagesContainer?.querySelector('.history-sentinel');
    if (sentinel) sentinel.remove();
  }

  showPanel(panelName) {
    const { serversPanel, roomsPanel, serversToggleBtn, roomsToggleBtn } = this.elements;
    if (!serversPanel || !roomsPanel || !serversToggleBtn || !roomsToggleBtn) return;
    this.activePanel = panelName;
    if (panelName === 'servers') {
      serversToggleBtn.classList.add('active');
      roomsToggleBtn.classList.remove('active');
      serversPanel.classList.add('active');
      roomsPanel.classList.remove('active');
    } else {
      serversToggleBtn.classList.remove('active');
      roomsToggleBtn.classList.add('active');
      serversPanel.classList.remove('active');
      roomsPanel.classList.add('active');
    }
  }

  processUrlParams() {
    const params = new URLSearchParams(window.location.search);
    this.currentServerId = params.get('server');
    this.currentRoom = params.get('room');
    this.inviteServerId = params.get('invite');
    const inviteCode = params.get('invite');
    if (inviteCode && /^[a-zA-Z0-9]{4,6}$/.test(inviteCode)) {
      const storedInvite = localStorage.getItem('pending_invite');
      if (storedInvite && storedInvite !== inviteCode) localStorage.removeItem('pending_invite');
      this.pendingInviteCode = inviteCode;
      InviteManager.setPendingInvite(inviteCode);
    }
  }

  async ensureConsumer(producerId, producerData = {}) {
    if (this.consumedProducerIdsRef.has(producerId)) return true;
    
    if (producerData.clientID === this.clientID) {
      this.consumedProducerIdsRef.add(producerId);
      return false;
    }
    
    if (!this.recvTransport || this.recvTransport.closed || this.recvTransport.connectionState === 'failed') {
      const recoveryState = this.consumerRecoveryState.get(producerId);
      if (!recoveryState || !recoveryState.exhausted) {
        const alreadyPending = this.pendingProducersRef.some(p => (p.id || p.producerId) === producerId);
        if (!alreadyPending) {
          this.pendingProducersRef.push(producerData);
        }
        
        const alreadyInQueue = this._producersPendingConsume.some(item => item.producerId === producerId);
        if (!alreadyInQueue) {
          this._producersPendingConsume.push({ producerId, producerData, addedAt: Date.now() });
        }
      }
      return false;
    }
    
    this._attemptConsumeWithRetry(producerId, producerData);
    return true;
  }

  _processPendingProducers() {
    if (this._isProcessingConsumers) return;
    this._isProcessingConsumers = true;
    this._transportReadyForConsume = true;
    
    if (!this.recvTransport || this.recvTransport.closed || this.recvTransport.connectionState === 'failed') {
      this._isProcessingConsumers = false;
      this._transportReadyForConsume = false;
      return;
    }
    
    const uniqueProducers = new Map();
    for (const p of this.pendingProducersRef) {
      const id = p.id || p.producerId;
      if (!uniqueProducers.has(id)) {
        uniqueProducers.set(id, p);
      }
    }
    const toProcess = Array.from(uniqueProducers.values());
    this.pendingProducersRef = [];
    
    const promises = toProcess.map((p) =>
      this.ensureConsumer(p.id || p.producerId, p).catch((e) => {
        this._scheduleConsumerRetry(p.id || p.producerId, p, e.message);
      })
    );
    
    Promise.allSettled(promises).finally(() => {
      this._isProcessingConsumers = false;
      this._processPendingConsumeQueue();
      if (this.pendingProducersRef.length > 0) {
        setTimeout(() => this._processPendingProducers(), 200);
      }
    });
  }

  async initAutoConnect() {
    if (this._joinRoomInProgress || this.isConnected) {
      return;
    }
    this.processUrlParams();
    try {
      const autoLoggedIn = await AuthManager.tryAutoLogin(this);
      if (autoLoggedIn) {
        await ServerManager.loadServers(this, false);

        await AvatarManager.fetchUser(this.userId);

        await UIManager.fetchUsernames([this.userId]);
        if (this.pendingInviteCode || InviteManager.getPendingInvite()) {
          const inviteApplied = await InviteManager.applyPendingInvite();
          if (inviteApplied) {
            this.clearPendingInvite();
            return;
          }
          this.clearPendingInvite();
        }
        const lastServerId = localStorage.getItem('lastServerId');
        const lastRoomId = localStorage.getItem('lastRoomId');
        if (this.currentRoom === lastRoomId && this.isConnected) {
          return;
        }
        if (lastServerId) {
          const serverExists = this.servers.some((s) => s.id === lastServerId);
          if (serverExists) {
            this.currentServerId = lastServerId;
            this.currentServer = this.servers.find((s) => s.id === lastServerId);
            await RoomManager.loadRoomsForServer(this, lastServerId);
            if (lastRoomId) {
              const roomExists = this.rooms?.some((r) => r.id === lastRoomId);
              if (roomExists) {
                this.currentRoom = lastRoomId;
                await this.reconnectToRoom(lastRoomId);
                return;
              }
            }
          }
        }
        return;
      }
      AuthManager.showAuthModal(this);
    } catch (err) {
      UIManager.showError('Критическая ошибка: не удалось загрузить систему авторизации');
    }
  }

  clearPendingInvite() {
    this.pendingInviteCode = null;
    localStorage.removeItem('pending_invite');
    const url = new URL(window.location);
    url.searchParams.delete('invite');
    window.history.replaceState({}, '', url);
  }

  async joinServer(serverId) {
    try {
      const res = await fetch(`${this.API_SERVER_URL}/api/servers/${serverId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ userId: this.userId, token: this.token }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Не удалось присоединиться');
      }
      const data = await res.json();
      const server = data.server;
      if (!this.servers.some((s) => s.id === server.id)) this.servers.push(server);
      if (this.elements.serverSearchInput) this.elements.serverSearchInput.value = '';
      localStorage.setItem('lastServerId', server.id);
      ServerManager.renderServers(this);
      this.showPanel('servers');
      UIManager.addMessage('System', `✅ Вы присоединились к дереву "${server.name}"`);
      return true;
    } catch (error) {
      UIManager.showError(`❌ Не удалось присоединиться: ${error.message}`);
      return false;
    }
  }

  async clearUnreadForCurrentRoom() {
    if (!this.currentRoom) return;
    let serverId = this.currentServerId;
    if (!serverId || this.currentServer?.type === 'direct' || this.currentServerId?.startsWith('user_')) {
      serverId = this.currentRoom;
    }
    try {
      const response = await fetch(`${this.API_SERVER_URL}/api/messages/${this.currentRoom}/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ serverId }),
      });
      if (response.ok) {
        UIManager.clearUnreadForRoom(serverId, this.currentRoom);
        this._updateTrayBadge();
      }
    } catch (error) {
    }
  }

setupSocketConnection() {
    const currentToken = this.token;
    if (!currentToken) return;
    if (this.socket && this.socket.connected) {
        if (this.currentRoom && this.socketRoom !== this.currentRoom) {
            this.destroySocket();
        } else {
            this.socket.emit('join-room', { roomId: this.currentRoom });
            return;
        }
    }
    this.destroySocket();
    try {
        this.socket = io(this.API_SERVER_URL, {
            auth: {
                token: currentToken,
                userId: this.userId,
                clientId: this.clientID,
                username: this.username,
                tokenVersion: this.tokenVersion,
            },
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 30000,
            timeout: 20000,
        });
        this.socketRoom = this.currentRoom;
        this.chatHandler.registerHandlers(this.socket);
        this.mediaHandler.registerHandlers(this.socket);
        this.systemHandler.registerHandlers(this.socket);
        this.pollHandler.registerHandlers(this.socket);
        this.noteHandler.registerHandlers(this.socket, this.userId, io);
        
this.socket.on('console-command', (data) => {
    console.log('🔧 [CLIENT] Получена console-command:', data);
    
    const { text, senderName, senderId } = data;
    
    // Выполняем команду
    const { result, error, isPublic, commandPrefix } = 
        ConsoleCommandManager.handleRemoteCommand(text, senderName, senderId);
    
    if (error) {
        // Ошибку показываем только локально
        UIManager.addMessage('System', `❌ Ошибка ${commandPrefix}: ${error}`, null, 'system');
        return;
    }
    
    if (isPublic) {
        // 🔥 ПУБЛИЧНАЯ КОМАНДА — отправляем результат в общий чат
        const formatted = ConsoleCommandManager.formatValue(result);
        const maxLength = 500;
        const truncated = formatted.length > maxLength 
            ? formatted.substring(0, maxLength) + '...' 
            : formatted;
        
        this.socket.emit('send-message', {
            roomId: this.currentRoom,
            text: `📟 ${this.username} выполнил ${commandPrefix}:\n${truncated}`
        });
    } else {
        // 🔥 ЛОКАЛЬНАЯ КОМАНДА — показываем только у себя
        const formatted = ConsoleCommandManager.formatValue(result);
        UIManager.addMessage('System', `📟 ${commandPrefix}\n${formatted}`, null, 'system');
    }
});

        
    } catch (error) {
        UIManager.showError('Ошибка подключения к серверу');
        this.setConnectionState(CONNECTION_STATE.ERROR, this.currentRoom);
    }
}

/**
 * Обработчик удаленной консольной команды от сервера
 * Выполняет команду на всех клиентах в комнате
 */
handleRemoteConsoleCommand(data) {
    const { text, senderId, senderName } = data;
    
    if (!text) return;
    
    // Определяем префикс команды
    const firstLine = text.split('\n')[0].trim();
    const commandPrefix = ConsoleCommandManager.getCommandPrefix(firstLine);
    
    if (!commandPrefix) return;
    
    // Показываем, что получили команду
    UIManager.addMessage('System', `📟 ${senderName} выполняет команду ${commandPrefix}...`, null, 'system');
    
    // Выполняем команду через менеджер
    try {
        ConsoleCommandManager.handleCommand(text, commandPrefix);
    } catch (error) {
        console.error('[VoiceChatClient] Remote console command error:', error);
        UIManager.addMessage('System', `📟 Ошибка выполнения ${commandPrefix}: ${error.message}`, null, 'system');
    }
}

  _scheduleSocketReconnect(reason) {
    const key = 'socket';
    let state = this.transportRecoveryState.get(key);
    if (!state) {
      state = { attempts: 0, timer: null };
    } else {
      state.attempts++;
    }
    const roomId = this.currentRoom;
    if (!roomId) return;
    const baseDelay = 1000;
    const maxDelay = 16000;
    const exponentialDelay = Math.min(baseDelay * Math.pow(2, state.attempts), maxDelay);
    const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
    const delay = Math.max(baseDelay, Math.min(maxDelay, exponentialDelay + jitter));
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(async () => {
      this.transportRecoveryState.delete(key);
      const wasMicUnmuted = this.isMicActive && !this.isMicPaused;
      try {
        this._resetAllRecoveryState();
        if (this.isMicActive && this.mediaData) await MediaManager.stopMicrophone(this).catch(() => {});
        this.destroySocket();
        if (this.socket) this.socket.emit('leave-room', { roomId });
        MediaManager.disconnect(this);
        TextChatManager.leaveTextRoom(this, roomId);
        MembersManager.clearMembers();
        await new Promise((r) => setTimeout(r, 1000));
        this.currentRoom = roomId;
        await this.joinRoom(roomId, false);
        this._resetSocketReconnectState();
        UIManager.updateStatus('Подключено', 'connected');
        UIManager.addMessage('System', '✅ Подключение восстановлено', null, 'system');
        SoundManager.playSound(SoundManager.SoundTypes.SOUND_CONNECTED);
        if (wasMicUnmuted) {
          setTimeout(async () => {
            try {
              await MediaManager.resumeMicrophone(this);
              this.updateMicButtonState();
            } catch (e) {
            }
          }, 2000);
        }
      } catch (error) {
        this.currentRoom = roomId;
        this._scheduleSocketReconnect(error.message);
      }
    }, delay);
    this.transportRecoveryState.set(key, state);
    UIManager.updateStatus(`Переподключение через ${Math.round(delay / 1000)}с...`, 'connecting');
  }

  _resetSocketReconnectState() {
    const state = this.transportRecoveryState.get('socket');
    if (state?.timer) clearTimeout(state.timer);
    this.transportRecoveryState.delete('socket');
  }

  _isMessageDirectedToMe(message) {
    if (!message || !this.userId) return false;
    if (message.directedToUsers && Array.isArray(message.directedToUsers)) {
      return message.directedToUsers.includes(this.userId);
    }
    const events = SoundManager.analyzePersonalEvents(message, this.userId, this.username);
    return events.hasMention || events.hasReply || events.hasNameMention;
  }

  createPoll(roomId, question, options, settings = {}) {
    if (!this.socket || !this.socket.connected) {
      UIManager.showError('Нет подключения к серверу');
      return;
    }
    if (!roomId) {
      UIManager.showError('Не указана комната');
      return;
    }
    this.socket.emit('create-poll', { roomId, question, options, settings });
  }

  votePoll(roomId, pollId, optionIds) {
    if (!this.socket || !this.socket.connected) {
      UIManager.showError('Нет подключения к серверу');
      return;
    }
    if (!roomId || !pollId || !optionIds) {
      UIManager.showError('Неверные данные для голосования');
      return;
    }
    this.socket.emit('poll:vote', { roomId, pollId, optionIds });
  }

  closePoll(roomId, pollId) {
    if (!this.socket || !this.socket.connected) {
      UIManager.showError('Нет подключения к серверу');
      return;
    }
    if (!roomId || !pollId) {
      UIManager.showError('Неверные данные для закрытия опроса');
      return;
    }
    this.socket.emit('poll:close', { roomId, pollId });
  }

  forwardMessage(messageId, targetRoomId) {
    if (!this.socket || !this.socket.connected) {
      UIManager.showError('Нет подключения к серверу');
      return;
    }
    if (!messageId || !targetRoomId || !this.currentRoom) {
      UIManager.showError('Неверные данные для пересылки');
      return;
    }
    this.socket.emit('forward-message', { messageId, sourceRoomId: this.currentRoom, targetRoomId });
  }

  async jumpToForwardSource(forwardedFrom) {
    if (!forwardedFrom) return;
    const { serverId, roomId, messageId } = forwardedFrom;
    try {
      const serverExists = this.servers.some((s) => s.id === serverId);
      if (!serverExists) {
        const res = await fetch(`${this.API_SERVER_URL}/api/servers/${serverId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
          body: JSON.stringify({ userId: this.userId, token: this.token }),
        });
        if (res.ok) {
          const data = await res.json();
          if (!this.servers.some((s) => s.id === data.server.id)) {
            this.servers.push(data.server);
          }
        }
      }
      this.currentServerId = serverId;
      this.currentServer = this.servers.find((s) => s.id === serverId);
      localStorage.setItem('lastServerId', serverId);
      await RoomManager.loadRoomsForServer(this, serverId);
      const roomExists = this.rooms?.some((r) => r.id === roomId);
      if (roomExists) {
        await this.joinRoom(roomId, false);
        setTimeout(() => {
          UIManager.scrollToMessage(messageId, null, true);
        }, 500);
      } else {
        UIManager.showError('У вас нет доступа к этому гнезду');
      }
    } catch (error) {
      UIManager.showError('Не удалось перейти к исходному сообщению');
    }
  }

  pinMessage(roomId, messageId) {
    if (!this.socket || !this.socket.connected) {
      UIManager.showError('Нет подключения к серверу');
      return;
    }
    if (!roomId || !messageId) {
      UIManager.showError('Не указана комната или сообщение');
      return;
    }
    this.socket.emit('pin-message', { roomId, messageId }, (response) => {
      if (!response?.success) {
        UIManager.showError(response?.error || 'Не удалось закрепить сообщение');
      }
    });
  }

  unpinMessage(roomId, messageId) {
    if (!this.socket || !this.socket.connected) {
      UIManager.showError('Нет подключения к серверу');
      return;
    }
    if (!roomId || !messageId) {
      UIManager.showError('Не указана комната или сообщение');
      return;
    }
    this.socket.emit('unpin-message', { roomId, messageId }, (response) => {
      if (!response?.success) {
        UIManager.showError(response?.error || 'Не удалось открепить сообщение');
      }
    });
  }

  fetchPinnedMessages(roomId) {
    if (!this.socket || !this.socket.connected) return;
    this.socket.emit('get-pinned-messages', { roomId }, (response) => {
      if (response?.success) {
        const sorted = (response.pinnedMessages || []).sort((a, b) => new Date(b.pinnedAt) - new Date(a.pinnedAt));
        this.pinnedMessages.set(roomId, sorted);
        this.currentPinnedIndex.set(roomId, 0);
        if (roomId === this.currentRoom) {
          if (sorted.length > 0) UIManager.renderPinnedMessagesBar(this);
          else UIManager.hidePinnedMessagesBar();
        }
      }
    });
  }

  scrollToNextPinnedMessage() {
    const roomId = this.currentRoom;
    if (!roomId) return;
    const pinned = this.pinnedMessages.get(roomId) || [];
    if (pinned.length === 0) return;
    let currentIndex = this.currentPinnedIndex.get(roomId) || 0;
    if (currentIndex >= pinned.length) currentIndex = 0;
    const targetMessage = pinned[currentIndex];
    if (targetMessage) {
      const found = UIManager.scrollToMessage(targetMessage.id, null, true);
      if (found) {
        const nextIndex = (currentIndex + 1) % pinned.length;
        this.currentPinnedIndex.set(roomId, nextIndex);
        UIManager.renderPinnedMessagesBar(this);
      } else {
        TextChatManager.loadMessagesAround(this, roomId, targetMessage.id, 50)
          .then(() => {
            setTimeout(() => {
              const retryFound = UIManager.scrollToMessage(targetMessage.id, null, true);
              if (retryFound) {
                const nextIndex = (currentIndex + 1) % pinned.length;
                this.currentPinnedIndex.set(roomId, nextIndex);
                UIManager.renderPinnedMessagesBar(this);
              }
            }, 300);
          })
          .catch(() => {});
      }
    }
  }

  getCurrentPinnedMessage(roomId) {
    const pinned = this.pinnedMessages.get(roomId) || [];
    if (pinned.length === 0) return null;
    let currentIndex = this.currentPinnedIndex.get(roomId) || 0;
    if (currentIndex >= pinned.length) {
      currentIndex = 0;
      this.currentPinnedIndex.set(roomId, 0);
    }
    return pinned[currentIndex] || null;
  }

  async openSecondaryFromNotification(roomId) {
    if (!roomId) return;
    if (SecondaryChatManager.secondaryChat.enabled) {
      await SecondaryChatManager.joinRoom(this, roomId);
      return;
    }
    const direction = SecondaryChatManager.getDirection();
    await SecondaryChatManager.toggle(this, direction);
    setTimeout(async () => {
      if (SecondaryChatManager.secondaryChat.enabled) {
        await SecondaryChatManager.joinRoom(this, roomId);
      }
    }, 200);
  }

  async _reconcileOfflineState() {
    if (this.recvTransport && !this.recvTransport.closed && this.recvTransport.connectionState === 'connected') {
      let hasActiveMedia = false;
      for (const [, state] of this.consumerState) {
        if (state.status === 'active' && state.consumer?.track?.readyState === 'live') {
          hasActiveMedia = true;
          break;
        }
      }
      if (hasActiveMedia || (this.audioProducer && !this.audioProducer.closed)) {
        if (this.socket && this.currentRoom) {
          this.socket.emit('request-room-snapshot', { roomId: this.currentRoom }, (response) => {
            if (response?.success && response.participants) {
              MembersManager.updateMember(this.userId, { isOnline: true, connectionState: 'connected' });
              UIManager.updateMembersListWithStatus(
                response.participants.filter((p) => p.isOnline),
                response.participants.filter((p) => !p.isOnline)
              );
            }
          });
        }
      }
    }
  }

  _reconcileParticipantsState(serverData) {
    const { online = [] } = serverData;
    const serverOnlineIds = new Set(online.map((p) => p.userId));
    if (!serverOnlineIds.has(this.userId)) this._reconcileOfflineState();
  }

  startPingInterval() {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.socket && this.socket.connected) this.socket.emit('ping');
    }, PING_INTERVAL);
  }

  stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  _updateTrayBadge() {
    let total = 0;
    if (UIManager.unreadCounts) {
      for (const serverId in UIManager.unreadCounts) {
        const serverData = UIManager.unreadCounts[serverId];
        if (serverData && typeof serverData.total === 'number') {
          total += serverData.total;
        }
      }
    }
    if (window.electronAPI && typeof window.electronAPI.updateTrayBadge === 'function') {
      window.electronAPI.updateTrayBadge(total);
    } else {
      window.postMessage({ type: 'ELECTRON_UPDATE_TRAY_BADGE', count: total, source: 'webview' }, '*');
    }
  }

  async loadUnreadCounts() {
    try {
      const response = await fetch(`${this.API_SERVER_URL}/api/messages/unread`, {
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.unread) {
          UIManager.syncUnreadCounts(data.unread);
          this._updateTrayBadge();
        }
      }
    } catch (error) {
    }
  }

  destroySocket() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.socketRoom = null;
    this.stopPingInterval();
  }

  updateMicButtonState() {
    let status;

    if (!this.isConnected) {
      status = 'disconnected';
    } else if (this._isMediaInitializing) {
      status = 'connecting';
    } else if (!this.audioProducer || this.audioProducer.closed) {
      status = 'connected';
    } else if (this.isMicPaused) {
      status = 'paused';
    } else if (this.isMicActive) {
      status = 'active';
    } else {
      status = 'connected';
    }

    UIManager.updateMicButton(status);
  }

  async toggleMicrophone() {
    if (this._micToggleDebounce) {
      return;
    }

    this._micToggleDebounce = setTimeout(() => {
      this._micToggleDebounce = null;
    }, 300);

    try {
      if (!this.currentRoom) {
        UIManager.showError('Микрофон доступен только в гнёздах');
        return;
      }

      if (this._joinRoomInProgress) {
        UIManager.showError('Подождите, идёт подключение к гнезду...');
        return;
      }

      if (!this.audioProducer || this.audioProducer.closed) {
        this._isMediaInitializing = true;
        UIManager.updateMicButton('connecting');
        UIManager.showNotification('🎤 Подключение микрофона...', 'info', 2000);

        try {
          await MediaManager.initMicrophone(this);

          if (!this.audioProducer) {
            throw new Error('Микрофон не был инициализирован');
          }

          this._isMediaInitializing = false;

          this.updateMicButtonState();
          SoundManager.playSound(SoundManager.SoundTypes.SOUND_MIC_ON);
          this.sendMicStateToElectron();
        } catch (error) {
          console.error('Failed to init microphone:', error);
          this._isMediaInitializing = false;
          this.isMicActive = false;
          this.isMicPaused = true;
          this.audioProducer = null;
          UIManager.showError('Не удалось получить доступ к микрофону: ' + error.message);
          this.updateMicButtonState();
        }
        return;
      }

      const shouldEnable = this.isMicPaused === true;

      try {
        if (shouldEnable) {
          await MediaManager.resumeMicrophone(this);
          SoundManager.playSound(SoundManager.SoundTypes.SOUND_MIC_ON);
        } else {
          await MediaManager.pauseMicrophone(this);
          SoundManager.playSound(SoundManager.SoundTypes.SOUND_MIC_OFF);
        }

        this.updateMicButtonState();
        this.sendMicStateToElectron();
      } catch (error) {
        console.error('Failed to toggle microphone:', error);

        if (error.message.includes('closed')) {
          this.audioProducer = null;
          this.isMicActive = false;
          this.isMicPaused = true;
        }

        UIManager.showError('Ошибка микрофона: ' + error.message);
        this.updateMicButtonState();
      }
    } catch (error) {
      console.error('Toggle microphone error:', error);
      this._isMediaInitializing = false;
      UIManager.showError('Ошибка микрофона: ' + error.message);
      this.updateMicButtonState();
    }
  }

  sendMessage(text) {
    if (!text.trim() || !this.currentRoom) return;
    const currentRoomData = this.rooms?.find((r) => r.id === this.currentRoom);
    if (currentRoomData?.imagesOnly && this.userId !== currentRoomData?.ownerId) {
      UIManager.showError('📷 В этом гнезде разрешены только картинки');
      return;
    }
    const trimmedText = text.trim();
    const replyTarget = UIManager.replyTarget
      ? {
          id: UIManager.replyTarget.id,
          userId: UIManager.replyTarget.userId,
          username: UIManager.replyTarget.username,
          text: UIManager.replyTarget.text,
        }
      : null;
    UIManager.clearReplyTarget();
    if (this.socket) {
      this.socket.emit('send-message', { roomId: this.currentRoom, text: trimmedText, replyTo: replyTarget });
    } else {
      TextChatManager.sendMessage(this, trimmedText, 'text', replyTarget).catch(() =>
        UIManager.showError('Ошибка отправки сообщения')
      );
    }
  }

  async sendSecondaryMessage(text, targetRoomId, replyTo = null) {
    const roomId = targetRoomId || SecondaryChatManager.secondaryChat.roomId;
    if (!roomId || !text.trim()) return;
    const targetRoomData = this.rooms?.find((r) => r.id === roomId);
    if (targetRoomData?.imagesOnly && this.userId !== targetRoomData?.ownerId) {
      UIManager.showError('📷 В этом гнезде разрешены только картинки');
      return;
    }
    const tempId = `temp_sec_${Date.now()}`;
    SecondaryChatManager.addMessage(
      this.username,
      text.trim(),
      null,
      'text',
      null,
      tempId,
      [],
      this.userId,
      false,
      null,
      replyTo,
      {}
    );
    const payloadReplyTo = replyTo ? { id: replyTo.id, username: replyTo.username } : null;
    try {
      if (this.socket && this.socket.connected) {
        this.socket.emit('send-message', { roomId, text: text.trim(), replyTo: payloadReplyTo });
        return;
      }
      const result = await TextChatManager.sendMessageToRoom(this, roomId, text.trim(), 'text', payloadReplyTo);
      if (result && result.message) {
        const tempEl = document.querySelector(`[data-message-id="${tempId}"]`);
        if (tempEl) {
          tempEl.dataset.messageId = result.message.id;
          const timeEl = tempEl.querySelector('.message-time');
          if (timeEl && result.message.timestamp) {
            timeEl.textContent = new Date(result.message.timestamp).toLocaleTimeString('ru-RU', {
              hour: '2-digit',
              minute: '2-digit',
            });
          }
        }
      }
    } catch (error) {
      UIManager.showError('Не удалось отправить сообщение');
      const tempEl = document.querySelector(`[data-message-id="${tempId}"]`);
      if (tempEl) tempEl.remove();
    }
  }

  async toggleReaction(messageId, emoji) {
    if (!messageId || !emoji || !this.currentRoom) return;
    try {
      if (this.socket?.connected) {
        this.socket.emit('toggle-reaction', { messageId, emoji, roomId: this.currentRoom });
      } else {
        await this.sendReactionFallback(messageId, emoji);
      }
    } catch (error) {
      UIManager.showError('Не удалось отправить реакцию');
    }
  }

  async sendReactionFallback(messageId, emoji) {
    try {
      const response = await fetch(`${this.API_SERVER_URL}/api/messages/${messageId}/reaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
        body: JSON.stringify({ emoji }),
      });
      if (!response.ok) throw new Error('Fallback reaction failed');
    } catch (error) {
    }
  }

  async _scrollToMessageId(roomId, messageId) {
    if (!messageId) {
      UIManager.scrollToBottom();
      return;
    }

    const container = document.querySelector('.messages-container');
    if (!container) {
      UIManager.scrollToBottom();
      return;
    }

    const maxAttempts = 30;
    let targetElement = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      targetElement = container.querySelector(`.message[data-message-id="${messageId}"]`);
      if (targetElement) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (!targetElement) {
      try {
        await TextChatManager.loadMessagesAround(this, roomId, messageId, 50);
        await new Promise((resolve) => setTimeout(resolve, 300));
        targetElement = container.querySelector(`.message[data-message-id="${messageId}"]`);
      } catch (e) {
        console.error('Failed to load messages around:', e);
      }
    }

    if (!targetElement) {
      UIManager.scrollToBottom();
      return;
    }

    const pinnedBar = document.getElementById('pinned-messages-bar');
    const barHeight = pinnedBar && pinnedBar.style.display !== 'none' ? pinnedBar.offsetHeight : 0;

    const targetPosition = targetElement.offsetTop - barHeight - 10;
    container.scrollTop = Math.max(0, targetPosition);

    await new Promise((resolve) => requestAnimationFrame(resolve));

    targetElement.style.transition = 'background 0.3s';
    targetElement.style.background = 'rgba(88, 101, 242, 0.2)';
    setTimeout(() => {
      if (targetElement) targetElement.style.background = '';
    }, 1500);
  }

  async joinRoom(roomId, clearUnread = true) {
    if (this.currentRoom === roomId && this.isConnected && this.socket?.connected) {
      this._processPendingProducers();
      return true;
    }
    
    const sidebar = document.querySelector('.sidebar');
    const membersPanel = document.querySelector('.members-panel');
    
    if (sidebar) sidebar.classList.remove('open');
    if (membersPanel) membersPanel.classList.remove('open');
    
    if (roomId) ScrollTracker.clearLastViewedMessage(roomId);
    
    this._resetAllRecoveryState();
    this._abortMediaRequests();
    this.setConnectionState(CONNECTION_STATE.CONNECTING, roomId);
    
    this._joinRoomInProgress = true;
    this._isMediaInitializing = false;
    this._pendingMicAction = null;
    
    this.pendingProducersRef = [];
    this.consumedProducerIdsRef.clear();
    this.consumerState.clear();
    this._isProcessingConsumers = false;
    this._transportReadyForConsume = false;
    this._producersPendingConsume = [];
    
    try {
      if (this.currentRoom && this.currentRoom !== roomId) {
        if (this.socket) this.socket.emit('leave-room', { roomId: this.currentRoom });
      }
      await this.disconnectFromRoom();
      
      const joinRes = await this._fetchWithTimeout(this.CHAT_API_URL, {
        method: 'POST',
        body: JSON.stringify({
          roomId,
          userId: this.userId,
          token: this.token,
          clientId: this.clientID,
        }),
      });
      
      const joinData = await joinRes.json();
      if (!joinData.success) throw new Error(joinData.error || 'Join failed');
      if (!joinData.mediaData) throw new Error('No media data received');
      
      this.clientID = joinData.clientId;
      this.mediaData = joinData.mediaData;
      this.currentRoom = roomId;
      this.roomType = 'voice';
      localStorage.setItem('lastServerId', this.currentServerId);
      localStorage.setItem('lastRoomId', this.currentRoom);
      this.audioProducer = null;
      this.isMicActive = false;
      this.isMicPaused = true;
      
      this.setupSocketConnection();
      let attempts = 0;
      while (!this.socket?.connected && attempts < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        attempts++;
      }
      if (!this.socket?.connected) throw new Error('WebSocket не подключился');
      
      await new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(), 2000);
        const joinHandler = () => {
          clearTimeout(timeout);
          resolve();
        };
        this.socket.once('join-ack', joinHandler);
        this.socket.emit('join-room', { roomId });
      });
      
      await MediaManager.connect(this, roomId, joinData.mediaData);
      
      if (this.socket && this.socket.connected) {
        this.socket.emit('request-room-snapshot', { roomId }, (response) => {
          if (response?.success && response.producers) {
            for (const producer of response.producers) {
              if (producer.clientID !== this.clientID && !this.consumedProducerIdsRef.has(producer.id)) {
                this.pendingProducersRef.push(producer);
              }
            }
            this._processPendingProducers();
          }
        });
        
        this.socket.emit('request-mic-states', { roomId });
      }
      
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      this.updateMicButtonState();
      await UIManager.updateRoomUI(this);
      TextChatManager.joinTextRoom(this, roomId);
      this.resetHistoryState();
      
      if (!this.token) throw new Error('Токен отсутствует');
      
      try {
        const response = await fetch(`${this.API_SERVER_URL}/api/messages/${roomId}/view-position`, {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        if (response.ok) {
          const data = await response.json();
          this.savedMaxSeenId = data.maxSeen || null;
          this.savedFirstUnreadId = data.firstUnread || null;
        }
      } catch (e) {
        console.error('Failed to load view position:', e.message);
      }
      
      ScrollTracker.setMaxSeenMessageId(roomId, this.savedMaxSeenId);
      ScrollTracker.setFirstUnreadId(roomId, this.savedFirstUnreadId);
      
      this.fetchPinnedMessages(roomId);
      await new Promise((resolve) => setTimeout(resolve, 150));
      
      const result = await TextChatManager.loadMessages(this, roomId, 100);
      if (result && result.messages?.length > 0) {
        this.oldestMessageId = result.messages[0].id;
        this.hasMoreHistory = result.hasMore;
      } else {
        this.hasMoreHistory = false;
      }
      
      await new Promise((resolve) => setTimeout(resolve, 150));
      
      UIManager.initScrollTracker(roomId);
      
      const firstUnreadId = ScrollTracker.getFirstUnreadId(roomId);
      const maxSeenId = ScrollTracker.getMaxSeenMessageId(roomId);
      
      let hasRealUnread = false;
      if (firstUnreadId) {
        const unreadIds = ScrollTracker._unreadMessageIds.get(roomId) || [];
        hasRealUnread = unreadIds.length > 0;
      }
      
      if (hasRealUnread && firstUnreadId) {
        await this._scrollToMessageId(roomId, firstUnreadId);
      } else if (maxSeenId) {
        await this._scrollToMessageId(roomId, maxSeenId);
      } else {
        UIManager.scrollToBottom();
      }
      
      UIManager.updateScrollButtonCounter(roomId);
      
      if (this.hasMoreHistory) {
        this.initHistoryObserver();
      } else {
        this.removeHistorySentinel();
      }
      
      if (MembersManager.onlineMembers?.length > 0) {
        MobileOnlineBar.update(MembersManager.onlineMembers);
      }
      
      if (clearUnread) {
        await this.clearUnreadForCurrentRoom();
      }
      
      this.setConnectionState(CONNECTION_STATE.CONNECTED, roomId);
      this.isConnected = true;
      this.sendMicStateToElectron();
      
      this._joinRoomInProgress = false;
      this.startTrafficMonitor();
      
      return true;
      
    } catch (error) {
      this._joinRoomInProgress = false;
      this._isMediaInitializing = false;
      this._pendingMicAction = null;
      this.setConnectionState(CONNECTION_STATE.ERROR, roomId);
      UIManager.updateStatus('Ошибка: ' + error.message, 'disconnected');
      UIManager.showError('Не удалось занять гнездо: ' + error.message);
      throw error;
    }
  }

  async disconnectFromRoom() {
    this.stopTrafficMonitor();

    if (this.currentRoom) {
      this._resetAllRecoveryState();
      if (this.socket) this.socket.emit('leave-room', { roomId: this.currentRoom });
      MediaManager.disconnect(this);
      TextChatManager.leaveTextRoom(this, this.currentRoom);
      MembersManager.clearMembers();
      this.destroySocket();
      this.removeHistorySentinel();
      this.hasMoreHistory = true;
      this.isHistoryLoading = false;
      this.oldestMessageId = null;

      ScrollTracker.clearLastViewedMessage(this.currentRoom);

      VolumeBoostManager.detachAll();

      document.querySelectorAll('audio[id^="audio-"]').forEach((el) => el.remove());

      const oldRoom = this.currentRoom;
      this.currentRoom = null;
      this.isConnected = false;
      this.isMicActive = false;
      this.isMicPaused = false;
      this.pendingProducersRef = [];
      this.consumedProducerIdsRef.clear();
      this.consumerState.clear();
      this._transportReadyForConsume = false;
      this._producersPendingConsume = [];
      this.savedMaxSeenId = null;
      this.savedFirstUnreadId = null;
      this.updateMicButtonState();
      this.setConnectionState(CONNECTION_STATE.DISCONNECTED);
      this.sendMicStateToElectron();

      const container = document.querySelector('.messages-container');
      if (container) {
        container._scrollTrackerBound = false;
        delete container._scrollSaveTimeout;
        delete container._readCheckTimeout;
      }
      UIManager.hidePinnedMessagesBar();
    }
  }

  async reconnectToRoom(roomId, clearUnread = false) {
    if (this.currentRoom === roomId && this.isConnected) {
      return true;
    }
    const wasMicUnmuted = this.isMicActive && !this.isMicPaused;
    if (this.isMicActive && this.mediaData) {
      await MediaManager.stopMicrophone(this).catch(() => {});
    }
    await this.leaveRoom().catch(() => {});
    try {
      await this.joinRoom(roomId, clearUnread);
      if (wasMicUnmuted && this.mediaData) {
        setTimeout(async () => {
          try {
            await MediaManager.resumeMicrophone(this);
            this.updateMicButtonState();
          } catch (e) {
          }
        }, 3000);
      }
      return true;
    } catch (error) {
      console.error('Reconnect failed:', error.message);
      if (this.currentRoom) {
        this._scheduleSocketReconnect(error.message);
      }
      return false;
    }
  }

  async leaveRoom() {
    if (!this.currentRoom) return;

    this.stopTrafficMonitor();

    try {
      this._resetAllRecoveryState();
      if (this.socket) this.socket.emit('leave-room', { roomId: this.currentRoom });
      if (this.isConnected) MediaManager.disconnect(this);
      await fetch(`${this.API_SERVER_URL}/api/media/rooms/${this.currentRoom}/leave`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      });

      VolumeBoostManager.detachAll();

      document.querySelectorAll('.member-volume-slider').forEach((s) => {
        s.style.display = 'none';
        s.dataset.producerId = '';
      });
      MembersManager.clearMembers();
      this.currentRoom = null;
      this.roomType = null;
      this.savedMaxSeenId = null;
      this.savedFirstUnreadId = null;
      UIManager.updateRoomUI(this);
      this.setConnectionState(CONNECTION_STATE.DISCONNECTED);
      this.sendMicStateToElectron();
      UIManager.hidePinnedMessagesBar();
      return true;
    } catch (error) {
      UIManager.showError('Ошибка при покидании гнезда: ' + error.message);
      return false;
    }
  }

  autoConnect() {
    this.elements.sidebar.classList.add('open');
  }

  showMessage(user, text) {
    UIManager.addMessage(user, text);
  }

  showError(text) {
    UIManager.showError(text);
  }

  async searchServers(query) {
    await ServerManager.searchServers(this, query);
  }

  async toggleSecondaryChat(direction = 'side') {
    await SecondaryChatManager.toggle(this, direction);
    if (this.socket?.connected) {
      if (SecondaryChatManager.secondaryChat.enabled) {
        if (SecondaryChatManager.secondaryChat.roomId) {
          this.socket.emit('secondary-chat-update', { roomId: SecondaryChatManager.secondaryChat.roomId });
        }
      } else {
        this.socket.emit('secondary-chat-close');
      }
    }
    if (SecondaryChatManager.secondaryChat.enabled && SecondaryChatManager.secondaryChat.roomId) {
      localStorage.setItem('secondaryChatRoom', SecondaryChatManager.secondaryChat.roomId);
    } else {
      localStorage.removeItem('secondaryChatRoom');
    }
  }

  setupElectronBridge() {
    this._electronMessageHandler = this.handleElectronMessage.bind(this);
    window.addEventListener('message', this._electronMessageHandler);
  }

  handleElectronMessage(event) {
    if (!event.data || event.data.source !== 'electron') return;
    const { channel, data } = event.data;
    switch (channel) {
      case 'toggle-mic':
        if (data.active === true && this.isMicPaused) {
          MediaManager.resumeMicrophone(this).then(() => this.updateMicButtonState());
        } else if (data.active === false && !this.isMicPaused) {
          MediaManager.pauseMicrophone(this).then(() => this.updateMicButtonState());
        } else if (data.active === undefined) {
          this.toggleMicrophone();
        }
        setTimeout(() => this.sendMicStateToElectron(), 100);
        break;
      case 'electron-ready':
        this.sendMicStateToElectron();
        break;
    }
  }

  sendMicStateToElectron() {
    const state = {
      active: this.isMicActive && !this.isMicPaused,
      muted: !this.isMicActive || this.isMicPaused,
      connected: this.isConnected,
      speaking: false,
    };
    window.parent.postMessage({ channel: 'mic-state', state, source: 'webclient' }, '*');
  }

  startDiagnostic() {
    if (!this.currentRoom || this.diagnosticActive || !this.socket?.connected) return;
    this.diagnosticActive = true;
    this.socket.emit('start-room-diagnostic', { roomId: this.currentRoom });
    DiagnosticPanel.open(this);
    setTimeout(() => this._notifyDiagnosticUpdate(), 100);
  }

  stopDiagnostic() {
    if (!this.diagnosticActive) return;
    this.diagnosticActive = false;
    this.socket.emit('stop-room-diagnostic', { roomId: this.currentRoom });
    DiagnosticPanel.close();
  }

  async gatherClientDiagnosticState() {
    let consumersPlaying = 0;
    let consumersTotal = 0;
    if (this.consumerState) {
      consumersTotal = this.consumerState.size;
      for (const [, state] of this.consumerState.entries()) {
        const el = state.audioElement;
        if (state.consumer?.track?.readyState === 'live' && el && !el.muted && !el.paused) {
          consumersPlaying++;
        }
      }
    }
    const recoverySummary = {
      activeRecoveries: this.consumerRecoveryState.size,
      exhaustedRecoveries: Array.from(this.consumerRecoveryState.values()).filter((s) => s.exhausted).length,
      pendingConsumeQueue: this._producersPendingConsume.length,
      transportReady: this._transportReadyForConsume,
      iceRestartActive: this.iceRestartState.size > 0,
      socketReconnectAttempts: this.transportRecoveryState.get('socket')?.attempts || 0,
    };
    return {
      userId: this.userId,
      username: this.username,
      isMicActive: this.isMicActive && !this.isMicPaused,
      micTrackState: this.audioProducer?.track?.readyState || 'inactive',
      isTabHidden: document.hidden,
      consumersPlaying,
      consumersTotal,
      timestamp: Date.now(),
      recoverySummary,
    };
  }

  destroy() {
    this.stopTrafficMonitor();

    this._resetSocketReconnectState();
    this._resetAllRecoveryState();
    this.destroySocket();
    this.stopPingInterval();

    VolumeBoostManager.detachAll();
    document.querySelectorAll('audio[id^="audio-"]').forEach((el) => el.remove());

    if (this._electronMessageHandler) {
      window.removeEventListener('message', this._electronMessageHandler);
    }
    if (this.historyObserver) {
      this.historyObserver.disconnect();
      this.historyObserver = null;
    }
  }

  switchToNotes(mode, targetId = null) {
    NoteStateManager.setView(mode, mode === 'personal' ? 'personal' : 'public', targetId);
    NoteUIManager.switchView(mode, targetId);
    return true;
  }

  openUserPublicNotes(userId) {
    if (!userId) return;
    NoteStateManager.setView('public', 'public', userId);
    NoteUIManager.openUserPublicNotes(userId);
  }

  openNoteThread(noteId, roomId) {
    if (!noteId || !roomId) return;
    NoteStateManager.setView('thread', 'thread', noteId, roomId);
    NoteUIManager.openNoteThread(noteId, roomId);
  }

  returnToChat() {
    NoteStateManager.resetToChat();
    NoteUIManager.returnToChat();
  }
}

export default VoiceChatClient;
