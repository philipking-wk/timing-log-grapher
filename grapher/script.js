"use strict";

// Tab management
let tabs = [];
let activeTabId = null;
let tabIdCounter = 1;

// History management
const HISTORY_STORAGE_KEY = 'logGrapherHistory';
const TABS_STORAGE_KEY = 'logGrapherTabs';
const ACTIVE_TAB_STORAGE_KEY = 'logGrapherActiveTab';
const TAB_ID_COUNTER_STORAGE_KEY = 'logGrapherTabIdCounter';
const MAX_HISTORY_ITEMS = 10;

// Tab state structure
function createTabState(id, name = null) {
    return {
        id: id,
        name: name || `Tab ${id}`,
        logInput: '',
        zoomState: { minTime: null, maxTime: null },
        gapsVisible: false,
        trackOpacity: 0.1,
        trackHoverTooltipEnabled: true,
        hiddenTasks: new Set(),
        trackOrder: null, // Array of task names in custom order, null if using default sort
        graphData: {
            validTasks: [],
            minTime: 0,
            maxTime: 0,
            totalDuration: 0
        }
    };
}

// Global variables to store graph data for hover calculations (for current tab)
let graphData = {
    validTasks: [],
    minTime: 0,
    maxTime: 0,
    totalDuration: 0
};

// Set to track hidden task names (for current tab)
const hiddenTasks = new Set();

// Zoom state (for current tab)
let zoomState = {
    minTime: null,
    maxTime: null
};

// Gap visibility state (for current tab)
let gapsVisible = false;

// Track opacity state (for current tab)
let trackOpacity = 0.1;

// Track hover tooltip state (for current tab)
let trackHoverTooltipEnabled = false;

// State Persistence Functions
function saveTabsState() {
    try {
        // Convert Sets to Arrays for JSON serialization
        const tabsToSave = tabs.map(tab => ({
            ...tab,
            hiddenTasks: Array.from(tab.hiddenTasks)
        }));
        
        localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabsToSave));
        localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, String(activeTabId));
        localStorage.setItem(TAB_ID_COUNTER_STORAGE_KEY, String(tabIdCounter));
    } catch (e) {
        console.error('Failed to save tabs state:', e);
    }
}

function loadTabsState() {
    try {
        const tabsJson = localStorage.getItem(TABS_STORAGE_KEY);
        const activeTabIdStr = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
        const tabIdCounterStr = localStorage.getItem(TAB_ID_COUNTER_STORAGE_KEY);
        
        if (tabsJson) {
            const loadedTabs = JSON.parse(tabsJson);
            // Convert Arrays back to Sets
            tabs = loadedTabs.map(tab => ({
                ...tab,
                hiddenTasks: new Set(tab.hiddenTasks || [])
            }));
            
            if (tabIdCounterStr) {
                tabIdCounter = parseInt(tabIdCounterStr, 10) || 1;
            }
            
            // Restore tabs UI and content
            tabs.forEach(tab => {
                createTabUI(tab.id, tab.name);
                createTabContent(tab.id);
            });
            
            // Restore active tab
            if (activeTabIdStr && tabs.find(t => t.id === parseInt(activeTabIdStr, 10))) {
                switchTab(parseInt(activeTabIdStr, 10));
            } else if (tabs.length > 0) {
                switchTab(tabs[0].id);
            }
            
            return true;
        }
    } catch (e) {
        console.error('Failed to load tabs state:', e);
    }
    return false;
}

// Tab Management Functions
function initializeTabs() {
    // Try to load saved state
    const stateLoaded = loadTabsState();
    
    // If no saved state, create first tab
    if (!stateLoaded) {
        addNewTab();
    }
}

function addNewTab(name = null) {
    const tabId = tabIdCounter++;
    const tabState = createTabState(tabId, name);
    tabs.push(tabState);
    
    // Create tab UI
    createTabUI(tabId, tabState.name);
    
    // Create tab content
    createTabContent(tabId);
    
    // Switch to new tab
    switchTab(tabId);
    
    // Save state
    saveTabsState();
}

function createTabUI(tabId, tabName) {
    const tabsHeader = document.getElementById('tabs-header');
    if (!tabsHeader) return;
    
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.draggable = true;
    tab.dataset.tabId = tabId;
    tab.innerHTML = `
        <span class="tab-name" ondblclick="event.stopPropagation(); startRenameTab(${tabId})">${tabName}</span>
        <span class="tab-close" onclick="event.stopPropagation(); closeTab(${tabId})" title="Close tab">×</span>
    `;
    // Switch tab on click (but not if clicking close button or during drag)
    tab.addEventListener('click', (e) => {
        // Don't switch if we just dragged or clicked the close button
        if (!isDraggingTab && !e.target.classList.contains('tab-close')) {
            switchTab(tabId);
        }
    });
    
    // Add drag event handlers
    setupTabDragHandlers(tab, tabId);
    
    tabsHeader.appendChild(tab);
}

function createTabContent(tabId) {
    const container = document.getElementById('tab-content-container');
    if (!container) return;
    
    const tabContent = document.createElement('div');
    tabContent.className = 'tab-content';
    tabContent.id = `tab-content-${tabId}`;
    tabContent.dataset.tabId = tabId;
    tabContent.innerHTML = `
        <div>
            <p>Enter logs below. Format:<br>
                <code>&lt;name&gt; start: &lt;time in mil&gt;</code><br>
                <code>&lt;name&gt; end: &lt;time in mil&gt;</code><br>
                <br> Click + drag to zoom
            </p>
            <textarea class="tab-log-input" data-tab-id="${tabId}"
                placeholder="ProcessA start: 1678886400000&#10;ProcessA end: 1678886401000"></textarea>
        </div>
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
            <button onclick="renderGraph()">Visualize</button>
            <button class="reset-zoom-btn" data-tab-id="${tabId}" style="display: none;" onclick="resetZoom()">Reset Zoom</button>
            <button class="toggle-gaps-btn" data-tab-id="${tabId}" onclick="toggleGaps()">Show Gaps</button>
            <button class="toggle-track-tooltip-btn" data-tab-id="${tabId}" onclick="toggleTrackHoverTooltip()">Show Track Tooltip</button>
            <div style="display: flex; align-items: center; gap: 10px;">
                <label for="track-opacity-slider-${tabId}" style="font-size: 14px;">Track Opacity:</label>
                <input type="range" class="track-opacity-slider" id="track-opacity-slider-${tabId}" data-tab-id="${tabId}" min="0" max="1" step="0.01" value="0.1" oninput="updateTrackOpacity(this.value)">
                <span class="track-opacity-value" data-tab-id="${tabId}" style="font-size: 14px; min-width: 40px;">10%</span>
            </div>
        </div>
        <div class="graph-container" data-tab-id="${tabId}"></div>
    `;
    
    // Add event listener for textarea
    const textarea = tabContent.querySelector('.tab-log-input');
    if (textarea) {
        textarea.addEventListener('input', (e) => {
            saveTabState(tabId);
        });
    }
    
    container.appendChild(tabContent);
}

