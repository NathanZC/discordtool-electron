const BaseScreen = require('./BaseScreen');
const DiscordAPI = require('../utils/discord');
const Console = require('../components/Console');

class ClosedDMsScreen extends BaseScreen {
    // Add static property to store loaded data
    static loadedData = null;

    constructor(token, userId) {
        super(token);
        this.api = new DiscordAPI(token, userId);
        this.closedDMs = new Map(); // Store closed DM data
        this.openDMs = new Set(); // Track which DMs are already open
        
        // If we have previously loaded data, process it
        if (ClosedDMsScreen.loadedData) {
            this.processUserData(ClosedDMsScreen.loadedData);
        }
    }

    render(container) {
        container.innerHTML = `
            <div class="screen-container">
                <div class="header-row">
                    <h1>Find Closed DMs</h1>
                    
                    <!-- File Upload Section -->
                    <div class="upload-section">
                        <div class="file-controls">
                            <button class="choose-file-btn" id="chooseFileBtn">Select Discord Data</button>
                            <span class="file-name" id="fileName">No file chosen</span>
                        </div>
                        <input type="file" id="jsonUpload" class="hidden-input" accept=".json">
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
                                Start Opening DMs
                            </button>
                        </div>
                    </div>
                </div>

                <!-- DMs List -->
                <div class="dms-section">
                    <div class="total-dms">
                        Total: 0 DMs
                        <div class="filter-buttons">
                            <button class="filter-btn active" data-filter="all">All</button>
                            <button class="filter-btn" data-filter="open">Open</button>
                            <button class="filter-btn" data-filter="closed">Closed</button>
                        </div>
                    </div>
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
                            <span>Open Dm</span>
                        </div>
                        <div class="dms-list" id="dmsList">
                            <!-- DMs will be loaded here -->
                            <div class="info-message">
                                <p>Upload your Discord data to view closed DMs</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.setupEventListeners(container);

        // Process and display stored data if it exists
        if (ClosedDMsScreen.loadedData) {
            this.processUserData(ClosedDMsScreen.loadedData);
            const fileNameSpan = container.querySelector('#fileName');
            if (fileNameSpan) {
                fileNameSpan.textContent = 'Discord Data (Loaded)';
            }
        }

        // Load open DMs and re-render the list
        this.loadOpenDMs().then(() => {
            this.renderDMsList();
        });
    }

    async loadOpenDMs() {
        try {
            const dms = await this.api.getAllOpenDMs();
            // Clear and repopulate the Set with channel IDs
            this.openDMs.clear();
            dms.forEach(dm => this.openDMs.add(dm.id));
            Console.log(`Loaded ${this.openDMs.size} open DM channels`);
        } catch (error) {
            Console.error('Error loading open DMs: ' + error.message);
        }
    }

    handleFileUpload(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                // Store the data in the static property
                ClosedDMsScreen.loadedData = data;
                this.processUserData(data);
            } catch (error) {
                Console.error('Error parsing JSON file: ' + error.message);
            }
        };
        reader.readAsText(file);
    }

    processUserData(data) {
        const dmsList = document.getElementById('dmsList');
        this.closedDMs.clear();

        // Filter and process only Direct Message entries
        Object.entries(data).forEach(([channelId, channelName]) => {
            if (channelName.startsWith('Direct Message with')) {
                const username = channelName.replace('Direct Message with ', '');
                this.closedDMs.set(channelId, username);
            }
        });

        this.renderDMsList();
    }

    renderDMsList() {
        // Get the container first
        const container = document.querySelector('.screen-container');
        if (!container) return; // Exit if container doesn't exist yet
        
        const dmsList = container.querySelector('#dmsList');
        if (!dmsList) return; // Exit if dmsList doesn't exist yet
        
        if (this.closedDMs.size === 0) {
            // Only show "No closed DMs" if we've actually loaded data
            if (ClosedDMsScreen.loadedData) {
                dmsList.innerHTML = '<div class="info-message">No closed DMs found in the uploaded data.</div>';
            } else {
                dmsList.innerHTML = '<div class="info-message">Upload your Discord data to view closed DMs</div>';
            }
            this.updateTotalCount(0);
            return;
        }

        const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';

        const filteredDMs = Array.from(this.closedDMs.entries()).filter(([channelId, _]) => {
            const isOpen = this.openDMs.has(channelId);
            switch (activeFilter) {
                case 'open': return isOpen;
                case 'closed': return !isOpen;
                default: return true;
            }
        });

        if (filteredDMs.length === 0) {
            dmsList.innerHTML = '<div class="info-message">No DMs match the selected filter.</div>';
            this.updateTotalCount(0);
            return;
        }

        dmsList.innerHTML = filteredDMs.map(([channelId, username], index) => {
            const isOpen = this.openDMs.has(channelId);
            return `
                <div class="dm-row" data-channel-id="${channelId}">
                    <span class="dm-recipient">
                        <button class="user-info-btn" title="Get User Info">
                            <svg width="16" height="16" viewBox="0 0 16 16">
                                <path fill="currentColor" d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 12a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm1.5-4.563a.5.5 0 01-.5.5h-2a.5.5 0 01-.5-.5v-.375c0-.5.5-.812.938-1.062C7.907 5.75 8 5.5 8 5.25v-1a1.25 1.25 0 112.5 0v.375c0 .5-.5.812-.938 1.062-.469.25-.562.5-.562.75v1z"/>
                            </svg>
                        </button>
                        <span class="dm-index">${index + 1}.</span> ${username}
                    </span>
                    <span class="dm-count">-</span>
                    <div class="dm-actions">
                        <button class="open-dm-btn ${isOpen ? 'disabled' : ''}" 
                                ${isOpen ? 'disabled' : ''}>
                            ${isOpen ? 'Already Open' : 'Open DM'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        this.updateTotalCount(filteredDMs.length);
    }

    updateTotalCount(count) {
        const totalDMs = document.querySelector('.total-dms');
        if (totalDMs) {
            // Find the existing filter buttons
            const filterButtons = totalDMs.querySelector('.filter-buttons');
            
            // Update the text content while preserving the filter buttons
            totalDMs.innerHTML = `Total: ${count} DM${count !== 1 ? 's' : ''}`;
            
            // If filter buttons don't exist, create them
            if (!filterButtons) {
                const newFilterButtons = document.createElement('div');
                newFilterButtons.className = 'filter-buttons';
                newFilterButtons.innerHTML = `
                    <button class="filter-btn active" data-filter="all">All</button>
                    <button class="filter-btn" data-filter="open">Open</button>
                    <button class="filter-btn" data-filter="closed">Closed</button>
                `;
                totalDMs.appendChild(newFilterButtons);
            } else {
                // Re-append existing filter buttons
                totalDMs.appendChild(filterButtons);
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
                this.handleFileUpload(file); // Directly handle the file when selected
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
                startBtn.disabled = false;  // Re-enable start button
            } else {
                this.isCountingMessages = true;
                getCountsBtn.textContent = 'Stop Counting';
                getCountsBtn.classList.add('danger');
                startBtn.disabled = true;  // Disable start button
                this.getMessageCounts();
            }
        });

        startBtn.addEventListener('click', () => {
            if (this.isRunning) {
                this.stopOperation();
            } else {
                this.toggleOperation(startBtn);
                getCountsBtn.disabled = true;  // Disable count button
            }
        });

        // Search functionality
        const searchInput = container.querySelector('#dmSearch');
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const dmRows = container.querySelectorAll('.dm-row');
            let visibleCount = 0;

            dmRows.forEach(row => {
                const recipient = row.querySelector('.dm-recipient').textContent.toLowerCase();
                const isVisible = recipient.includes(searchTerm);
                row.style.display = isVisible ? '' : 'none';
                if (isVisible) visibleCount++;
            });

            this.updateTotalCount(visibleCount);
        });

        // Update refresh button to also reload open DMs
        const refreshBtn = container.querySelector('#refreshDMsBtn');
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.classList.add('spinning');
            await this.loadOpenDMs();
            this.renderDMsList();
            refreshBtn.classList.remove('spinning');
        });

        // Filter buttons
        const filterButtons = container.querySelectorAll('.filter-btn');
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderDMsList();
            });
        });

        // Add event delegation for Open DM buttons
        const dmsList = container.querySelector('#dmsList');
        dmsList.addEventListener('click', async (e) => {
            const dmRow = e.target.closest('.dm-row');
            if (!dmRow) return;

            if (e.target.closest('.user-info-btn')) {
                await this.handleUserInfo(dmRow);
            } else if (e.target.closest('.open-dm-btn:not(.disabled)')) {
                await this.handleOpenDM(dmRow, e.target.closest('.open-dm-btn'));
            }
        });
    }

    async getMessageCounts() {
        const getCountsBtn = document.querySelector('#getCountsBtn');

        try {
            const dmRows = document.querySelectorAll('.dm-row');
            const totalDMs = dmRows.length;
            let currentDM = 0;

            this.updateProgress(0, totalDMs);
            
            for (const row of dmRows) {
                if (!this.isCountingMessages) {
                    Console.warn('Message counting stopped by user');
                    break;
                }

                const channelId = row.dataset.channelId;
                const username = row.querySelector('.dm-recipient').textContent;
                const countSpan = row.querySelector('.dm-count');
                
                countSpan.textContent = 'Counting...';
                
                try {
                    const count = await this.api.getMessageCountForUser(channelId, this.api.userId);
                    
                    if (!this.isCountingMessages) break;

                    if (count !== null) {
                        countSpan.textContent = count.toString();
                        Console.log(`Found ${count} messages with ${username}`);
                    } else {
                        countSpan.textContent = 'Error';
                        Console.error(`Failed to get count for ${username}`);
                    }
                } catch (error) {
                    countSpan.textContent = 'Error';
                    Console.error(`Failed to get count for ${username}: ${error.message}`);
                }

                currentDM++;
                this.updateProgress(currentDM, totalDMs);

                // Add delay after each operation, regardless of success/failure
                // Get current delay value from slider
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

    async handleOpenDM(dmRow, button) {
        const channelId = dmRow.dataset.channelId;
        const username = dmRow.querySelector('.dm-recipient').textContent.trim();
        
        try {
            button.disabled = true;
            button.textContent = 'Opening...';
            
            const result = await this.api.openDM(channelId);
            
            if (result) {
                Console.success(`Successfully opened DM with ${username}`);
                this.openDMs.add(channelId);
                button.textContent = 'Already Open';
                button.classList.add('disabled');
            }
        } catch (error) {
            Console.error(`Failed to open DM with ${username}: ${error.message}`);
            button.textContent = 'Open DM';
            button.disabled = false;
        }
    }

    async handleUserInfo(dmRow) {
        const channelId = dmRow.dataset.channelId;
        const username = dmRow.querySelector('.dm-recipient').textContent.trim();
        try {
            const userInfo = await this.api.getUserInfo(channelId);
            if (userInfo) {
                Console.printUserInfo(userInfo);
            }
        } catch (error) {
            Console.error(`Failed to get user info for ${username}: ${error.message}`);
        }
    }

    toggleOperation(button) {
        const getCountsBtn = document.querySelector('#getCountsBtn');
        
        this.isRunning = !this.isRunning;
        
        if (this.isRunning) {
            button.textContent = 'Stop';
            button.classList.add('danger');
            getCountsBtn.disabled = true;  // Disable count button
            this.startOperation();
        } else {
            button.textContent = 'Start';
            button.classList.remove('danger');
            Console.warn('Operation stopping...'); // Add immediate feedback
            this.stopOperation();
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

    async startOperation() {
        const startIndex = parseInt(document.querySelector('#startIndex').value) - 1;
        const endIndex = parseInt(document.querySelector('#endIndex').value) - 1;
        const dmRows = Array.from(document.querySelectorAll('.dm-row'));
        const delaySlider = document.querySelector('#operationDelay');
        
        if (isNaN(startIndex) || isNaN(endIndex)) {
            Console.error('Please enter valid start and end indices');
            this.stopOperation();
            return;
        }

        if (startIndex < 0 || endIndex >= dmRows.length || startIndex > endIndex) {
            Console.error(`Please enter indices between 1 and ${dmRows.length}`);
            this.stopOperation();
            return;
        }

        const totalDMs = endIndex - startIndex + 1;
        let processedDMs = 0;

        Console.log(`Starting to open DMs from index ${startIndex + 1} to ${endIndex + 1}`);
        this.updateProgress(0, totalDMs);

        for (let i = startIndex; i <= endIndex && this.isRunning; i++) {
            const row = dmRows[i];
            const channelId = row.dataset.channelId;
            const username = row.querySelector('.dm-recipient').textContent.trim();
            const button = row.querySelector('.open-dm-btn');

            if (button.classList.contains('disabled')) {
                Console.log(`Skipping ${username} - DM already open`);
                processedDMs++;
                this.updateProgress(processedDMs, totalDMs);
                continue;
            }

            try {
                button.disabled = true;
                button.textContent = 'Opening...';
                
                const result = await this.api.openDM(channelId);
                
                if (result) {
                    Console.success(`Successfully opened DM with ${username}`);
                    this.openDMs.add(channelId);
                    button.textContent = 'Already Open';
                    button.classList.add('disabled');
                }
            } catch (error) {
                Console.error(`Failed to open DM with ${username}: ${error.message}`);
                button.textContent = 'Open DM';
                button.disabled = false;
            }

            processedDMs++;
            this.updateProgress(processedDMs, totalDMs);

            if (this.isRunning && i < endIndex) {
                const currentDelay = parseFloat(delaySlider.value) * 1000;
                await new Promise(resolve => setTimeout(resolve, currentDelay));
            }
        }

        if (!this.isRunning) {
            Console.warn('Operation stopped by user');
        } else {
            Console.success('Finished opening DMs in range');
            this.updateButtonState(false); // Reset button state when complete
        }

        this.stopOperation();
    }

    stopOperation() {
        this.isRunning = false;
        this.updateButtonState(false); // Reset button state
        // Only show warning if operation was manually stopped
        if (this.isRunning) {
            Console.warn('Operation stopped by user');
        }
    }
}

module.exports = ClosedDMsScreen; 