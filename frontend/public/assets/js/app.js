// Message Hub App - Main JavaScript

// Configuration
const config = {
    apiUrl: 'http://localhost:3000',
    wsUrl: 'ws://localhost:3000/ws',
    maxMessages: 1000,
    reconnectInterval: 5000,
    autoReconnect: true,
    isDarkTheme: false
};

// Application state
const state = {
    connected: false,
    connecting: false,
    authenticated: false,
    destinations: {
        kafka: [],
        rabbitmqQueues: [],
        rabbitmqExchanges: []
    },
    selectedDestination: null,
    messages: [],
    selectedMessage: null,
    paused: false,
    messageCount: 0,
    messageRate: 0,
    lastMessageTime: null,
    websocket: null,
    reconnectTimer: null,
    authToken: localStorage.getItem('authToken'),
    apiKey: localStorage.getItem('apiKey')
};

// DOM Elements
const elements = {
    // Header
    connectionIndicator: document.getElementById('connection-indicator'),
    connectionText: document.getElementById('connection-text'),
    themeToggle: document.getElementById('theme-toggle'),
    darkIcon: document.getElementById('dark-icon'),
    lightIcon: document.getElementById('light-icon'),
    userMenuButton: document.getElementById('user-menu-button'),
    userDropdown: document.getElementById('user-dropdown'),
    loginButton: document.getElementById('login-button'),
    settingsButton: document.getElementById('settings-button'),

    // Sidebar
    refreshDestinations: document.getElementById('refresh-destinations'),
    kafkaTopics: document.getElementById('kafka-topics'),
    rabbitmqQueues: document.getElementById('rabbitmq-queues'),
    addDestinationButton: document.getElementById('add-destination-button'),

    // Content
    tabButtons: document.querySelectorAll('.tab-button'),
    tabPanes: document.querySelectorAll('.tab-pane'),

    // Reader Tab
    readerDestination: document.getElementById('reader-destination'),
    connectButton: document.getElementById('connect-button'),
    pauseButton: document.getElementById('pause-button'),
    clearButton: document.getElementById('clear-button'),
    messageList: document.getElementById('message-list'),
    messageDetails: document.getElementById('message-details'),
    formattedContent: document.getElementById('formatted-content'),

    // Publisher Tab
    publishDestination: document.getElementById('publish-destination'),
    messageType: document.getElementById('message-type'),
    messageInput: document.getElementById('message-input'),
    publishButton: document.getElementById('publish-button'),
    validateButton: document.getElementById('validate-button'),

    // History Tab
    historyDestination: document.getElementById('history-destination'),
    loadHistory: document.getElementById('load-history'),
    historyList: document.getElementById('history-list'),

    // Modals
    loginModal: document.getElementById('login-modal'),
    loginSubmit: document.getElementById('login-submit'),
    username: document.getElementById('username'),
    password: document.getElementById('password'),
    modalCloseButtons: document.querySelectorAll('.modal-close')
};

// Initialize Dark/Light Theme
function initTheme() {
    // Check for user preference or system preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark-theme');
        elements.darkIcon.style.display = 'none';
        elements.lightIcon.style.display = 'inline-block';
        config.isDarkTheme = true;
    } else {
        elements.darkIcon.style.display = 'inline-block';
        elements.lightIcon.style.display = 'none';
    }
}

// Toggle Theme
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    config.isDarkTheme = document.body.classList.contains('dark-theme');

    if (config.isDarkTheme) {
        elements.darkIcon.style.display = 'none';
        elements.lightIcon.style.display = 'inline-block';
        localStorage.setItem('theme', 'dark');
    } else {
        elements.darkIcon.style.display = 'inline-block';
        elements.lightIcon.style.display = 'none';
        localStorage.setItem('theme', 'light');
    }
}

// Toggle User Dropdown
function toggleUserDropdown() {
    elements.userDropdown.classList.toggle('show');
}

// Close User Dropdown when clicking outside
function closeUserDropdown(event) {
    if (!elements.userMenuButton.contains(event.target) && !elements.userDropdown.contains(event.target)) {
        elements.userDropdown.classList.remove('show');
    }
}

// Show Modal
function showModal(modal) {
    modal.classList.add('show');
}

// Hide Modal
function hideModal(modal) {
    modal.classList.remove('show');
}