function switchTab(tabId) {
    // Save current tab state
    if (activeTabId !== null) {
        saveTabState(activeTabId);
    }
    
    // Update active tab
    activeTabId = tabId;
    
    // Update tab UI
    document.querySelectorAll('.tab').forEach(t => {
        if (parseInt(t.dataset.tabId) === tabId) {
            t.classList.add('active');
        } else {
            t.classList.remove('active');
        }
    });
    
    // Update tab content visibility
    document.querySelectorAll('.tab-content').forEach(tc => {
        if (parseInt(tc.dataset.tabId) === tabId) {
            tc.classList.add('active');
        } else {
            tc.classList.remove('active');
        }
    });
    
    // Load tab state
    loadTabState(tabId);
}

function saveTabState(tabId) {
    const tabState = tabs.find(t => t.id === tabId);
    if (!tabState) return;
    
    const tabContent = document.getElementById(`tab-content-${tabId}`);
    if (!tabContent) return;
    
    const textarea = tabContent.querySelector('.tab-log-input');
    if (textarea) {
        tabState.logInput = textarea.value;
    }
    
    // Save current state to tab
    tabState.zoomState = { ...zoomState };
    tabState.gapsVisible = gapsVisible;
    tabState.trackOpacity = trackOpacity;
    tabState.trackHoverTooltipEnabled = trackHoverTooltipEnabled;
    tabState.hiddenTasks = new Set(hiddenTasks);
    tabState.graphData = { ...graphData };
    // trackOrder is updated separately when tracks are reordered
    
    // Save to localStorage
    saveTabsState();
}

function loadTabState(tabId) {
    const tabState = tabs.find(t => t.id === tabId);
    if (!tabState) return;
    
    const tabContent = document.getElementById(`tab-content-${tabId}`);
    if (!tabContent) return;
    
    // Load textarea
    const textarea = tabContent.querySelector('.tab-log-input');
    if (textarea) {
        textarea.value = tabState.logInput;
    }
    
    // Load state variables
    zoomState = { ...tabState.zoomState };
    gapsVisible = tabState.gapsVisible;
    trackOpacity = tabState.trackOpacity;
    trackHoverTooltipEnabled = tabState.trackHoverTooltipEnabled !== undefined ? tabState.trackHoverTooltipEnabled : true;
    hiddenTasks.clear();
    tabState.hiddenTasks.forEach(task => hiddenTasks.add(task));
    graphData = { ...tabState.graphData };
    // Note: trackOrder is stored in tabState and will be used in renderGraph
    
    // Update UI
    const resetBtn = tabContent.querySelector('.reset-zoom-btn');
    if (resetBtn) {
        resetBtn.style.display = (zoomState.minTime !== null || zoomState.maxTime !== null) ? 'block' : 'none';
    }
    
    const toggleBtn = tabContent.querySelector('.toggle-gaps-btn');
    if (toggleBtn) {
        toggleBtn.textContent = gapsVisible ? 'Hide Gaps' : 'Show Gaps';
    }
    
    const toggleTooltipBtn = tabContent.querySelector('.toggle-track-tooltip-btn');
    if (toggleTooltipBtn) {
        toggleTooltipBtn.textContent = trackHoverTooltipEnabled ? 'Hide Track Tooltip' : 'Show Track Tooltip';
    }
    
    const opacitySlider = tabContent.querySelector('.track-opacity-slider');
    if (opacitySlider) {
        opacitySlider.value = trackOpacity;
    }
    
    const opacityValue = tabContent.querySelector('.track-opacity-value');
    if (opacityValue) {
        opacityValue.textContent = Math.round(trackOpacity * 100) + '%';
    }
    
    // Re-render graph if there's data
    if (tabState.logInput.trim()) {
        renderGraph();
    } else {
        const graphContainer = tabContent.querySelector('.graph-container');
        if (graphContainer) {
            graphContainer.innerHTML = '';
        }
    }
}

function closeTab(tabId) {
    if (tabs.length <= 1) {
        // Don't close the last tab
        return;
    }
    
    // Remove tab from array
    tabs = tabs.filter(t => t.id !== tabId);
    
    // Remove tab UI
    const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
    if (tabElement) {
        tabElement.remove();
    }
    
    // Remove tab content
    const tabContent = document.getElementById(`tab-content-${tabId}`);
    if (tabContent) {
        tabContent.remove();
    }
    
    // Switch to another tab if this was active
    if (activeTabId === tabId) {
        const remainingTab = tabs[0];
        if (remainingTab) {
            switchTab(remainingTab.id);
        }
    }
    
    // Save state
    saveTabsState();
}

// Tab drag and drop
let draggedTabId = null;
let draggedTabElement = null;
let isDraggingTab = false;

function setupTabDragHandlers(tabElement, tabId) {
    tabElement.addEventListener('dragstart', (e) => {
        draggedTabId = tabId;
        draggedTabElement = tabElement;
        isDraggingTab = true;
        tabElement.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', tabElement.innerHTML);
    });
    
    tabElement.addEventListener('dragend', (e) => {
        tabElement.classList.remove('dragging');
        // Remove all drag-over classes
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.remove('drag-over');
        });
        draggedTabId = null;
        draggedTabElement = null;
        // Reset drag flag after a short delay to allow click event to check it
        setTimeout(() => {
            isDraggingTab = false;
        }, 100);
    });
    
    tabElement.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        const afterElement = getDragAfterElement(e.clientX);
        const tabsHeader = document.getElementById('tabs-header');
        if (!tabsHeader) return;
        
        // Remove drag-over from all tabs
        document.querySelectorAll('.tab').forEach(t => {
            t.classList.remove('drag-over');
        });
        
        if (afterElement == null) {
            tabsHeader.appendChild(draggedTabElement);
        } else {
            tabsHeader.insertBefore(draggedTabElement, afterElement);
        }
    });
    
    tabElement.addEventListener('drop', (e) => {
        e.preventDefault();
        handleTabReorder();
    });
    
    tabElement.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (tabElement !== draggedTabElement) {
            tabElement.classList.add('drag-over');
        }
    });
    
    tabElement.addEventListener('dragleave', (e) => {
        tabElement.classList.remove('drag-over');
    });
}

