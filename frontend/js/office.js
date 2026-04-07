/**
 * Pixel Office - Phaser.js Scene
 * 
 * Renders the pixel office with animated agent characters.
 */

// Get the base path from the meta tag or fallback to /pixel-office/
const baseElement = document.getElementById('base-path');
const BASE_PATH = baseElement ? baseElement.getAttribute('href') : '/pixel-office/';

// Ensure base path ends with /
const NORMALIZED_BASE = BASE_PATH.endsWith('/') ? BASE_PATH : BASE_PATH + '/';

// WebSocket connection
let ws = null;
let reconnectTimer = null;

// Agent data
let agents = {};
let agent_sprites = {};

// Phaser config
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    backgroundColor: '#1a1a2e',
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

// Start the game
const game = new Phaser.Game(config);

function preload() {
    // Load assets if available
    // For now using colored shapes as placeholders
    this.load.on('complete', () => {
        console.log('Assets loaded');
    });
}

function create() {
    // Create office background
    this.add.rectangle(400, 300, 780, 580, 0x2a2a4a);
    
    // Draw desk outlines - arranged in an office layout
    const desks = [
        { x: 400, y: 200, agent: 'cortex', name: 'Cortex' },
        { x: 200, y: 150, agent: 'scout', name: 'Scout' },
        { x: 600, y: 150, agent: 'builder', name: 'Builder' },
        { x: 200, y: 350, agent: 'architect', name: 'Architect' },
        { x: 600, y: 350, agent: 'quick', name: 'Quick' },
        { x: 400, y: 450, agent: 'analyst', name: 'Analyst' }
    ];
    
    desks.forEach(desk => {
        // Desk
        this.add.rectangle(desk.x, desk.y, 60, 40, 0x4a4a6a);
        this.add.rectangle(desk.x, desk.y, 56, 36, 0x3a3a5a);
        
        // Chair
        this.add.rectangle(desk.x, desk.y + 30, 30, 20, 0x2a2a3a);
        
        // Agent name label
        this.add.text(desk.x, desk.y - 35, desk.name, {
            fontSize: '12px',
            color: '#0ff',
            fontFamily: 'Courier New'
        }).setOrigin(0.5);
        
        // Agent sprite (placeholder circle)
        const colors = {
            cortex: 0x00ffff,
            scout: 0xff9900,
            builder: 0x00ff00,
            architect: 0xff00ff,
            quick: 0xffff00,
            analyst: 0x0099ff
        };
        
        const sprite = this.add.circle(desk.x, desk.y, 12, colors[desk.agent] || 0xffffff);
        sprite.setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => showAgentInfo(desk.agent));
        
        agent_sprites[desk.agent] = {
            sprite: sprite,
            x: desk.x,
            y: desk.y,
            state: 'offline'
        };
    });
    
    // Coffee machine
    this.add.rectangle(70, 50, 50, 60, 0x8b4513);
    this.add.text(70, 80, 'COFFEE', {
        fontSize: '10px',
        color: '#fff',
        fontFamily: 'Courier New'
    }).setOrigin(0.5);
    
    // Couch
    this.add.rectangle(650, 520, 100, 40, 0x4a4a4a);
    this.add.text(650, 520, 'nap spot', {
        fontSize: '10px',
        color: '#666',
        fontFamily: 'Courier New'
    }).setOrigin(0.5);
    
    // Title
    this.add.text(400, 30, '🎮 PIXEL OFFICE', {
        fontSize: '24px',
        color: '#0ff',
        fontFamily: 'Courier New',
        fontStyle: 'bold'
    }).setOrigin(0.5);
    
    // Connect WebSocket
    connectWebSocket(this);
}

function update() {
    // Animation loop - update agent sprites based on state
    Object.keys(agent_sprites).forEach(agentId => {
        const agent = agent_sprites[agentId];
        if (agent && agent.sprite) {
            // Simple pulse animation for active agents
            if (agent.state === 'active') {
                agent.sprite.setScale(1 + Math.sin(Date.now() / 200) * 0.1);
            }
        }
    });
}

