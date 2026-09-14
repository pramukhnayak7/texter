document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const textToAnalyze = urlParams.get('text');

    const quoteEl = document.getElementById('quote');
    const responseEl = document.getElementById('response');
    const previewBox = document.getElementById('previewBox');
    const previewImg = document.getElementById('previewImg');
    const snapBtn = document.getElementById('snapBtn');
    const copyBtn = document.getElementById('copyBtn');

    let currentAnswer = '';

    // Copy action
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            if (currentAnswer) {
                navigator.clipboard.writeText(currentAnswer).then(() => {
                    const orig = copyBtn.textContent;
                    copyBtn.textContent = '✅ Copied';
                    setTimeout(() => { copyBtn.textContent = orig; }, 1500);
                });
            }
        });
    }

    // Snap Screen from floating window
    if (snapBtn) {
        snapBtn.addEventListener('click', async () => {
            try {
                responseEl.className = 'response-box loading';
                responseEl.textContent = 'Capturing screen and solving question...';
                
                const dataUrl = await captureTab();
                if (!dataUrl) throw new Error('Could not capture screen');
                
                previewImg.src = dataUrl;
                previewBox.style.display = 'block';
                quoteEl.style.display = 'none';

                await analyzeImage(dataUrl);
            } catch (err) {
                responseEl.className = 'response-box error';
                responseEl.textContent = `Error: ${err.message}`;
            }
        });
    }

    // Ctrl+V paste support in floating window
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
                        handlePastedFileInWindow(file);
                        return;
                    }
                }
            }
        }
    });

    function handlePastedFileInWindow(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
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
                const compressed = canvas.toDataURL('image/jpeg', 0.75);

                previewImg.src = compressed;
                previewBox.style.display = 'block';
                quoteEl.style.display = 'none';
                responseEl.className = 'response-box loading';
                responseEl.textContent = 'Analyzing pasted screenshot...';
                analyzeImage(compressed).catch((err) => {
                    responseEl.className = 'response-box error';
                    responseEl.textContent = `Error: ${err.message}`;
                });
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Initial load logic
    if (mode === 'lens') {
        // Load latest lens image & answer from storage
        chrome.storage.local.get(['lastLensImage', 'lastLensAnswer'], async (data) => {
            if (data.lastLensImage) {
                previewImg.src = data.lastLensImage;
                previewBox.style.display = 'block';
                if (data.lastLensAnswer) {
                    currentAnswer = data.lastLensAnswer;
                    responseEl.className = 'response-box';
                    responseEl.textContent = currentAnswer;
                } else {
                    await analyzeImage(data.lastLensImage);
                }
            } else {
                // Trigger fresh snap
                if (snapBtn) snapBtn.click();
            }
        });
    } else if (textToAnalyze) {
        // Text analysis mode
        quoteEl.style.display = 'block';
        quoteEl.textContent = `"${textToAnalyze}"`;
        await analyzeText(textToAnalyze);
    } else {
        responseEl.className = 'response-box';
        responseEl.textContent = 'Click "📸 Snap Screen" to capture the active tab and solve questions.';
    }

    function captureTab() {
        return new Promise((resolve, reject) => {
            chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 75 }, (dataUrl) => {
                if (chrome.runtime.lastError) {
                    return reject(new Error(chrome.runtime.lastError.message));
                }
                resolve(dataUrl);
            });
        });
    }

    async function analyzeImage(imageDataUrl) {
        const { serverUrl, selectedModel } = await chrome.storage.local.get(['serverUrl', 'selectedModel']);
        const baseUrl = serverUrl || 'http://localhost:3000';
        const model = selectedModel || 'google/gemini-2.5-flash:free';

        const prompt = `Analyze this test/exam screenshot.
1. Identify the question / MCQ.
2. State the CORRECT ANSWER clearly (e.g. Option B: [text]).
3. Provide a brief 1-2 sentence explanation.
Keep it direct, accurate, and concise.`;

        const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: imageDataUrl } }
                    ]
                }],
                model: model
            })
        });

        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }

        await streamResponse(response);
    }

    async function analyzeText(text) {
        const { serverUrl, selectedModel } = await chrome.storage.local.get(['serverUrl', 'selectedModel']);
        const baseUrl = serverUrl || 'http://localhost:3000';
        const model = selectedModel || 'openrouter/free';

        const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: `Please analyze and explain the following question/text: "${text}"` }],
                model: model
            })
        });

        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }

        await streamResponse(response);
    }

    async function streamResponse(response) {
        responseEl.className = 'response-box';
        responseEl.textContent = '';
        currentAnswer = '';

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
                            currentAnswer += content;
                            responseEl.textContent = currentAnswer;
                            responseEl.scrollTop = responseEl.scrollHeight;
                        }
                    } catch (e) {}
                }
            }
        }
    }
});
