// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "analyzeTextMenu",
        title: "✨ Analyze Text",
        contexts: ["selection"]
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "analyzeTextMenu" && info.selectionText) {
        // Open a small popup window for analysis
        chrome.windows.create({
            url: `analysis-window.html?text=${encodeURIComponent(info.selectionText)}`,
            type: "popup",
            width: 400,
            height: 500
        });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyzeText') {
        analyzeText(request.text, request.model)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        
        return true; // Keep the message channel open for async response
    } else if (request.action === 'streamAnalyzeText') {
        streamAnalyzeText(request.text, request.model, sender.tab.id);
        sendResponse({ success: true });
        return true;
    }
});

async function analyzeText(text, model) {
    const { serverUrl } = await chrome.storage.local.get(['serverUrl']);
    const baseUrl = serverUrl || 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messages: [{ role: 'user', content: `Please analyze and explain the following text: "${text}"` }],
            model: model || 'openrouter/free'
        })
    });
    
    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    
    return await response.text();
}

async function streamAnalyzeText(text, model, tabId) {
    try {
        const { serverUrl } = await chrome.storage.local.get(['serverUrl']);
        const baseUrl = serverUrl || 'http://localhost:3000';

        const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: `Please analyze and explain the following text: "${text}"` }],
                model: model || 'openrouter/free'
            })
        });

        if (!response.ok) {
            chrome.tabs.sendMessage(tabId, { action: 'streamError', error: 'Network response was not ok' });
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                chrome.tabs.sendMessage(tabId, { action: 'streamDone' });
                break;
            }
            const chunk = decoder.decode(value, { stream: true });
            chrome.tabs.sendMessage(tabId, { action: 'streamData', chunk });
        }
    } catch (error) {
        chrome.tabs.sendMessage(tabId, { action: 'streamError', error: error.message });
    }
}
