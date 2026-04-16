import UIManager from './UIManager.js';
import SecondaryChatManager from './SecondaryChatManager.js';

class PollSocketHandler {
  constructor(client) {
    this.client = client;
  }

  registerHandlers(socket) {
    socket.on('poll:updated', this.handlePollUpdated.bind(this));
    socket.on('poll:closed', this.handlePollClosed.bind(this));
  }

  handlePollUpdated(data) {
    const { originalRoomId, pollId, poll, isForSecondary } = data;
    if (isForSecondary) {
      SecondaryChatManager.updatePollInSecondary(originalRoomId, poll);
      return;
    }

    const updateElement = (msgEl, msgPollId, msgPollRef) => {
      if (!msgEl) return;
      const container = msgEl.querySelector('.poll-container');
      if (!container) return;
      const pollData = {
        poll: poll,
        messageId: msgPollId,
        roomId: this.client.currentRoom,
        pollRef: msgPollRef
      };
      msgEl.dataset.pollData = JSON.stringify(pollData);
      import('./PollWidget.js').then(m => {
        m.default.render(container, pollData, this.client);
      });
    };

    const originalMsg = document.querySelector(`.message[data-message-id="${pollId}"]`);
    if (originalMsg) {
      updateElement(originalMsg, pollId, null);
    }

    const allMessages = document.querySelectorAll('.message.poll-message');
    allMessages.forEach(msgEl => {
      const msgId = msgEl.dataset.messageId;
      if (msgId === pollId) return;
      try {
        const existingData = JSON.parse(msgEl.dataset.pollData || '{}');
        if (existingData.pollRef && existingData.pollRef.originalPollId === pollId) {
          updateElement(msgEl, msgId, existingData.pollRef);
        }
      } catch (e) {
        const pollRefAttr = msgEl.dataset.pollRef;
        if (pollRefAttr) {
          try {
            const pollRef = JSON.parse(pollRefAttr);
            if (pollRef.originalPollId === pollId) {
              updateElement(msgEl, msgId, pollRef);
            }
          } catch (e2) {}
        }
      }
    });
  }

  handlePollClosed(data) {
    const { roomId, pollId } = data;
    if (roomId === this.client.currentRoom) {
      const msgEl = document.querySelector(`.message[data-message-id="${pollId}"]`);
      if (msgEl) {
        const container = msgEl.querySelector('.poll-container');
        if (container) {
          container.classList.add('poll-closed');
          const voteBtn = container.querySelector('.poll-vote-btn');
          if (voteBtn) voteBtn.style.display = 'none';
        }
      }
    }
  }
}

export default PollSocketHandler;
