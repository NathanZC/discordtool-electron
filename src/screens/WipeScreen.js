const BaseScreen = require('./BaseScreen');
const DiscordAPI = require('../utils/discord');
const Console = require('../components/Console');
const Store = require('electron-store');

class WipeScreen extends BaseScreen {
    static CHANNEL_STATES = {
        INCOMPLETE: 'incomplete',
        UNABLE: 'unable',
        COMPLETE: 'complete'
    };

    constructor(token, userId) {
        super(token);
        this.api = new DiscordAPI(token, userId);
        this.channels = new Map();
        this.store = new Store();
        
        // Initialize channel states for current user
        this.channelStates = this.loadChannelStates();
        
        if (WipeScreen.loadedData) {
            this.processUserData(WipeScreen.loadedData);
        }
    }

    // Load channel states from storage
    loadChannelStates() {
        const userKey = `channelStates.${this.api.userId}`;
        return this.store.get(userKey, {});
    }

    // Save channel states to storage
    saveChannelStates() {
        const userKey = `channelStates.${this.api.userId}`;
        this.store.set(userKey, this.channelStates);
    }

    // Update a channel's state
    updateChannelState(channelId, state, locked = false) {
        this.channelStates[channelId] = {
            state,
            locked,
            updatedAt: new Date().toISOString()
        };
        this.saveChannelStates();
        this.renderChannelsList(); // Refresh the display
    }

    // Get a channel's state
    getChannelState(channelId) {
        return this.channelStates[channelId] || {
            state: WipeScreen.CHANNEL_STATES.INCOMPLETE,
            locked: false,
            updatedAt: null
        };
    }

    // Toggle channel lock
    toggleChannelLock(channelId) {
        const currentState = this.getChannelState(channelId);
        this.updateChannelState(channelId, currentState.state, !currentState.locked);
    }

