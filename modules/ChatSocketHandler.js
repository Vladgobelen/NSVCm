import UIManager from './UIManager.js';
import SecondaryChatManager from './SecondaryChatManager.js';
import SoundManager from './SoundManager.js';
import MessageRenderer from './MessageRenderer.js';

class ChatSocketHandler {
  constructor(client) {
    this.client = client;
  }

  registerHandlers(socket) {
    socket.on('message-deleted', this.handleMessageDeleted.bind(this));
    socket.on('message-reaction-updated', this.handleMessageReactionUpdated.bind(this));
    socket.on('message-updated', this.handleMessageUpdated.bind(this));
    socket.on('new-message', this.handleNewMessage.bind(this));
    socket.on('messages-read-status', this.handleMessagesReadStatus.bind(this));
    socket.on('message-pinned', this.handleMessagePinned.bind(this));
    socket.on('message-unpinned', this.handleMessageUnpinned.bind(this));
    socket.on('pinned-messages-list', this.handlePinnedMessagesList.bind(this));
  }

  handleMessageDeleted(data) {
    UIManager.removeMessageFromUI(data.messageId);
  }

  handleMessageReactionUpdated(data) {
    if (data?.messageId && data?.reactions) {
      UIManager.updateMessageReactions(data.messageId, data.reactions);
    }
  }

  handleMessageUpdated(data) {
    if (data?.messageId && data?.updatedMessage) {
      const msg = data.updatedMessage;
      const updateWithRetry = (retries = 5) => {
        const msgEl = document.querySelector(`.message[data-message-id="${data.messageId}"]`);
        if (msgEl) {
          if (msg.embed) {
            MessageRenderer.updateMessageEmbed(data.messageId, msg.embed);
          }
          if (msg.reactions) {
            UIManager.updateMessageReactions(data.messageId, msg.reactions);
          }
          if (msg.text) {
            const textEl = msgEl.querySelector('.message-text');
            if (textEl) {
              textEl.innerHTML = MessageRenderer.escapeHtmlAndFormat(msg.text);
            }
          }
        } else if (retries > 0) {
          setTimeout(() => updateWithRetry(retries - 1), 100);
        }
      };
      updateWithRetry();
    }
  }

handleNewMessage(message) {
    if (!message || !message.roomId) return;
    if (message.isForSecondary) {
        SecondaryChatManager.addMessage(
            message.username, message.text, message.timestamp, message.type || 'text',
            message.imageUrl, message.id, message.readBy || [], message.userId,
            message.broadcast || false, message.thumbnailUrl, message.replyTo,
            message.reactions || {}, message.poll, message.forwardedFrom, message.pollRef
        );
        return;
    }

    if (message.roomId === this.client.currentRoom) {
        // Определяем mediaUrl ДО вызова
        let mediaUrl = null;
        if (message.type === 'audio') {
            mediaUrl = message.audioUrl;
        } else if (message.type === 'image') {
            mediaUrl = message.imageUrl;
        }
        
        UIManager.addMessage(
            message.username, 
            message.text, 
            message.timestamp, 
            message.type || 'text',
            mediaUrl,
            message.id, 
            message.readBy || [], 
            message.userId,
            message.broadcast || false, 
            message.thumbnailUrl, 
            null, 
            message.replyTo,
            message.reactions || {}, 
            message.poll, 
            message.forwardedFrom, 
            message.pollRef, 
            message.embed
        );
        
        if (message.username !== this.client.username) {
            if (message.isDirectMessage) {
                SoundManager.playSound(SoundManager.SoundTypes.SOUND_DM);
            } else {
                const events = SoundManager.analyzePersonalEvents(message, this.client.userId, this.client.username);
                if (events.hasReply) {
                    SoundManager.playSound(SoundManager.SoundTypes.SOUND_CURRENT_REPLY);
                } else if (events.hasMention) {
                    SoundManager.playSound(SoundManager.SoundTypes.SOUND_CURRENT_MENTION);
                } else if (events.hasNameMention) {
                    SoundManager.playSound(SoundManager.SoundTypes.SOUND_CURRENT_NAME);
                }
            }
        }
    }
}

  handleMessagesReadStatus(updates) {
    if (updates && Array.isArray(updates)) {
      for (const { id, readBy } of updates) {
        const msgEl = document.querySelector(`.message[data-message-id="${id}"]`);
        if (msgEl && msgEl.dataset.userId === this.client.userId) {
          UIManager.updateMessageReadStatus(id, readBy || []);
        }
      }
    }
  }

  handleMessagePinned(data) {
    const { roomId, pinnedMessage } = data;
    if (!roomId || !pinnedMessage) return;
    if (!this.client.pinnedMessages.has(roomId)) {
      this.client.pinnedMessages.set(roomId, []);
    }
    const roomPinned = this.client.pinnedMessages.get(roomId);
    const existingIndex = roomPinned.findIndex(p => p.id === pinnedMessage.id);
    if (existingIndex === -1) {
      roomPinned.push(pinnedMessage);
      roomPinned.sort((a, b) => new Date(b.pinnedAt) - new Date(a.pinnedAt));
    }
    this.client.pinnedMessages.set(roomId, roomPinned);
    this.client.currentPinnedIndex.set(roomId, 0);
    if (roomId === this.client.currentRoom) {
      UIManager.renderPinnedMessagesBar(this.client);
      UIManager.addMessage('System', `📌 Сообщение от ${pinnedMessage.username} закреплено`, null, 'system');
    }
  }

  handleMessageUnpinned(data) {
    const { roomId, messageId } = data;
    if (!roomId || !messageId) return;
    if (this.client.pinnedMessages.has(roomId)) {
      const roomPinned = this.client.pinnedMessages.get(roomId);
      const filtered = roomPinned.filter(p => p.id !== messageId);
      this.client.pinnedMessages.set(roomId, filtered);
      if (this.client.currentPinnedIndex.has(roomId)) {
        const idx = this.client.currentPinnedIndex.get(roomId);
        if (idx >= filtered.length) {
          this.client.currentPinnedIndex.set(roomId, 0);
        }
      }
    }
    if (roomId === this.client.currentRoom) {
      if (this.client.pinnedMessages.get(roomId)?.length === 0) {
        UIManager.hidePinnedMessagesBar();
      } else {
        UIManager.renderPinnedMessagesBar(this.client);
      }
      UIManager.addMessage('System', `📌 Сообщение откреплено`, null, 'system');
    }
  }

  handlePinnedMessagesList(data) {
    const { roomId, pinnedMessages } = data;
    if (!roomId) return;
    const sorted = (pinnedMessages || []).sort((a, b) => new Date(b.pinnedAt) - new Date(a.pinnedAt));
    this.client.pinnedMessages.set(roomId, sorted);
    this.client.currentPinnedIndex.set(roomId, 0);
    if (roomId === this.client.currentRoom) {
      if (sorted.length > 0) {
        UIManager.renderPinnedMessagesBar(this.client);
      } else {
        UIManager.hidePinnedMessagesBar();
      }
    }
  }
}

export default ChatSocketHandler;