function connectWebSocket(scene) {
    // Build WebSocket URL: use current host + base path + ws
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsPath = NORMALIZED_BASE.replace(/\/$/, '') + '/ws';
    const wsUrl = wsProtocol + '//' + window.location.host + wsPath;
    
    console.log('Connecting to WebSocket:', wsUrl);
    updateConnectionStatus('connecting');
    
    // Close existing connection
    if (ws) {
        ws.close();
    }
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        updateConnectionStatus('connected');
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'init') {
                // Initial state
                agents = data.agents;
                updateAgentSprites();
            } else if (data.type === 'agent_update') {
                // Single agent update
                agents[data.agent_id] = data.state;
                updateAgentSprite(data.agent_id);
            }
        } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
        }
    };
    
    ws.onclose = () => {
        console.log('WebSocket closed');
        updateConnectionStatus('disconnected');
        // Reconnect after 3 seconds
        if (!reconnectTimer) {
            reconnectTimer = setTimeout(() => connectWebSocket(scene), 3000);
        }
    };
    
    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        updateConnectionStatus('error');
    };
}

function updateConnectionStatus(status) {
    const statusEl = document.getElementById('connection-status');
    const timestampEl = document.getElementById('timestamp');
    
    switch(status) {
        case 'connected':
            statusEl.innerHTML = '🟢 Connected';
            statusEl.className = 'connected';
            break;
        case 'disconnected':
            statusEl.innerHTML = '🔴 Disconnected';
            statusEl.className = 'disconnected';
            break;
        case 'error':
            statusEl.innerHTML = '⚠️ Error';
            statusEl.className = 'error';
            break;
        default:
            statusEl.innerHTML = '🟡 Connecting...';
            statusEl.className = '';
    }
    
    timestampEl.textContent = new Date().toLocaleTimeString();
}

function updateAgentSprites() {
    Object.keys(agents).forEach(agentId => {
        updateAgentSprite(agentId);
    });
}

function updateAgentSprite(agentId) {
    const agent = agents[agentId];
    const spriteData = agent_sprites[agentId];
    
    if (!agent || !spriteData) return;
    
    // Update state
    spriteData.state = agent.state;
    
    // Update visual based on state
    const sprite = spriteData.sprite;
    
    switch(agent.state) {
        case 'active':
            // Agent is working - show as bright
            sprite.setAlpha(1);
            break;
        case 'idle':
            // Agent is idle - slightly dimmed
            sprite.setAlpha(0.7);
            break;
        case 'thinking':
            // Agent is thinking - pulse effect
            sprite.setAlpha(0.9);
            break;
        case 'sleeping':
            // Agent is sleeping - dim
            sprite.setAlpha(0.4);
            break;
        case 'offline':
            // Agent is offline - hidden or grey
            sprite.setAlpha(0.2);
            break;
        default:
            sprite.setAlpha(1);
    }
}

function showAgentInfo(agentId) {
    const info = document.getElementById('agent-info');
    const name = document.getElementById('agent-name');
    const state = document.getElementById('agent-state');
    const task = document.getElementById('agent-task');
    
    const agentData = agents[agentId] || { state: 'offline', task: null };
    const agentNames = {
        cortex: 'Cortex 🧠',
        scout: 'Scout 🔍',
        builder: 'Builder 🛠️',
        architect: 'Architect 📐',
        quick: 'Quick ⚡',
        analyst: 'Analyst 📊'
    };
    
    name.textContent = agentNames[agentId] || agentId;
    state.textContent = `State: ${agentData.state || 'Unknown'}`;
    task.textContent = `Task: ${agentData.task || 'None'}`;
    
    info.classList.remove('hidden');
}

function closeAgentInfo() {
    document.getElementById('agent-info').classList.add('hidden');
}

// Make closeAgentInfo available globally
window.closeAgentInfo = closeAgentInfo;