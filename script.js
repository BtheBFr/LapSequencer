// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
const state = {
    isPlaying: false,
    bpm: 128,
    currentStep: 0,
    currentPattern: 0,
    channels: [],
    patterns: [
        { id: 0, name: 'Pattern 1', channels: [] },
        { id: 1, name: 'Pattern 2', channels: [] },
        { id: 2, name: 'Pattern 3', channels: [] },
        { id: 3, name: 'Pattern 4', channels: [] }
    ],
    metronome: {
        enabled: false,
        volume: 0.5,
        sound: null
    },
    audioContext: null,
    masterVolume: 1.0,
    sequencerInterval: null,
    draggedSound: null,
    selectedChannels: new Set(),
    shiftPressed: false
};

// Звуки, загруженные из GitHub
let loadedSounds = {};
let synth = null;

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Lap Sequencer v3.0.26 starting...');
    
    await initAudio();
    initUI();
    await loadSoundsFromGitHub();
    setupEventListeners();
    setupDragAndDrop();
    generatePatterns();
    updateChannelCount();
    
    // Загрузка из LocalStorage
    loadFromStorage();
    
    console.log('✅ Lap Sequencer ready!');
});

// ===== АУДИО СИСТЕМА =====
async function initAudio() {
    try {
        // Инициализация Tone.js
        await Tone.start();
        
        // Создание мастер-выхода
        state.masterVolume = new Tone.Volume(0).toDestination();
        
        // Создание метронома
        state.metronome.sound = new Tone.Player({
            url: generateClickSound(),
            volume: -12
        }).connect(state.masterVolume);
        
        // Инициализация синтезатора 3xOSC
        init3xOSC();
        
        // Инициализация FL Keys
        initFLKeys();
        
        console.log('🎵 Audio system initialized');
    } catch (error) {
        console.error('Audio init error:', error);
        showNotification('⚠️ Audio system error - some features may not work', 'warning');
    }
}

function generateClickSound() {
    // Генерация звука клика для метронома
    const duration = 0.1;
    const sampleRate = 44100;
    const length = sampleRate * duration;
    const buffer = new Float32Array(length);
    
    for (let i = 0; i < length; i++) {
        buffer[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.01));
    }
    
    return buffer;
}

function init3xOSC() {
    // Создание синтезатора 3xOSC
    synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: {
            type: 'sawtooth'
        },
        envelope: {
            attack: 0.01,
            decay: 0.1,
            sustain: 0.5,
            release: 0.5
        }
    }).connect(state.masterVolume);
}

function initFLKeys() {
    // Инициализация пианино (используем тот же синтезатор для простоты)
    window.flKeys = synth;
}

