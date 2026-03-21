/**
 * Toast Notification Component
 */

const toast = {
    container: null,

    init() {
        this.container = document.getElementById('toast-container');
    },

    show(message, type = 'info', duration = 3000) {
        if (!this.container) this.init();

        const toastEl = document.createElement('div');
        toastEl.className = `toast ${type}`;
        toastEl.textContent = message;

        this.container.appendChild(toastEl);

        // Auto-remove after duration
        setTimeout(() => {
            toastEl.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => {
                toastEl.remove();
            }, 300);
        }, duration);
    },

    success(message) {
        this.show(message, 'success');
    },

    error(message) {
        this.show(message, 'error', 5000);
    },

    warning(message) {
        this.show(message, 'warning');
    },

    info(message) {
        this.show(message, 'info');
    }
};
