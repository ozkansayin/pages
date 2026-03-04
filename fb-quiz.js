const STORAGE_KEY = 'medical_quiz_state_v2';
const DATA_URL = './fb.json?v=20260302'; // Preserve user choice

let quizData = [];
let appState = {
    answers: {},
    checked: {},
    mode: {},
    settings: {
        questionMode: 'mixed',
        evalMode: 'immediate'
    }
};

// Modal State
let pendingModalAction = null;
let cancelModalAction = null;

// Initialize
init();

async function init() {
    // Theme setup
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.getElementById('theme-btn').textContent = savedTheme === 'dark' ? '☀️' : '🌙';

    // Load Data
    try {
        const response = await fetch(DATA_URL);
        const rawData = await response.json();

        // Prepare Data (IDs based on original index)
        quizData = rawData.map((item, index) => ({
            id: index,
            term: item.term,
            definition: item.definition
        }));

        loadState();

        // Apply Order (Restore or Shuffle)
        if (appState.order && appState.order.length === quizData.length) {
            // Restore preserved order
            const dataMap = new Map(quizData.map(i => [i.id, i]));
            quizData = appState.order.map(id => dataMap.get(id)).filter(item => item);
        } else {
            // New shuffled order
            shuffleArray(quizData);
            appState.order = quizData.map(i => i.id);
            saveState();
        }

        // Set initial switch values
        updateRadioButtons('qmode', appState.settings.questionMode);
        updateRadioButtons('emode', appState.settings.evalMode);

        renderQuiz();
        updateStats();

    } catch (error) {
        console.error("Failed to load data", error);
        document.getElementById('quiz-list').innerHTML = `<div style="text-align:center; color:var(--danger)">Fehler beim Laden der Daten.<br>${error.message}</div>`;
    }
}

function updateRadioButtons(name, value) {
    const rads = document.querySelectorAll(`input[name="${name}"]`);
    rads.forEach(r => {
        if (r.value === value) r.checked = true;
    });
}

function loadState() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        const loaded = JSON.parse(stored);
        // Merge loaded state
        appState.answers = loaded.answers || {};
        appState.checked = loaded.checked || {};
        appState.mode = loaded.mode || {};
        appState.order = loaded.order || [];
        appState.settings = { ...appState.settings, ...(loaded.settings || {}) };

        // Ensure we have random modes if missing
        if (Object.keys(appState.mode).length === 0) {
            generateRandomModes();
        }
    } else {
        generateRandomModes();
        saveState();
    }
}

function generateRandomModes() {
    quizData.forEach(item => {
        appState.mode[item.id] = Math.random() > 0.5 ? 'term' : 'def';
    });
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    updateStats();
}

function resetAnswers() {
    appState.answers = {};
    appState.checked = {};
    generateRandomModes(); // Re-roll random modes for freshness in mixed mode
    saveState();
}

window.changeQuestionMode = (newMode) => {
    // Check if we need confirmation
    const hasAnswers = Object.keys(appState.answers).length > 0;
    const currentMode = appState.settings.questionMode;

    if (hasAnswers && newMode !== currentMode) {
        showModal(
            "Modus wechseln?",
            "Das Wechseln des Frage-Modus löscht alle bisherigen Antworten. Fortfahren?",
            () => {
                // Confirm
                appState.settings.questionMode = newMode;
                resetAnswers();
                renderQuiz();
                updateStats();
            },
            () => {
                // Cancel: Revert radio button
                updateRadioButtons('qmode', currentMode);
            }
        );
    } else {
        appState.settings.questionMode = newMode;
        saveState();
        renderQuiz();
    }
};

window.changeEvalMode = (val) => {
    appState.settings.evalMode = val;
    saveState();
};

function renderQuiz() {
    const container = document.getElementById('quiz-list');
    const qMode = appState.settings.questionMode;

    // Performance Note: Rendering 2000+ items at once might be heavy. 
    // If laggy, we'll need virtual scrolling. For now, strict HTML string building is fastest.

    const html = quizData.map(item => {
        // Determine display mode for this item
        let currentMode = 'term'; // Default: Show term, ask definition
        if (qMode === 'mixed') {
            currentMode = appState.mode[item.id] || 'term';
        } else if (qMode === 'definition') {
            currentMode = 'definition'; // Show definition, ask term
        } else {
            currentMode = 'term'; // Show term, ask definition
        }

        const questionText = currentMode === 'term' ? item.term : item.definition;
        const existingAnswer = appState.answers[item.id] || '';
        const isChecked = appState.checked[item.id] !== undefined;
        const isCorrect = appState.checked[item.id] === true;

        let statusClass = '';
        let icon = '';
        let feedback = '';

        if (isChecked) {
            statusClass = isCorrect ? 'correct' : 'wrong';
            icon = isCorrect ? '✅' : '❌';
            if (!isCorrect) {
                const correctAnswer = currentMode === 'term' ? item.definition : item.term;
                feedback = `<div class="feedback-msg">Richtig wäre: <b>${correctAnswer}</b></div>`;
            }
        }

        // Determine Input Placeholder
        const placeholder = currentMode === 'term' ? 'Erklärung...' : 'Begriff...';
        const questionLabel = currentMode === 'term' ? 'Begriff' : 'Erklärung';
        const answerLabel = currentMode === 'term' ? 'Erklärung eingeben' : 'Begriff eingeben';

        return `
        <div class="question-card ${statusClass}" id="card-${item.id}" data-id="${item.id}">
            <div class="question-section">
                <span class="question-label">${questionLabel}</span>
                <div class="question-text">${questionText}</div>
            </div>
            
            <div class="input-group">
                <span class="question-label">${answerLabel}</span>
                <div class="input-wrapper">
                    <textarea
                           class="answer-input" 
                           oninput="handleInput(${item.id}, this)"
                           onkeydown="handleKey(event, ${item.id})"
                           placeholder="${placeholder}"
                           rows="1"
                           autocomplete="off">${existingAnswer}</textarea>
                    <button class="btn btn-sm btn-primary" onclick="checkAnswer(${item.id})">Prüfen</button>
                </div>
                ${feedback}
            </div>

            <div class="status-icon">
                ${icon}
            </div>
        </div>
        `;
    }).join('');

    container.innerHTML = html;

    // Initial resize
    requestAnimationFrame(() => {
        document.querySelectorAll('textarea.answer-input').forEach(el => {
            autoResize(el);
        });
    });
}

