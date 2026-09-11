document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const textToAnalyze = urlParams.get('text');
    
    const quoteEl = document.getElementById('quote');
    const responseEl = document.getElementById('response');
    
    if (!textToAnalyze) {
        responseEl.className = 'error';
        responseEl.textContent = 'No text provided for analysis.';
        return;
    }
    
    quoteEl.textContent = `"${textToAnalyze}"`;
    responseEl.textContent = 'Analyzing...';
    
    try {
        const { serverUrl } = await chrome.storage.local.get(['serverUrl']);
        const baseUrl = serverUrl || 'http://localhost:3000';
        
        const response = await fetch(`${baseUrl}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [{ role: 'user', content: `Please analyze and explain the following text: "${textToAnalyze}"` }],
                model: 'openrouter/free'
            })
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        responseEl.className = '';
        responseEl.innerHTML = '';
        
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
                        if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                            const textNode = document.createTextNode(data.choices[0].delta.content);
                            responseEl.appendChild(textNode);
                        }
                    } catch (e) {
                        // ignore parse error
                    }
                }
            }
        }
    } catch (error) {
        responseEl.className = 'error';
        responseEl.textContent = `Error: ${error.message}`;
    }
});
