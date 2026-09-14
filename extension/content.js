let analyzeButton = null;
let selectedText = '';

// Listen for text selection anywhere on the page
document.addEventListener('mouseup', (e) => {
    // Don't trigger if clicking inside the analyze button itself
    if (e.target.closest('#ai-teacher-analyze-btn')) {
        return;
    }

    setTimeout(() => {
        const selection = window.getSelection();
        const text = selection ? selection.toString().trim() : '';

        if (text.length > 0) {
            selectedText = text;
            showAnalyzeButton(e.pageX, e.pageY);
        } else {
            removeAnalyzeButton();
        }
    }, 20);
});

// Hide button on mousedown outside
document.addEventListener('mousedown', (e) => {
    if (analyzeButton && !e.target.closest('#ai-teacher-analyze-btn')) {
        removeAnalyzeButton();
    }
});

function showAnalyzeButton(x, y) {
    if (!analyzeButton) {
        analyzeButton = document.createElement('button');
        analyzeButton.id = 'ai-teacher-analyze-btn';
        analyzeButton.innerHTML = '✨ Analyze';
        document.body.appendChild(analyzeButton);

        analyzeButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (selectedText) {
                chrome.runtime.sendMessage({
                    action: 'openSidepanelWithText',
                    text: selectedText
                });
            }
            removeAnalyzeButton();
        });
    }

    // Position neatly near cursor without overflowing viewport
    const posX = Math.min(x + 10, window.innerWidth + window.scrollX - 110);
    const posY = Math.max(y - 42, window.scrollY + 10);

    analyzeButton.style.left = `${posX}px`;
    analyzeButton.style.top = `${posY}px`;
    analyzeButton.style.display = 'inline-flex';
}

function removeAnalyzeButton() {
    if (analyzeButton) {
        analyzeButton.style.display = 'none';
    }
}
