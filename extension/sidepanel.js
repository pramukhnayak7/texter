document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const messagesContainer = document.getElementById('messagesContainer');
    const welcomeHint = document.getElementById('welcomeHint');
    const promptInput = document.getElementById('promptInput');
    const sendBtn = document.getElementById('sendBtn');
    const attachFileBtn = document.getElementById('attachFileBtn');
    const fileInput = document.getElementById('fileInput');
    const previewBar = document.getElementById('previewBar');
    const previewImg = document.getElementById('previewImg');
    const removeImgBtn = document.getElementById('removeImgBtn');
    const lensSnapBtn = document.getElementById('lensSnapBtn');
    const clearChatBtn = document.getElementById('clearChatBtn');
    const settingsToggleBtn = document.getElementById('settingsToggleBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const modelSelect = document.getElementById('modelSelect');
    const serverUrlInput = document.getElementById('serverUrlInput');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const activeModelLabel = document.getElementById('activeModelLabel');

    let attachedImageBase64 = null;
    let isGenerating = false;
    let conversation = [];

    // Load saved settings
    chrome.storage.local.get(['serverUrl', 'selectedModel', 'sidepanel_theme'], (result) => {
        if (serverUrlInput) serverUrlInput.value = result.serverUrl || 'http://localhost:3000';
        // If no model or outdated/problematic model saved, default to dots-studio
        let defaultModel = result.selectedModel;
        if (!defaultModel || defaultModel === 'openrouter/free' || defaultModel.includes('content-safety') || defaultModel.includes('gemini-2.5-flash')) {
            defaultModel = 'dots-studio/dots-3-note-preview:free';
            chrome.storage.local.set({ selectedModel: defaultModel });
        }
        if (modelSelect) modelSelect.value = defaultModel;
        if (activeModelLabel) activeModelLabel.textContent = defaultModel.split('/')[1] || defaultModel;

        const theme = result.sidepanel_theme || 'light';
        document.body.className = theme;

        // Restore chat history & any active ongoing generation
        loadChatHistory();
    });

    // Theme Toggle
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isLight = document.body.classList.contains('light');
            const newTheme = isLight ? 'dark' : 'light';
            document.body.className = newTheme;
            chrome.storage.local.set({ sidepanel_theme: newTheme });
        });
    }

    // Toggle Settings Panel
    if (settingsToggleBtn) {
        settingsToggleBtn.addEventListener('click', () => {
            settingsPanel.classList.toggle('open');
        });
    }

    // Save Settings
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            const url = serverUrlInput.value.trim().replace(/\/$/, '');
            const model = modelSelect.value;
            chrome.storage.local.set({ serverUrl: url, selectedModel: model }, () => {
                if (activeModelLabel) activeModelLabel.textContent = model.split('/')[1] || model;
                const orig = saveSettingsBtn.textContent;
                saveSettingsBtn.textContent = 'Saved!';
                setTimeout(() => {
                    saveSettingsBtn.textContent = orig;
                    settingsPanel.classList.remove('open');
                }, 1000);
            });
        });
    }

    // Clear Chat
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', () => {
            messagesContainer.innerHTML = '';
            if (welcomeHint) {
                messagesContainer.appendChild(welcomeHint);
                welcomeHint.style.display = 'block';
            }
            clearAttachedImage();
            activeAssistantBubble = null;
            isGenerating = false;
            if (sendBtn) sendBtn.disabled = false;
            chrome.storage.local.remove(['copilot_chat_history', 'copilot_conversation', 'copilot_active_task']);
            chrome.runtime.sendMessage({ action: 'clearChatHistory' }).catch(() => {});
        });
    }

    // Attach File
    if (attachFileBtn && fileInput) {
        attachFileBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleImageFile(file);
        });
    }

    if (removeImgBtn) {
        removeImgBtn.addEventListener('click', clearAttachedImage);
    }

    function clearAttachedImage() {
        attachedImageBase64 = null;
        if (previewBar) previewBar.style.display = 'none';
        if (previewImg) previewImg.src = '';
        if (fileInput) fileInput.value = '';
    }

    // Paste handler for screenshots (Ctrl+V)
    window.addEventListener('paste', (e) => {
        const clipboardData = e.clipboardData || window.clipboardData;
        if (!clipboardData) return;

        const items = clipboardData.items;
        if (items) {
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        e.preventDefault();
                        handleImageFile(file);
                        return;
                    }
                }
            }
        }
    });

    function handleImageFile(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const compressed = await compressImage(e.target.result);
            attachedImageBase64 = compressed;
            if (previewImg) previewImg.src = compressed;
            if (previewBar) previewBar.style.display = 'block';
            if (promptInput) promptInput.focus();
        };
        reader.readAsDataURL(file);
    }

    let activeAssistantBubble = null;

    // Load persisted chat history and active task on startup
    function loadChatHistory() {
        chrome.storage.local.get(['copilot_chat_history', 'copilot_active_task'], (res) => {
            const history = res.copilot_chat_history;
            if (Array.isArray(history) && history.length > 0) {
                if (welcomeHint) welcomeHint.style.display = 'none';
                messagesContainer.innerHTML = '';
                for (const msg of history) {
                    appendMessage(msg.role, msg.text, msg.imageUrl);
                }
            }

            const task = res.copilot_active_task;
            if (task && task.inProgress) {
                isGenerating = true;
                if (sendBtn) sendBtn.disabled = true;
                activeAssistantBubble = appendMessage('assistant', task.text || '');
                if (!task.text) {
                    activeAssistantBubble.innerHTML = '<span class="status-loading"><span class="dot-pulse"></span> Analyzing & solving...</span>';
                }
            }
        });
    }

    // Handle external text analysis (from right-click context menu or on-page analyze button)
    async function handleAnalyzeText(text) {
        if (!text || isGenerating) return;
        const cleanText = text.trim();
        if (!cleanText) return;

        // Fast direct prompt to guarantee answers within 10-15s
        const promptToSend = `Directly solve or analyze this question/text. State the CORRECT OPTION / ANSWER prominently at the top, followed by a concise 1-3 sentence explanation. Be fast and direct:\n\n${cleanText}`;

        await sendChatRequest(promptToSend, null, cleanText);
    }

    // Check for pending text analysis when sidepanel opens
    chrome.storage.local.get(['pendingSelectionAnalysis'], (res) => {
        if (res && res.pendingSelectionAnalysis) {
            const { text, timestamp } = res.pendingSelectionAnalysis;
            chrome.storage.local.remove('pendingSelectionAnalysis');
            if (text && Date.now() - timestamp < 45000) {
                handleAnalyzeText(text);
            }
        }
    });

    // Listen for real-time messages from background script
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'copilotStreamDelta') {
            if (!activeAssistantBubble) {
                activeAssistantBubble = appendMessage('assistant', '');
                isGenerating = true;
                if (sendBtn) sendBtn.disabled = true;
            }
            if (msg.text) {
                activeAssistantBubble.textContent = msg.text;
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            } else if (msg.reasoning && !activeAssistantBubble.textContent) {
                activeAssistantBubble.innerHTML = '<span class="status-loading"><span class="dot-pulse"></span> Formulating explanation...</span>';
            }
        } else if (msg.action === 'copilotStreamDone') {
            if (activeAssistantBubble) {
                activeAssistantBubble.textContent = msg.text;
            }
            activeAssistantBubble = null;
            isGenerating = false;
            if (sendBtn) sendBtn.disabled = false;
            if (promptInput) promptInput.focus();
        } else if (msg.action === 'copilotStreamError') {
            if (activeAssistantBubble) {
                activeAssistantBubble.innerHTML = `<span style="color: var(--error);">⚠️ Error: ${msg.error}</span>`;
            }
            activeAssistantBubble = null;
            isGenerating = false;
            if (sendBtn) sendBtn.disabled = false;
        } else if (msg.action === 'analyzeSelection' && msg.text) {
            handleAnalyzeText(msg.text);
        } else if (msg.action === 'triggerLensSnap') {
            if (lensSnapBtn && !isGenerating) {
                lensSnapBtn.click();
            }
        }
    });

    // Lens Snap Active Tab
    if (lensSnapBtn) {
        lensSnapBtn.addEventListener('click', async () => {
            if (isGenerating) return;

            try {
                const rawScreenshot = await captureActiveTab();
                if (!rawScreenshot) throw new Error("Could not capture active tab");

                const compressed = await compressImage(rawScreenshot);
                
                // Fast direct prompt for rapid 10-15s response
                const prompt = "Directly solve any question or MCQ shown in this screenshot. State the question number, CORRECT OPTION / ANSWER prominently first, followed by a concise 1-2 sentence explanation. Be fast and direct.";

                await sendChatRequest(prompt, compressed, "📸 Screen Lens Capture");
            } catch (err) {
                console.error("Lens error:", err);
                appendMessage('assistant', `⚠️ ${err.message || "Failed to capture active tab"}`);
            }
        });
    }

    // Send Button & Enter Key
    if (sendBtn) sendBtn.addEventListener('click', handleUserSubmit);

    if (promptInput) {
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleUserSubmit();
            }
        });

        // Auto-resize
        promptInput.addEventListener('input', () => {
            promptInput.style.height = 'auto';
            promptInput.style.height = Math.min(promptInput.scrollHeight, 120) + 'px';
        });
    }

    async function handleUserSubmit() {
        if (isGenerating) return;

        const text = promptInput.value.trim();
        const image = attachedImageBase64;

        if (!text && !image) return;

        promptInput.value = '';
        promptInput.style.height = 'auto';
        clearAttachedImage();

        const displayText = text || (image ? "📸 Solve question in image" : "");
        const promptToSend = text || "Directly solve any question/MCQ in this screenshot with the exact correct option and a brief explanation.";
        await sendChatRequest(promptToSend, image, displayText);
    }

    function appendMessage(role, text, imageUrl = null) {
        if (welcomeHint) welcomeHint.style.display = 'none';

        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;

        const bubble = document.createElement('div');
        bubble.className = 'bubble';

        if (imageUrl) {
            const img = document.createElement('img');
            img.src = imageUrl;
            bubble.appendChild(img);
        }

        if (text) {
            const span = document.createElement('span');
            span.textContent = text;
            bubble.appendChild(span);
        }

        msgDiv.appendChild(bubble);
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        return bubble;
    }

    async function sendChatRequest(promptToSend, imageDataUrl = null, displayText = null) {
        if (isGenerating) return;
        isGenerating = true;
        if (sendBtn) sendBtn.disabled = true;

        const userText = displayText !== null ? displayText : promptToSend;
        appendMessage('user', userText, imageDataUrl);

        activeAssistantBubble = appendMessage('assistant', '');
        activeAssistantBubble.innerHTML = '<span class="status-loading"><span class="dot-pulse"></span> Analyzing & solving...</span>';

        const { selectedModel } = await chrome.storage.local.get(['selectedModel']);

        // Send to background service worker so it survives even if sidepanel is closed/hidden
        chrome.runtime.sendMessage({
            action: 'startCopilotChat',
            userDisplayText: userText,
            userImageUrl: imageDataUrl,
            promptToSend: promptToSend,
            model: selectedModel || 'dots-studio/dots-3-note-preview:free'
        });
    }

    function captureActiveTab() {
        return new Promise((resolve, reject) => {
            chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 80 }, (dataUrl) => {
                if (chrome.runtime.lastError) {
                    return reject(new Error(chrome.runtime.lastError.message));
                }
                if (!dataUrl) {
                    return reject(new Error("Unable to capture active screen"));
                }
                resolve(dataUrl);
            });
        });
    }

    function compressImage(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDim = 720; // 720p optimized for high-speed network transmission (<50KB)

                if (width > height && width > maxDim) {
                    height = Math.round(height * (maxDim / width));
                    width = maxDim;
                } else if (height > maxDim) {
                    width = Math.round(width * (maxDim / height));
                    height = maxDim;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.65));
            };
            img.src = dataUrl;
        });
    }
});