// ===== ЗАГРУЗКА ЗВУКОВ ИЗ GITHUB =====
async function loadSoundsFromGitHub() {
    const soundList = document.getElementById('soundList');
    soundList.innerHTML = '<div class="loading-sounds"><i class="fas fa-spinner fa-spin"></i> Scanning GitHub repository for sounds...</div>';
    
    try {
        // URL твоего репозитория
        const repoUrl = 'https://api.github.com/repos/BtheBFr/LapSequencer/contents/sounds';
        
        console.log('📂 Fetching sounds from:', repoUrl);
        
        // Пытаемся получить содержимое папки sounds
        const response = await fetch(repoUrl);
        
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status}`);
        }
        
        const contents = await response.json();
        
        // Фильтруем только папки
        const folders = contents.filter(item => item.type === 'dir');
        
        if (folders.length === 0) {
            soundList.innerHTML = `
                <div class="no-sounds">
                    <i class="fas fa-folder-open"></i>
                    <h3>No sound folders found</h3>
                    <p>Create a "sounds" folder in your GitHub repository with subfolders like KICK/, CLAP/, etc.</p>
                    <p>Upload your WAV files to GitHub in the correct folders.</p>
                </div>
            `;
            return;
        }
        
        // Очищаем список
        soundList.innerHTML = '';
        
        // Для каждой папки создаем секцию
        for (const folder of folders) {
            await loadSoundsFromFolder(folder.name, folder.url);
        }
        
        updateSoundCount();
        
    } catch (error) {
        console.error('Error loading sounds:', error);
        
        // Fallback: демо структура
        soundList.innerHTML = `
            <div class="error-loading">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Cannot load from GitHub API</h3>
                <p>Make sure your repository structure is:</p>
                <pre style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 6px;">
LapSequencer/
└── sounds/
    ├── KICK/
    ├── CLAP/
    ├── SNARE/
    └── HAT/</pre>
                <p>Upload WAV files to these folders on GitHub.</p>
            </div>
        `;
    }
}

async function loadSoundsFromFolder(folderName, folderUrl) {
    const soundList = document.getElementById('soundList');
    
    try {
        const response = await fetch(folderUrl);
        const files = await response.json();
        
        // Фильтруем только WAV файлы
        const wavFiles = files.filter(file => 
            file.type === 'file' && 
            (file.name.toLowerCase().endsWith('.wav') || 
             file.name.toLowerCase().endsWith('.mp3'))
        );
        
        if (wavFiles.length === 0) return;
        
        // Создаем секцию для папки
        const folderSection = document.createElement('div');
        folderSection.className = 'folder-item';
        folderSection.innerHTML = `
            <div class="folder-header" onclick="toggleFolder(this)">
                <div>
                    <i class="fas fa-folder"></i>
                    <span>${folderName.toUpperCase()}</span>
                    <span class="file-count">(${wavFiles.length} files)</span>
                </div>
                <i class="fas fa-chevron-down"></i>
            </div>
            <div class="sound-items">
                ${wavFiles.map(file => `
                    <div class="sound-item" draggable="true" 
                         data-sound="${file.name}"
                         data-path="${folderName}/${file.name}"
                         data-url="${file.download_url}"
                         ondragstart="dragSound(event)">
                        <i class="fas fa-music sound-icon"></i>
                        <span class="sound-name">${file.name}</span>
                        <span class="sound-size">${formatFileSize(file.size)}</span>
                    </div>
                `).join('')}
            </div>
        `;
        
        soundList.appendChild(folderSection);
        
        // Сохраняем информацию о звуках
        wavFiles.forEach(file => {
            const soundKey = `${folderName}/${file.name}`;
            loadedSounds[soundKey] = {
                name: file.name,
                path: soundKey,
                url: file.download_url,
                folder: folderName,
                size: file.size
            };
        });
        
    } catch (error) {
        console.error(`Error loading folder ${folderName}:`, error);
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function toggleFolder(element) {
    const items = element.parentElement.querySelector('.sound-items');
    const icon = element.querySelector('.fa-chevron-down');
    
    if (items.style.display === 'block') {
        items.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
    } else {
        items.style.display = 'block';
        icon.style.transform = 'rotate(180deg)';
    }
}

// ===== DRAG & DROP =====
function dragSound(event) {
    const soundItem = event.target.closest('.sound-item');
    if (!soundItem) return;
    
    const soundData = {
        name: soundItem.querySelector('.sound-name').textContent,
        path: soundItem.dataset.path,
        url: soundItem.dataset.url
    };
    
    event.dataTransfer.setData('application/json', JSON.stringify(soundData));
    event.dataTransfer.effectAllowed = 'copy';
    
    state.draggedSound = soundData;
}

function setupDragAndDrop() {
    const channelRack = document.getElementById('channelRack');
    
    // Разрешаем дроп
    channelRack.addEventListener('dragover', (e) => {
        e.preventDefault();
        channelRack.classList.add('drag-over');
    });
    
    channelRack.addEventListener('dragleave', () => {
        channelRack.classList.remove('drag-over');
    });
    
    channelRack.addEventListener('drop', async (e) => {
        e.preventDefault();
        channelRack.classList.remove('drag-over');
        
        try {
            const soundData = JSON.parse(e.dataTransfer.getData('application/json'));
            
            if (soundData && soundData.path) {
                await addChannelFromSound(soundData);
                showNotification(`Added: ${soundData.name}`, 'success');
            }
        } catch (error) {
            console.error('Drop error:', error);
        }
    });
}

// ===== УПРАВЛЕНИЕ КАНАЛАМИ =====
async function addChannelFromSound(soundData) {
    const channelId = state.channels.length;
    
    // Создаем канал
    const channel = {
        id: channelId,
        name: soundData.name.replace('.wav', '').replace('.mp3', ''),
        path: soundData.path,
        url: soundData.url,
        type: 'sample',
        muted: false,
        volume: 0.8,
        pan: 0,
        steps: Array(16).fill(false),
        audioBuffer: null,
        player: null
    };
    
    // Загружаем аудио
    try {
        const audioContext = Tone.getContext();
        const response = await fetch(soundData.url);
        const arrayBuffer = await response.arrayBuffer();
        channel.audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Создаем плеер для этого звука
        channel.player = new Tone.Player(channel.audioBuffer).connect(state.masterVolume);
        
    } catch (error) {
        console.error('Error loading sound:', error);
        showNotification(`Error loading: ${soundData.name}`, 'error');
        return;
    }
    
    // Добавляем в состояние
    state.channels.push(channel);
    
    // Создаем HTML для канала
    const channelHTML = `
        <div class="channel" data-channel-id="${channelId}" onclick="selectChannel(${channelId}, event)">
            <div class="channel-mute ${channel.muted ? 'muted' : ''}" onclick="toggleMute(${channelId})">
                <i class="fas fa-volume-up"></i>
            </div>
            <div class="channel-info">
                <div class="channel-name">${channel.name}</div>
                <div class="channel-path">${soundData.path}</div>
            </div>
            <div class="step-sequencer">
                ${channel.steps.map((active, index) => `
                    <div class="step ${active ? 'active' : ''}" 
                         data-step="${index}"
                         onclick="toggleStep(${channelId}, ${index})"></div>
                `).join('')}
            </div>
            <div class="channel-controls">
                <input type="range" class="channel-slider" 
                       min="0" max="100" value="${channel.volume * 100}"
                       oninput="updateChannelVolume(${channelId}, this.value)">
                <div class="channel-delete" onclick="deleteChannel(${channelId})">
                    <i class="fas fa-times"></i>
                </div>
            </div>
        </div>
    `;
    
    // Добавляем в DOM
    const channelRack = document.getElementById('channelRack');
    const emptyMessage = channelRack.querySelector('.empty-rack');
    if (emptyMessage) {
        emptyMessage.remove();
    }
    
    channelRack.insertAdjacentHTML('beforeend', channelHTML);
    
    // Добавляем канал в микшер
    addMixerChannel(channelId, channel.name);
    
    // Обновляем счетчик
    updateChannelCount();
    
    // Сохраняем
    saveToStorage();
}

function addMixerChannel(channelId, channelName) {
    const mixerChannels = document.getElementById('mixerChannels');
    
    const mixerChannelHTML = `
        <div class="mixer-channel" data-track="${channelId}">
            <div class="mixer-channel-header">
                <div class="mixer-channel-name">${channelName}</div>
                <div class="mixer-channel-value track-volume-${channelId}">0.0 dB</div>
            </div>
            <div class="mixer-slider-container">
                <input type="range" class="mixer-slider track-slider-${channelId}"
                       min="-60" max="6" value="0" orient="vertical"
                       oninput="updateTrackVolume(${channelId}, this.value)">
            </div>
            <div class="mixer-plugins">
                <button class="mixer-plugin" onclick="openPlugin('eq', ${channelId})">EQ</button>
                <button class="mixer-plugin" onclick="openPlugin('compressor', ${channelId})">Comp</button>
            </div>
        </div>
    `;
    
    mixerChannels.insertAdjacentHTML('beforeend', mixerChannelHTML);
}

function updateChannelVolume(channelId, volume) {
    const channel = state.channels[channelId];
    if (!channel || !channel.player) return;
    
    channel.volume = volume / 100;
    channel.player.volume.value = Tone.gainToDb(channel.volume);
    
    saveToStorage();
}

function updateTrackVolume(channelId, db) {
    const channel = state.channels[channelId];
    if (!channel || !channel.player) return;
    
    channel.player.volume.value = parseFloat(db);
    
    // Обновляем отображение
    const volumeDisplay = document.querySelector(`.track-volume-${channelId}`);
    if (volumeDisplay) {
        volumeDisplay.textContent = `${db >= 0 ? '+' : ''}${db} dB`;
    }
    
    saveToStorage();
}

function toggleMute(channelId) {
    const channel = state.channels[channelId];
    if (!channel) return;
    
    channel.muted = !channel.muted;
    
    if (channel.player) {
        channel.player.mute = channel.muted;
    }
    
    // Обновляем иконку
    const muteIcon = document.querySelector(`[data-channel-id="${channelId}"] .channel-mute`);
    if (muteIcon) {
        muteIcon.classList.toggle('muted');
        muteIcon.querySelector('i').className = channel.muted ? 
            'fas fa-volume-mute' : 'fas fa-volume-up';
    }
    
    saveToStorage();
}

function toggleStep(channelId, stepIndex) {
    const channel = state.channels[channelId];
    if (!channel) return;
    
    // Если зажат Shift, копируем отрывок
    if (state.shiftPressed) {
        copyPatternSegment(channelId, stepIndex);
        return;
    }
    
    // Обычное переключение шага
    channel.steps[stepIndex] = !channel.steps[stepIndex];
    
    // Обновляем визуально
    const stepElement = document.querySelector(
        `[data-channel-id="${channelId}"] [data-step="${stepIndex}"]`
    );
    if (stepElement) {
        stepElement.classList.toggle('active');
    }
    
    saveToStorage();
}

function copyPatternSegment(channelId, startStep) {
    const channel = state.channels[channelId];
    if (!channel) return;
    
    // Копируем 4 шага
    const segment = channel.steps.slice(startStep, startStep + 4);
    
    // Вставляем через 4 шага
    for (let i = 0; i < 4; i++) {
        const targetStep = startStep + 4 + i;
        if (targetStep < 16) {
            channel.steps[targetStep] = segment[i];
            
            // Обновляем визуально
            const stepElement = document.querySelector(
                `[data-channel-id="${channelId}"] [data-step="${targetStep}"]`
            );
            if (stepElement) {
                stepElement.classList.toggle('active', segment[i]);
            }
        }
    }
    
    showNotification(`Pattern copied (Shift+Click)`, 'info');
    saveToStorage();
}

function selectChannel(channelId, event) {
    if (event.ctrlKey || event.metaKey) {
        // Multi-select
        state.selectedChannels.has(channelId) ? 
            state.selectedChannels.delete(channelId) : 
            state.selectedChannels.add(channelId);
    } else {
        // Single select
        state.selectedChannels.clear();
        state.selectedChannels.add(channelId);
    }
    
    // Обновляем визуальное выделение
    document.querySelectorAll('.channel').forEach(ch => {
        const id = parseInt(ch.dataset.channelId);
        ch.classList.toggle('selected', state.selectedChannels.has(id));
    });
}

function deleteChannel(channelId) {
    if (!confirm('Delete this channel?')) return;
    
    // Удаляем из состояния
    const channelIndex = state.channels.findIndex(c => c.id === channelId);
    if (channelIndex !== -1) {
        // Останавливаем и очищаем аудио
        const channel = state.channels[channelIndex];
        if (channel.player) {
            channel.player.dispose();
        }
        
        state.channels.splice(channelIndex, 1);
    }
    
    // Удаляем из DOM
    const channelElement = document.querySelector(`[data-channel-id="${channelId}"]`);
    if (channelElement) {
        channelElement.remove();
    }
    
    // Удаляем из микшера
    const mixerChannel = document.querySelector(`.mixer-channel[data-track="${channelId}"]`);
    if (mixerChannel) {
        mixerChannel.remove();
    }
    
    // Переиндексируем оставшиеся каналы
    state.channels.forEach((channel, index) => {
        channel.id = index;
        
        const channelElement = document.querySelector(`[data-channel-id="${channel.id}"]`);
        if (channelElement) {
            channelElement.dataset.channelId = index;
            channelElement.querySelector('.channel-info .channel-name').textContent = channel.name;
        }
    });
    
    updateChannelCount();
    saveToStorage();
    
    showNotification('Channel deleted', 'info');
}

function clearRack() {
    if (!confirm('Clear ALL channels?')) return;
    
    // Очищаем все каналы
    state.channels.forEach(channel => {
        if (channel.player) {
            channel.player.dispose();
        }
    });
    
    state.channels = [];
    state.selectedChannels.clear();
    
    // Очищаем DOM
    const channelRack = document.getElementById('channelRack');
    channelRack.innerHTML = `
        <div class="empty-rack" style="text-align: center; padding: 40px; color: #666;">
            <i class="fas fa-sliders-h" style="font-size: 48px; margin-bottom: 20px; display: block;"></i>
            Drag & drop sounds here or add instruments
        </div>
    `;
    
    // Очищаем микшер
    const mixerChannels = document.getElementById('mixerChannels');
    mixerChannels.innerHTML = '';
    
    updateChannelCount();
    saveToStorage();
    
    showNotification('All channels cleared', 'info');
}

function updateChannelCount() {
    const count = state.channels.length;
    document.getElementById('channelCount').textContent = `(${count} channels)`;
    document.getElementById('activeChannels').textContent = `Channels: ${count}`;
}

// ===== СЕКВЕНСОР И ВОСПРОИЗВЕДЕНИЕ =====
function togglePlay() {
    state.isPlaying = !state.isPlaying;
    const playBtn = document.getElementById('playBtn');
    
    if (state.isPlaying) {
        playBtn.innerHTML = '<i class="fas fa-pause"></i>';
        playBtn.classList.add('playing');
        startSequencer();
    } else {
        playBtn.innerHTML = '<i class="fas fa-play"></i>';
        playBtn.classList.remove('playing');
        stopSequencer();
    }
    
    saveToStorage();
}

function startSequencer() {
    stopSequencer(); // Останавливаем предыдущий
    
    const stepTime = 60000 / state.bpm / 4; // 16-е ноты
    
    state.currentStep = 0;
    
    state.sequencerInterval = setInterval(() => {
        playCurrentStep();
        updateStepVisualization();
        state.currentStep = (state.currentStep + 1) % 16;
    }, stepTime);
}

function stopSequencer() {
    if (state.sequencerInterval) {
        clearInterval(state.sequencerInterval);
        state.sequencerInterval = null;
    }
    
    // Сбрасываем визуализацию
    document.querySelectorAll('.step.active-step').forEach(step => {
        step.classList.remove('active-step');
    });
}

function playCurrentStep() {
    // Играем метроном
    if (state.metronome.enabled) {
        playMetronome();
    }
    
    // Играем активные шаги для каждого канала
    state.channels.forEach(channel => {
        if (!channel.muted && channel.steps[state.currentStep] && channel.player) {
            playChannelSound(channel);
        }
    });
}

function playChannelSound(channel) {
    if (!channel.player || !channel.audioBuffer) return;
    
    try {
        // Перезапускаем плеер если он уже играет
        if (channel.player.state === 'started') {
            channel.player.stop();
        }
        
        channel.player.start();
    } catch (error) {
        console.error('Error playing sound:', error);
    }
}

function playMetronome() {
    if (!state.metronome.sound) return;
    
    try {
        state.metronome.sound.start();
    } catch (error) {
        console.error('Metronome error:', error);
    }
}

function updateStepVisualization() {
    // Убираем подсветку с предыдущего шага
    document.querySelectorAll('.step.active-step').forEach(step => {
        step.classList.remove('active-step');
    });
    
    // Подсвечиваем текущий шаг
    document.querySelectorAll(`.step[data-step="${state.currentStep}"]`).forEach(step => {
        step.classList.add('active-step');
    });
}

// ===== МЕТРОНОМ =====
function toggleMetronome() {
    state.metronome.enabled = !state.metronome.enabled;
    
    const metroBtn = document.getElementById('metronomeBtn');
    metroBtn.classList.toggle('active', state.metronome.enabled);
    
    if (state.metronome.sound) {
        state.metronome.sound.volume.value = Tone.gainToDb(state.metronome.volume);
    }
    
    saveToStorage();
    showNotification(`Metronome ${state.metronome.enabled ? 'ON' : 'OFF'}`, 'info');
}

function updateMetroVolume(value) {
    state.metronome.volume = value / 100;
    
    if (state.metronome.sound) {
        state.metronome.sound.volume.value = Tone.gainToDb(state.metronome.volume);
    }
    
    saveToStorage();
}

// ===== ПАТТЕРНЫ =====
function generatePatterns() {
    const patternList = document.getElementById('patternList');
    
    state.patterns.forEach((pattern, index) => {
        const patternBtn = document.createElement('button');
        patternBtn.className = `pattern-btn ${index === state.currentPattern ? 'active' : ''}`;
        patternBtn.innerHTML = `<i class="fas fa-layer-group"></i> ${pattern.name}`;
        patternBtn.onclick = () => switchPattern(index);
        
        patternList.appendChild(patternBtn);
    });
}

function switchPattern(patternId) {
    state.currentPattern = patternId;
    
    // Обновляем активную кнопку
    document.querySelectorAll('.pattern-btn').forEach((btn, index) => {
        btn.classList.toggle('active', index === patternId);
    });
    
    // TODO: Загружать состояние каналов для этого паттерна
    
    showNotification(`Switched to ${state.patterns[patternId].name}`, 'info');
    saveToStorage();
}

function addPattern() {
    const newPatternId = state.patterns.length;
    const newPattern = {
        id: newPatternId,
        name: `Pattern ${newPatternId + 1}`,
        channels: []
    };
    
    state.patterns.push(newPattern);
    
    // Добавляем кнопку
    const patternList = document.getElementById('patternList');
    const patternBtn = document.createElement('button');
    patternBtn.className = 'pattern-btn';
    patternBtn.innerHTML = `<i class="fas fa-layer-group"></i> ${newPattern.name}`;
    patternBtn.onclick = () => switchPattern(newPatternId);
    
    patternList.appendChild(patternBtn);
    
    showNotification(`Added ${newPattern.name}`, 'success');
    saveToStorage();
}

// ===== ПЛАГИНЫ =====
function openPlugin(pluginName, channelId = null) {
    const overlay = document.getElementById('pluginOverlay');
    const pluginWindow = document.getElementById(`plugin${pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}`);
    
    if (!pluginWindow) {
        console.error(`Plugin ${pluginName} not found`);
        return;
    }
    
    // Скрываем все плагины
    document.querySelectorAll('.plugin-window').forEach(plugin => {
        plugin.style.display = 'none';
    });
    
    // Показываем выбранный плагин
    pluginWindow.style.display = 'block';
    overlay.style.display = 'flex';
    
    // Обновляем активную вкладку
    document.querySelectorAll('.plugin-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.plugin === pluginName);
    });
    
    // Если передан channelId, применяем плагин к этому каналу
    if (channelId !== null) {
        console.log(`Opening ${pluginName} for channel ${channelId}`);
    }
}

function closePlugin() {
    document.getElementById('pluginOverlay').style.display = 'none';
}

function testSynth() {
    if (!synth) return;
    
    synth.triggerAttackRelease('C4', '8n');
    showNotification('Testing 3xOSC synth', 'info');
}

function resetEQ() {
    document.querySelectorAll('.eq-slider').forEach(slider => {
        slider.value = 0;
    });
    showNotification('EQ reset to flat', 'info');
}

// ===== ПИАНО РОЛЛ =====
function openPianoRoll() {
    document.getElementById('pianoRollOverlay').style.display = 'block';
    
    // TODO: Инициализация пиано ролла
    const pianoRollContent = document.getElementById('pianoRollContent');
    pianoRollContent.innerHTML = `
        <div style="padding: 20px;">
            <h3 style="color: var(--primary); margin-bottom: 20px;">Piano Roll Editor</h3>
            <p style="color: #888; margin-bottom: 20px;">Draw MIDI notes on the grid below.</p>
            
            <div style="background: #222233; border-radius: 8px; padding: 20px; min-height: 400px;">
                <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                    <button style="background: var(--primary); color: black; border: none; padding: 8px 15px; border-radius: 6px; cursor: pointer;">
                        <i class="fas fa-pencil-alt"></i> Draw Tool
                    </button>
                    <button style="background: rgba(60,60,90,0.7); color: white; border: none; padding: 8px 15px; border-radius: 6px; cursor: pointer;">
                        <i class="fas fa-mouse-pointer"></i> Select Tool
                    </button>
                    <button style="background: rgba(60,60,90,0.7); color: white; border: none; padding: 8px 15px; border-radius: 6px; cursor: pointer;">
                        <i class="fas fa-eraser"></i> Eraser
                    </button>
                </div>
                
                <div style="background: #1a1a2a; border-radius: 6px; padding: 10px; min-height: 300px; display: flex; align-items: center; justify-content: center; color: #666;">
                    Piano Roll Grid - Coming Soon
                </div>
            </div>
        </div>
    `;
}

function closePianoRoll() {
    document.getElementById('pianoRollOverlay').style.display = 'none';
}

// ===== ЛОКАЛЬНОЕ ХРАНИЛИЩЕ =====
function saveToStorage() {
    try {
        const saveData = {
            version: '3.0.26',
            timestamp: new Date().toISOString(),
            bpm: state.bpm,
            currentPattern: state.currentPattern,
            channels: state.channels.map(channel => ({
                name: channel.name,
                path: channel.path,
                url: channel.url,
                type: channel.type,
                muted: channel.muted,
                volume: channel.volume,
                steps: channel.steps
            })),
            patterns: state.patterns,
            metronome: state.metronome
        };
        
        localStorage.setItem('lapSequencerProject', JSON.stringify(saveData));
        
        // Обновляем время сохранения
        const lastSaved = document.getElementById('lastSaved');
        if (lastSaved) {
            const now = new Date();
            lastSaved.textContent = `Saved ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        }
        
    } catch (error) {
        console.error('Save error:', error);
    }
}

