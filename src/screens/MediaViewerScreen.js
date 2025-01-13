const BaseScreen = require('./BaseScreen');

class MediaViewerScreen extends BaseScreen {
    constructor(token, userId) {
        super(token);
    }

    render(container) {
        container.innerHTML = `
            <div class="screen-container">
                <h1>View Media</h1>
                <div class="info-message">Media viewer coming soon...</div>
            </div>
        `;
    }
}

module.exports = MediaViewerScreen; 