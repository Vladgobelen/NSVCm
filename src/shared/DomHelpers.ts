export function createButton(text: string, className: string = '', onClick?: (e: MouseEvent) => void, title?: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    if (className) btn.className = className;
    if (title) btn.title = title;
    if (onClick) btn.addEventListener('click', onClick);
    return btn;
}

export function createCloseButton(onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.innerHTML = '✕';
    btn.style.cssText = 'background: none; border: none; color: #888; font-size: 20px; cursor: pointer; padding: 4px 8px; border-radius: 4px;';
    btn.addEventListener('click', onClick);
    return btn;
}

export function createModalOverlay(content: HTMLElement, onClose: () => void): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); display: flex; justify-content: center; align-items: center; z-index: 10001;';
    overlay.appendChild(content);
    
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) onClose();
    });
    
    return overlay;
}

export function createModalContent(width: string = '500px'): HTMLDivElement {
    const div = document.createElement('div');
    div.style.cssText = `background: #2d2d44; border-radius: 12px; padding: 24px; max-width: ${width}; width: 90%; border: 1px solid #404060;`;
    return div;
}

export function addOutsideClickHandler(element: HTMLElement, callback: () => void): () => void {
    const handler = (e: MouseEvent) => {
        if (!element.contains(e.target as Node)) {
            callback();
            document.removeEventListener('click', handler);
        }
    };
    setTimeout(() => document.addEventListener('click', handler), 100);
    return handler;
}

export function removeModal(modal: HTMLElement): void {
    modal.style.opacity = '0';
    setTimeout(() => modal.remove(), 200);
}
