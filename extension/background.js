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
    } else if (request.action === 'startCopilotChat') {
        runCopilotBackgroundChat(request);
        sendResponse({ success: true });
        return true;
    } else if (request.action === 'clearChatHistory') {
        chrome.storage.local.set({
            copilot_chat_history: [],
            copilot_conversation: [],
            copilot_active_task: null
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

let currentTaskState = null;

async function runCopilotBackgroundChat({ userDisplayText, userImageUrl, promptToSend, model }) {
    try {
        const { serverUrl, selectedModel, copilot_chat_history, copilot_conversation } = 
            await chrome.storage.local.get(['serverUrl', 'selectedModel', 'copilot_chat_history', 'copilot_conversation']);

        const baseUrl = serverUrl || 'http://localhost:3000';
        let activeModel = model || selectedModel || 'dots-studio/dots-3-note-preview:free';
        if (activeModel === 'openrouter/free' || activeModel.includes('content-safety')) {
            activeModel = 'dots-studio/dots-3-note-preview:free';
        }

        const history = Array.isArray(copilot_chat_history) ? [...copilot_chat_history] : [];
        const conversation = Array.isArray(copilot_conversation) ? [...copilot_conversation] : [];

        // Add user message
        history.push({
            role: 'user',
            text: userDisplayText,
            imageUrl: userImageUrl || null
        });

        let userContent;
        if (userImageUrl) {
            userContent = [
                { type: "text", text: promptToSend },
                { type: "image_url", image_url: { url: userImageUrl } }
            ];
        } else {
            userContent = promptToSend;
        }

        conversation.push({
            role: "user",
            content: userContent
        });

        // Initialize active task in background and storage
        currentTaskState = {
            inProgress: true,
            text: '',
            reasoningText: '',
            startedAt: Date.now()
        };

        await chrome.storage.local.set({
            copilot_chat_history: history,
            copilot_conversation: conversation,
            copilot_active_task: currentTaskState
        });

        const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: conversation,
                model: activeModel
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

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let lastSaveTime = Date.now();

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
                            currentTaskState.reasoningText += reasoningDelta;
                        }
                        if (delta) {
                            currentTaskState.text += delta;
                        }

                        // Broadcast to open sidepanel
                        chrome.runtime.sendMessage({
                            action: 'copilotStreamDelta',
                            text: currentTaskState.text,
                            reasoning: currentTaskState.reasoningText,
                            delta,
                            reasoningDelta
                        }).catch(() => {});

                    } catch (e) {}
                }
            }

            // Periodically sync partial text to storage in case panel reopens while streaming
            if (Date.now() - lastSaveTime > 800) {
                lastSaveTime = Date.now();
                chrome.storage.local.set({ copilot_active_task: currentTaskState }).catch(() => {});
            }
        }

        const finalText = currentTaskState.text.trim() || currentTaskState.reasoningText.trim();
        history.push({
            role: 'assistant',
            text: finalText
        });
        conversation.push({
            role: 'assistant',
            content: finalText
        });

        currentTaskState = null;
        await chrome.storage.local.set({
            copilot_chat_history: history,
            copilot_conversation: conversation,
            copilot_active_task: null
        });

        chrome.runtime.sendMessage({
            action: 'copilotStreamDone',
            text: finalText
        }).catch(() => {});

    } catch (err) {
        console.error("Copilot background chat error:", err);
        currentTaskState = null;

        const { copilot_chat_history } = await chrome.storage.local.get(['copilot_chat_history']);
        const history = Array.isArray(copilot_chat_history) ? [...copilot_chat_history] : [];
        history.push({
            role: 'assistant',
            text: `⚠️ Error: ${err.message}`
        });

        await chrome.storage.local.set({
            copilot_chat_history: history,
            copilot_active_task: null
        });

        chrome.runtime.sendMessage({
            action: 'copilotStreamError',
            error: err.message
        }).catch(() => {});
    }
}

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