    render(container) {
        container.innerHTML = `
            <div class="screen-container">
                <div class="header-row">
                    <div class="title-section">
                        <h1>Message Wiper</h1>
                    </div>
                    
                    <!-- File Upload Section -->
                    <div class="upload-section">
                        <div class="file-controls">
                            <button class="choose-file-btn" id="chooseFileBtn">Select Discord Data</button>
                            <span class="file-name" id="fileName">No file chosen</span>
                        </div>
                        <input type="file" id="jsonUpload" class="hidden-input" accept=".json">
                    </div>
                </div>

                <!-- Add modal HTML -->
                <div class="modal" id="resetConfirmModal">
                    <div class="modal-content">
                        <h2>Reset Channel States</h2>
                        <p>Are you sure you want to clear all saved channel data for your currently logged in account (locked, red, green, channel states)? This action cannot be undone.</p>
                        <div class="modal-actions">
                            <button class="modal-btn cancel">No, Cancel</button>
                            <button class="modal-btn confirm">Yes, Reset</button>
                        </div>
                    </div>
                </div>

                <!-- Progress Section -->
                <div class="progress-section">
                    <div class="progress-bar">
                        <div class="progress-fill"></div>
                    </div>
                    <div class="progress-stats">
                        <span>Progress: <span id="progressCount">0</span>/<span id="totalCount">0</span></span>
                        <span>Estimated Time: <span id="estimatedTime">--:--</span></span>
                    </div>

                    <div class="index-controls">
                        <div class="index-input">
                            <label for="startIndex">Start Index:</label>
                            <input type="number" id="startIndex" min="1" value="1" class="index-field">
                        </div>
                        <div class="index-input">
                            <label for="endIndex">End Index:</label>
                            <input type="number" id="endIndex" min="1" class="index-field">
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
                                Start Wiping Messages
                            </button>
                        </div>
                    </div>
                </div>

                <!-- DMs List -->
                <div class="dms-section">
                    <div class="total-dms">
                        Total: 0 Channels
                        <div class="filter-buttons">
                            <button class="reset-states-btn" title="Reset all channel states">Reset States</button>
                            <button class="filter-btn active" data-filter="all">All</button>
                            <button class="filter-btn" data-filter="server">Servers</button>
                            <button class="filter-btn" data-filter="dm">DMs</button>
                        </div>
                    </div>
                    <div class="dms-container">
                        <div class="dms-header">
                            <div class="channel-header">
                                <span>Channel</span>
                            </div>
                            <div class="search-container">
                                <input type="text" id="channelSearch" placeholder="Search channels..." class="dm-search">
                            </div>
                            <span class="message-count-header">Message Count</span>
                            <span class="actions-header">Actions</span>
                        </div>
                        <div class="dms-list" id="channelsList">
                            <!-- Channels will be loaded here -->
                            <div class="info-message">
                                <p>Upload your Discord data to view channels</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.setupEventListeners(container);

        // Process and display stored data if it exists
        if (WipeScreen.loadedData) {
            this.processUserData(WipeScreen.loadedData);
            const fileNameSpan = container.querySelector('#fileName');
            if (fileNameSpan) {
                fileNameSpan.textContent = 'Discord Data (Loaded)';
            }
        }
    }

    handleFileUpload(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                // Store the data in the static property
                WipeScreen.loadedData = data;
                this.processUserData(data);
            } catch (error) {
                Console.error('Error parsing JSON file: ' + error.message);
            }
        };
        reader.readAsText(file);
    }

    processUserData(data) {
        const channelsList = document.getElementById('channelsList');
        this.channels.clear();

        // Process all channel entries
        Object.entries(data).forEach(([channelId, channelName]) => {
            this.channels.set(channelId, channelName);
        });

        this.renderChannelsList();
    }

    renderChannelsList() {
        const container = document.querySelector('.screen-container');
        if (!container) return;
        
        const channelsList = container.querySelector('#channelsList');
        if (!channelsList) return;
        
        if (this.channels.size === 0) {
            if (WipeScreen.loadedData) {
                channelsList.innerHTML = '<div class="info-message">No channels found in the uploaded data.</div>';
            } else {
                channelsList.innerHTML = '<div class="info-message">Upload your Discord data to view channels</div>';
            }
            this.updateTotalCount(0);
            return;
        }

        const searchInput = container.querySelector('#channelSearch');
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
        const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';

        const filteredChannels = Array.from(this.channels.entries())
            .filter(([channelId, channelName]) => {
                // Apply search filter
                const matchesSearch = channelName.toLowerCase().includes(searchTerm);
                
                // Apply type filter
                const isDM = channelName.startsWith('Direct Message with');
                switch (activeFilter) {
                    case 'server': return !isDM && matchesSearch;
                    case 'dm': return isDM && matchesSearch;
                    default: return matchesSearch;
                }
            });

        if (filteredChannels.length === 0) {
            channelsList.innerHTML = '<div class="info-message">No channels match the search term.</div>';
            this.updateTotalCount(0);
            return;
        }

        channelsList.innerHTML = filteredChannels.map(([channelId, channelName], index) => {
            const isDM = channelName.startsWith('Direct Message with');
            const channelType = isDM ? 'DM' : 'Server';
            const displayName = isDM ? channelName.replace('Direct Message with ', '') : channelName;
            const channelState = this.getChannelState(channelId);

            // Define state-specific styles and icons
            const stateClasses = {
                [WipeScreen.CHANNEL_STATES.INCOMPLETE]: '',
                [WipeScreen.CHANNEL_STATES.UNABLE]: 'state-unable',
                [WipeScreen.CHANNEL_STATES.COMPLETE]: 'state-complete'
            };

            return `
                <div class="dm-row ${stateClasses[channelState.state]}" 
                    data-channel-id="${channelId}"
                    data-channel-type="${channelType.toLowerCase()}"
                    data-original-name="${channelName}">
                    <span class="channel-name">
                        <span class="dm-index">${index + 1}.</span>
                        ${isDM ? `
                            <button class="user-info-btn" title="Get User Info">
                                <svg width="16" height="16" viewBox="0 0 16 16">
                                    <path fill="currentColor" d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 12a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm1.5-4.563a.5.5 0 01-.5.5h-2a.5.5 0 01-.5-.5v-.375c0-.5.5-.812.938-1.062C7.907 5.75 8 5.5 8 5.25v-1a1.25 1.25 0 112.5 0v.375c0 .5-.5.812-.938 1.062-.469.25-.562.5-.562.75v1z"/>
                                </svg>
                            </button>
                        ` : `
                            <button class="server-info-btn" title="Get Channel Info">
                                <svg width="16" height="16" viewBox="0 0 16 16">
                                    <path fill="currentColor" d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 12a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm1.5-4.563a.5.5 0 01-.5.5h-2a.5.5 0 01-.5-.5v-.375c0-.5.5-.812.938-1.062C7.907 5.75 8 5.5 8 5.25v-1a1.25 1.25 0 112.5 0v.375c0 .5-.5.812-.938 1.062-.469.25-.562.5-.562.75v1z"/>
                                </svg>
                            </button>
                        `}
                        <span class="channel-type ${channelType.toLowerCase()}">${channelType}</span>
                        ${displayName}
                        <span class="channel-state ${channelState.state}" title="Channel State">
                            ${this.getLockIcon(channelState.locked)}
                        </span>
                    </span>
                    <span class="message-count">-</span>
                    <div class="dm-actions">
                        <button class="wipe-messages-btn action-btn danger" ${channelState.locked ? 'disabled' : ''}>
                            ${this.getWipeButtonText(channelState)}
                        </button>
                        <button class="lock-btn ${channelState.locked ? 'locked' : ''}" title="${channelState.locked ? 'Unlock Channel' : 'Lock Channel'}">
                            ${this.getLockIcon(channelState.locked)}
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        this.updateTotalCount(filteredChannels.length);
    }

