import UIManager from './UIManager.js';

const CONNECTION_STATE = {
  UNKNOWN: 'unknown',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
  DISCONNECTED: 'disconnected'
};

class MembersManager {
  static members = new Map();
  static onlineMembers = [];
  static offlineMembers = [];
  static collapsedSections = { online: false, offline: false };
  static connectionStates = new Map();
  static micStates = new Map();
  static client = null;
  static __bulkUpdate = false;

  static init(client) {
    this.client = client;
    try {
      const saved = localStorage.getItem('membersListCollapsed');
      if (saved) this.collapsedSections = JSON.parse(saved);
    } catch (e) {
      this.collapsedSections = { online: false, offline: false };
    }
  }

  static isSectionCollapsed(section) {
    return this.collapsedSections[section] || false;
  }

  static toggleSection(section) {
    this.collapsedSections[section] = !this.collapsedSections[section];
    localStorage.setItem('membersListCollapsed', JSON.stringify(this.collapsedSections));
    if (!this.__bulkUpdate) this._updateOnlineOfflineLists();
    UIManager.updateMembersListWithStatus(this.onlineMembers, this.offlineMembers);
  }

  static setConnectionState(userId, state) {
    if (!userId) return;
    const previousState = this.connectionStates.get(userId);
    this.connectionStates.set(userId, { state, timestamp: Date.now(), previousState });
    if (this.members.has(userId)) {
      const member = this.members.get(userId);
      member.connectionState = state;
      this.members.set(userId, member);
    }
    if (!this.__bulkUpdate) {
      this._updateOnlineOfflineLists();
      UIManager.updateMembersListWithStatus(this.onlineMembers, this.offlineMembers);
    }
    UIManager.showConnectionStatus(userId, state);
  }

  static getConnectionState(userId) {
    if (!userId) return CONNECTION_STATE.UNKNOWN;
    const stateData = this.connectionStates.get(userId);
    return stateData?.state || CONNECTION_STATE.UNKNOWN;
  }

  static setMicState(userId, isActive) {
    if (!userId) return;
    this.micStates.set(userId, { isActive, timestamp: Date.now() });
    if (this.members.has(userId)) {
      const member = this.members.get(userId);
      member.isMicActive = isActive;
      this.members.set(userId, member);
    }
    UIManager.updateMemberMicState(userId, isActive);
  }

  static getMicState(userId) {
    if (!userId) return { isActive: false, timestamp: 0 };
    return this.micStates.get(userId) || { isActive: false, timestamp: 0 };
  }

  static updateMember(userId, updates) {
    if (this.members.has(userId)) {
      const member = { ...this.members.get(userId), ...updates };
      
      if (updates.isMicActive !== undefined && updates.lastSpeakingUpdate) {
        member.isMicActive = updates.isMicActive;
        member.micSource = 'server';
      } else if (updates.isMicActive !== undefined && !member.micSource) {
        member.isMicActive = updates.isMicActive;
      }
      
      if (updates.connectionState) this.setConnectionState(userId, updates.connectionState);
      if (updates.isMicActive !== undefined) this.setMicState(userId, updates.isMicActive);
      
      this.members.set(userId, member);
      
      if (updates.isMicActive === true && this.client) {
        this._ensureConsumerForActiveSpeaker(userId);
      }
      
      if (!this.__bulkUpdate) {
        this._updateOnlineOfflineLists();
        UIManager.updateMembersListWithStatus(this.onlineMembers, this.offlineMembers);
        UIManager.updateMemberMicState(userId, updates.isMicActive);
      }
    }
  }

  static _ensureConsumerForActiveSpeaker(userId) {
    if (!this.client || !this.client.currentRoom) return;
    
    const member = this.members.get(userId);
    if (!member || !member.isOnline) return;
    
    const producerUserMap = window.producerUserMap;
    if (!producerUserMap) return;
    
    let producerId = null;
    for (const [pid, uid] of producerUserMap.entries()) {
      if (uid === userId) {
        producerId = pid;
        break;
      }
    }
    
    if (!producerId) return;
    
    const consumerState = this.client.consumerState;
    const consumedProducerIds = this.client.consumedProducerIdsRef;
    
    if (consumedProducerIds && !consumedProducerIds.has(producerId)) {
      if (typeof this.client.ensureConsumer === 'function') {
        this.client.ensureConsumer(producerId, { producerId, clientID: member.clientId }).catch(e => {
          console.error('MembersManager: failed to ensure consumer for active speaker:', e.message);
        });
      }
    } else if (consumerState && consumerState.has(producerId)) {
      const state = consumerState.get(producerId);
      if (state.status === 'error' || !state.consumer || state.consumer.closed) {
        if (consumedProducerIds) consumedProducerIds.delete(producerId);
        consumerState.delete(producerId);
        
        if (typeof this.client.ensureConsumer === 'function') {
          this.client.ensureConsumer(producerId, { producerId, clientID: member.clientId }).catch(e => {
            console.error('MembersManager: failed to recover consumer:', e.message);
          });
        }
      }
    }
  }

