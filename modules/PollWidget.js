// modules/PollWidget.js
import UIManager from './UIManager.js';

class PollWidget {
    static _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    static render(container, pollData, client) {
        if (!container || !pollData || !pollData.poll) {
            console.error('[PollWidget] Недостаточно данных для рендеринга опроса');
            return;
        }

        const { poll, messageId, roomId: providedRoomId, userId: providedUserId, pollRef } = pollData;
        const isClosed = poll.settings?.closed || false;
        const isMultiple = poll.settings?.multiple || false;
        const maxChoices = poll.settings?.maxChoices || 1;
        const currentUserId = providedUserId || client?.userId;
        const hasVoted = poll.options.some(opt => opt.voters && opt.voters.includes(currentUserId));
        const totalVotes = poll.totalVotes || 0;

        const votedOptions = new Set();
        poll.options.forEach(opt => {
            if (opt.voters && opt.voters.includes(currentUserId)) {
                votedOptions.add(opt.id);
            }
        });

        let optionsHtml = '';
        for (const option of poll.options) {
            const votes = option.votes || 0;
            const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
            const isVoted = votedOptions.has(option.id);

            if (hasVoted || isClosed) {
                optionsHtml += `
                    <div class="poll-option-result ${isVoted ? 'voted' : ''}">
                        <div class="poll-option-header">
                            <span class="poll-option-text">${this._escapeHtml(option.text)}</span>
                            <span class="poll-option-stats">
                                <span class="poll-option-percentage">${percentage}%</span>
                                <span class="poll-option-votes">(${votes})</span>
                                ${isVoted ? '<span class="poll-voted-check">✓</span>' : ''}
                            </span>
                        </div>
                        <div class="poll-progress-bar-container">
                            <div class="poll-progress-bar" style="width: ${percentage}%;"></div>
                        </div>
                    </div>
                `;
            } else {
                const inputType = isMultiple ? 'checkbox' : 'radio';
                optionsHtml += `
                    <div class="poll-option">
                        <label class="poll-option-label">
                            <input type="${inputType}" name="poll_${messageId}" value="${option.id}" class="poll-option-input">
                            <span class="poll-option-text">${this._escapeHtml(option.text)}</span>
                        </label>
                    </div>
                `;
            }
        }

        let footerHtml = '';
        if (!hasVoted && !isClosed) {
            footerHtml = `<button class="poll-vote-btn" data-poll-id="${messageId}">Голосовать</button>`;
        } else {
            footerHtml = `
                <div class="poll-footer">
                    <span class="poll-total-votes">Всего голосов: ${totalVotes}</span>
                    ${isMultiple ? '<span class="poll-multiple-badge">Множественный выбор</span>' : ''}
                </div>
            `;
        }

        if (isClosed) {
            footerHtml += '<div class="poll-closed-badge">🔒 Опрос закрыт</div>';
        } else if (currentUserId && (poll.userId === currentUserId)) {
            footerHtml += `<button class="poll-close-btn" data-poll-id="${messageId}">Закрыть опрос</button>`;
        }

        container.innerHTML = `
            <div class="poll-header">
                <span class="poll-icon">📊</span>
                <span class="poll-question">${this._escapeHtml(poll.question)}</span>
            </div>
            <div class="poll-options">
                ${optionsHtml}
            </div>
            ${footerHtml}
        `;

        container.classList.add('poll-container');
        if (isClosed) {
            container.classList.add('poll-closed');
        }

        const voteBtn = container.querySelector('.poll-vote-btn');
        if (voteBtn) {
            voteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                
                if (!client) {
                    console.error('[PollWidget] Клиент не передан для голосования');
                    UIManager.showError('Ошибка: клиент не инициализирован');
                    return;
                }

                const selectedInputs = container.querySelectorAll('.poll-option-input:checked');
                const selectedOptionIds = Array.from(selectedInputs).map(input => input.value);

                if (selectedOptionIds.length === 0) {
                    UIManager.showError('Выберите хотя бы один вариант');
                    return;
                }

                if (isMultiple && selectedOptionIds.length > maxChoices) {
                    UIManager.showError(`Можно выбрать не более ${maxChoices} вариантов`);
                    return;
                }

                const targetRoomId = pollRef?.originalRoomId || providedRoomId || client.currentRoom;
                const targetPollId = pollRef?.originalPollId || messageId;

                if (!targetRoomId || !targetPollId) {
                    console.error('[PollWidget] Не удалось определить roomId или pollId для голосования');
                    UIManager.showError('Ошибка: неверные данные опроса');
                    return;
                }

                if (typeof client.votePoll === 'function') {
                    client.votePoll(targetRoomId, targetPollId, selectedOptionIds);
                } else {
                    console.error('[PollWidget] Метод votePoll отсутствует в клиенте');
                    UIManager.showError('Ошибка: функция голосования недоступна');
                }
            });
        }

        const closeBtn = container.querySelector('.poll-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                if (!client) {
                    console.error('[PollWidget] Клиент не передан для закрытия опроса');
                    UIManager.showError('Ошибка: клиент не инициализирован');
                    return;
                }

                const targetRoomId = pollRef?.originalRoomId || providedRoomId || client.currentRoom;
                const targetPollId = pollRef?.originalPollId || messageId;

                if (!targetRoomId || !targetPollId) {
                    console.error('[PollWidget] Не удалось определить roomId или pollId для закрытия опроса');
                    UIManager.showError('Ошибка: неверные данные опроса');
                    return;
                }

                if (typeof client.closePoll === 'function') {
                    client.closePoll(targetRoomId, targetPollId);
                } else {
                    console.error('[PollWidget] Метод closePoll отсутствует в клиенте');
                    UIManager.showError('Ошибка: функция закрытия опроса недоступна');
                }
            });
        }
    }

    static showResults(container, message) {
        if (!container || !message || !message.poll) return;
        
        const poll = message.poll;
        const totalVotes = poll.totalVotes || 0;
        
        let resultsHtml = '';
        for (const option of poll.options) {
            const votes = option.votes || 0;
            const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
            
            resultsHtml += `
                <div class="poll-option-result">
                    <div class="poll-option-header">
                        <span class="poll-option-text">${this._escapeHtml(option.text)}</span>
                        <span class="poll-option-stats">
                            <span class="poll-option-percentage">${percentage}%</span>
                            <span class="poll-option-votes">(${votes})</span>
                        </span>
                    </div>
                    <div class="poll-progress-bar-container">
                        <div class="poll-progress-bar" style="width: ${percentage}%;"></div>
                    </div>
                </div>
            `;
        }
        
        container.innerHTML = `
            <div class="poll-header">
                <span class="poll-icon">📊</span>
                <span class="poll-question">${this._escapeHtml(poll.question)}</span>
            </div>
            <div class="poll-options">
                ${resultsHtml}
            </div>
            <div class="poll-footer">
                <span class="poll-total-votes">Всего голосов: ${totalVotes}</span>
            </div>
        `;
        
        container.classList.add('poll-container', 'poll-results');
    }
}

export default PollWidget;