function getDragAfterElement(x) {
    const tabs = Array.from(document.querySelectorAll('.tab:not(.dragging)'));
    
    return tabs.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function handleTabReorder() {
    if (draggedTabId === null) return;
    
    const tabsHeader = document.getElementById('tabs-header');
    if (!tabsHeader) return;
    
    // Get new order from DOM
    const tabElements = Array.from(tabsHeader.querySelectorAll('.tab'));
    const newOrder = tabElements.map(tab => parseInt(tab.dataset.tabId));
    
    // Reorder tabs array to match DOM order
    tabs.sort((a, b) => {
        const indexA = newOrder.indexOf(a.id);
        const indexB = newOrder.indexOf(b.id);
        return indexA - indexB;
    });
    
    // Reorder tab content elements to match
    const tabContentContainer = document.getElementById('tab-content-container');
    if (tabContentContainer) {
        newOrder.forEach(tabId => {
            const tabContent = document.getElementById(`tab-content-${tabId}`);
            if (tabContent) {
                tabContentContainer.appendChild(tabContent);
            }
        });
    }
    
    // Save state after reordering
    saveTabsState();
}

// Track drag and drop for reordering
let draggedTrackName = null;
let draggedTrackElement = null;
let isDraggingTrack = false;

function setupTrackDragHandlers(trackRow, taskName) {
    trackRow.addEventListener('dragstart', (e) => {
        // Don't start drag if clicking on the bar or label (which have their own handlers)
        if (e.target.closest('.timeline-bar') || e.target.closest('.timeline-label')) {
            e.preventDefault();
            return;
        }
        draggedTrackName = taskName;
        draggedTrackElement = trackRow;
        isDraggingTrack = true;
        trackRow.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', trackRow.innerHTML);
    });
    
    trackRow.addEventListener('dragend', (e) => {
        trackRow.classList.remove('dragging');
        // Remove all drag-over classes
        document.querySelectorAll('.timeline-row').forEach(row => {
            row.classList.remove('drag-over');
        });
        draggedTrackName = null;
        draggedTrackElement = null;
        setTimeout(() => {
            isDraggingTrack = false;
        }, 100);
    });
    
    trackRow.addEventListener('dragover', (e) => {
        if (draggedTrackName === null || draggedTrackElement === null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        const afterElement = getDragAfterTrackElement(e.clientY);
        const container = trackRow.closest('.graph-container');
        if (!container) return;
        
        // Remove drag-over from all rows
        document.querySelectorAll('.timeline-row').forEach(row => {
            row.classList.remove('drag-over');
        });
        
        if (afterElement == null) {
            container.appendChild(draggedTrackElement);
        } else {
            container.insertBefore(draggedTrackElement, afterElement);
        }
    });
    
    trackRow.addEventListener('drop', (e) => {
        e.preventDefault();
        handleTrackReorder();
    });
    
    trackRow.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (trackRow !== draggedTrackElement) {
            trackRow.classList.add('drag-over');
        }
    });
    
    trackRow.addEventListener('dragleave', (e) => {
        trackRow.classList.remove('drag-over');
    });
}

function getDragAfterTrackElement(y) {
    const rows = Array.from(document.querySelectorAll('.timeline-row:not(.dragging)'));
    
    return rows.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function handleTrackReorder() {
    if (draggedTrackName === null || activeTabId === null) return;
    
    const tabContent = document.getElementById(`tab-content-${activeTabId}`);
    if (!tabContent) return;
    
    const container = tabContent.querySelector('.graph-container');
    if (!container) return;
    
    // Get new order from DOM
    const trackRows = Array.from(container.querySelectorAll('.timeline-row'));
    const newOrder = trackRows.map(row => row.dataset.taskName).filter(name => name);
    
    // Update track order in tab state
    const tabState = tabs.find(t => t.id === activeTabId);
    if (tabState) {
        tabState.trackOrder = newOrder;
        saveTabsState();
    }
}

function startRenameTab(tabId) {
    const tabElement = document.querySelector(`.tab[data-tab-id="${tabId}"]`);
    if (!tabElement) return;
    
    const tabNameElement = tabElement.querySelector('.tab-name');
    if (!tabNameElement) return;
    
    const currentName = tabNameElement.textContent;
    
    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'tab-rename-input';
    input.style.cssText = 'background: #1a1a1a; border: 1px solid #666; color: #e0e0e0; padding: 2px 4px; font-size: 14px; border-radius: 3px; width: 100px;';
    
    // Replace name with input
    const parent = tabNameElement.parentNode;
    parent.replaceChild(input, tabNameElement);
    input.focus();
    input.select();
    
    const finishRename = () => {
        const newName = input.value.trim() || currentName;
        const tabState = tabs.find(t => t.id === tabId);
        if (tabState) {
            tabState.name = newName;
        }
        
        // Create new name element
        const newNameElement = document.createElement('span');
        newNameElement.className = 'tab-name';
        newNameElement.textContent = newName;
        newNameElement.ondblclick = (e) => {
            e.stopPropagation();
            startRenameTab(tabId);
        };
        
        parent.replaceChild(newNameElement, input);
        
        // Save state after renaming
        saveTabsState();
    };
    
    input.onblur = finishRename;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishRename();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            const newNameElement = document.createElement('span');
            newNameElement.className = 'tab-name';
            newNameElement.textContent = currentName;
            newNameElement.ondblclick = (e) => {
                e.stopPropagation();
                startRenameTab(tabId);
            };
            parent.replaceChild(newNameElement, input);
        }
    };
}

// History Management Functions
function saveToHistory(logInput, tabName = null) {
    if (!logInput || !logInput.trim()) return;
    
    let history = getHistory();
    
    const historyItem = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        logInput: logInput,
        tabName: tabName || `Run ${new Date().toLocaleTimeString()}`
    };
    
    // Add to beginning
    history.unshift(historyItem);
    
    // Keep only last MAX_HISTORY_ITEMS
    history = history.slice(0, MAX_HISTORY_ITEMS);
    
    // Save to localStorage
    try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
        console.error('Failed to save history:', e);
    }
}

function getHistory() {
    try {
        const historyJson = localStorage.getItem(HISTORY_STORAGE_KEY);
        return historyJson ? JSON.parse(historyJson) : [];
    } catch (e) {
        console.error('Failed to load history:', e);
        return [];
    }
}