// Switch Tabs
function switchTab(tabId) {
    // Remove active class from all tabs
    elements.tabButtons.forEach(button => {
        button.classList.remove('active');
    });
    elements.tabPanes.forEach(pane => {
        pane.classList.remove('active');
    });

    // Add active class to selected tab
    document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

// Format JSON
function formatJSON(json) {
    try {
        // If json is a string, parse it
        const obj = typeof json === 'string' ? JSON.parse(json) : json;
        return JSON.stringify(obj, null, 2);
    } catch (error) {
        console.error('Error formatting JSON:', error);
        return json;
    }
}

// Handle Authentication
async function handleLogin() {
    const username = elements.username.value;
    const password = elements.password.value;

    if (!username || !password) {
        alert('Please enter both username and password');
        return;
    }

    try {
        const response = await fetch(`${config.apiUrl}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            throw new Error('Login failed');
        }

        const data = await response.json();
        state.authToken = data.token;
        localStorage.setItem('authToken', data.token);
        state.authenticated = true;

        // Close modal
        hideModal(elements.loginModal);

        // Update UI for authenticated user
        updateAuthUI();

        // Refresh destinations
        fetchDestinations();
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed. Please check your credentials and try again.');
    }
}

// Update UI for authenticated user
function updateAuthUI() {
    if (state.authenticated) {
        // Update user info
        // document.getElementById('user-name').textContent = 'Authenticated User';
        // document.getElementById('user-role').textContent = 'User';

        // Show logout button, hide login button
        // document.getElementById('logout-button').style.display = 'block';
        // document.getElementById('login-button').style.display = 'none';
    } else {
        // Update user info
        // document.getElementById('user-name').textContent = 'Guest User';
        // document.getElementById('user-role').textContent = 'Unauthenticated';

        // Show login button, hide logout button
        // document.getElementById('logout-button').style.display = 'none';
        // document.getElementById('login-button').style.display = 'block';
    }
}

// Fetch Destinations
async function fetchDestinations() {
    try {
        // Build headers
        const headers = {
            'Content-Type': 'application/json'
        };

        if (state.authToken) {
            headers['Authorization'] = `Bearer ${state.authToken}`;
        } else if (state.apiKey) {
            headers['X-API-Key'] = state.apiKey;
        }

        const response = await fetch(`${config.apiUrl}/api/messages/destinations`, {
            headers
        });

        if (!response.ok) {
            throw new Error('Failed to fetch destinations');
        }

        const data = await response.json();

        // Update state with destinations
        state.destinations.kafka = data.kafka || [];
        state.destinations.rabbitmqQueues = data.rabbitmq?.queues || [];
        state.destinations.rabbitmqExchanges = data.rabbitmq?.exchanges || [];

        // Update destination lists
        updateDestinationLists();

        // Update destination dropdowns
        updateDestinationDropdowns();
    } catch (error) {
        console.error('Error fetching destinations:', error);
    }
}

// Update Destination Lists
function updateDestinationLists() {
    // Clear existing lists
    elements.kafkaTopics.innerHTML = '';
    elements.rabbitmqQueues.innerHTML = '';

    // Add Kafka topics
    if (state.destinations.kafka.length === 0) {
        elements.kafkaTopics.innerHTML = '<li class="empty-list">No Kafka topics available</li>';
    } else {
        state.destinations.kafka.forEach(topic => {
            const li = document.createElement('li');
            li.textContent = topic.name;
            li.dataset.type = 'kafka';
            li.dataset.name = topic.name;
            li.addEventListener('click', () => selectDestination('kafka', topic.name));
            elements.kafkaTopics.appendChild(li);
        });
    }

    // Add RabbitMQ queues
    if (state.destinations.rabbitmqQueues.length === 0) {
        elements.rabbitmqQueues.innerHTML = '<li class="empty-list">No RabbitMQ queues available</li>';
    } else {
        state.destinations.rabbitmqQueues.forEach(queue => {
            const li = document.createElement('li');
            li.textContent = queue.name;
            li.dataset.type = 'rabbitmq-queue';
            li.dataset.name = queue.name;
            li.addEventListener('click', () => selectDestination('rabbitmq-queue', queue.name));
            elements.rabbitmqQueues.appendChild(li);
        });
    }
}

// Update Destination Dropdowns
function updateDestinationDropdowns() {
    // Clear existing options
    elements.readerDestination.innerHTML = '<option value="">Select a destination</option>';
    elements.publishDestination.innerHTML = '<option value="">Select a destination</option>';
    elements.historyDestination.innerHTML = '<option value="">Select a destination</option>';

    // Add Kafka topics
    const kafkaGroup = document.createElement('optgroup');
    kafkaGroup.label = 'Kafka Topics';

    state.destinations.kafka.forEach(topic => {
        const option = document.createElement('option');
        option.value = `kafka://${topic.name}`;
        option.textContent = topic.name;
        kafkaGroup.appendChild(option);
    });

    if (kafkaGroup.childElementCount > 0) {
        elements.readerDestination.appendChild(kafkaGroup.cloneNode(true));
        elements.publishDestination.appendChild(kafkaGroup.cloneNode(true));
        elements.historyDestination.appendChild(kafkaGroup.cloneNode(true));
    }

    // Add RabbitMQ queues
    const rabbitmqQueueGroup = document.createElement('optgroup');
    rabbitmqQueueGroup.label = 'RabbitMQ Queues';

    state.destinations.rabbitmqQueues.forEach(queue => {
        const option = document.createElement('option');
        option.value = `rabbitmq://${queue.name}`;
        option.textContent = queue.name;
        rabbitmqQueueGroup.appendChild(option);
    });

    if (rabbitmqQueueGroup.childElementCount > 0) {
        elements.readerDestination.appendChild(rabbitmqQueueGroup.cloneNode(true));
        elements.publishDestination.appendChild(rabbitmqQueueGroup.cloneNode(true));
        elements.historyDestination.appendChild(rabbitmqQueueGroup.cloneNode(true));
    }
}

// Select Destination
function selectDestination(type, name) {
    state.selectedDestination = { type, name };

    // Update UI
    document.querySelectorAll('.destination-list li').forEach(li => {
        li.classList.remove('active');
        if (li.dataset.type === type && li.dataset.name === name) {
            li.classList.add('active');
        }
    });

    // Enable connect button
    elements.connectButton.disabled = false;

    // Set selected destination in dropdowns
    const value = type.startsWith('kafka') ? `kafka://${name}` : `rabbitmq://${name}`;
    elements.readerDestination.value = value;
    elements.publishDestination.value = value;
    elements.historyDestination.value = value;

    // Enable relevant buttons
    elements.loadHistory.disabled = false;
    elements.publishButton.disabled = false;
}

// WebSocket Connection
function connectWebSocket(destination) {
    // Check if already connected
    if (state.connected && state.websocket) {
        return;
    }

    // Update state
    state.connecting = true;

    // Update UI
    elements.connectionIndicator.className = 'status-indicator';
    elements.connectionText.textContent = 'Connecting...';

    // Extract destination type and name
    const destType = destination.type === 'kafka' ? 'kafka' : 'rabbitmq';

    // Build WebSocket URL
    let wsUrl = `${config.wsUrl}?destination=${destType}://${destination.name}`;

    // Add authentication if available
    if (state.authToken) {
        wsUrl += `&token=${state.authToken}`;
    } else if (state.apiKey) {
        wsUrl += `&apiKey=${state.apiKey}`;
    }

    // Create WebSocket
    state.websocket = new WebSocket(wsUrl);

    // WebSocket event handlers
    state.websocket.onopen = handleWebSocketOpen;
    state.websocket.onmessage = handleWebSocketMessage;
    state.websocket.onclose = handleWebSocketClose;
    state.websocket.onerror = handleWebSocketError;
}

// WebSocket Open Handler
function handleWebSocketOpen() {
    // Update state
    state.connected = true;
    state.connecting = false;

    // Update UI
    elements.connectionIndicator.className = 'status-indicator connected';
    elements.connectionText.textContent = 'Connected';
    elements.connectButton.textContent = 'Disconnect';
    elements.pauseButton.disabled = false;

    // Clear reconnect timer
    if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
    }

    // Clear messages
    clearMessages();
}

