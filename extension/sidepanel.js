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
            conversation = [];
            messagesContainer.innerHTML = '';
            if (welcomeHint) {
                messagesContainer.appendChild(welcomeHint);
                welcomeHint.style.display = 'block';
            }
            clearAttachedImage();
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

    // Handle external text analysis (from right-click context menu or on-page analyze button)
    async function handleAnalyzeText(text) {
        if (!text || isGenerating) return;
        const cleanText = text.trim();
        if (!cleanText) return;

        appendMessage('user', cleanText);

        // Fast direct prompt to guarantee answers within 10-15s
        const promptToSend = `Directly solve or analyze this question/text. State the CORRECT OPTION / ANSWER prominently at the top, followed by a concise 1-3 sentence explanation. Be fast and direct:\n\n${cleanText}`;

        await sendChatRequest(promptToSend, null);
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

    // Listen for real-time messages from background/content script
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === 'analyzeSelection' && msg.text) {
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

                appendMessage('user', '📸 Screen Lens Capture', compressed);
                await sendChatRequest(prompt, compressed);
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

        const displayText = text || (image ? "Solve question in image" : "");
        appendMessage('user', displayText, image);

        const promptToSend = text || "Please analyze this screenshot and solve the question/MCQ with the exact correct option and brief explanation.";
        await sendChatRequest(promptToSend, image);
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

    async function sendChatRequest(text, imageDataUrl) {
        isGenerating = true;
        if (sendBtn) sendBtn.disabled = true;

        const { serverUrl, selectedModel } = await chrome.storage.local.get(['serverUrl', 'selectedModel']);
        const baseUrl = serverUrl || 'http://localhost:3000';
        let model = selectedModel || 'dots-studio/dots-3-note-preview:free';
        if (model === 'openrouter/free' || model.includes('content-safety')) {
            model = 'dots-studio/dots-3-note-preview:free';
        }

        // Prepare message payload
        let userContent;
        if (imageDataUrl) {
            userContent = [
                { type: "text", text: text },
                { type: "image_url", image_url: { url: imageDataUrl } }
            ];
        } else {
            userContent = text;
        }

        conversation.push({
            role: "user",
            content: userContent
        });

        const assistantBubble = appendMessage('assistant', '');
        assistantBubble.innerHTML = '<span class="status-loading"><span class="dot-pulse"></span> Analyzing & solving...</span>';

        try {
            const response = await fetch(`${baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: conversation,
                    model: model
                })
            });

            if (!response.ok) {
                let errorText = 'Network response was not ok';
                try {
                    const errData = await response.json();
                    errorText = errData.error || errorText;
                } catch (e) {}
                throw new Error(errorText);
            }

            let fullText = '';
            let reasoningText = '';

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                            const data = JSON.parse(line.slice(6));
                            const delta = data.choices?.[0]?.delta?.content;
                            const reasoningDelta = data.choices?.[0]?.delta?.reasoning;

                            if (reasoningDelta) {
                                reasoningText += reasoningDelta;
                                if (!fullText) {
                                    assistantBubble.innerHTML = '<span class="status-loading"><span class="dot-pulse"></span> Formulating explanation...</span>';
                                }
                            }

                            if (delta) {
                                fullText += delta;
                                assistantBubble.textContent = fullText;
                                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                            }
                        } catch (e) {}
                    }
                }
            }

            // Fallback if model only returned reasoning
            if (!fullText.trim() && reasoningText.trim()) {
                fullText = reasoningText;
                assistantBubble.textContent = fullText;
            }

            conversation.push({
                role: "assistant",
                content: fullText
            });

        } catch (err) {
            console.error(err);
            assistantBubble.innerHTML = `<span style="color: var(--error);">⚠️ Error: ${err.message}</span>`;
        } finally {
            isGenerating = false;
            if (sendBtn) sendBtn.disabled = false;
            if (promptInput) promptInput.focus();
        }
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
