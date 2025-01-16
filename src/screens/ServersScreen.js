const BaseScreen = require('./BaseScreen');
const Console = require('../components/Console');
const DiscordAPI = require('../utils/discord');
const Store = require('electron-store');

class ServersScreen extends BaseScreen {
    constructor(token, userId, preloadedData = null) {
        super(token);
        this.serverQueue = [];
        this.isRunning = false;
        this.isCountingMessages = false;
        this.operationDelay = 1000;
        this.store = new Store();
        this.api = new DiscordAPI(token, userId);
        this.preloadedData = preloadedData;
    }

    isOperationInProgress() {
        return this.isRunning || this.isCountingMessages;
    }

    render(container) {
        container.innerHTML = `
            <div class="screen-container">
                <h1>View Accessible Servers</h1>
                
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
                            <div class="text-filter">
                                <label for="channelId">Channel ID:</label>
                                <input type="text" id="channelId" placeholder="Specific channel ID...">
                            </div>
                        </div>
                        <div class="checkbox-row">
                            <div class="checkbox-group">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="onlyMe" checked>
                                    <span>Only My Messages</span>
                                </label>
                                <div class="text-filter-uid" id="userIdsContainer">
                                    <label for="customUserIds">From User IDs:</label>
                                    <input type="text" id="customUserIds" 
                                        placeholder="Comma-separated user IDs..."
                                        title="Enter comma-separated user IDs, or leave empty to include messages from all users"
                                        disabled>
                                </div>
                            </div>
                            <label class="checkbox-label">
                                <input type="checkbox" id="leaveServer">
                                <span>Leave Server After Delete</span>
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
                <div class="total-dms">Total: 0 Servers</div>
                <div class="dms-container">
                    <div class="dms-header">
                        <div class="channel-header">
                            <span>Server</span>
                            <button class="refresh-btn" id="refreshServersBtn" title="Refresh Server List">
                                <svg width="16" height="16" viewBox="0 0 16 16">
                                    <path fill="currentColor" d="M13.6 2.3C12.2.9 10.2 0 8 0 3.6 0 0 3.6 0 8s3.6 8 8 8c3.7 0 6.8-2.5 7.7-6h-2.1c-.8 2.3-3 4-5.6 4-3.3 0-6-2.7-6-6s2.7-6 6-6c1.7 0 3.1.7 4.2 1.8L9 7h7V0l-2.4 2.3z"/>
                                </svg>
                            </button>
                        </div>
                        <div class="search-container">
                            <input type="text" id="serverSearch" placeholder="Search Servers... (name or server ID)" class="dm-search">
                        </div>
                        <span>Message Count</span>
                        <div class="toggle-header">
                            <button class="select-all-btn" id="selectAllBtn">Enable All</button>
                        </div>
                    </div>
                    <div class="dms-list" id="serversList">
                        <!-- Servers will be loaded here -->
                    </div>
                </div>
            </div>
        `;

        // Initialize console and event listeners
        this.setupEventListeners(container);
        this.loadServers();
    }