// WebSocket Message Handler
function handleWebSocketMessage(event) {
    // Skip if paused
    if (state.paused) {
        return;
    }

    try {
        // Parse message
        const message = JSON.parse(event.data);

        // Calculate message rate
        const now = Date.now();
        if (state.lastMessageTime) {
            const timeDiff = now - state.lastMessageTime;
            state.messageRate = Math.round(1000 / timeDiff);
        }
        state.lastMessageTime = now;

        // Add to messages array
        state.messages.unshift(message);

        // Limit number of messages
        if (state.messages.length > config.maxMessages) {
            state.messages.pop();
        }

        // Update message count
        state.messageCount++;

        // Add to message list
        addMessageToList(message);
    } catch (error) {
        console.error('Error processing message:', error);
    }
}

// WebSocket Close Handler
function handleWebSocketClose() {
    // Update state
    state.connected = false;
    state.connecting = false;

    // Update UI
    elements.connectionIndicator.className = 'status-indicator disconnected';
    elements.connectionText.textContent = 'Disconnected';
    elements.connectButton.textContent = 'Connect';
    elements.pauseButton.disabled = true;

    // Auto reconnect
    if (config.autoReconnect && state.selectedDestination) {
        // Set reconnect timer
        state.reconnectTimer = setTimeout(() => {
            connectWebSocket(state.selectedDestination);
        }, config.reconnectInterval);
    }
}