function loadFromStorage() {
    try {
        const saved = localStorage.getItem('lapSequencerProject');
        if (!saved) return;
        
        const data = JSON.parse(saved);
        
        // Загружаем BPM
        if (data.bpm) {
            state.bpm = data.bpm;
            document.getElementById('bpmValue').textContent = state.bpm;
            document.getElementById('bpmSlider').value = state.bpm;
        }
        
        // Загружаем метроном
        if (data.metronome) {
            state.metronome = data.metronome;
            document.getElementById('metronomeBtn').classList.toggle('active', state.metronome.enabled);
            document.getElementById('metroVolume').value = state.metronome.volume * 100;
        }
        
        // TODO: Загружать каналы и паттерны
        
        console.log('Loaded from storage');
        
    } catch (error) {
        console.error('Load error:', error);
    }
}

// ===== ИНТЕРФЕЙС И УВЕДОМЛЕНИЯ =====
function showNotification(message, type = 'info') {
    // Создаем уведомление
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        bottom: 80px;
        right: 20px;
        background: ${type === 'error' ? 'var(--red)' : 
                     type === 'warning' ? 'var(--accent)' : 
                     type === 'success' ? 'var(--primary)' : 'var(--secondary)'};
        color: ${type === 'success' ? 'black' : 'white'};
        padding: 12px 20px;
        border-radius: 8px;
        z-index: 10000;
        font-weight: 500;
        animation: slideInRight 0.3s ease;
        box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        max-width: 300px;
        word-wrap: break-word;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <i class="fas fa-${type === 'error' ? 'exclamation-circle' : 
                           type === 'warning' ? 'exclamation-triangle' : 
                           type === 'success' ? 'check-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Удаляем через 3 секунды
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ===== ОБРАБОТЧИКИ СОБЫТИЙ =====
function initUI() {
    // BPM слайдер
    const bpmSlider = document.getElementById('bpmSlider');
    const bpmValue = document.getElementById('bpmValue');
    
    bpmSlider.addEventListener('input', function() {
        state.bpm = parseInt(this.value);
        bpmValue.textContent = state.bpm;
        
        if (state.isPlaying) {
            stopSequencer();
            startSequencer();
        }
        
        saveToStorage();
    });
    
    // Метроном
    document.getElementById('metronomeBtn').addEventListener('click', toggleMetronome);
    document.getElementById('metroVolume').addEventListener('input', function() {
        updateMetroVolume(this.value);
    });
    
    // Кнопки управления
    document.getElementById('playBtn').addEventListener('click', togglePlay);
    document.getElementById('recordBtn').addEventListener('click', function() {
        this.classList.toggle('recording');
        showNotification(this.classList.contains('recording') ? 'Recording ON' : 'Recording OFF', 'info');
    });
    
    document.getElementById('clearRackBtn').addEventListener('click', clearRack);
    document.getElementById('addPatternBtn').addEventListener('click', addPattern);
    document.getElementById('refreshBtn').addEventListener('click', loadSoundsFromGitHub);
    
    // Поиск
    document.getElementById('searchInput').addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        
        document.querySelectorAll('.sound-item').forEach(item => {
            const soundName = item.querySelector('.sound-name').textContent.toLowerCase();
            item.style.display = soundName.includes(searchTerm) ? 'flex' : 'none';
        });
    });
    
    // Горячие клавиши
    document.addEventListener('keydown', function(e) {
        // Пробел - play/pause
        if (e.code === 'Space' && !e.target.matches('input, textarea')) {
            e.preventDefault();
            togglePlay();
        }
        
        // Ctrl+S - сохранить
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
            e.preventDefault();
            saveToStorage();
            showNotification('Project saved', 'success');
        }
        
        // Ctrl+O - загрузить
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyO') {
            e.preventDefault();
            loadFromStorage();
            showNotification('Project loaded', 'info');
        }
        
        // R - запись
        if (e.code === 'KeyR' && !e.target.matches('input, textarea')) {
            e.preventDefault();
            document.getElementById('recordBtn').click();
        }
        
        // L - цикл
        if (e.code === 'KeyL' && !e.target.matches('input, textarea')) {
            e.preventDefault();
            const loopBtn = document.getElementById('loopBtn');
            loopBtn.classList.toggle('active');
            showNotification(`Loop ${loopBtn.classList.contains('active') ? 'ON' : 'OFF'}`, 'info');
        }
        
        // Shift для копирования паттернов
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
            state.shiftPressed = true;
        }
        
        // Delete для удаления выбранных каналов
        if (e.code === 'Delete' && state.selectedChannels.size > 0) {
            e.preventDefault();
            state.selectedChannels.forEach(channelId => {
                deleteChannel(channelId);
            });
            state.selectedChannels.clear();
        }
    });
    
    document.addEventListener('keyup', function(e) {
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
            state.shiftPressed = false;
        }
    });
    
    // Автосохранение каждые 30 секунд
    setInterval(saveToStorage, 30000);
    
    // Обновление CPU (симуляция)
    setInterval(() => {
        const cpuUsage = document.getElementById('cpuUsage');
        if (cpuUsage) {
            const usage = Math.min(100, state.channels.length * 3 + (state.isPlaying ? 10 : 0));
            cpuUsage.textContent = `CPU: ${usage}%`;
        }
    }, 5000);
}

