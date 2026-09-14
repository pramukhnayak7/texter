document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const toggle = document.getElementById('aiModeToggle');
    const serverUrlInput = document.getElementById('serverUrl');
    const modelSelect = document.getElementById('modelSelect');
    const saveBtn = document.getElementById('saveBtn');
    const popoutWindowBtn = document.getElementById('popoutWindowBtn');
    const popoutAnswerBtn = document.getElementById('popoutAnswerBtn');

    // Lens Elements
    const captureLensBtn = document.getElementById('captureLensBtn');
    const resnapBtn = document.getElementById('resnapBtn');
    const lensResult = document.getElementById('lensResult');
    const lensPreviewContainer = document.getElementById('lensPreviewContainer');
    const lensPreview = document.getElementById('lensPreview');
    const previewBadge = document.getElementById('previewBadge');
    const lensStatus = document.getElementById('lensStatus');
    const lensStatusText = document.getElementById('lensStatusText');
    const lensAnswer = document.getElementById('lensAnswer');
    const copyAnswerBtn = document.getElementById('copyAnswerBtn');

    // Texting Area & Paste Elements
    const extPromptInput = document.getElementById('extPromptInput');
    const extSendBtn = document.getElementById('extSendBtn');
    const extImagePreviewContainer = document.getElementById('extImagePreviewContainer');
    const extImagePreview = document.getElementById('extImagePreview');
    const extRemoveImageBtn = document.getElementById('extRemoveImageBtn');

    let currentImageDataUrl = null;
    let pastedImageBase64 = null;
    let currentAnswerText = '';

    // Load stored settings & state
    chrome.storage.local.get(['aiModeActive', 'serverUrl', 'selectedModel', 'lastLensImage', 'lastLensAnswer'], (result) => {
        if (toggle) toggle.checked = !!result.aiModeActive;
        if (serverUrlInput) serverUrlInput.value = result.serverUrl || 'http://localhost:3000';
        if (modelSelect && result.selectedModel) modelSelect.value = result.selectedModel;

        // Restore previous lens result if available
        if (result.lastLensImage && result.lastLensAnswer) {
            currentImageDataUrl = result.lastLensImage;
            currentAnswerText = result.lastLensAnswer;
            lensPreview.src = currentImageDataUrl;
            lensPreviewContainer.style.display = 'block';
            lensAnswer.textContent = currentAnswerText;
            lensStatusText.textContent = "Last analysis";
            const pulse = lensStatus.querySelector('.pulse-dot');
            if (pulse) pulse.style.display = 'none';
            lensResult.style.display = 'block';
        }
    });

    // Handle AI mode toggle
    if (toggle) {
        toggle.addEventListener('change', (e) => {
            chrome.storage.local.set({ aiModeActive: e.target.checked });
        });
    }

    // Save Settings
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const url = serverUrlInput.value.trim().replace(/\/$/, '');
            const model = modelSelect.value;
            chrome.storage.local.set({ serverUrl: url, selectedModel: model }, () => {
                const originalText = saveBtn.textContent;
                saveBtn.textContent = 'Saved!';
                setTimeout(() => { saveBtn.textContent = originalText; }, 1500);
            });
        });
    }

    // Floating Window Handler
    function openFloatingWindow() {
        chrome.windows.create({
            url: 'analysis-window.html?mode=lens',
            type: 'popup',
            width: 440,
            height: 560
        });
    }

    if (popoutWindowBtn) popoutWindowBtn.addEventListener('click', openFloatingWindow);
    if (popoutAnswerBtn) popoutAnswerBtn.addEventListener('click', openFloatingWindow);

    // Copy Answer
    if (copyAnswerBtn) {
        copyAnswerBtn.addEventListener('click', () => {
            if (currentAnswerText) {
                navigator.clipboard.writeText(currentAnswerText).then(() => {
                    const orig = copyAnswerBtn.textContent;
                    copyAnswerBtn.textContent = '✅ Copied!';
                    setTimeout(() => { copyAnswerBtn.textContent = orig; }, 1500);
                });
            }
        });
    }

    /* =========================================================
       SCREENSHOT PASTE (Ctrl+V) IN EXTENSION
       ========================================================= */
    function handlePastedFile(file) {
        if (!file || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            compressScreenshot(e.target.result).then((compressed) => {
                pastedImageBase64 = compressed;
                extImagePreview.src = compressed;
                extImagePreviewContainer.style.display = 'block';
                if (extPromptInput) extPromptInput.focus();
            });
        };
        reader.readAsDataURL(file);
    }

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
                        handlePastedFile(file);
                        return;
                    }
                }
            }
        }

        const files = clipboardData.files;
        if (files && files.length > 0) {
            for (let i = 0; i < files.length; i++) {
                if (files[i].type.startsWith('image/')) {
                    e.preventDefault();
                    handlePastedFile(files[i]);
                    return;
                }
            }
        }
    });

    if (extRemoveImageBtn) {
        extRemoveImageBtn.addEventListener('click', () => {
            pastedImageBase64 = null;
            extImagePreviewContainer.style.display = 'none';
            extImagePreview.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        });
    }

    // Handle Send from Texting Area
    async function handleComposerSend() {
        const text = extPromptInput.value.trim();
        if (!text && !pastedImageBase64) return;

        const imageToSend = pastedImageBase64;
        const promptToSend = text || (imageToSend ? "Please analyze this screenshot and answer any question/MCQ with the correct option and brief explanation." : "");

        // Reset composer inputs
        extPromptInput.value = '';
        if (extRemoveImageBtn) extRemoveImageBtn.click();

        try {
            lensResult.style.display = 'block';
            lensStatusText.textContent = "Analyzing...";
            const pulse = lensStatus.querySelector('.pulse-dot');
            if (pulse) pulse.style.display = 'inline-block';

            if (imageToSend) {
                currentImageDataUrl = imageToSend;
                lensPreview.src = imageToSend;
                previewBadge.textContent = "Pasted Screenshot";
                lensPreviewContainer.style.display = 'block';
                chrome.storage.local.set({ lastLensImage: imageToSend, lastLensAnswer: '' });
                await sendToAIWithImage(imageToSend, promptToSend);
            } else {
                lensPreviewContainer.style.display = 'none';
                await sendToAITextOnly(promptToSend);
            }
        } catch (err) {
            console.error(err);
            lensStatusText.textContent = "Error";
            const pulse = lensStatus.querySelector('.pulse-dot');
            if (pulse) pulse.style.display = 'none';
            lensAnswer.textContent = `⚠️ ${err.message || "Request failed"}`;
        }
    }

    if (extSendBtn) extSendBtn.addEventListener('click', handleComposerSend);

    if (extPromptInput) {
        extPromptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleComposerSend();
            }
        });
    }

    /* =========================================================
       CAMERA / SCREEN LENS TRIGGER
       ========================================================= */
    if (captureLensBtn) captureLensBtn.addEventListener('click', runScreenLens);
    if (resnapBtn) resnapBtn.addEventListener('click', runScreenLens);

    async function runScreenLens() {
        try {
            lensResult.style.display = 'block';
            lensStatusText.textContent = "Capturing screen...";
            const pulse = lensStatus.querySelector('.pulse-dot');
            if (pulse) pulse.style.display = 'inline-block';
            lensAnswer.textContent = "Scanning active tab for questions...";

            // 1. Capture Visible Tab
            const rawScreenshot = await captureActiveTab();
            if (!rawScreenshot) throw new Error("Could not capture active tab");

            // 2. Compress image using canvas
            const compressedImage = await compressScreenshot(rawScreenshot);
            currentImageDataUrl = compressedImage;
            lensPreview.src = compressedImage;
            previewBadge.textContent = "Active Tab Screen";
            lensPreviewContainer.style.display = 'block';

            chrome.storage.local.set({ lastLensImage: compressedImage, lastLensAnswer: '' });

            // 3. Send to Server for MCQ/Question Solving
            lensStatusText.textContent = "Analyzing question & finding answer...";
            const defaultPrompt = `You are an expert exam problem solver and tutor.
Carefully inspect this screenshot.
If there are any multiple choice questions (MCQs), test problems, or questions:
1. Identify the question.
2. State the CORRECT ANSWER clearly (e.g. Option B: [text]).
3. Provide a direct, 1-2 sentence concise explanation.
Format clearly so the answer is instantly readable.`;

            await sendToAIWithImage(compressedImage, defaultPrompt);

        } catch (error) {
            console.error("Lens capture error:", error);
            lensStatusText.textContent = "Error";
            const pulse = lensStatus.querySelector('.pulse-dot');
            if (pulse) pulse.style.display = 'none';
            lensAnswer.textContent = `⚠️ ${error.message || "Failed to analyze screen"}`;
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

    function compressScreenshot(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDim = 1000;

                if (width > height && width > maxDim) {
                    height *= maxDim / width;
                    width = maxDim;
                } else if (height > maxDim) {
                    width *= maxDim / height;
                    height = maxDim;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.75));
            };
            img.src = dataUrl;
        });
    }

    async function sendToAIWithImage(imageDataUrl, prompt) {
        const { serverUrl, selectedModel } = await chrome.storage.local.get(['serverUrl', 'selectedModel']);
        const baseUrl = serverUrl || 'http://localhost:3000';
        const model = selectedModel || 'google/gemini-2.5-flash:free';

        const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: imageDataUrl } }
                        ]
                    }
                ],
                model: model
            })
        });

        if (!response.ok) {
            let errorMsg = 'Failed to connect to AI server';
            try {
                const errObj = await response.json();
                errorMsg = errObj.error || errorMsg;
            } catch (e) {}
            throw new Error(errorMsg);
        }

        await streamToAnswerBox(response);
    }

    async function sendToAITextOnly(prompt) {
        const { serverUrl, selectedModel } = await chrome.storage.local.get(['serverUrl', 'selectedModel']);
        const baseUrl = serverUrl || 'http://localhost:3000';
        const model = selectedModel || 'openrouter/free';

        const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: prompt }],
                model: model
            })
        });

        if (!response.ok) {
            let errorMsg = 'Failed to connect to AI server';
            try {
                const errObj = await response.json();
                errorMsg = errObj.error || errorMsg;
            } catch (e) {}
            throw new Error(errorMsg);
        }

        await streamToAnswerBox(response);
    }

    async function streamToAnswerBox(response) {
        lensAnswer.textContent = '';
        currentAnswerText = '';

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
                        const content = data.choices?.[0]?.delta?.content;
                        if (content) {
                            currentAnswerText += content;
                            lensAnswer.textContent = currentAnswerText;
                            lensAnswer.scrollTop = lensAnswer.scrollHeight;
                        }
                    } catch (e) {}
                }
            }
        }

        lensStatusText.textContent = "Analysis complete";
        const pulse = lensStatus.querySelector('.pulse-dot');
        if (pulse) pulse.style.display = 'none';
        chrome.storage.local.set({ lastLensAnswer: currentAnswerText });
    }
});
