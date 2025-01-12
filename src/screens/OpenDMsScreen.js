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
        this.channelData = new Map();
    }

    isOperationInProgress() {
        return this.isRunning || this.isCountingMessages;
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
                                Start Deletion
                            </button>
                        </div>
                    </div>
                </div>

                <!-- DMs List -->
                <div class="total-dms">Total: 0 DMs</div>
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
                            <input type="text" id="dmSearch" placeholder="Search DMs... (name, channel ID, or user ID)" class="dm-search">
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
            
            // Clear the queue if we're deselecting all
            if (!isAnyUnchecked) {
                this.dmQueue = [];
                Console.log('Removed all DMs from queue');
                allToggles.forEach(toggle => {
                    toggle.classList.remove('active');
                    toggle.querySelector('.dm-checkbox').checked = false;
                });
            } else {
                // Build new queue for selecting all
                const newDMs = [];
                allToggles.forEach(toggle => {
                    const row = toggle.closest('.dm-row');
                    const checkbox = row.querySelector('.dm-checkbox');
                    const channelId = row.dataset.channelId;
                    const channelName = row.dataset.channelName;
                    
                    toggle.classList.add('active');
                    checkbox.checked = true;
                    
                    if (!this.dmQueue.some(dm => dm.id === channelId)) {
                        newDMs.push({ id: channelId, name: channelName });
                    }
                });
                
                if (newDMs.length > 0) {
                    this.dmQueue.push(...newDMs);
                    Console.log(`Added ${newDMs.length} DMs to queue. Queue size: ${this.dmQueue.length}`);
                }
            }
            
            // Update button text based on the new state after changes
            selectAllBtn.textContent = !isAnyUnchecked ? 'Select All' : 'Deselect All';
        });

        // Add search functionality
        const searchInput = container.querySelector('#dmSearch');
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const dmRows = container.querySelectorAll('.dm-row');
            let visibleCount = 0;

            dmRows.forEach(row => {
                const recipient = row.querySelector('.dm-recipient').textContent.toLowerCase();
                const channelId = row.dataset.channelId.toLowerCase();
                const recipientId = row.dataset.recipientId?.toLowerCase() || '';  // Add null check
                
                if (recipient.includes(searchTerm) || 
                    channelId.includes(searchTerm) || 
                    recipientId.includes(searchTerm)) {
                    row.style.display = '';
                    visibleCount++;
                } else {
                    row.style.display = 'none';
                }
            });

            this.updateTotalCount(visibleCount);
        });

        // Add event delegation for user info buttons
        const dmsList = container.querySelector('#dmsList');
        dmsList.addEventListener('click', async (e) => {
            if (e.target.closest('.user-info-btn')) {
                const dmRow = e.target.closest('.dm-row');
                if (dmRow) {
                    await this.handleUserInfo(dmRow);
                }
            }
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
                this.updateTotalCount(0);
                return;
            }

            // Clear existing data
            this.dmQueue = [];
            this.channelData.clear();

            // Store channel data and render DMs
            dmsList.innerHTML = dms.map((dm, index) => {
                // Store the full channel data
                this.channelData.set(dm.id, dm);

                const isGroupDM = dm.type === 3; // Discord's type 3 is GROUP_DM
                let displayName;
                
                if (isGroupDM) {
                    const memberNames = dm.recipients.map(r => r.username || 'Unknown User');
                    const visibleMembers = memberNames.slice(0, 3);
                    const remainingCount = memberNames.length - visibleMembers.length;
                    displayName = visibleMembers.join(', ') + 
                        (remainingCount > 0 ? ` and ${remainingCount} more` : '');
                } else {
                    displayName = dm.recipients?.[0]?.username || 'Unknown User';
                }

                const nickname = isGroupDM ? 
                    displayName : 
                    dm.recipients?.[0]?.global_name || displayName;
                const recipientId = isGroupDM ? null : dm.recipients?.[0]?.id;
                
                return `
                    <div class="dm-row" 
                        data-channel-id="${dm.id}"
                        data-channel-name="${displayName}"
                        data-recipient-id="${recipientId}">
                        <span class="dm-recipient">
                            <button class="user-info-btn" title="Get User Info">
                                <svg width="16" height="16" viewBox="0 0 16 16">
                                    <path fill="currentColor" d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 12a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm1.5-4.563a.5.5 0 01-.5.5h-2a.5.5 0 01-.5-.5v-.375c0-.5.5-.812.938-1.062C7.907 5.75 8 5.5 8 5.25v-1a1.25 1.25 0 112.5 0v.375c0 .5-.5.812-.938 1.062-.469.25-.562.5-.562.75v1z"/>
                                </svg>
                            </button>
                            <span class="dm-index">${index + 1}.</span>
                            ${isGroupDM ? '<span class="channel-type group">Group</span>' : ''}
                            ${nickname} ${!isGroupDM ? `<span class="dm-username">(${displayName})</span>` : ''}
                        </span>
                        <span class="dm-count">-</span>
                        <span class="dm-toggle">
                            <input type="checkbox" class="dm-checkbox" 
                                id="dm-${dm.id}" 
                                value="${dm.id}">
                        </span>
                    </div>
                `;
            }).join('');

            this.updateTotalCount(dms.length);
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

            const beforeSnowflake = beforeDate ? (BigInt(new Date(beforeDate).getTime() - 1420070400000) << 22n).toString() : null;
            const afterSnowflake = afterDate ? (BigInt(new Date(afterDate).getTime() - 1420070400000) << 22n).toString() : null;

            const result = await this.api.deleteChannelMessages({
                channelOrGuildId: dm.id,
                channelName: dm.name,
                authorId: this.api.userId,
                deleteDelay: () => this.operationDelay, // Pass as function to get current value
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

    updateTotalCount(count) {
        const totalDMs = document.querySelector('.total-dms');
        if (totalDMs) {
            totalDMs.textContent = `Total: ${count} DM${count !== 1 ? 's' : ''}`;
        }
    }

    async handleUserInfo(dmRow) {
        const channelId = dmRow.dataset.channelId;
        const channelData = this.channelData.get(channelId);

        if (!channelData) {
            Console.error('Channel data not found');
            return;
        }

        const isGroupDM = channelData.type === 3; // Discord's type 3 is GROUP_DM
        
        if (isGroupDM) {
            // Format the channel data for group DM display
            const formattedChannel = {
                ...channelData,
                created_at: new Date(Number((BigInt(channelData.id) >> 22n) + 1420070400000n))
            };
            Console.printGroupDMInfo(formattedChannel);
        } else {
            try {
                const userInfo = await this.api.getUserInfo(channelData.recipients[0].id, true);
                if (userInfo) {
                    Console.printUserInfo(userInfo);
                }
            } catch (userError) {
                // Fallback to getting user info through channel
                const userInfo = await this.api.getUserInfo(channelId, false);
                if (userInfo) {
                    Console.printUserInfo(userInfo);
                }
            }
        }
    }
}

module.exports = OpenDMsScreen; 