    async loadServers(forceRefresh = false) {
        const serversList = document.getElementById('serversList');
        Console.log('Loading servers...');

        try {
            serversList.innerHTML = '<div class="loading">Loading servers...</div>';

            // Use preloaded data only on initial load and when not forcing refresh
            let servers;
            if (!forceRefresh && this.preloadedData?.servers) {
                servers = this.preloadedData.servers;
                Console.log('Using preloaded server data');
            } else {
                // Always fetch fresh data from API
                servers = await this.api.getAllAccessibleServers();
                // Update preloaded data cache in both this component and the parent Navigation
                if (this.preloadedData) {
                    this.preloadedData.servers = servers;
                    
                    // Get the Navigation instance from the window
                    const navigationInstance = window.navigationInstance;
                    if (navigationInstance?.preloadedData) {
                        navigationInstance.preloadedData.servers = servers;
                        Console.log('Updated Navigation preloaded data');
                    }
                }
                Console.log('Fetched fresh server data from API');
            }

            if (!servers || servers.length === 0) {
                serversList.innerHTML = '<div class="info-message">No accessible servers found.</div>';
                this.updateTotalCount(0);
                return;
            }

            // Clear existing message counts when refreshing
            this.serverQueue = [];

            // Updated server row rendering to match DM format
            serversList.innerHTML = servers.map((server, index) => {
                return `
                    <div class="dm-row" 
                        data-server-id="${server.id}"
                        data-server-name="${server.name}">
                        <span class="dm-recipient">
                            <span class="dm-index">${index + 1}.</span>
                            <button class="server-info-btn" title="Get Server Info">
                                <svg width="16" height="16" viewBox="0 0 16 16">
                                    <path fill="currentColor" d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 12a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm1.5-4.563a.5.5 0 01-.5.5h-2a.5.5 0 01-.5-.5v-.375c0-.5.5-.812.938-1.062C7.907 5.75 8 5.5 8 5.25v-1a1.25 1.25 0 112.5 0v.375c0 .5-.5.812-.938 1.062-.469.25-.562.5-.562.75v1z"/>
                                </svg>
                            </button>
                            ${server.name}
                        </span>
                        <span class="dm-count">-</span>
                        <span class="dm-toggle">
                            <input type="checkbox" class="dm-checkbox" 
                                id="server-${server.id}" 
                                value="${server.id}">
                        </span>
                    </div>
                `;
            }).join('');

            this.updateTotalCount(servers.length);
            // Set up the server toggle listeners
            this.setupServerToggleListeners(serversList.closest('.screen-container'));
            Console.success(`Loaded ${servers.length} servers`);
        } catch (error) {
            Console.error('Error loading servers: ' + error.message);
            serversList.innerHTML = '<div class="error-message">Failed to load servers</div>';
        }
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
        const refreshBtn = container.querySelector('#refreshServersBtn');
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.classList.add('spinning');
            await this.loadServers(true);
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
                this.serverQueue = [];
                Console.log('Removed all servers from queue');
                allToggles.forEach(toggle => {
                    toggle.classList.remove('active');
                    toggle.querySelector('.dm-checkbox').checked = false;
                });
            } else {
                // Build new queue for selecting all
                const newServers = [];
                allToggles.forEach(toggle => {
                    const row = toggle.closest('.dm-row');
                    const checkbox = row.querySelector('.dm-checkbox');
                    const serverId = row.dataset.serverId;
                    const serverName = row.dataset.serverName;
                    
                    toggle.classList.add('active');
                    checkbox.checked = true;
                    
                    if (!this.serverQueue.some(server => server.id === serverId)) {
                        newServers.push({ id: serverId, name: serverName });
                    }
                });
                
                if (newServers.length > 0) {
                    this.serverQueue.push(...newServers);
                    Console.log(`Added ${newServers.length} servers to queue. Queue size: ${this.serverQueue.length}`);
                }
            }
            