// WebSocket Error Handler
function handleWebSocketError(error) {
    console.error('WebSocket error:', error);

    // Update UI
    elements.connectionIndicator.className = 'status-indicator disconnected';
    elements.connectionText.textContent = 'Connection Error';
}

// Close WebSocket Connection
function disconnectWebSocket() {
    if (state.websocket) {
        state.websocket.close();
        state.websocket = null;
    }
}

// Toggle Connection
function toggleConnection() {
    if (state.connected) {
        disconnectWebSocket();
    } else {
        if (state.selectedDestination) {
            connectWebSocket(state.selectedDestination);
        }
    }
}

// Toggle Pause
function togglePause() {
    state.paused = !state.paused;

    // Update UI
    if (state.paused) {
        elements.pauseButton.innerHTML = '<i class="fas fa-play"></i> Resume';
    } else {
        elements.pauseButton.innerHTML = '<i class="fas fa-pause"></i> Pause';
    }
}

// Clear Messages
function clearMessages() {
    // Clear state
    state.messages = [];
    state.selectedMessage = null;
    state.messageCount = 0;

    // Clear UI
    elements.messageList.innerHTML = `
    <div class="empty-state">
      <i class="fas fa-inbox empty-icon"></i>
      <h3>No Messages</h3>
      <p>Waiting for messages...</p>
    </div>
  `;
    elements.formattedContent.textContent = 'Select a message to view details';
}

// Add Message to List
function addMessageToList(message) {
    // Remove empty state if present
    const emptyState = elements.messageList.querySelector('.empty-state');
    if (emptyState) {
        elements.messageList.removeChild(emptyState);
    }

    // Create message item
    const item = document.createElement('div');
    item.className = 'message-item';

    // Get message type
    let messageType = 'unknown';
    if (message.headers && message.headers['x-message-type']) {
        messageType = message.headers['x-message-type'];
    }

    // Set content
    item.innerHTML = `
    <div class="message-header">
      <span class="message-timestamp">${new Date().toLocaleTimeString()}</span>
      <span class="message-type">${messageType}</span>
    </div>
    <div class="message-preview">${getMessagePreview(message)}</div>
  `;

    // Add click handler
    item.addEventListener('click', () => selectMessage(message, item));

    // Add to list
    elements.messageList.insertBefore(item, elements.messageList.firstChild);
}

// Get Message Preview
function getMessagePreview(message) {
    try {
        // If message has content, use that
        if (message.content) {
            if (typeof message.content === 'object') {
                return JSON.stringify(message.content).slice(0, 100) + '...';
            }
            return String(message.content).slice(0, 100) + '...';
        }

        // Otherwise use the whole message
        if (typeof message === 'object') {
            return JSON.stringify(message).slice(0, 100) + '...';
        }
        return String(message).slice(0, 100) + '...';
    } catch (error) {
        console.error('Error generating message preview:', error);
        return 'Error generating preview';
    }
}

// Select Message
function selectMessage(message, element) {
    // Update state
    state.selectedMessage = message;

    // Update UI
    document.querySelectorAll('.message-item').forEach(item => {
        item.classList.remove('active');
    });
    element.classList.add('active');

    // Show message details
    elements.formattedContent.textContent = formatJSON(message);
}