function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

// --- Interaction Handlers ---

window.handleInput = (id, el) => {
    appState.answers[id] = el.value;
    autoResize(el);
    clearTimeout(window.saveTimeout);
    window.saveTimeout = setTimeout(saveState, 500);
};

window.handleKey = (event, id) => {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent submit

        const evalMode = appState.settings.evalMode;

        if (evalMode === 'immediate') {
            checkAnswer(id);
        }

        focusNext(id);
    }
};

window.checkAnswer = (id) => {
    const item = quizData.find(q => q.id === id);

    const qMode = appState.settings.questionMode;
    let currentMode = 'term';
    if (qMode === 'mixed') {
        currentMode = appState.mode[item.id] || 'term';
    } else if (qMode === 'definition') {
        currentMode = 'definition';
    } else {
        currentMode = 'term';
    }

    const userAnswer = (appState.answers[id] || '').trim();//.toLowerCase();
    const correctAnswer = (currentMode === 'term' ? item.definition : item.term);//.toLowerCase();

    const correctParts = correctAnswer.split(/[,]/).map(s => s.trim());
    const isCorrect = correctParts.every(part => part === userAnswer);

    appState.checked[id] = isCorrect;
    saveState();
    updateCardUI(id);
};

window.checkAll = () => {
    quizData.forEach(item => {
        if (appState.answers[item.id]) {
            checkAnswer(item.id);
        }
    });
    alert('Alle ausgefüllten Antworten wurden geprüft!');
};

function updateCardUI(id) {
    const card = document.getElementById(`card-${id}`);
    if (!card) return;

    const item = quizData.find(q => q.id === id);
    const qMode = appState.settings.questionMode;
    let currentMode = 'term';
    if (qMode === 'mixed') {
        currentMode = appState.mode[item.id] || 'term';
    } else if (qMode === 'definition') {
        currentMode = 'definition';
    } else {
        currentMode = 'term';
    }

    const isCorrect = appState.checked[id];

    card.classList.remove('correct', 'wrong');
    card.classList.add(isCorrect ? 'correct' : 'wrong');

    const iconDiv = card.querySelector('.status-icon');
    iconDiv.innerHTML = isCorrect ? '✅' : '❌';

    // Note: Card update doesn't strictly need to rerender input, but if we did, we'd need to re-apply textarea styles.
    // But here we are just updating classes and feedback div.

    const inputGroup = card.querySelector('.input-group');
    const oldFeedback = inputGroup.querySelector('.feedback-msg');
    if (oldFeedback) oldFeedback.remove();

    if (!isCorrect) {
        const correctTxt = currentMode === 'term' ? item.definition : item.term;
        const msg = document.createElement('div');
        msg.className = 'feedback-msg';
        msg.innerHTML = `Richtig wäre: <b>${correctTxt}</b>`;
        inputGroup.appendChild(msg);
    }
}

function focusNext(currentId) {
    const currentIndex = quizData.findIndex(q => q.id === currentId);
    if (currentIndex < quizData.length - 1) {
        const nextId = quizData[currentIndex + 1].id;
        // Note: Modified selector for textarea or input
        const nextInput = document.querySelector(`#card-${nextId} .answer-input`);
        if (nextInput) {
            nextInput.focus();
            nextInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

function updateStats() {
    const total = quizData.length;
    const answered = Object.keys(appState.answers).filter(k => appState.answers[k]).length;

    const correct = Object.values(appState.checked).filter(v => v === true).length;
    const wrong = Object.values(appState.checked).filter(v => v === false).length;

    document.getElementById('stat-progress').textContent = `${answered}/${total}`;
    document.getElementById('stat-correct').textContent = correct;
    document.getElementById('stat-wrong').textContent = wrong;
}

// --- Modal Logic ---
function showModal(title, text, onConfirm, onCancel) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-text').textContent = text;
    document.getElementById('confirm-modal').style.display = 'flex';

    pendingModalAction = onConfirm;
    cancelModalAction = onCancel;

    // Re-bind confirm button
    const btn = document.getElementById('modal-confirm-btn');
    btn.onclick = () => {
        if (pendingModalAction) pendingModalAction();
        closeModal();
    };
}

window.cancelModal = () => {
    if (cancelModalAction) cancelModalAction();
    closeModal();
};

window.closeModal = () => {
    document.getElementById('confirm-modal').style.display = 'none';
    pendingModalAction = null;
    cancelModalAction = null;
};

// --- Reset Logic ---
window.confirmReset = () => {
    showModal(
        "Wirklich neu starten?",
        "Alle deine Antworten werden gelöscht. Dies kann nicht rückgängig gemacht werden.",
        () => {
            localStorage.removeItem(STORAGE_KEY);
            location.reload();
        }
    );
};

window.performReset = () => {
    // Deprecated, logic moved to showModal callback
};

// --- Theme Toggle (Bonus) ---
window.toggleTheme = () => {
    const current = document.documentElement.getAttribute('data-theme');
    const target = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', target);
    localStorage.setItem('theme', target);
    document.getElementById('theme-btn').textContent = target === 'dark' ? '☀️' : '🌙';
};