function loadFromHistory(historyItem) {
    try {
        // Create a new tab with the history data
        addNewTab(historyItem.tabName);
        
        // Set the log input
        const tabState = tabs[tabs.length - 1];
        if (tabState) {
            tabState.logInput = historyItem.logInput;
            
            const tabContent = document.getElementById(`tab-content-${tabState.id}`);
            if (tabContent) {
                const textarea = tabContent.querySelector('.tab-log-input');
                if (textarea) {
                    textarea.value = historyItem.logInput;
                }
            }
            
            // Render the graph
            renderGraph();
        }
    } catch (e) {
        console.error('Failed to load from history:', e);
    }
}

function renderHistory() {
    const historyList = document.getElementById('history-list');
    if (!historyList) return;
    
    const history = getHistory();
    
    if (history.length === 0) {
        historyList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No history yet. Visualize some logs to create history.</p>';
        return;
    }
    
    historyList.innerHTML = history.map((item, index) => {
        const date = new Date(item.timestamp);
        const preview = item.logInput.substring(0, 100) + (item.logInput.length > 100 ? '...' : '');
        const escapedPreview = preview.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const escapedTabName = item.tabName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        return `
            <div class="history-item" data-history-index="${index}">
                <div class="history-item-header">
                    <span class="history-item-title">${escapedTabName}</span>
                    <span class="history-item-time">${date.toLocaleString()}</span>
                </div>
                <div class="history-item-preview">${escapedPreview}</div>
                <div class="history-item-actions">
                    <button class="load-history-btn" data-history-index="${index}">Load in New Tab</button>
                </div>
            </div>
        `;
    }).join('');
    
    // Add event listeners to all load buttons
    historyList.querySelectorAll('.load-history-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const index = parseInt(button.dataset.historyIndex);
            const history = getHistory();
            if (history[index]) {
                loadFromHistory(history[index]);
            }
        });
    });
}

function toggleHistory() {
    const historyPanel = document.getElementById('history-panel');
    if (!historyPanel) return;
    
    if (historyPanel.style.display === 'none') {
        historyPanel.style.display = 'block';
        renderHistory();
    } else {
        historyPanel.style.display = 'none';
    }
}