// ===== СИНТЕЗАТОР И ИНСТРУМЕНТЫ =====
function addSynthChannel() {
    const channelId = state.channels.length;
    
    const channel = {
        id: channelId,
        name: `3xOSC ${channelId + 1}`,
        type: 'synth',
        synthType: '3xosc',
        muted: false,
        volume: 0.7,
        steps: Array(16).fill(false),
        notes: Array(16).fill(null)
    };
    
    state.channels.push(channel);
    
    // Создаем HTML для синтезатора
    const channelHTML = `
        <div class="channel" data-channel-id="${channelId}" onclick="selectChannel(${channelId}, event)">
            <div class="channel-mute" onclick="toggleMute(${channelId})">
                <i class="fas fa-volume-up"></i>
            </div>
            <div class="channel-info">
                <div class="channel-name">${channel.name}</div>
                <div class="channel-path">3xOSC Synthesizer</div>
            </div>
            <div class="step-sequencer">
                ${channel.steps.map((active, index) => `
                    <div class="step ${active ? 'active' : ''}" 
                         data-step="${index}"
                         onclick="toggleStep(${channelId}, ${index})"></div>
                `).join('')}
            </div>
            <div class="channel-controls">
                <input type="range" class="channel-slider" 
                       min="0" max="100" value="${channel.volume * 100}"
                       oninput="updateChannelVolume(${channelId}, this.value)">
                <button class="plugin-btn" onclick="openPianoRollForChannel(${channelId})" style="background: var(--secondary); color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px;">
                    <i class="fas fa-music"></i> Piano Roll
                </button>
                <div class="channel-delete" onclick="deleteChannel(${channelId})">
                    <i class="fas fa-times"></i>
                </div>
            </div>
        </div>
    `;
    
    // Добавляем в DOM
    const channelRack = document.getElementById('channelRack');
    const emptyMessage = channelRack.querySelector('.empty-rack');
    if (emptyMessage) {
        emptyMessage.remove();
    }
    
    channelRack.insertAdjacentHTML('beforeend', channelHTML);
    
    // Добавляем в микшер
    addMixerChannel(channelId, channel.name);
    
    updateChannelCount();
    saveToStorage();
    
    showNotification(`Added ${channel.name}`, 'success');
}

