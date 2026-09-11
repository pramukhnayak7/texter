let isActive = false;

// Check initial state
chrome.storage.local.get(['aiModeActive'], (result) => {
    isActive = !!result.aiModeActive;
});

// Listen for state changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (changes.aiModeActive) {
        isActive = changes.aiModeActive.newValue;
        if (!isActive) {
            removeAnalyzeButton();
            removeFloatingWindow();
        } else {
            createFloatingWindow();
        }
    }
});

let analyzeButton = null;
let floatingWindow = null;
let responseContent = null;
let selectedText = '';

// Listen for text selection
document.addEventListener('mouseup', (e) => {
    if (!isActive) return;

    // Don't trigger if clicking inside our own elements
    if (e.target.closest('#ai-teacher-analyze-btn') || e.target.closest('#ai-teacher-floating-window')) {
        return;
    }

    setTimeout(() => {
        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (text.length > 0) {
            selectedText = text;
            showAnalyzeButton(e.pageX, e.pageY);
        } else {
            removeAnalyzeButton();
        }
    }, 10);
});

function showAnalyzeButton(x, y) {
    if (!analyzeButton) {
        analyzeButton = document.createElement('button');
        analyzeButton.id = 'ai-teacher-analyze-btn';
        analyzeButton.innerHTML = '✨ Analyze';
        document.body.appendChild(analyzeButton);

        analyzeButton.addEventListener('click', handleAnalyzeClick);
    }

    analyzeButton.style.left = `${x + 10}px`;
    analyzeButton.style.top = `${y + 10}px`;
    analyzeButton.style.display = 'block';
}

function removeAnalyzeButton() {
    if (analyzeButton) {
        analyzeButton.style.display = 'none';
    }
}

function createFloatingWindow() {
    if (floatingWindow) return;

    floatingWindow = document.createElement('div');
    floatingWindow.id = 'ai-teacher-floating-window';
    
    floatingWindow.innerHTML = `
        <div class="ai-header">
            <span>AI Teacher</span>
            <button id="ai-close-btn">×</button>
        </div>
        <div class="ai-content" id="ai-response-content">
            Select text and click analyze...
        </div>
    `;

    document.body.appendChild(floatingWindow);
    responseContent = floatingWindow.querySelector('#ai-response-content');

    // Close button
    floatingWindow.querySelector('#ai-close-btn').addEventListener('click', () => {
        chrome.storage.local.set({ aiModeActive: false });
    });
}

function removeFloatingWindow() {
    if (floatingWindow) {
        floatingWindow.remove();
        floatingWindow = null;
        responseContent = null;
    }
}

async function handleAnalyzeClick() {
    removeAnalyzeButton();
    if (!floatingWindow) createFloatingWindow();
    
    // Make window fully visible
    floatingWindow.classList.add('active');
    
    responseContent.innerHTML = '<div class="ai-loading">Analyzing...</div>';

    // Parse the stream from background
    chrome.runtime.sendMessage({
        action: 'streamAnalyzeText',
        text: selectedText
    });
}

// Handle messages from background script (streaming response)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'streamData') {
        if (responseContent.querySelector('.ai-loading')) {
            responseContent.innerHTML = ''; // clear loading
        }
        
        // Very basic parsing for OpenRouter SSE data chunks
        const lines = request.chunk.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                try {
                    const data = JSON.parse(line.slice(6));
                    if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                        // Append text securely using textContent on a temporary node or just create text nodes
                        const textNode = document.createTextNode(data.choices[0].delta.content);
                        responseContent.appendChild(textNode);
                    }
                } catch (e) {
                    // Ignore parse errors for incomplete chunks
                }
            }
        }
    } else if (request.action === 'streamError') {
        responseContent.innerHTML = `<div class="ai-error">Error: ${request.error}</div>`;
    }
});
