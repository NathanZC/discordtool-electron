const BaseScreen = require('./BaseScreen');
const Console = require('../components/Console');
const DiscordAPI = require('../utils/discord');
const Store = require('electron-store');

class OpenDMsScreen extends BaseScreen {
    constructor(token, userId) {
        super(token);
        this.dmQueue = [];
        this.isRunning = false;
        this.deleteDelay = 1000;
        this.store = new Store();
        const savedAuth = this.store.get('discord_token');
        this.api = new DiscordAPI(token, userId);
    }

    render(container) {
        container.innerHTML = `
            <div class="screen-container">
                <h1>View Open DMs</h1>
                
                <!-- Controls Section -->
                <div class="controls-section">
                    <div class="delay-control">
                        <label for="deleteDelay">Delete Delay (seconds):</label>
                        <input type="range" id="deleteDelay" 
                            min="1" max="10" value="1" step="0.5"
                            class="delay-slider">
                        <span class="delay-value">1.0s</span>
                    </div>
                    
                    <div class="action-buttons">
                        <button id="getCountsBtn" class="action-btn">
                            Get Message Counts
                        </button>
                        <button id="startBtn" class="action-btn primary">
                            Start
                        </button>
                    </div>
                </div>

                <!-- Progress Section -->
                <div class="progress-section">
                    <div class="progress-bar">
                        <div class="progress-fill"></div>
                    </div>
                    <div class="progress-stats">
                        <span class="progress-text">Ready to start</span>
                        <span class="progress-percentage">0%</span>
                    </div>
                </div>

                <!-- DMs List -->
                <div class="dms-container">
                    <div class="dms-header">
                        <span>Channel</span>
                        <span>Message Count</span>
                        <span>Enable</span>
                    </div>
                    <div class="dms-list" id="dmsList">
                        <!-- DMs will be loaded here -->
                    </div>
                </div>
            </div>
        `;

        // Initialize console and event listeners
        this.setupEventListeners(container);
        this.loadDMs();
    }