function renderGraph() {
    if (activeTabId === null) return;
    
    const tabContent = document.getElementById(`tab-content-${activeTabId}`);
    if (!tabContent) return;
    
    const inputElement = tabContent.querySelector('.tab-log-input');
    if (!inputElement) {
        console.error('log-input element not found');
        return;
    }
    const input = inputElement.value;
    
    // Save to history when rendering
    if (input.trim()) {
        const tabState = tabs.find(t => t.id === activeTabId);
        saveToHistory(input, tabState ? tabState.name : null);
    }
    const lines = input.split('\n');
    const tasks = {};
    // Parsing - store each task instance separately to handle duplicates
    lines.forEach(line => {
        let cleanLine = line.trim();
        // Handle "!!!" separator if present
        if (cleanLine.includes('!!!')) {
            const parts = cleanLine.split('!!!');
            if (parts.length > 1) {
                cleanLine = parts[1].trim();
            }
        }
        // Regex to match name and time, optionally ignoring trailing ' ms'
        // Matches: <name> start: <time>[ ms]
        const startMatch = cleanLine.match(/^(.*) start: (\d+)(?: ms)?$/);
        const endMatch = cleanLine.match(/^(.*) end: (\d+)(?: ms)?$/);
        if (startMatch) {
            const name = startMatch[1].trim();
            const time = parseInt(startMatch[2], 10);
            // Always create a new task instance for each start event
            if (!tasks[name]) {
                tasks[name] = [];
            }
            const taskInstance = { start: time, end: undefined };
            tasks[name].push(taskInstance);
        }
        else if (endMatch) {
            const name = endMatch[1].trim();
            const time = parseInt(endMatch[2], 10);
            if (!tasks[name]) {
                tasks[name] = [];
            }
            // Find the most recent task instance with a start but no end
            // Search from the end of the array to get the most recent
            let taskInstance = null;
            for (let i = tasks[name].length - 1; i >= 0; i--) {
                if (tasks[name][i].start !== undefined && tasks[name][i].end === undefined) {
                    taskInstance = tasks[name][i];
                    break;
                }
            }
            if (!taskInstance) {
                // If no unmatched start found, create a new instance with just an end
                taskInstance = { start: undefined, end: time };
                tasks[name].push(taskInstance);
            } else {
                taskInstance.end = time;
            }
        }
    });
    // Validation and Min/Max calculation
    let minTime = Infinity;
    let maxTime = -Infinity;
    let validTasks = [];
    const nameCounts = {}; // Track how many times each name appears
    
    for (const [baseName, taskInstances] of Object.entries(tasks)) {
        for (const taskInstance of taskInstances) {
            if (taskInstance.start !== undefined && taskInstance.end !== undefined) {
                if (taskInstance.end < taskInstance.start) {
                    console.warn(`Skipping ${baseName}: End time before start time.`);
                continue;
            }
                minTime = Math.min(minTime, taskInstance.start);
                maxTime = Math.max(maxTime, taskInstance.end);
                
                // Track name occurrences and append number for duplicates
                if (!nameCounts[baseName]) {
                    nameCounts[baseName] = 0;
                }
                nameCounts[baseName]++;
                const displayName = nameCounts[baseName] === 1 ? baseName : `${baseName} ${nameCounts[baseName]}`;
                
                validTasks.push({ 
                    name: displayName, 
                    originalName: baseName,
                    start: taskInstance.start, 
                    end: taskInstance.end 
                });
            }
        }
    }
    if (validTasks.length === 0) {
        const container = tabContent.querySelector('.graph-container');
        if (container) {
            container.innerHTML = '<p>No valid start/end pairs found.</p>';
        }
        return;
    }
    // Sort by start time (default order)
    validTasks.sort((a, b) => a.start - b.start);
    
    // Apply custom track order if it exists
    const tabState = tabs.find(t => t.id === activeTabId);
    if (tabState && tabState.trackOrder && tabState.trackOrder.length > 0) {
        // Create a map for quick lookup
        const taskMap = new Map(validTasks.map(task => [task.name, task]));
        const orderedTasks = [];
        const unorderedTasks = [];
        
        // First, add tasks in the custom order
        tabState.trackOrder.forEach(taskName => {
            const task = taskMap.get(taskName);
            if (task) {
                orderedTasks.push(task);
                taskMap.delete(taskName);
            }
        });
        
        // Then add any remaining tasks (new tasks not in the order) at the end
        taskMap.forEach(task => unorderedTasks.push(task));
        unorderedTasks.sort((a, b) => a.start - b.start);
        
        // Combine ordered and unordered tasks
        validTasks = [...orderedTasks, ...unorderedTasks];
    }
    
    const totalDuration = maxTime - minTime;
    
    // Store graph data globally for hover calculations (always use full range)
    graphData.validTasks = validTasks;
    graphData.minTime = minTime;
    graphData.maxTime = maxTime;
    graphData.totalDuration = totalDuration;
    
    // Determine display time range (use zoom if set, otherwise full range)
    const displayMinTime = zoomState.minTime !== null ? zoomState.minTime : minTime;
    const displayMaxTime = zoomState.maxTime !== null ? zoomState.maxTime : maxTime;
    const displayDuration = displayMaxTime - displayMinTime;
    
    // Show/hide reset zoom button
    const resetBtn = tabContent.querySelector('.reset-zoom-btn');
    if (resetBtn) {
        resetBtn.style.display = (zoomState.minTime !== null || zoomState.maxTime !== null) ? 'block' : 'none';
    }
    
    const container = tabContent.querySelector('.graph-container');
    if (!container) {
        console.error('graph-container element not found');
        return;
    }
    container.innerHTML = '';
    
    // Clear hidden tasks when re-rendering (but preserve zoom)
    hiddenTasks.clear();
    
    // Create vertical timeline indicator
    const timelineIndicator = document.createElement('div');
    timelineIndicator.id = 'timeline-indicator';
    timelineIndicator.style.display = 'none';
    container.appendChild(timelineIndicator);
    
    // Create selection rectangle for zoom
    const selectionRect = document.createElement('div');
    selectionRect.id = 'selection-rect';
    selectionRect.style.display = 'none';
    container.appendChild(selectionRect);
    // Render Rows
    validTasks.forEach((task, index) => {
        const row = document.createElement('div');
        row.className = 'timeline-row';
        row.draggable = true;
        row.dataset.taskName = task.name;
        const label = document.createElement('div');
        label.className = 'timeline-label';
        label.textContent = task.name;
        label.title = task.name;
        // Add hover tooltip for full name
        label.onmouseenter = (e) => {
            if (label.scrollWidth > label.clientWidth) {
                showTooltip(e, task.name);
            }
        };
        label.onmouseleave = hideTooltip;
        
        // Prevent drag when clicking on label
        label.onmousedown = (e) => {
            e.stopPropagation();
        };
        const track = document.createElement('div');
        track.className = 'timeline-track';
        const bar = document.createElement('div');
        bar.className = 'timeline-bar';
        // Calculate position and width using display time range
        // If displayDuration is 0 (single point), handle gracefully
        const safeDuration = displayDuration === 0 ? 1 : displayDuration;
        const leftPercent = ((task.start - displayMinTime) / safeDuration) * 100;
        const widthPercent = ((task.end - task.start) / safeDuration) * 100;
        bar.style.left = `${leftPercent}%`;
        bar.style.width = `${Math.max(widthPercent, 0.5)}%`; // Min width for visibility
        // Randomish color based on original name (so duplicates have same color)
        const originalName = task.originalName || task.name;
        const hue = stringToHue(originalName);
        bar.style.backgroundColor = `hsl(${hue}, 70%, 50%)`;
        // Set track background to same color but slightly transparent
        track.style.backgroundColor = `hsla(${hue}, 70%, 50%, ${trackOpacity})`;
        const durationMs = task.end - task.start;
        
        // Create text element that can be positioned outside if bar is too narrow
        const barText = document.createElement('span');
        barText.className = 'timeline-bar-text';
        barText.textContent = `${durationMs}ms`;
        bar.appendChild(barText);
        
        // Check if bar is too narrow and position text outside
        // Use requestAnimationFrame to ensure layout is calculated
        requestAnimationFrame(() => {
            const barWidth = bar.offsetWidth;
            const textWidth = barText.scrollWidth;
            // If text is wider than 70% of bar, position it outside
            if (barWidth > 0 && textWidth > barWidth * 0.7) {
                barText.classList.add('outside');
            }
        });
        
        // Tooltip events
        bar.onmousemove = (e) => showTooltip(e, `${task.name}<br>Start: ${task.start}<br>End: ${task.end}<br>Duration: ${durationMs}ms`);
        bar.onmouseleave = hideTooltip;
        // Click to toggle hidden state
        bar.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (hiddenTasks.has(task.name)) {
                hiddenTasks.delete(task.name);
                bar.style.opacity = '1';
            } else {
                hiddenTasks.add(task.name);
                bar.style.opacity = '0.3';
            }
            // Save state when toggling hidden tasks
            if (activeTabId !== null) {
                saveTabState(activeTabId);
            }
        };
        
        // Prevent drag when clicking on bar
        bar.onmousedown = (e) => {
            e.stopPropagation();
        };
        track.appendChild(bar);
        row.appendChild(label);
        // Add gap label showing time gaps
        // For true gaps: show gap from closest previous task end to current task start
        // For overlapping tasks: show gap from previous task start to current task start
        if (index > 0) {
            const prevTask = validTasks[index - 1];
            // Check if there's empty space between previous task end and current task start
            const gapStart = prevTask.end;
            const gapEnd = task.start;
            const hasEmptySpace = gapEnd > gapStart;
            const isAdjacent = gapEnd === gapStart;
            // Calculate gap duration based on whether there's empty space
            let gapDuration;
            let gapLabelText;
            let visualGapStart;
            if (isAdjacent) {
                // Tasks are exactly adjacent - no gap, no overlap, don't show gap label
                gapDuration = 0;
            }
            else if (hasEmptySpace) {
                // True gap: find the closest end time before current task start
                let closestEndTime = prevTask.end;
                for (let i = 0; i < index; i++) {
                    const checkTask = validTasks[i];
                    if (checkTask.end <= task.start && checkTask.end > closestEndTime) {
                        closestEndTime = checkTask.end;
                    }
                }
                visualGapStart = closestEndTime;
                gapDuration = gapEnd - visualGapStart;
                gapLabelText = `+${gapDuration}ms gap`;
            }
            else {
                // Overlapping: show gap from previous task start to current task start
                visualGapStart = prevTask.start;
                gapDuration = task.start - prevTask.start;
                gapLabelText = `+${gapDuration}ms from prev start`;
            }
            // Only show gap if there's a time difference
            if (gapDuration > 0) {
                const gap = document.createElement('div');
                gap.className = 'timeline-gap';
                gap.style.display = gapsVisible ? 'block' : 'none';
                if (hasEmptySpace) {
                    // Position in empty space between closest end and current start
                    const gapLeftPercent = ((visualGapStart - displayMinTime) / safeDuration) * 100;
                    const gapWidthPercent = ((gapEnd - visualGapStart) / safeDuration) * 100;
                    gap.style.left = `${gapLeftPercent}%`;
                    gap.style.width = `${gapWidthPercent}%`;
                }
                else {
                    // Tasks overlap - position to the left of the current task start
                    const taskStartPercent = ((task.start - displayMinTime) / safeDuration) * 100;
                    // Position gap label to the left of task start, extending leftward
                    // The right edge of the gap should align with the task start
                    const gapWidthPercent = 8; // 8% width for label
                    const gapLeftPercent = Math.max(0, taskStartPercent - gapWidthPercent);
                    gap.style.left = `${gapLeftPercent}%`;
                    gap.style.width = `${gapWidthPercent}%`;
                    gap.style.justifyContent = 'flex-end';
                    // Border should be at the right edge (task start position)
                    gap.style.borderRight = '2px dashed #ff6b6b';
                    gap.style.borderLeft = 'none';
                }
                const gapLabel = document.createElement('div');
                gapLabel.className = 'timeline-gap-label';
                gapLabel.textContent = gapLabelText;
                gap.appendChild(gapLabel);
                track.appendChild(gap);
            }
        }
        row.appendChild(track);
        container.appendChild(row);
        
        // Setup drag handlers for track reordering
        setupTrackDragHandlers(row, task.name);
    });
    
    // Axis (Simple start/end labels)
    const axis = document.createElement('div');
    axis.className = 'axis';
    axis.innerHTML = `<span>${new Date(displayMinTime).toLocaleTimeString()} (${displayMinTime})</span><span>${new Date(displayMaxTime).toLocaleTimeString()} (${displayMaxTime})</span>`;
    // Set axis margin based on first label width (if available)
    const firstLabel = container.querySelector('.timeline-label');
    if (firstLabel) {
        const labelWidth = firstLabel.offsetWidth || 150;
        axis.style.marginLeft = `${labelWidth + 16}px`; // label width + resize handle (6px) + margin (10px)
    }
    container.appendChild(axis);
    
    // Create a single resize handle for all labels (after axis is created)
    const allLabels = container.querySelectorAll('.timeline-label');
    const allRows = container.querySelectorAll('.timeline-row');
    if (allLabels.length > 0 && allRows.length > 0) {
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle-global';
        
        // Position the resize handle
        const firstRow = allRows[0];
        const lastRow = allRows[allRows.length - 1];
        
        const labelWidth = firstLabel.offsetWidth || 150;
        const containerPadding = 20; // Container padding
        
        // Calculate positions relative to container
        const firstRowTop = firstRow.offsetTop;
        const lastRowBottom = lastRow.offsetTop + lastRow.offsetHeight;
        
        resizeHandle.style.left = `${labelWidth + containerPadding}px`;
        resizeHandle.style.top = `${firstRowTop}px`;
        resizeHandle.style.height = `${lastRowBottom - firstRowTop}px`;
        
        container.appendChild(resizeHandle);
        setupGlobalLabelResize(resizeHandle, container);
    }
    
    // Add mouse handlers for timeline indicator and zoom selection
    setupTimelineHandlers(container, displayMinTime, displayDuration);
    
    // Save current tab state after rendering
    if (activeTabId !== null) {
        saveTabState(activeTabId);
    }
}
function stringToHue(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash % 360);
}
const tooltip = document.getElementById('tooltip');