  static forceUpdateFromServer(userId, serverData) {
    if (!this.members.has(userId)) {
      this.addMember({ ...serverData, userId });
      return;
    }
    
    const member = this.members.get(userId);
    const updated = {
      ...member,
      ...serverData,
      micSource: 'server',
      lastServerUpdate: Date.now()
    };
    
    this.members.set(userId, updated);
    
    if (serverData.connectionState) this.setConnectionState(userId, serverData.connectionState);
    if (serverData.isMicActive !== undefined) {
      this.setMicState(userId, serverData.isMicActive);
      UIManager.updateMemberMicState(userId, serverData.isMicActive);
      
      if (serverData.isMicActive === true) {
        this._ensureConsumerForActiveSpeaker(userId);
      }
    }
    
    if (!this.__bulkUpdate) {
      this._updateOnlineOfflineLists();
      UIManager.updateMembersListWithStatus(this.onlineMembers, this.offlineMembers);
    }
  }

  static addMember(memberData) {
    if (!memberData.userId) return;
    const existingMember = this.members.get(memberData.userId);
    let isCurrentlyOnline = true;
    let connectionState = CONNECTION_STATE.CONNECTED;
    let isMicActive = false;
    if (existingMember) {
      isCurrentlyOnline = existingMember.isOnline;
      connectionState = existingMember.connectionState || CONNECTION_STATE.CONNECTED;
      isMicActive = existingMember.isMicActive || false;
    }
    const processedMemberData = {
      userId: memberData.userId,
      username: memberData.username || `User_${memberData.userId.substr(0, 8)}`,
      isMicActive: memberData.isMicActive !== undefined ? memberData.isMicActive : isMicActive,
      isOnline: memberData.isOnline !== undefined ? memberData.isOnline : isCurrentlyOnline,
      clientId: memberData.clientId || null,
      connectionState: memberData.connectionState || connectionState,
      joinedAt: memberData.joinedAt || new Date().toISOString()
    };
    this.members.set(processedMemberData.userId, processedMemberData);
    if (processedMemberData.isOnline) {
      this.setConnectionState(processedMemberData.userId, processedMemberData.connectionState);
      this.setMicState(processedMemberData.userId, processedMemberData.isMicActive);
    }
    this._updateOnlineOfflineLists();
    UIManager.updateMembersListWithStatus(this.onlineMembers, this.offlineMembers);
  }

  static removeMember(userId) {
    if (this.members.has(userId)) {
      this.members.delete(userId);
      this.connectionStates.delete(userId);
      this.micStates.delete(userId);
      this._updateOnlineOfflineLists();
      UIManager.updateMembersListWithStatus(this.onlineMembers, this.offlineMembers);
    }
  }

  static clearMembers() {
    this.members.clear();
    this.onlineMembers = [];
    this.offlineMembers = [];
    this.connectionStates.clear();
    this.micStates.clear();
    UIManager.clearConnectionStatuses();
    UIManager.updateMembersListWithStatus([], []);
  }

  static updateAllMembers(members) {
    this.members.clear();
    members.forEach(member => {
      this.members.set(member.userId, {
        ...member,
        connectionState: member.connectionState || CONNECTION_STATE.CONNECTED,
        isMicActive: member.isMicActive || false
      });
      if (member.isOnline) {
        this.setConnectionState(member.userId, member.connectionState || CONNECTION_STATE.CONNECTED);
        this.setMicState(member.userId, member.isMicActive || false);
      }
    });
    this._updateOnlineOfflineLists();
    UIManager.updateMembersListWithStatus(this.onlineMembers, this.offlineMembers);
  }

