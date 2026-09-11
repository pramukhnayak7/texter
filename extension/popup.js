document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('aiModeToggle');
    const statusText = document.getElementById('statusText');
    const serverUrlInput = document.getElementById('serverUrl');
    const saveBtn = document.getElementById('saveBtn');

    // Load current state
    chrome.storage.local.get(['aiModeActive', 'serverUrl'], (result) => {
        toggle.checked = !!result.aiModeActive;
        updateStatus(toggle.checked);
        
        if (result.serverUrl) {
            serverUrlInput.value = result.serverUrl;
        } else {
            serverUrlInput.value = 'http://localhost:3000'; // Default
        }
    });

    // Handle toggle
    toggle.addEventListener('change', (e) => {
        const isActive = e.target.checked;
        chrome.storage.local.set({ aiModeActive: isActive });
        updateStatus(isActive);
    });

    // Handle save URL
    saveBtn.addEventListener('click', () => {
        const url = serverUrlInput.value.trim().replace(/\/$/, ''); // Remove trailing slash
        if (url) {
            chrome.storage.local.set({ serverUrl: url }, () => {
                const originalText = saveBtn.textContent;
                saveBtn.textContent = 'Saved!';
                setTimeout(() => {
                    saveBtn.textContent = originalText;
                }, 1500);
            });
        }
    });

    function updateStatus(isActive) {
        statusText.textContent = isActive ? 'Active' : 'Off';
        statusText.style.color = isActive ? '#6e8efb' : 'inherit';
    }
});
