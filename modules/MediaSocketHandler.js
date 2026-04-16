import MediaManager from './MediaManager.js';
import MembersManager from './MembersManager.js';
import UIManager from './UIManager.js';
import VolumeBoostManager from './VolumeBoostManager.js';

class MediaSocketHandler {
  constructor(client) {
    this.client = client;
  }

  registerHandlers(socket) {
    socket.on('user-speaking-state', this.handleUserSpeakingState.bind(this));
    socket.on('existing-producers', this.handleExistingProducers.bind(this));
    socket.on('consumerParameters', this.handleConsumerParameters.bind(this));
    socket.on('producerPaused', this.handleProducerPaused.bind(this));
    socket.on('producerResumed', this.handleProducerResumed.bind(this));
    socket.on('new-producer', this.handleNewProducer.bind(this));
    socket.on('producer-closed', this.handleProducerClosed.bind(this));
    socket.on('mic-indicator-update', this.handleMicIndicatorUpdate.bind(this));
    socket.on('room-mode-updated', this.handleRoomModeUpdated.bind(this));
  }

  handleUserSpeakingState(data) {
    const { userId, speaking, timestamp } = data;
    MembersManager.updateMember(userId, { isMicActive: speaking, lastSpeakingUpdate: timestamp });
    UIManager.updateMemberMicState(userId, speaking);
    if (userId === this.client.userId) {
      this.client.sendMicStateToElectron();
    }
  }

  handleExistingProducers(data) {
    if (!data?.producers || !Array.isArray(data.producers)) return;
    for (const producer of data.producers) {
      if (producer.clientID !== this.client.clientID && !this.client.consumedProducerIdsRef.has(producer.id)) {
        this.client.pendingProducersRef.push(producer);
      } else {
        this.client.consumedProducerIdsRef.add(producer.id);
      }
    }
    this.client._processPendingProducers();
  }

  async handleConsumerParameters(data) {
    if (!this.client.consumedProducerIdsRef.has(data.producerId)) {
      try {
        const { consumer, audioElement } = await MediaManager.createConsumer(this.client, data);
        this.client._resetConsumerRecoveryState(data.producerId);
        this.client.consumerState.set(data.producerId, {
          status: 'active',
          consumer,
          audioElement,
          lastError: null
        });
        this.client.consumedProducerIdsRef.add(data.producerId);
        const members = MembersManager.getMembers();
        const member = members.find((m) => m.clientId === data.peerId || m.userId === data.peerId);
        const userId = member?.userId || data.peerId;
        if (userId) {
          if (!window.producerUserMap) window.producerUserMap = new Map();
          window.producerUserMap.set(data.producerId, userId);
          UIManager.showVolumeSliderByUserId(data.producerId, userId);
          VolumeBoostManager.attachToAudioElement(audioElement, userId, 1.0).catch(() => {});
        }
        if (this.client.diagnosticActive) {
          this.client._notifyDiagnosticUpdate();
        }
      } catch (error) {
        this.client.consumerState.set(data.producerId, { status: 'error', consumer: null, lastError: error });
        this.client._scheduleConsumerRetry(data.producerId, { producerId: data.producerId }, error.message);
      }
    }
  }

  handleProducerPaused(data) {
    const { producerId, peerId } = data;
    const state = this.client.consumerState.get(producerId);
    if (state?.audioElement) state.audioElement.muted = true;
    if (peerId) MembersManager.updateMember(peerId, { isMicActive: false });
    UIManager.updateMemberMicState(peerId, false);
  }

  handleProducerResumed(data) {
    const { producerId, peerId } = data;
    const state = this.client.consumerState.get(producerId);
    if (state?.audioElement) state.audioElement.muted = false;
    if (peerId) MembersManager.updateMember(peerId, { isMicActive: true });
    UIManager.updateMemberMicState(peerId, true);
  }

  handleNewProducer(data) {
    if (data.clientID !== this.client.clientID && !this.client.consumedProducerIdsRef.has(data.producerId)) {
      this.client.pendingProducersRef.push(data);
      this.client._processPendingProducers();
    } else {
      this.client.consumedProducerIdsRef.add(data.producerId);
    }
  }

  handleProducerClosed(data) {
    const { producerId } = data;
    this.client._resetConsumerRecoveryState(producerId);
    const state = this.client.consumerState.get(producerId);
    if (state) {
      if (state.audioElement) {
        state.audioElement.remove();
      }
      if (state.consumer && !state.consumer.closed) {
        try { state.consumer.close(); } catch (e) {}
      }
      this.client.consumerState.delete(producerId);
    }
    this.client.consumedProducerIdsRef.delete(producerId);
  }

  handleMicIndicatorUpdate(data) {
    const { userId, isActive } = data;
    const member = MembersManager.getMember(userId);
    if (!member?.lastSpeakingUpdate || member.lastSpeakingUpdate < Date.now() - 2000) {
      MembersManager.updateMember(userId, { isMicActive: isActive });
      UIManager.updateMemberMicState(userId, isActive);
    }
  }

  handleRoomModeUpdated(data) {
    const { roomId, imagesOnly, readOnly } = data;
    const roomIndex = this.client.rooms?.findIndex(r => r.id === roomId);
    if (roomIndex !== -1 && this.client.rooms[roomIndex]) {
      if (imagesOnly !== undefined) this.client.rooms[roomIndex].imagesOnly = imagesOnly;
      if (readOnly !== undefined) this.client.rooms[roomIndex].readOnly = readOnly;
      if (roomId === this.client.currentRoom) {
        if (imagesOnly) {
          UIManager.addMessage('System', `📷 Режим "только картинки" ${imagesOnly ? 'включён' : 'выключен'}`, null, 'system');
        }
      }
    }
  }
}

export default MediaSocketHandler;