  static updateAllMembersWithStatus(online, offline) {
    this.__bulkUpdate = true;
    if (!Array.isArray(online)) online = [];
    if (!Array.isArray(offline)) offline = [];
    this.members.clear();
    this.onlineMembers = [...online];
    this.offlineMembers = [...offline];
    [...this.onlineMembers].forEach(member => {
      if (member && member.userId) {
        const memberWithState = { ...member, connectionState: member.connectionState || CONNECTION_STATE.CONNECTED, isMicActive: member.isMicActive || false, isOnline: true };
        this.members.set(member.userId, memberWithState);
        this.setConnectionState(member.userId, memberWithState.connectionState);
        this.setMicState(member.userId, memberWithState.isMicActive);
        
        if (memberWithState.isMicActive === true) {
          setTimeout(() => this._ensureConsumerForActiveSpeaker(member.userId), 100);
        }
      }
    });
    [...this.offlineMembers].forEach(member => {
      if (member && member.userId) {
        const memberWithState = { ...member, connectionState: member.connectionState || CONNECTION_STATE.DISCONNECTED, isMicActive: member.isMicActive || false, isOnline: false };
        this.members.set(member.userId, memberWithState);
      }
    });
    this._updateOnlineOfflineLists();
    this.__bulkUpdate = false;
    UIManager.updateMembersListWithStatus(this.onlineMembers, this.offlineMembers);
  }

  static _updateOnlineOfflineLists() {
    this.onlineMembers = [];
    this.offlineMembers = [];
    this.members.forEach(member => {
      if (member.isOnline === true) this.onlineMembers.push(member);
      else this.offlineMembers.push(member);
    });
    this.onlineMembers.sort((a, b) => (a.username || '').localeCompare(b.username || ''));
    this.offlineMembers.sort((a, b) => (a.username || '').localeCompare(b.username || ''));
  }

  static getMembers() {
    return Array.from(this.members.values());
  }

  static getMember(userId) {
    return this.members.get(userId);
  }

  static getOnlineMembers() {
    return this.onlineMembers;
  }

  static getOfflineMembers() {
    return this.offlineMembers;
  }

  static isCurrentUser(client, userId) {
    return client.userId === userId;
  }

  static initializeRoomMembers(client, participants) {
    this.clearMembers();
    participants.forEach(participant => this.addMember(participant));
  }

  static getMembersByConnectionState(state) {
    return this.getMembers().filter(m => m.connectionState === state);
  }

  static getMembersByMicState(isActive) {
    return this.getMembers().filter(m => m.isMicActive === isActive);
  }

  static getConnectionStats() {
    const stats = { [CONNECTION_STATE.UNKNOWN]: 0, [CONNECTION_STATE.CONNECTING]: 0, [CONNECTION_STATE.CONNECTED]: 0, [CONNECTION_STATE.ERROR]: 0, [CONNECTION_STATE.DISCONNECTED]: 0 };
    this.members.forEach(member => {
      const state = member.connectionState || CONNECTION_STATE.UNKNOWN;
      if (stats[state] !== undefined) stats[state]++;
    });
    return stats;
  }

  static getMicStats() {
    const stats = { active: 0, inactive: 0 };
    this.members.forEach(member => {
      if (member.isOnline) {
        if (member.isMicActive) stats.active++;
        else stats.inactive++;
      }
    });
    return stats;
  }

  static syncStatesWithServer(client, roomId) {
    if (!client || !client.socket || !roomId) return;
    if (client.userId) {
      const myMicState = this.getMicState(client.userId);
      client.socket.emit('mic-indicator-state', { roomId, isActive: myMicState.isActive || false });
    }
    client.socket.emit('request-mic-states', { roomId });
  }

  static hasMembers() {
    return this.onlineMembers.length > 0 || this.offlineMembers.length > 0;
  }

  static getMemberByClientId(clientId) {
    if (!clientId) return null;
    for (const member of this.members.values()) {
      if (member.clientId === clientId) {
        return member;
      }
    }
    return null;
  }

  static getMemberByProducerId(producerId) {
    if (!producerId || !window.producerUserMap) return null;
    const userId = window.producerUserMap.get(producerId);
    if (!userId) return null;
    return this.getMember(userId);
  }

  static forceSyncFromServer() {
    if (this.client && this.client.socket && this.client.currentRoom) {
      this.client.socket.emit('request-room-snapshot', { roomId: this.client.currentRoom });
    }
  }
}

export default MembersManager;