// Helper function to get the current label width (including resize handle)
function getLabelAreaWidth() {
    if (activeTabId === null) return 160;
    const tabContent = document.getElementById(`tab-content-${activeTabId}`);
    if (!tabContent) return 160;
    const container = tabContent.querySelector('.graph-container');
    if (!container) return 160;
    const firstLabel = container.querySelector('.timeline-label');
    const globalResizeHandle = container.querySelector('.resize-handle-global');
    if (firstLabel) {
        const handleWidth = globalResizeHandle ? (globalResizeHandle.offsetWidth || 6) : 6;
        return (firstLabel.offsetWidth || 150) + handleWidth + 10; // label + handle + margin
    }
    return 160; // default
}

function showTooltip(e, html) {
    if (!tooltip)
        return;
    tooltip.style.display = 'block';
    tooltip.innerHTML = html;
    
    // Get tooltip dimensions
    const tooltipRect = tooltip.getBoundingClientRect();
    const tooltipWidth = tooltipRect.width;
    const tooltipHeight = tooltipRect.height;
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Calculate initial position
    const offset = 10;
    let left = e.pageX + offset;
    let top = e.pageY + offset;
    
    // Adjust horizontal position if tooltip would overflow right edge
    if (left + tooltipWidth > viewportWidth) {
        left = e.pageX - tooltipWidth - offset;
        // If still overflowing left edge, position at right edge of viewport
        if (left < 0) {
            left = viewportWidth - tooltipWidth - offset;
        }
    }
    
    // Adjust vertical position if tooltip would overflow bottom edge
    if (top + tooltipHeight > viewportHeight) {
        top = e.pageY - tooltipHeight - offset;
        // If still overflowing top edge, position at bottom edge of viewport
        if (top < 0) {
            top = viewportHeight - tooltipHeight - offset;
        }
    }
    
    // Ensure tooltip doesn't go off the left edge
    if (left < offset) {
        left = offset;
    }
    
    // Ensure tooltip doesn't go off the top edge
    if (top < offset) {
        top = offset;
    }
    
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}
function hideTooltip() {
    if (!tooltip)
        return;
    tooltip.style.display = 'none';
}

// Drag selection state
let dragState = {
    isDragging: false,
    startX: 0,
    startY: 0
};