    setupEventListeners(container) {
        // Delay slider
        const delaySlider = container.querySelector('#deleteDelay');
        const delayValue = container.querySelector('.delay-value');
        delaySlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value).toFixed(1);
            delayValue.textContent = `${value}s`;
            this.deleteDelay = value * 1000;
        });

        // Get Counts Button
        const getCountsBtn = container.querySelector('#getCountsBtn');
        getCountsBtn.addEventListener('click', () => this.getMessageCounts());

        // Start/Stop Button
        const startBtn = container.querySelector('#startBtn');
        startBtn.addEventListener('click', () => this.toggleOperation(startBtn));

        // Add toggle event listeners for DM rows
        container.querySelectorAll('.dm-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                const row = e.target.closest('.dm-row');
                const channelId = row.dataset.channelId;
                const channelName = row.dataset.channelName;
                const checkbox = row.querySelector('.dm-checkbox');
                
                toggle.classList.toggle('active');
                checkbox.checked = !checkbox.checked;

                if (checkbox.checked) {
                    this.addToQueue(channelId, channelName);
                } else {
                    this.removeFromQueue(channelId);
                }
            });
        });
    }

    addToQueue(channelId, channelName) {
        if (!this.dmQueue.some(dm => dm.id === channelId)) {
            this.dmQueue.push({ id: channelId, name: channelName });
            Console.log(`Added ${channelName} (${channelId}) to queue. Queue size: ${this.dmQueue.length}`);
        }
    }

    removeFromQueue(channelId) {
        const index = this.dmQueue.findIndex(dm => dm.id === channelId);
        if (index > -1) {
            const removed = this.dmQueue.splice(index, 1)[0];
            Console.log(`Removed ${removed.name} (${removed.id}) from queue. Queue size: ${this.dmQueue.length}`);
        }
    }

    async loadDMs() {
        const dmsList = document.getElementById('dmsList');
        Console.log('Loading DM channels...');

        try {
            dmsList.innerHTML = '<div class="loading">Loading DM channels...</div>';

            const api = new DiscordAPI(this.token);
            const dms = await api.getAllOpenDMs();

            if (!dms || dms.length === 0) {
                dmsList.innerHTML = '<div class="info-message">No open DMs found.</div>';
                return;
            }

            // Render DMs list with toggle buttons and store username in data attribute
            dmsList.innerHTML = dms.map(dm => {
                const username = dm.recipients?.[0]?.username || 'Unknown User';
                return `
                    <div class="dm-row" 
                        data-channel-id="${dm.id}"
                        data-channel-name="${username}">
                        <span class="dm-recipient">${username}</span>
                        <span class="dm-count">-</span>
                        <span class="dm-toggle">
                            <input type="checkbox" class="dm-checkbox" 
                                id="dm-${dm.id}" 
                                value="${dm.id}">
                        </span>
                    </div>
                `;
            }).join('');

            // Only set up the DM toggle listeners, not all listeners
            this.setupDMToggleListeners(dmsList.closest('.screen-container'));
            Console.success(`Loaded ${dms.length} DM channels`);
        } catch (error) {
            Console.error('Error loading DMs: ' + error.message);
            dmsList.innerHTML = '<div class="error-message">Failed to load DMs</div>';
        }
    }

    async getMessageCounts() {
        const getCountsBtn = document.querySelector('#getCountsBtn');
        getCountsBtn.disabled = true;
        Console.log('Fetching message counts...');

        try {
            // TODO: Implement actual message count fetching
            await new Promise(resolve => setTimeout(resolve, 1000));
            Console.success('Message counts updated');
        } catch (error) {
            Console.error('Error fetching message counts: ' + error.message);
        } finally {
            getCountsBtn.disabled = false;
        }
    }

    toggleOperation(button) {
        console.log("toggleOperation called, current isRunning:", this.isRunning);
        this.isRunning = !this.isRunning;
        console.log("toggleOperation: isRunning set to", this.isRunning);
        
        if (this.isRunning) {
            this.updateButtonState(true, false);  // Enable Stop button
            this.startDeletion();
        } else {
            this.updateButtonState(false, false);  // Disable Start button
            this.stopDeletion();
        }
    }

    updateButtonState(isRunning, enableButton = true) {
        const startBtn = document.querySelector('#startBtn');
        
        if (isRunning) {
            console.log("Updating button state to stop");
            startBtn.textContent = 'Stop';
            startBtn.classList.add('danger');
            startBtn.disabled = false;  // Keep enabled when in Stop mode
        } else {
            console.log("Updating button state to start");
            startBtn.textContent = 'Start';
            startBtn.classList.remove('danger');
            startBtn.disabled = !enableButton;  // Only disable in Start mode when processing
        }
    }

    async startDeletion() {
        console.log("startDeletion called, current isRunning:", this.isRunning);
        
        if (this.dmQueue.length === 0) {
            Console.warn('No DMs selected for deletion');
            this.isRunning = false;
            this.updateButtonState(false, true);  // Re-enable button
            return;
        }

        Console.log(`Starting deletion process for ${this.dmQueue.length} DMs:`);
        
        for (const dm of this.dmQueue) {
            console.log("Processing DM in queue, isRunning:", this.isRunning);
            if (!this.isRunning) {
                console.log("Breaking loop due to isRunning false");
                break;
            }
            
            Console.log(`Processing DM: ${dm.name} (${dm.id})`);
            const result = await this.api.deleteChannelMessages({
                channelId: dm.id,
                channelName: dm.name,
                deleteDelay: this.deleteDelay,
                onProgress: (current, total) => this.updateProgress(current, total),
                onLog: (message) => Console.log(message),
                isRunning: () => this.isRunning
            });

            console.log("Deletion result:", result);
            if (result.stopped) {
                Console.warn('Deletion process stopped by user');
                break;
            }
        }

        console.log("Exiting startDeletion, final isRunning:", this.isRunning);
        this.isRunning = false;
        this.updateButtonState(false, true);  // Re-enable button when completely done
    }

    stopDeletion() {
        console.log("stopDeletion called, setting isRunning to false");
        this.isRunning = false;
        Console.warn('Stopping deletion process...');
        // Button stays disabled until process is completely stopped
    }

    updateProgress(current, total) {
        const progressFill = document.querySelector('.progress-fill');
        const progressText = document.querySelector('.progress-text');
        const progressPercentage = document.querySelector('.progress-percentage');
        
        const percentage = (current / total) * 100;
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `Processing: ${current}/${total}`;
        progressPercentage.textContent = `${percentage.toFixed(1)}%`;
    }

    // New method for DM-specific listeners
    setupDMToggleListeners(container) {
        container.querySelectorAll('.dm-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                const row = e.target.closest('.dm-row');
                const channelId = row.dataset.channelId;
                const channelName = row.dataset.channelName;
                const checkbox = row.querySelector('.dm-checkbox');
                
                toggle.classList.toggle('active');
                checkbox.checked = !checkbox.checked;

                if (checkbox.checked) {
                    this.addToQueue(channelId, channelName);
                } else {
                    this.removeFromQueue(channelId);
                }
            });
        });
    }
}

module.exports = OpenDMsScreen; 