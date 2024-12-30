class Console {
    static init() {
        const consoleContent = document.getElementById('console-content');
        if (!consoleContent) return;

        consoleContent.innerHTML = `
            <h2>Console</h2>
            <div class="console-section">
                <div class="console-output" id="consoleOutput">
                    <!-- Console messages will appear here -->
                </div>
            </div>
        `;
    }

    static show() {
        const consoleContent = document.getElementById('console-content');
        if (consoleContent) {
            consoleContent.style.display = 'flex';
        }
    }

    static hide() {
        const consoleContent = document.getElementById('console-content');
        if (consoleContent) {
            consoleContent.style.display = 'none';
        }
    }

    static log(message, type = 'info') {
        const consoleOutput = document.getElementById('consoleOutput');
        if (!consoleOutput) return;

        const logEntry = document.createElement('div');
        logEntry.className = `console-entry ${type}`;
        logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        consoleOutput.appendChild(logEntry);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }

    static clear() {
        const consoleOutput = document.getElementById('consoleOutput');
        if (consoleOutput) {
            consoleOutput.innerHTML = '';
        }
    }

    static success(message) {
        this.log(message, 'success');
    }

    static error(message) {
        this.log(message, 'error');
    }

    static warn(message) {
        this.log(message, 'warning');
    }

    static delete(message) {
        this.log(message, 'delete');
    }
}

module.exports = Console; 