function setupTimelineHandlers(container, displayMinTime, displayDuration) {
    let currentDisplayMinTime = displayMinTime;
    let currentDisplayDuration = displayDuration;
    
    container.onmousemove = (e) => {
        if (dragState.isDragging) {
            handleDragSelection(e, container, currentDisplayMinTime, currentDisplayDuration);
        } else {
            handleTimelineHover(e, currentDisplayMinTime, currentDisplayDuration);
        }
    };
    
    container.onmousedown = (e) => {
        // Only start drag if clicking on track area (not on bars or labels)
        const tracks = container.querySelectorAll('.timeline-track');
        if (tracks.length === 0) return;
        
        const firstTrack = tracks[0];
        const trackRect = firstTrack.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const labelWidth = getLabelAreaWidth();
        const containerPadding = 20;
        const mouseX = e.clientX - containerRect.left - labelWidth - containerPadding;
        const trackWidth = trackRect.width;
        
        // Check if click is on a bar (don't start drag)
        const target = e.target;
        if (target.classList.contains('timeline-bar')) {
            return; // Let bar click handler work
        }
        
        // Only start drag if in track area
        if (mouseX >= 0 && mouseX <= trackWidth) {
            dragState.isDragging = true;
            dragState.startX = e.clientX;
            dragState.startY = e.clientY;
            e.preventDefault();
        }
    };
    
    container.onmouseup = (e) => {
        if (dragState.isDragging) {
            finishDragSelection(e, container, currentDisplayMinTime, currentDisplayDuration);
            dragState.isDragging = false;
        }
    };
    
    container.onmouseleave = () => {
        if (dragState.isDragging) {
            dragState.isDragging = false;
            hideSelectionRect();
        }
        hideTimelineIndicator();
    };
}

function handleTimelineHover(e, displayMinTime, displayDuration) {
    if (activeTabId === null) return;
    const tabContent = document.getElementById(`tab-content-${activeTabId}`);
    if (!tabContent) return;
    const container = tabContent.querySelector('.graph-container');
    const indicator = tabContent.querySelector('#timeline-indicator');
    if (!container || !indicator)
        return;
    
    // Get the track area (excluding labels and axis)
    const tracks = container.querySelectorAll('.timeline-track');
    if (tracks.length === 0)
        return;
    
    const firstTrack = tracks[0];
    const trackRect = firstTrack.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    // Calculate mouse position relative to the track area
    // Account for label width and container padding
    const labelWidth = getLabelAreaWidth();
    const containerPadding = 20;
    const mouseX = e.clientX - containerRect.left - labelWidth - containerPadding;
    const trackWidth = trackRect.width;
    
    // Only show indicator if mouse is over the track area
    if (mouseX < 0 || mouseX > trackWidth) {
        hideTimelineIndicator();
        return;
    }
    
    // Calculate time at mouse position using display time range
    const { validTasks } = graphData;
    const safeDuration = displayDuration === 0 ? 1 : displayDuration;
    const percent = Math.max(0, Math.min(1, mouseX / trackWidth));
    const currentTime = displayMinTime + (percent * safeDuration);
    
    // Position the vertical line (account for container padding)
    const indicatorLeft = labelWidth + containerPadding + mouseX;
    indicator.style.left = `${indicatorLeft}px`;
    
    // Calculate height to span all rows (but not the axis)
    const rows = container.querySelectorAll('.timeline-row');
    if (rows.length > 0) {
        const firstRow = rows[0];
        const lastRow = rows[rows.length - 1];
        const firstRowTop = firstRow.getBoundingClientRect().top - containerRect.top;
        const lastRowBottom = lastRow.getBoundingClientRect().bottom - containerRect.top;
        indicator.style.top = `${firstRowTop}px`;
        indicator.style.height = `${lastRowBottom - firstRowTop}px`;
    }
    
    indicator.style.display = 'block';
    
    // Find all spans that intersect with this time (excluding hidden tasks)
    const intersectingSpans = validTasks.filter(task => 
        !hiddenTasks.has(task.name) &&
        currentTime >= task.start && currentTime <= task.end
    );
    
    // Build tooltip content
    let tooltipContent = `<strong>Time: ${Math.round(currentTime)}ms</strong>`;
    
    if (intersectingSpans.length > 0) {
        tooltipContent += '<br><br><strong>Intersecting spans:</strong><br>';
        intersectingSpans.forEach(task => {
            const timeIntoSpan = currentTime - task.start;
            const spanDuration = task.end - task.start;
            const percentThrough = spanDuration > 0 ? ((timeIntoSpan / spanDuration) * 100).toFixed(1) : '0.0';
            const remainingTime = task.end - currentTime;
            
            tooltipContent += `<br>${task.name}:<br>`;
            tooltipContent += `  • ${Math.round(timeIntoSpan)}ms into span (${percentThrough}%)<br>`;
            tooltipContent += `  • ${Math.round(remainingTime)}ms remaining<br>`;
            tooltipContent += `  • Start: ${task.start}ms, End: ${task.end}ms`;
        });
    } else {
        tooltipContent += '<br><br>No spans at this time';
    }
    
    // Only show tooltip if enabled
    if (trackHoverTooltipEnabled) {
        showTooltip(e, tooltipContent);
    }
}