// Publish Message
async function publishMessage() {
    // Get destination
    const destination = elements.publishDestination.value;
    if (!destination) {
        alert('Please select a destination');
        return;
    }

    // Get message
    let message;
    try {
        message = JSON.parse(elements.messageInput.value);
    } catch (error) {
        alert('Invalid JSON message');
        return;
    }

    // Get message type
    const messageType = elements.messageType.value;

    // Build request
    const requestBody = {
        destination,
        message,
        messageType
    };

    try {
        // Build headers
        const headers = {
            'Content-Type': 'application/json'
        };

        if (state.authToken) {
            headers['Authorization'] = `Bearer ${state.authToken}`;
        } else if (state.apiKey) {
            headers['X-API-Key'] = state.apiKey;
        }

        // Send request
        const response = await fetch(`${config.apiUrl}/api/messages`, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error('Failed to publish message');
        }

        const data = await response.json();

        // Show success message
        alert('Message published successfully');

        // Add to recent publishes
        // addToRecentPublishes(destination, message, data.transactionId);
    } catch (error) {
        console.error('Error publishing message:', error);
        alert('Failed to publish message: ' + error.message);
    }
}

// Load Message History
async function loadMessageHistory() {
    // Get destination
    const destination = elements.historyDestination.value;
    if (!destination) {
        alert('Please select a destination');
        return;
    }

    try {
        // Build headers
        const headers = {
            'Content-Type': 'application/json'
        };

        if (state.authToken) {
            headers['Authorization'] = `Bearer ${state.authToken}`;
        } else if (state.apiKey) {
            headers['X-API-Key'] = state.apiKey;
        }

        // Send request
        const response = await fetch(`${config.apiUrl}/api/messages/history?destination=${encodeURIComponent(destination)}&limit=50`, {
            headers
        });

        if (!response.ok) {
            throw new Error('Failed to load message history');
        }

        const data = await response.json();

        // Clear history list
        elements.historyList.innerHTML = '';

        // Show message history
        if (data.messages && data.messages.length > 0) {
            data.messages.forEach(message => {
                // Create message item
                const item = document.createElement('div');
                item.className = 'message-item';

                // Set content
                item.innerHTML = `
          <div class="message-header">
            <span class="message-timestamp">${new Date(message.timestamp).toLocaleString()}</span>
          </div>
          <div class="message-preview">${getMessagePreview(message.message)}</div>
        `;

                // Add to list
                elements.historyList.appendChild(item);
            });
        } else {
            // Show empty state
            elements.historyList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-history empty-icon"></i>
          <h3>No Message History</h3>
          <p>No messages found for this destination</p>
        </div>
      `;
        }
    } catch (error) {
        console.error('Error loading message history:', error);
        alert('Failed to load message history: ' + error.message);
    }
}

// Initialize Application
function init() {
    // Initialize theme
    initTheme();

    // Add event listeners

    // Theme toggle
    elements.themeToggle.addEventListener('click', toggleTheme);

    // User dropdown
    elements.userMenuButton.addEventListener('click', toggleUserDropdown);
    document.addEventListener('click', closeUserDropdown);

    // Login
    elements.loginButton.addEventListener('click', () => showModal(elements.loginModal));
    elements.loginSubmit.addEventListener('click', handleLogin);

    // Modal close buttons
    elements.modalCloseButtons.forEach(button => {
        button.addEventListener('click', function() {
            const modal = this.closest('.modal');
            hideModal(modal);
        });
    });

    // Tab switching
    elements.tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            switchTab(this.dataset.tab);
        });
    });

    // Refresh destinations
    elements.refreshDestinations.addEventListener('click', fetchDestinations);

    // Reader tab
    elements.readerDestination.addEventListener('change', function() {
        const value = this.value;
        if (value) {
            const [type, name] = value.split('://');
            selectDestination(type, name);
        } else {
            elements.connectButton.disabled = true;
        }
    });
    elements.connectButton.addEventListener('click', toggleConnection);
    elements.pauseButton.addEventListener('click', togglePause);
    elements.clearButton.addEventListener('click', clearMessages);

    // Publisher tab
    elements.publishButton.addEventListener('click', publishMessage);

    // History tab
    elements.loadHistory.addEventListener('click', loadMessageHistory);

    // Fetch destinations
    fetchDestinations();

    // Check authentication
    if (state.authToken || state.apiKey) {
        state.authenticated = true;
        updateAuthUI();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);