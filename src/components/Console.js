class Console {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.init();
    }

    init() {
        this.container.innerHTML = `
            <div class="console-window">
                <div class="console-output"></div>
            </div>
        `;
    }

    log(message) {
        const output = this.container.querySelector('.console-output');
        const logEntry = document.createElement('div');
        logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        output.appendChild(logEntry);
        output.scrollTop = output.scrollHeight;
    }
} 