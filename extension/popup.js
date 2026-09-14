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
    const lensPreview = document.getElementById('lensPreview');
    const lensStatus = document.getElementById('lensStatus');
    const lensStatusText = document.getElementById('lensStatusText');
    const lensAnswer = document.getElementById('lensAnswer');
    const copyAnswerBtn = document.getElementById('copyAnswerBtn');

    let currentImageDataUrl = null;
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
            lensAnswer.textContent = currentAnswerText;
            lensStatusText.textContent = "Last captured analysis";
            lensStatus.querySelector('.pulse-dot').style.display = 'none';
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

    // CAMERA / SCREEN LENS TRIGGER
    if (captureLensBtn) captureLensBtn.addEventListener('click', runScreenLens);
    if (resnapBtn) resnapBtn.addEventListener('click', runScreenLens);

    async function runScreenLens() {
        try {
            // Show result area and loading state
            lensResult.style.display = 'block';
            lensStatusText.textContent = "Capturing screen...";
            lensStatus.querySelector('.pulse-dot').style.display = 'inline-block';
            lensAnswer.textContent = "Scanning active tab for questions...";

            // 1. Capture Visible Tab
            const rawScreenshot = await captureActiveTab();
            if (!rawScreenshot) throw new Error("Could not capture active tab");

            // 2. Compress image using canvas (keeps bandwidth light for mobile host)
            const compressedImage = await compressScreenshot(rawScreenshot);
            currentImageDataUrl = compressedImage;
            lensPreview.src = compressedImage;

            // Store for popout window sync
            chrome.storage.local.set({ lastLensImage: compressedImage, lastLensAnswer: '' });

            // 3. Send to Server for MCQ/Question Solving
            lensStatusText.textContent = "Analyzing question & finding answer...";
            await analyzeScreenshotWithAI(compressedImage);

        } catch (error) {
            console.error("Lens capture error:", error);
            lensStatusText.textContent = "Error";
            lensStatus.querySelector('.pulse-dot').style.display = 'none';
            lensAnswer.textContent = `⚠️ ${error.message || "Failed to analyze screen"}`;
        }
    }

    // Capture tab helper
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

    // Image compression helper (max 1000px, 0.75 quality)
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

    // Call /api/chat and stream answer
    async function analyzeScreenshotWithAI(imageDataUrl) {
        const { serverUrl, selectedModel } = await chrome.storage.local.get(['serverUrl', 'selectedModel']);
        const baseUrl = serverUrl || 'http://localhost:3000';
        const model = selectedModel || 'google/gemini-2.5-flash:free';

        const prompt = `You are an expert exam problem solver and tutor.
Carefully inspect this screenshot.
If there are any multiple choice questions (MCQs), test problems, or questions:
1. Identify the question.
2. State the CORRECT ANSWER clearly (e.g. Option B: [text]).
3. Provide a direct, 1-2 sentence concise explanation.
Format clearly so the answer is instantly readable.`;

        const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
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
                    } catch (e) {
                        // ignore chunk parse errors
                    }
                }
            }
        }

        lensStatusText.textContent = "Analysis complete";
        lensStatus.querySelector('.pulse-dot').style.display = 'none';
        chrome.storage.local.set({ lastLensAnswer: currentAnswerText });
    }
});
