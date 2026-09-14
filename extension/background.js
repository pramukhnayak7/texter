// Configure Side Panel behavior (opens on right side when clicking extension icon)
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.error("setPanelBehavior error:", error));
}

// Fallback action click handler
chrome.action.onClicked.addListener(async (tab) => {
    if (chrome.sidePanel && chrome.sidePanel.open) {
        try {
            await chrome.sidePanel.open({ tabId: tab.id });
        } catch (e) {
            console.error("sidePanel.open error:", e);
        }
    }
});

function setupContextMenus() {
    chrome.contextMenus.removeAll(() => {
        // Selection context menu: shown when text is highlighted
        chrome.contextMenus.create({
            id: "analyzeSelectedText",
            title: "✨ Analyze with AI Copilot",
            contexts: ["selection"]
        });

        // Page context menu: shown when right-clicking normal page area
        chrome.contextMenus.create({
            id: "openCopilotSidebar",
            title: "✨ Open AI Copilot Sidebar",
            contexts: ["page", "action"]
        });

        // Lens Screen menu
        chrome.contextMenus.create({
            id: "lensScreenMenu",
            title: "📸 Screen Lens (Solve Question)",
            contexts: ["page", "image"]
        });
    });
}

chrome.runtime.onInstalled.addListener(setupContextMenus);
chrome.runtime.onStartup.addListener(setupContextMenus);

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "analyzeSelectedText") {
        const text = (info.selectionText || "").trim();
        if (!text) return;

        if (tab && tab.id && chrome.sidePanel && chrome.sidePanel.open) {
            try {
                await chrome.sidePanel.open({ tabId: tab.id });
            } catch (e) {
                console.error("sidePanel.open error:", e);
            }
        }

        // Save selection for when sidepanel initializes
        await chrome.storage.local.set({
            pendingSelectionAnalysis: {
                text: text,
                timestamp: Date.now()
            }
        });

        // Also broadcast directly to already-open sidepanel
        chrome.runtime.sendMessage({
            action: 'analyzeSelection',
            text: text
        }).catch(() => {});

    } else if (info.menuItemId === "openCopilotSidebar") {
        if (tab && tab.id && chrome.sidePanel && chrome.sidePanel.open) {
            await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
        }
    } else if (info.menuItemId === "lensScreenMenu") {
        if (tab && tab.id && chrome.sidePanel && chrome.sidePanel.open) {
            await chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
        }
        setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'triggerLensSnap' }).catch(() => {});
        }, 400);
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'openSidepanelWithText') {
        const tabId = sender.tab ? sender.tab.id : null;
        if (tabId && chrome.sidePanel && chrome.sidePanel.open) {
            chrome.sidePanel.open({ tabId }).catch(err => console.error("sidePanel open err:", err));
        }

        chrome.storage.local.set({
            pendingSelectionAnalysis: {
                text: request.text,
                timestamp: Date.now()
            }
        }).then(() => {
            chrome.runtime.sendMessage({
                action: 'analyzeSelection',
                text: request.text
            }).catch(() => {});
        });

        sendResponse({ success: true });
        return true;
    } else if (request.action === 'analyzeText') {
        analyzeText(request.text, request.model)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        
        return true;
    } else if (request.action === 'streamAnalyzeText') {
        streamAnalyzeText(request.text, request.model, sender.tab.id);
        sendResponse({ success: true });
        return true;
    }
});

async function analyzeText(text, model) {
    const { serverUrl, selectedModel } = await chrome.storage.local.get(['serverUrl', 'selectedModel']);
    const baseUrl = serverUrl || 'http://localhost:3000';
    const activeModel = model || selectedModel || 'dots-studio/dots-3-note-preview:free';
    
    const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            messages: [{ role: 'user', content: `Please analyze and explain the following text: "${text}"` }],
            model: activeModel
        })
    });
    
    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    
    return await response.text();
}

async function streamAnalyzeText(text, model, tabId) {
    try {
        const { serverUrl, selectedModel } = await chrome.storage.local.get(['serverUrl', 'selectedModel']);
        const baseUrl = serverUrl || 'http://localhost:3000';
        const activeModel = model || selectedModel || 'dots-studio/dots-3-note-preview:free';

        const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: `Please analyze and explain the following text: "${text}"` }],
                model: activeModel
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