            // Update button text based on the new state after changes
            selectAllBtn.textContent = !isAnyUnchecked ? 'Select All' : 'Deselect All';
        });

        // Add search functionality
        const searchInput = container.querySelector('#serverSearch');
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            const serverRows = container.querySelectorAll('.dm-row');
            let visibleCount = 0;

            serverRows.forEach(row => {
                const serverName = row.querySelector('.dm-recipient').textContent.toLowerCase();
                const serverId = row.dataset.serverId;
                if (serverName.includes(searchTerm) || serverId.includes(searchTerm)) {
                    row.style.display = '';
                    visibleCount++;
                } else {
                    row.style.display = 'none';
                }
            });

            this.updateTotalCount(visibleCount);

            // Update "Enable All" button to only consider visible rows
            const selectAllBtn = container.querySelector('#selectAllBtn');
            const visibleCheckboxes = Array.from(serverRows).filter(row => row.style.display !== 'none')
                .map(row => row.querySelector('.dm-checkbox'));
            
            if (visibleCheckboxes.length > 0) {
                const allVisible = visibleCheckboxes.every(checkbox => checkbox.checked);
                selectAllBtn.textContent = allVisible ? 'Disable All' : 'Enable All';
            }
        });

        // Update user IDs input toggle
        const onlyMeCheckbox = container.querySelector('#onlyMe');
        const customUserIdsInput = container.querySelector('#customUserIds');
        const userIdsContainer = container.querySelector('#userIdsContainer');
        
        onlyMeCheckbox.addEventListener('change', (e) => {
            customUserIdsInput.disabled = e.target.checked;
            userIdsContainer.style.display = e.target.checked ? 'none' : 'block';
        });

        const serversList = container.querySelector('#serversList');
        serversList.addEventListener('click', async (e) => {
            if (e.target.closest('.server-info-btn')) {
                const serverRow = e.target.closest('.dm-row');
                if (serverRow) {
                    await this.handleServerInfo(serverRow);
                }
            }
        });
    }

    addToQueue(serverId, serverName) {
        if (!this.serverQueue.some(server => server.id === serverId)) {
            this.serverQueue.push({ id: serverId, name: serverName });
            Console.log(`Added ${serverName} (${serverId}) to queue. Queue size: ${this.serverQueue.length}`);
        }
    }

    removeFromQueue(serverId) {
        const index = this.serverQueue.findIndex(server => server.id === serverId);
        if (index > -1) {
            const removed = this.serverQueue.splice(index, 1)[0];
            Console.log(`Removed ${removed.name} (${removed.id}) from queue. Queue size: ${this.serverQueue.length}`);
        }
    }

    setupServerToggleListeners(container) {
        container.querySelectorAll('.dm-toggle').forEach(toggle => {
            toggle.addEventListener('click', (e) => {
                const row = e.target.closest('.dm-row');
                const serverId = row.dataset.serverId;
                const serverName = row.dataset.serverName;
                const checkbox = row.querySelector('.dm-checkbox');
                
                toggle.classList.toggle('active');
                checkbox.checked = !checkbox.checked;

                if (checkbox.checked) {
                    this.addToQueue(serverId, serverName);
                } else {
                    this.removeFromQueue(serverId);
                }
            });
        });
    }

    async getMessageCounts() {
        const getCountsBtn = document.querySelector('#getCountsBtn');
        const startBtn = document.querySelector('#startBtn');

        try {
            const serverRows = document.querySelectorAll('.dm-row');
            const totalServers = serverRows.length;
            let currentServer = 0;

            // Reset progress bar at start
            this.updateProgress(0, totalServers);
            
            for (const row of serverRows) {
                if (!this.isCountingMessages) {
                    Console.warn('Message counting stopped by user');
                    break;
                }

                const serverId = row.dataset.serverId;
                const serverName = row.dataset.serverName;
                const countSpan = row.querySelector('.dm-count');
                
                countSpan.textContent = 'Counting...';
                
                const count = await this.api.getMessageCountForUser(serverId, this.api.userId, true);
                
                if (!this.isCountingMessages) break;

                if (count !== null) {
                    countSpan.textContent = count.toString();
                    Console.log(`Found ${count} messages in server "${serverName}"`);
                } else {
                    countSpan.textContent = 'Error';
                    Console.error(`Failed to get count for server "${serverName}"`);
                }

                currentServer++;
                this.updateProgress(currentServer, totalServers);

                if (this.operationDelay > 0) {
                    await new Promise(resolve => setTimeout(resolve, this.operationDelay));
                }
            }
            
            Console.success('Server message counts updated');
        } catch (error) {
            Console.error('Error fetching server message counts: ' + error.message);
        } finally {
            this.isCountingMessages = false;
            getCountsBtn.textContent = 'Get Message Counts';
            getCountsBtn.classList.remove('danger');
            startBtn.disabled = false;
            
            setTimeout(() => this.updateProgress(0, 0), 1000);
        }
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

    toggleOperation(button) {
        // Check for empty queue before starting
        if (!this.isRunning && this.serverQueue.length === 0) {
            Console.warn('No servers selected. Please select at least one server to process.');
            return;
        }

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

    stopDeletion() {
        this.isRunning = false;
        Console.warn('Stopping deletion process...');
        const getCountsBtn = document.querySelector('#getCountsBtn');
        getCountsBtn.disabled = false;  // Re-enable count button
        this.updateButtonState(false, true);  // Reset button state to "Start"
    }

    async startDeletion() {
        const beforeDate = document.querySelector('#beforeDate').value;
        const afterDate = document.querySelector('#afterDate').value;
        const containingText = document.querySelector('#containingText').value;
        const leaveServer = document.querySelector('#leaveServer').checked;
        const onlyMe = document.querySelector('#onlyMe').checked;
        const customUserIds = document.querySelector('#customUserIds').value;
        const channelId = document.querySelector('#channelId').value.trim();
        
        // Process user IDs
        let authorId = null;
        if (onlyMe) {
            authorId = this.api.userId;
        } else if (customUserIds.trim()) {
            // Convert comma-separated string to array and clean up whitespace
            authorId = customUserIds.split(',').map(id => id.trim()).filter(id => id);
        }

        // Convert dates to Discord snowflake IDs if provided
        const beforeSnowflake = beforeDate ? (BigInt(new Date(beforeDate).getTime() - 1420070400000) << 22n).toString() : null;
        const afterSnowflake = afterDate ? (BigInt(new Date(afterDate).getTime() - 1420070400000) << 22n).toString() : null;

        Console.log(`Starting deletion process for ${this.serverQueue.length} servers:`);

        for (const server of this.serverQueue) {
            if (!this.isRunning) break;

            Console.log(`Processing server: ${server.name} (${server.id})`);
            
            try {
                console.log(channelId)
                const result = await this.api.deleteChannelMessages({
                    channelOrGuildId: server.id,
                    channelName: server.name,
                    authorId: authorId,
                    beforeDate: beforeSnowflake,
                    afterDate: afterSnowflake,
                    contentSearch: containingText || null,
                    specificChannelId: channelId || null,
                    deleteDelay: () => this.operationDelay,
                    onProgress: (deleted, total) => {
                        this.updateProgress(deleted, total);
                    },
                    isRunning: () => this.isRunning,
                    isGuild: true
                });

                if (result.stopped) {
                    Console.warn('Deletion process stopped by user');
                    break;
                }
                console.log("result: ", result, leaveServer)
                if (result.success && leaveServer) {
                    await this.api.leaveServer(server.id);
                    Console.log(`Left server: ${server.name}`);
                }

            } catch (error) {
                Console.error(`Error processing server ${server.name}: ${error.message}`);
            }
        }

        console.log("Exiting startDeletion, final isRunning:", this.isRunning);
        this.isRunning = false;
        Console.success('Operation completed');
        this.updateButtonState(false, true);
    }

    updateTotalCount(count) {
        const totalServers = document.querySelector('.total-dms');
        if (totalServers) {
            totalServers.textContent = `Total: ${count} Server${count !== 1 ? 's' : ''}`;
        }
    }

    async handleServerInfo(serverRow) {
        const serverId = serverRow.dataset.serverId;
        const serverName = serverRow.dataset.serverName;
        try {
            const serverInfo = await this.api.getGuildInfo(serverId);
            if (serverInfo) {
                Console.printServerInfo(serverInfo);
            }
        } catch (error) {
            Console.error(`Failed to get server info for ${serverName}: ${error.message}`);
        }
    }
}

module.exports = ServersScreen; 