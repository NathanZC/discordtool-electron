const BaseScreen = require('./BaseScreen');

class ServersScreen extends BaseScreen {
    constructor(token) {
        super(token);
    }

    render(container) {
        container.innerHTML = `
            <div class="screen-container">
                <h1>Accessible Servers</h1>
                <div class="loading-indicator">
                    <p>Loading your servers...</p>
                </div>
                <div class="servers-list">
                    <!-- Server list will be populated here -->
                </div>
            </div>
        `;

        this.loadServers(container);
    }

    async loadServers(container) {
        setTimeout(() => {
            const serversList = container.querySelector('.servers-list');
            const loadingIndicator = container.querySelector('.loading-indicator');
            
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
            
            serversList.innerHTML = `
                <div class="info-message">
                    <p>This screen will show your accessible Discord servers.</p>
                    <p>Implementation coming soon...</p>
                </div>
            `;
        }, 1000);
    }
}

module.exports = ServersScreen; 