function hideTimelineIndicator() {
    const indicator = document.getElementById('timeline-indicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
    hideTooltip();
}

function handleDragSelection(e, container, displayMinTime, displayDuration) {
    const selectionRect = document.getElementById('selection-rect');
    if (!selectionRect) return;
    
    const containerRect = container.getBoundingClientRect();
    const labelWidth = getLabelAreaWidth();
    const containerPadding = 20;
    
    const startX = Math.min(dragState.startX, e.clientX);
    const endX = Math.max(dragState.startX, e.clientX);
    const startY = Math.min(dragState.startY, e.clientY);
    const endY = Math.max(dragState.startY, e.clientY);
    
    // Only show selection if in track area
    const tracks = container.querySelectorAll('.timeline-track');
    if (tracks.length === 0) return;
    const firstTrack = tracks[0];
    const trackRect = firstTrack.getBoundingClientRect();
    const trackLeft = containerRect.left + labelWidth + containerPadding;
    const trackRight = trackLeft + trackRect.width;
    
    if (endX < trackLeft || startX > trackRight) {
        hideSelectionRect();
        return;
    }
    
    // Clamp to track area
    const clampedStartX = Math.max(startX, trackLeft);
    const clampedEndX = Math.min(endX, trackRight);
    
    // Position selection rectangle
    const left = clampedStartX - containerRect.left;
    const width = clampedEndX - clampedStartX;
    
    const rows = container.querySelectorAll('.timeline-row');
    if (rows.length > 0) {
        const firstRow = rows[0];
        const lastRow = rows[rows.length - 1];
        const top = firstRow.getBoundingClientRect().top - containerRect.top;
        const height = lastRow.getBoundingClientRect().bottom - firstRow.getBoundingClientRect().top;
        
        selectionRect.style.left = `${left}px`;
        selectionRect.style.top = `${top}px`;
        selectionRect.style.width = `${width}px`;
        selectionRect.style.height = `${height}px`;
        selectionRect.style.display = 'block';
    }
}

function finishDragSelection(e, container, displayMinTime, displayDuration) {
    const selectionRect = document.getElementById('selection-rect');
    if (!selectionRect) return;
    
    const containerRect = container.getBoundingClientRect();
    const labelWidth = getLabelAreaWidth();
    const containerPadding = 20;
    
    const startX = Math.min(dragState.startX, e.clientX);
    const endX = Math.max(dragState.startX, e.clientX);
    
    const tracks = container.querySelectorAll('.timeline-track');
    if (tracks.length === 0) {
        hideSelectionRect();
        return;
    }
    const firstTrack = tracks[0];
    const trackRect = firstTrack.getBoundingClientRect();
    const trackLeft = containerRect.left + labelWidth + containerPadding;
    const trackRight = trackLeft + trackRect.width;
    
    // Clamp to track area
    const clampedStartX = Math.max(startX, trackLeft);
    const clampedEndX = Math.min(endX, trackRight);
    
    // Calculate time range from selection
    const trackWidth = trackRect.width;
    const startPercent = (clampedStartX - trackLeft) / trackWidth;
    const endPercent = (clampedEndX - trackLeft) / trackWidth;
    
    const safeDuration = displayDuration === 0 ? 1 : displayDuration;
    const newMinTime = displayMinTime + (startPercent * safeDuration);
    const newMaxTime = displayMinTime + (endPercent * safeDuration);
    
    // Only zoom if selection is meaningful (at least 1% of track width)
    if (Math.abs(endPercent - startPercent) > 0.01) {
        zoomState.minTime = newMinTime;
        zoomState.maxTime = newMaxTime;
        renderGraph();
    }
    
    hideSelectionRect();
}

function hideSelectionRect() {
    const selectionRect = document.getElementById('selection-rect');
    if (selectionRect) {
        selectionRect.style.display = 'none';
    }
}

function resetZoom() {
    zoomState.minTime = null;
    zoomState.maxTime = null;
    renderGraph();
    // State is saved in renderGraph
}

// Label resize state
let labelResizeState = {
    isResizing: false,
    startX: 0,
    startWidth: 0
};

function setupGlobalLabelResize(resizeHandle, container) {
    resizeHandle.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const firstLabel = container.querySelector('.timeline-label');
        if (!firstLabel) return;
        
        labelResizeState.isResizing = true;
        labelResizeState.startX = e.clientX;
        labelResizeState.startWidth = firstLabel.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };
    
    const handleMouseMove = (e) => {
        if (labelResizeState.isResizing) {
            const deltaX = e.clientX - labelResizeState.startX;
            const newWidth = Math.max(100, labelResizeState.startWidth + deltaX); // Min width 100px
            
            // Resize all labels
            const allLabels = container.querySelectorAll('.timeline-label');
            allLabels.forEach(label => {
                label.style.width = `${newWidth}px`;
            });
            
            // Update resize handle position
            const containerPadding = 20;
            resizeHandle.style.left = `${newWidth + containerPadding}px`;
            
            // Update axis margin to match (label width + resize handle 6px + margin 10px)
            const axis = container.querySelector('.axis');
            if (axis) {
                axis.style.marginLeft = `${newWidth + 16}px`;
            }
        }
    };
    
    const handleMouseUp = () => {
        if (labelResizeState.isResizing) {
            labelResizeState.isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}

function toggleGaps() {
    gapsVisible = !gapsVisible;
    const gapElements = document.querySelectorAll('.timeline-gap');
    gapElements.forEach(gap => {
        gap.style.display = gapsVisible ? 'block' : 'none';
    });
    if (activeTabId !== null) {
        const tabContent = document.getElementById(`tab-content-${activeTabId}`);
        if (tabContent) {
            const toggleBtn = tabContent.querySelector('.toggle-gaps-btn');
            if (toggleBtn) {
                toggleBtn.textContent = gapsVisible ? 'Hide Gaps' : 'Show Gaps';
            }
        }
        // Save state
        saveTabState(activeTabId);
    }
}

function updateTrackOpacity(value) {
    trackOpacity = parseFloat(value);
    
    // Update the display value for current tab
    if (activeTabId !== null) {
        const tabContent = document.getElementById(`tab-content-${activeTabId}`);
        if (tabContent) {
            const opacityValueDisplay = tabContent.querySelector('.track-opacity-value');
            if (opacityValueDisplay) {
                opacityValueDisplay.textContent = Math.round(trackOpacity * 100) + '%';
            }
        }
    }
    
    // Update all existing tracks in current tab
    if (activeTabId !== null) {
        const tabContent = document.getElementById(`tab-content-${activeTabId}`);
        if (tabContent) {
            const tracks = tabContent.querySelectorAll('.timeline-track');
            tracks.forEach(track => {
        const currentBg = track.style.backgroundColor;
        // Extract hue from current background color
        if (currentBg && currentBg.startsWith('hsla')) {
            // Parse hsla(hue, saturation, lightness, opacity)
            const match = currentBg.match(/hsla\((\d+),\s*([\d.]+)%,\s*([\d.]+)%,\s*([\d.]+)\)/);
            if (match) {
                const hue = match[1];
                const saturation = match[2];
                const lightness = match[3];
                track.style.backgroundColor = `hsla(${hue}, ${saturation}%, ${lightness}%, ${trackOpacity})`;
            }
        }
            });
        }
        // Save state after updating opacity
        if (activeTabId !== null) {
            saveTabState(activeTabId);
        }
    }
}

function toggleTrackHoverTooltip() {
    trackHoverTooltipEnabled = !trackHoverTooltipEnabled;
    
    // Update button text for current tab
    if (activeTabId !== null) {
        const tabContent = document.getElementById(`tab-content-${activeTabId}`);
        if (tabContent) {
            const toggleBtn = tabContent.querySelector('.toggle-track-tooltip-btn');
            if (toggleBtn) {
                toggleBtn.textContent = trackHoverTooltipEnabled ? 'Hide Track Tooltip' : 'Show Track Tooltip';
            }
        }
        // Hide tooltip if disabling
        if (!trackHoverTooltipEnabled) {
            hideTooltip();
        }
        // Save state
        saveTabState(activeTabId);
    }
}

// Initialize tabs when page loads
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
});
