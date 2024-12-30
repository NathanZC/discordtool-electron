const BaseScreen = require('./BaseScreen');
const Console = require('../components/Console');
const DiscordAPI = require('../utils/discord');
const Store = require('electron-store');

class OpenDMsScreen extends BaseScreen {
    constructor(token, userId) {
        super(token);
        this.dmQueue = [];
        this.isRunning = false;
        this.isCountingMessages = false;
        this.operationDelay = 1000;
        this.store = new Store();
        this.api = new DiscordAPI(token, userId);
    }

    render(container) {
        container.innerHTML = `
            <div class="screen-container">
                <h1>View Open DMs</h1>
                
                <!-- Combined Progress and Controls Section -->
                <div class="progress-section">
                    <div class="progress-bar">
                        <div class="progress-fill"></div>
                    </div>
                    <div class="progress-stats">
                        <span>Progress: <span id="progressCount">0</span>/<span id="totalCount">0</span></span>
                        <span>Estimated Time: <span id="estimatedTime">--:--</span></span>
                    </div>

                    <!-- Advanced Options -->
                    <div class="advanced-options-toggle">
                        <button class="toggle-btn">
                            <span class="toggle-arrow">▶</span>
                            Advanced Options
                        </button>
                    </div>

                    <div class="filter-options collapsed">
                        <div class="filter-row">
                            <div class="date-filter">
                                <label for="afterDate">After Date:</label>
                                <input type="date" id="afterDate">
                            </div>
                            <div class="date-filter">
                                <label for="beforeDate">Before Date:</label>
                                <input type="date" id="beforeDate">
                            </div>
                            <div class="text-filter">
                                <label for="containingText">Containing Text:</label>
                                <input type="text" id="containingText" placeholder="Search text...">
                            </div>
                        </div>
                        <div class="checkbox-row">
                            <label class="checkbox-label">
                                <input type="checkbox" id="onlyMe" checked disabled>
                                <span>Only My Messages</span>
                            </label>
                            <label class="checkbox-label">
                                <input type="checkbox" id="closeDm">
                                <span>Close DM After Delete</span>
                            </label>
                        </div>
                    </div>

                    <div class="controls-group">
                        <div class="delay-control">
                            <label for="operationDelay">Delay (seconds):</label>
                            <input type="range" id="operationDelay" 
                                min="0.1" max="10" value="1" step="0.1"
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
                </div>

                <!-- DMs List -->
                <div class="dms-container">
                    <div class="dms-header">
                        <div class="channel-header">
                            <span>Channel</span>
                            <button class="refresh-btn" id="refreshDMsBtn" title="Refresh DM List">
                                <svg width="16" height="16" viewBox="0 0 16 16">
                                    <path fill="currentColor" d="M13.6 2.3C12.2.9 10.2 0 8 0 3.6 0 0 3.6 0 8s3.6 8 8 8c3.7 0 6.8-2.5 7.7-6h-2.1c-.8 2.3-3 4-5.6 4-3.3 0-6-2.7-6-6s2.7-6 6-6c1.7 0 3.1.7 4.2 1.8L9 7h7V0l-2.4 2.3z"/>
                                </svg>
                            </button>
                        </div>
                        <div class="search-container">
                            <input type="text" id="dmSearch" placeholder="Search DMs..." class="dm-search">
                        </div>
                        <span>Message Count</span>
                        <div class="toggle-header">
                            <button class="select-all-btn" id="selectAllBtn">Enable All</button>
                        </div>
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
        // Update delay slider
        const delaySlider = container.querySelector('#operationDelay');
        const delayValue = container.querySelector('.delay-value');
        delaySlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value).toFixed(1);
            delayValue.textContent = `${value}s`;
            this.operationDelay = value * 1000;
        });

        // Get Counts Button
        const getCountsBtn = container.querySelector('#getCountsBtn');
        const startBtn = container.querySelector('#startBtn');

        getCountsBtn.addEventListener('click', () => {
            if (this.isCountingMessages) {
                this.isCountingMessages = false;
                getCountsBtn.textContent = 'Get Message Counts';
                getCountsBtn.classList.remove('danger');
            } else {
                this.isCountingMessages = true;
                getCountsBtn.textContent = 'Stop Counting';
                getCountsBtn.classList.add('danger');
                startBtn.disabled = true;  // Disable delete button
                this.getMessageCounts();
            }
        });

        // Start/Stop Button
        startBtn.addEventListener('click', () => {
            if (this.isRunning) {
                this.stopDeletion();
            } else {
                this.toggleOperation(startBtn);
                getCountsBtn.disabled = true;  // Disable count button
            }
        });

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

        // Advanced options toggle
        const toggleBtn = container.querySelector('.advanced-options-toggle .toggle-btn');
        const filterOptions = container.querySelector('.filter-options');
        const toggleArrow = container.querySelector('.toggle-arrow');
        
        toggleBtn.addEventListener('click', () => {
            filterOptions.classList.toggle('collapsed');
            toggleArrow.style.transform = filterOptions.classList.contains('collapsed') 
                ? 'rotate(0deg)' 
                : 'rotate(90deg)';
        });

        // Add refresh button listener
        const refreshBtn = container.querySelector('#refreshDMsBtn');
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.classList.add('spinning');
            await this.loadDMs();
            refreshBtn.classList.remove('spinning');
        });

        // Add select all button listener
        const selectAllBtn = container.querySelector('#selectAllBtn');
        selectAllBtn.addEventListener('click', () => {
            const allToggles = container.querySelectorAll('.dm-toggle');
            const allCheckboxes = container.querySelectorAll('.dm-checkbox');
            const isAnyUnchecked = Array.from(allCheckboxes).some(checkbox => !checkbox.checked);
            
            allToggles.forEach(toggle => {
                const row = toggle.closest('.dm-row');
                const checkbox = row.querySelector('.dm-checkbox');
                const channelId = row.dataset.channelId;
                const channelName = row.dataset.channelName;
                
                if (isAnyUnchecked) {
                    // Select all unchecked
                    if (!checkbox.checked) {
                        toggle.classList.add('active');
                        checkbox.checked = true;
                        this.addToQueue(channelId, channelName);
                    }
                } else {
                    // Deselect all
                    toggle.classList.remove('active');
                    checkbox.checked = false;
                    this.removeFromQueue(channelId);
                }
            });
            
            // Update button text
            selectAllBtn.textContent = isAnyUnchecked ? 'Deselect All' : 'Select All';
        });

        // Add search functionality
        const searchInput = container.querySelector('#dmSearch');
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const dmRows = container.querySelectorAll('.dm-row');

            dmRows.forEach(row => {
                const recipient = row.querySelector('.dm-recipient').textContent.toLowerCase();
                if (recipient.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
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

            const dms = await this.api.getAllOpenDMs();

            if (!dms || dms.length === 0) {
                dmsList.innerHTML = '<div class="info-message">No open DMs found.</div>';
                return;
            }

            // Clear existing message counts when refreshing
            this.dmQueue = [];

            // Updated DM row rendering to include both nickname and username
            dmsList.innerHTML = dms.map(dm => {
                const username = dm.recipients?.[0]?.username || 'Unknown User';
                const nickname = dm.recipients?.[0]?.global_name || username;
                return `
                    <div class="dm-row" 
                        data-channel-id="${dm.id}"
                        data-channel-name="${username}">
                        <span class="dm-recipient">${nickname} <span class="dm-username">(${username})</span></span>
                        <span class="dm-count">-</span>
                        <span class="dm-toggle">
                            <input type="checkbox" class="dm-checkbox" 
                                id="dm-${dm.id}" 
                                value="${dm.id}">
                        </span>
                    </div>
                `;
            }).join('');

            // Only set up the DM toggle listeners
            this.setupDMToggleListeners(dmsList.closest('.screen-container'));
            Console.success(`Loaded ${dms.length} DM channels`);
        } catch (error) {
            Console.error('Error loading DMs: ' + error.message);
            dmsList.innerHTML = '<div class="error-message">Failed to load DMs</div>';
        }
    }

    async getMessageCounts() {
        const getCountsBtn = document.querySelector('#getCountsBtn');
        const startBtn = document.querySelector('#startBtn');

        try {
            const dmRows = document.querySelectorAll('.dm-row');
            const totalDMs = dmRows.length;
            let currentDM = 0;

            // Reset progress bar at start
            this.updateProgress(0, totalDMs);
            
            for (const row of dmRows) {
                if (!this.isCountingMessages) {
                    Console.warn('Message counting stopped by user');
                    break;
                }

                const channelId = row.dataset.channelId;
                const channelName = row.dataset.channelName;
                const countSpan = row.querySelector('.dm-count');
                
                countSpan.textContent = 'Counting...';
                
                const count = await this.api.getMessageCountForUser(channelId, this.api.userId);
                
                if (!this.isCountingMessages) break;

                if (count !== null) {
                    countSpan.textContent = count.toString();
                    Console.log(`Found ${count} messages in ${channelName}`);
                } else {
                    countSpan.textContent = 'Error';
                    Console.error(`Failed to get count for ${channelName}`);
                }

                // Update progress
                currentDM++;
                this.updateProgress(currentDM, totalDMs);

                if (this.operationDelay > 0) {
                    await new Promise(resolve => setTimeout(resolve, this.operationDelay));
                }
            }
            
            Console.success('Message counts updated');
        } catch (error) {
            Console.error('Error fetching message counts: ' + error.message);
        } finally {
            this.isCountingMessages = false;
            getCountsBtn.textContent = 'Get Message Counts';
            getCountsBtn.classList.remove('danger');
            startBtn.disabled = false;  // Re-enable delete button
            
            // Reset progress bar when done
            setTimeout(() => this.updateProgress(0, 0), 1000);
        }
    }

    toggleOperation(button) {
        const getCountsBtn = document.querySelector('#getCountsBtn');
        
        this.isRunning = !this.isRunning;
        
        if (this.isRunning) {
            this.updateButtonState(true, false);
            getCountsBtn.disabled = true;  // Disable count button
            this.startDeletion();
        } else {
            this.updateButtonState(false, false);
            this.stopDeletion();
        }
    }

    updateButtonState(isRunning, enableButton = true) {
        const startBtn = document.querySelector('#startBtn');
        const getCountsBtn = document.querySelector('#getCountsBtn');
        
        if (isRunning) {
            startBtn.textContent = 'Stop';
            startBtn.classList.add('danger');
            startBtn.disabled = false;
            getCountsBtn.disabled = true;  // Disable count button while running
        } else {
            startBtn.textContent = 'Start';
            startBtn.classList.remove('danger');
            startBtn.disabled = !enableButton;
            getCountsBtn.disabled = false;  // Re-enable count button
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
            if (!this.isRunning) break;
            
            Console.log(`Processing DM: ${dm.name} (${dm.id})`);
            
            // Get filter values
            const beforeDate = document.querySelector('#beforeDate').value;
            const afterDate = document.querySelector('#afterDate').value;
            const containingText = document.querySelector('#containingText').value;
            const closeDm = document.querySelector('#closeDm').checked;

            // Convert dates to Discord snowflake format if provided
            const beforeSnowflake = beforeDate ? (BigInt(new Date(beforeDate).getTime() - 1420070400000) << 22n).toString() : null;
            const afterSnowflake = afterDate ? (BigInt(new Date(afterDate).getTime() - 1420070400000) << 22n).toString() : null;

            const result = await this.api.deleteChannelMessages({
                channelId: dm.id,
                channelName: dm.name,
                deleteDelay: this.operationDelay,
                beforeDate: beforeSnowflake,
                afterDate: afterSnowflake,
                contentSearch: containingText || null,
                onProgress: (current, total) => this.updateProgress(current, total),
                isRunning: () => this.isRunning
            });

            if (result.stopped) {
                Console.warn('Deletion process stopped by user');
                break;
            }

            // Close DM if option is selected and messages were deleted
            if (closeDm && result.deletedCount > 0) {
                try {
                    await this.api.closeDM(dm.id);
                    Console.log(`Closed DM with ${dm.name}`);
                } catch (error) {
                    Console.error(`Failed to close DM with ${dm.name}: ${error.message}`);
                }
            }
        }

        console.log("Exiting startDeletion, final isRunning:", this.isRunning);
        this.isRunning = false;
        this.updateButtonState(false, true);  // Re-enable button when completely done
    }

    stopDeletion() {
        this.isRunning = false;
        Console.warn('Stopping deletion process...');
        const getCountsBtn = document.querySelector('#getCountsBtn');
        getCountsBtn.disabled = false;  // Re-enable count button
    }

    updateProgress(current, total) {
        const progressFill = document.querySelector('.progress-fill');
        const progressCount = document.querySelector('#progressCount');
        const totalCount = document.querySelector('#totalCount');
        const estimatedTime = document.querySelector('#estimatedTime');
        
        if (progressFill && progressCount && totalCount) {
            const percentage = total > 0 ? (current / total) * 100 : 0;
            progressFill.style.width = `${percentage}%`;
            progressCount.textContent = current;
            totalCount.textContent = total;
            
            // Calculate estimated time remaining
            if (total > 0) {
                const timePerOperation = this.operationDelay / 1000; // convert to seconds
                const remainingOperations = total - current;
                const remainingSeconds = remainingOperations * timePerOperation;
                const minutes = Math.floor(remainingSeconds / 60);
                const seconds = Math.floor(remainingSeconds % 60);
                
                if (estimatedTime) {
                    estimatedTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
            } else {
                if (estimatedTime) {
                    estimatedTime.textContent = '--:--';
                }
            }
        }
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