    updateTotalCount(count) {
        const totalChannels = document.querySelector('.total-dms');
        if (totalChannels) {
            // Find the existing filter buttons
            const filterButtons = totalChannels.querySelector('.filter-buttons');
            
            // Update the text content while preserving the filter buttons
            totalChannels.innerHTML = `Total: ${count} Channel${count !== 1 ? 's' : ''}`;
            
            // If filter buttons don't exist, create them
            if (!filterButtons) {
                const newFilterButtons = document.createElement('div');
                newFilterButtons.className = 'filter-buttons';
                newFilterButtons.innerHTML = `
                    <button class="reset-states-btn" title="Reset all channel states">Reset States</button>
                    <button class="filter-btn active" data-filter="all">All</button>
                    <button class="filter-btn" data-filter="server">Servers</button>
                    <button class="filter-btn" data-filter="dm">DMs</button>
                `;
                totalChannels.appendChild(newFilterButtons);
            } else {
                // Re-append existing filter buttons
                totalChannels.appendChild(filterButtons);
            }
        }
    }

    setupEventListeners(container) {
        // File upload handling
        const chooseFileBtn = container.querySelector('#chooseFileBtn');
        const fileInput = container.querySelector('#jsonUpload');
        const fileNameSpan = container.querySelector('#fileName');

        chooseFileBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                fileNameSpan.textContent = file.name;
                this.handleFileUpload(file);
            } else {
                fileNameSpan.textContent = 'No file chosen';
            }
        });

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
                startBtn.disabled = false;
            } else {
                this.isCountingMessages = true;
                getCountsBtn.textContent = 'Stop Counting';
                getCountsBtn.classList.add('danger');
                startBtn.disabled = true;
                this.getMessageCounts();
            }
        });

        startBtn.addEventListener('click', () => {
            if (this.isRunning) {
                this.stopOperation();
            } else {
                this.toggleOperation(startBtn);
                getCountsBtn.disabled = true;
            }
        });

        // Search functionality
        const searchInput = container.querySelector('#channelSearch');
        searchInput.addEventListener('input', () => {
            this.renderChannelsList();
        });

        // Add event delegation for Wipe Messages buttons
        const channelsList = container.querySelector('#channelsList');
        channelsList.addEventListener('click', async (e) => {
            const channelRow = e.target.closest('.dm-row');
            if (!channelRow) return;

            if (e.target.closest('.user-info-btn') || e.target.closest('.server-info-btn')) {
                await this.handleInfoButtonClick(channelRow);
            } else if (e.target.closest('.wipe-messages-btn')) {
                await this.handleWipeMessages(channelRow, e.target.closest('.wipe-messages-btn'));
            }
        });

        // Add lock button listener
        channelsList.addEventListener('click', (e) => {
            if (e.target.closest('.lock-btn')) {
                const channelRow = e.target.closest('.dm-row');
                const channelId = channelRow.dataset.channelId;
                this.toggleChannelLock(channelId);
            }
        });

        // Filter buttons
        const filterButtons = container.querySelectorAll('.filter-btn');
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderChannelsList();
            });
        });

        // Add reset states button listener
        const resetStatesBtn = container.querySelector('.reset-states-btn');
        const resetConfirmModal = container.querySelector('#resetConfirmModal');
        
        resetStatesBtn.addEventListener('click', () => {
            resetConfirmModal.style.display = 'flex';
        });

        // Modal button listeners
        const cancelBtn = resetConfirmModal.querySelector('.modal-btn.cancel');
        const confirmBtn = resetConfirmModal.querySelector('.modal-btn.confirm');

        cancelBtn.addEventListener('click', () => {
            resetConfirmModal.style.display = 'none';
        });

        confirmBtn.addEventListener('click', () => {
            // Clear the channel states
            this.channelStates = {};
            this.saveChannelStates();
            
            // Refresh the display
            this.renderChannelsList();
            
            // Hide the modal
            resetConfirmModal.style.display = 'none';
            
            // Show success message in console
            Console.success('Channel states have been reset');
        });

        // Close modal when clicking outside
        resetConfirmModal.addEventListener('click', (e) => {
            if (e.target === resetConfirmModal) {
                resetConfirmModal.style.display = 'none';
            }
        });
    }

    async getMessageCounts() {
        const getCountsBtn = document.querySelector('#getCountsBtn');

        try {
            const channelRows = document.querySelectorAll('.dm-row');
            const totalChannels = channelRows.length;
            let currentChannel = 0;

            this.updateProgress(0, totalChannels);
            
            for (const row of channelRows) {
                if (!this.isCountingMessages) {
                    Console.warn('Message counting stopped by user');
                    break;
                }

                const channelId = row.dataset.channelId;
                const channelName = row.querySelector('.channel-name').textContent;
                const countSpan = row.querySelector('.message-count');
                const isServerChannel = row.dataset.channelType !== 'dm';
                
                countSpan.textContent = 'Counting...';
                
                try {
                    const count = await this.api.getMessageCountForUser(
                        channelId, 
                        this.api.userId,
                        false,
                        null,
                        isServerChannel
                    );
                    
                    if (!this.isCountingMessages) break;

                    if (count !== null) {
                        countSpan.textContent = count.toString();
                        Console.log(`Found ${count} messages in ${channelName}`);
                    } else {
                        countSpan.textContent = 'Error';
                        Console.error(`Failed to get count for ${channelName}`);
                    }
                } catch (error) {
                    countSpan.textContent = 'Error';
                    Console.error(`Failed to get count for ${channelName}: ${error.message}`);
                }

                currentChannel++;
                this.updateProgress(currentChannel, totalChannels);

                const delaySlider = document.querySelector('#operationDelay');
                const currentDelay = delaySlider ? parseFloat(delaySlider.value) * 1000 : this.operationDelay;
                await new Promise(resolve => setTimeout(resolve, currentDelay));
            }
            
            Console.success('Message counts updated');
        } catch (error) {
            Console.error('Error fetching message counts: ' + error.message);
        } finally {
            this.isCountingMessages = false;
            getCountsBtn.textContent = 'Get Message Counts';
            getCountsBtn.classList.remove('danger');
            
            setTimeout(() => this.updateProgress(0, 0), 1000);
        }
    }

    async handleWipeMessages(channelRow, button) {
        const channelId = channelRow.dataset.channelId;
        const channelName = channelRow.dataset.originalName;
        const channelState = this.getChannelState(channelId);
        const isGuild = channelRow.dataset.channelType !== 'dm';

        if (channelState.locked) {
            Console.warn(`Channel ${channelName} is locked`);
            return;
        }

        // Check if already wiping this channel
        if (button.textContent === 'Stop') {
            this.isRunning = false;
            button.disabled = true;
            button.textContent = 'Stopping...';
            return;
        }
        
        try {
            button.textContent = 'Stop';
            button.classList.add('danger');
            
            // Set isRunning to true for individual channel wipes
            this.isRunning = true;
            let isChannelWiping = true;
            const isRunningRef = () => isChannelWiping && this.isRunning;
            
            const result = await this.api.deleteChannelMessages({
                channelOrGuildId: channelId,
                channelName: channelName,
                authorId: this.api.userId,
                isServerChannel: isGuild,
                deleteDelay: () => {
                    const delaySlider = document.querySelector('#operationDelay');
                    return delaySlider ? parseFloat(delaySlider.value) * 1000 : 1000;
                },
                onProgress: (current, total) => {
                    this.updateProgress(current, total);
                },
                isRunning: isRunningRef
            });

            // Handle the result
            if (result.error) {
                if (result.code === 50001) {
                    Console.error(`No access to channel ${channelName} - Channel will be locked`);
                    this.updateChannelState(channelId, WipeScreen.CHANNEL_STATES.UNABLE, true);
                    return;
                }
                throw new Error(result.error);
            }
            
            if (result.success) {
                Console.success(`Successfully wiped messages in ${channelName}`);
                this.updateChannelState(channelId, WipeScreen.CHANNEL_STATES.COMPLETE, true);
            } else if (result.stopped) {
                Console.warn(`Operation stopped for ${channelName}`);
                this.updateChannelState(channelId, WipeScreen.CHANNEL_STATES.INCOMPLETE);
            } else {
                Console.error(`Failed to wipe messages in ${channelName}`);
                this.updateChannelState(channelId, WipeScreen.CHANNEL_STATES.UNABLE);
            }
        } catch (error) {
            Console.error(`Error in ${channelName}: ${error.message}`);
            this.updateChannelState(channelId, WipeScreen.CHANNEL_STATES.UNABLE);
        } finally {
            // Reset isRunning after individual channel wipe
            this.isRunning = false;
            button.disabled = false;
            button.classList.remove('danger');
            button.textContent = this.getWipeButtonText(this.getChannelState(channelId));
        }
    }

    updateProgress(current, total) {
        const progressFill = document.querySelector('.progress-fill');
        const progressCount = document.querySelector('#progressCount');
        const totalCount = document.querySelector('#totalCount');
        const estimatedTime = document.querySelector('#estimatedTime');
        const delaySlider = document.querySelector('#operationDelay');
        
        if (progressFill && progressCount && totalCount) {
            const percentage = total > 0 ? (current / total) * 100 : 0;
            progressFill.style.width = `${percentage}%`;
            progressCount.textContent = current;
            totalCount.textContent = total;
            
            if (total > 0 && current < total) {
                const timePerOperation = (delaySlider ? parseFloat(delaySlider.value) : 1);
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

    toggleOperation(button) {
        const getCountsBtn = document.querySelector('#getCountsBtn');
        
        this.isRunning = !this.isRunning;
        
        if (this.isRunning) {
            button.textContent = 'Stop';
            button.classList.add('danger');
            getCountsBtn.disabled = true;
            this.startOperation();
        } else {
            button.textContent = 'Start';
            button.classList.remove('danger');
            Console.warn('Operation stopping...');
            this.stopOperation();
        }
    }

    async startOperation() {
        const startIndex = parseInt(document.querySelector('#startIndex').value) - 1;
        const channelRows = Array.from(document.querySelectorAll('.dm-row'));
        const endIndexInput = document.querySelector('#endIndex').value;
        const endIndex = endIndexInput ? parseInt(endIndexInput) - 1 : channelRows.length - 1;
        
        if (isNaN(startIndex) || startIndex < 0) {
            Console.error('Please enter a valid start index');
            this.stopOperation();
            return;
        }

        if (startIndex >= channelRows.length) {
            Console.error(`Start index cannot be greater than ${channelRows.length}`);
            this.stopOperation();
            return;
        }

        const totalChannels = endIndex - startIndex + 1;
        let processedChannels = 0;

        Console.log(`Starting to wipe messages from index ${startIndex + 1} to ${endIndex + 1}`);
        this.updateProgress(0, totalChannels);

        for (let i = startIndex; i <= endIndex && this.isRunning; i++) {
            const row = channelRows[i];
            const channelId = row.dataset.channelId;
            const channelState = this.getChannelState(channelId);
            const button = row.querySelector('.wipe-messages-btn');

            if (channelState.locked || channelState.state === WipeScreen.CHANNEL_STATES.COMPLETE) {
                Console.log(`Skipping ${row.dataset.originalName} - Channel is locked or already completed`);
                processedChannels++;
                this.updateProgress(processedChannels, totalChannels);
                continue;
            }

            await this.handleWipeMessages(row, button);
            
            processedChannels++;
            this.updateProgress(processedChannels, totalChannels);

            if (this.isRunning) {
                const delaySlider = document.querySelector('#operationDelay');
                const currentDelay = delaySlider ? parseFloat(delaySlider.value) * 1000 : 1000;
                await new Promise(resolve => setTimeout(resolve, currentDelay));
            }
        }

        Console.success('Batch operation completed');
        this.isRunning = false;
        const startBtn = document.querySelector('#startBtn');
        if (startBtn) {
            startBtn.textContent = 'Start';
            startBtn.classList.remove('danger');
        }
    }

    updateButtonState(isRunning, enableButton = true) {
        const startBtn = document.querySelector('#startBtn');
        const getCountsBtn = document.querySelector('#getCountsBtn');
        
        if (isRunning) {
            startBtn.textContent = 'Stop';
            startBtn.classList.add('danger');
            startBtn.disabled = false;
            getCountsBtn.disabled = true;
        } else {
            startBtn.textContent = 'Start';
            startBtn.classList.remove('danger');
            startBtn.disabled = !enableButton;
            getCountsBtn.disabled = false;
        }
    }

    stopOperation() {
        this.isRunning = false;
        this.updateButtonState(false);
        Console.warn('Operation stopping');
    }

    async handleInfoButtonClick(row) {
        const channelId = row.dataset.channelId;
        const channelType = row.dataset.channelType;
        const originalName = row.dataset.originalName;

        if (channelType === 'dm') {
            // For DMs, get user info
            try {
                // Extract user ID from the channel name if possible
                const userInfo = await this.api.getUserInfo(channelId);
                if (userInfo) {
                    Console.printUserInfo(userInfo);
                }
            } catch (error) {
                Console.error(`Failed to get user info: ${error.message}`);
            }
        } else {
            // For server channels, get channel info
            try {
                const channelInfo = await this.api.getChannelInfo(channelId);
                if (channelInfo) {
                    Console.log('Channel Information:');
                    Console.log(`Name: ${channelInfo.name}`);
                    Console.log(`Type: ${channelInfo.type}`);
                    Console.log(`Server: ${channelInfo.guild_id ? channelInfo.guild_id : 'N/A'}`);
                    Console.log(`Position: ${channelInfo.position}`);
                    Console.log(`Created At: ${new Date(channelInfo.id / 4194304 + 1420070400000).toLocaleString()}`);
                }
            } catch (error) {
                Console.error(`Failed to get channel info: ${error.message}`);
            }
        }
    }

    // Helper methods for icons and text
    getStateIcon(state) {
        const icons = {
            [WipeScreen.CHANNEL_STATES.INCOMPLETE]: '⭕', // Or empty
            [WipeScreen.CHANNEL_STATES.UNABLE]: '⚠️',
            [WipeScreen.CHANNEL_STATES.COMPLETE]: '✅'
        };
        return icons[state] || icons[WipeScreen.CHANNEL_STATES.INCOMPLETE];
    }

    getLockIcon(locked) {
        return locked ? '🔒' : '🔓';
    }

    getWipeButtonText(channelState) {
        if (channelState.locked) return 'Locked';
        switch (channelState.state) {
            case WipeScreen.CHANNEL_STATES.COMPLETE:
                return 'Completed';
            case WipeScreen.CHANNEL_STATES.UNABLE:
                return 'Retry';
            default:
                return 'Wipe Messages';
        }
    }
}

module.exports = WipeScreen; 