function openPianoRollForChannel(channelId) {
    openPianoRoll();
    
    // TODO: Загрузить ноты этого канала в пиано ролл
    console.log(`Opening piano roll for channel ${channelId}`);
}

function updateSoundCount() {
    const totalSounds = Object.keys(loadedSounds).length;
    document.getElementById('soundCount').textContent = `${totalSounds} sounds loaded`;
}

// Инициализация кнопок добавления инструментов
document.addEventListener('DOMContentLoaded', function() {
    // Эта часть выполнится после загрузки DOM
    setTimeout(() => {
        const addSynthBtn = document.getElementById('addSynthBtn');
        const addDrumBtn = document.getElementById('addDrumBtn');
        
        if (addSynthBtn) {
            addSynthBtn.addEventListener('click', addSynthChannel);
        }
        
        if (addDrumBtn) {
            addDrumBtn.addEventListener('click', function() {
                showNotification('Drag & drop drum sounds from the browser', 'info');
            });
        }
    }, 1000);
});

// Добавляем CSS для анимаций
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    
    .notification {
        animation: slideInRight 0.3s ease;
    }
    
    .notification-exit {
        animation: slideOutRight 0.3s ease;
    }
    
    .fa-spinner {
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .loading-sounds {
        text-align: center;
        padding: 40px;
        color: #8a8aff;
    }
    
    .no-sounds, .error-loading {
        text-align: center;
        padding: 30px;
        color: #8a8aff;
    }
    
    .no-sounds i, .error-loading i {
        font-size: 48px;
        margin-bottom: 20px;
        display: block;
        color: var(--secondary);
    }
    
    .file-count {
        color: #888;
        font-size: 11px;
        margin-left: 8px;
    }
    
    .sound-size {
        margin-left: auto;
        color: #666;
        font-size: 10px;
    }
`;
document.head.appendChild(style);

console.log('🎹 Lap Sequencer v3.0.26 - Ready to create music!');
