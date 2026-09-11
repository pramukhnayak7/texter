const chat = document.getElementById("chat");
const input = document.getElementById("input");
const composer = document.getElementById("composer");
const send = document.getElementById("send");
const modelSelect = document.getElementById("model");
const welcome = document.getElementById("welcome");
const history = document.getElementById("history");
const sidebar = document.getElementById("sidebar");
const menu = document.getElementById("menu");
const newChat = document.getElementById("newChat");
const attachBtn = document.getElementById("attachBtn");
const imageInput = document.getElementById("imageInput");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const imagePreview = document.getElementById("imagePreview");
const removeImageBtn = document.getElementById("removeImageBtn");

let attachedImageBase64 = null;

let messages = [];
let chats = [];
let currentChatId = null;
let generating = false;

let isLiveChat = false;
let socket = null;
const liveChatBtn = document.getElementById("liveChatBtn");

/* HISTORY DELETE BUTTON STYLING */
const historyStyle = document.createElement("style");
historyStyle.textContent = `
.history-item {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 8px !important;
    width: 100% !important;
    box-sizing: border-box !important;
}
.history-title {
    flex: 1 !important;
    min-width: 0 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
    cursor: pointer !important;
}
.history-delete {
    flex: 0 0 28px !important;
    width: 28px !important;
    height: 28px !important;
    padding: 0 !important;
    border: 1px solid transparent !important;
    border-radius: 6px !important;
    background: transparent !important;
    color: #777 !important;
    cursor: pointer !important;
    font: inherit !important;
    font-size: 16px !important;
    line-height: 26px !important;
    opacity: 0 !important;
    transition: opacity .15s ease, color .15s ease, background .15s ease !important;
}
.history-item:hover .history-delete,
.history-delete:focus-visible {
    opacity: 1 !important;
}
.history-delete:hover {
    color: #ff3b30 !important;
    background: rgba(255, 59, 48, .12) !important;
    border-color: rgba(255, 59, 48, .25) !important;
}
`;
document.head.appendChild(historyStyle);

/* MOBILE MENU */
if (menu) {
    menu.onclick = () => {
        sidebar.classList.toggle("open");
    };
}

/* NEW CHAT */
if (newChat) {
    newChat.onclick = () => {
        isLiveChat = false;
        messages = [];
        currentChatId = null;

        chat.innerHTML = "";
        chat.appendChild(welcome);
        const h1 = welcome.querySelector("h1");
        const p = welcome.querySelector("p");
        if(h1) h1.textContent = "How can I help?";
        if(p) p.textContent = "Ask anything, attach images for MCQs, and choose an OpenRouter model above.";
        welcome.style.display = "block";

        input.value = "";
        autoResize();
        if (removeImageBtn) removeImageBtn.click();
        input.focus();
        sidebar.classList.remove("open");
    };
}

/* LIVE CHAT */
if (liveChatBtn) {
    liveChatBtn.onclick = () => {
        isLiveChat = true;
        chat.innerHTML = "";
        chat.appendChild(welcome);
        const h1 = welcome.querySelector("h1");
        const p = welcome.querySelector("p");
        if(h1) h1.textContent = "Global Live Chat";
        if(p) p.textContent = "Chat with other users in real-time.";
        welcome.style.display = "block";
        
        if (!socket) {
            socket = io();
            socket.on("chat message", (msg) => {
                welcome.style.display = "none";
                const wrapper = document.createElement("div");
                wrapper.className = "message assistant";
                wrapper.innerHTML = `<div class="role" style="background:#ff9500">U</div><div class="bubble"><span style="white-space: pre-wrap">${escapeHtml(msg)}</span></div>`;
                chat.appendChild(wrapper);
                chat.scrollTop = chat.scrollHeight;
            });
        }
        
        input.value = "";
        autoResize();
        input.focus();
        sidebar.classList.remove("open");
    };
}

/* IMAGE HANDLING */
if (attachBtn) {
    attachBtn.onclick = () => {
        imageInput.click();
    };
}

if (removeImageBtn) {
    removeImageBtn.onclick = () => {
        attachedImageBase64 = null;
        imagePreviewContainer.style.display = "none";
        imagePreview.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
        imageInput.value = "";
    };
}

if (imageInput) {
    imageInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;
                const maxDim = 800;

                if (width > height && width > maxDim) {
                    height *= maxDim / width;
                    width = maxDim;
                } else if (height > maxDim) {
                    width *= maxDim / height;
                    height = maxDim;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                attachedImageBase64 = canvas.toDataURL("image/jpeg", 0.7);
                imagePreview.src = attachedImageBase64;
                imagePreviewContainer.style.display = "block";
                input.focus();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    };
}

/* PROMPT BUTTONS */
function usePrompt(text) {
    input.value = text;
    input.focus();
    autoResize();
}

/* TEXTAREA */
input.addEventListener("input", autoResize);

function autoResize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 180) + "px";
}

/* ENTER / SHIFT + ENTER */
input.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;

    // Shift + Enter = normal textarea newline.
    if (e.shiftKey) return;

    // Enter = send.
    e.preventDefault();
    e.stopPropagation();

    if (!generating) {
        composer.requestSubmit();
    }
});

/* CODE COPY */
async function copyCode(code, button) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(code);
        } else {
            const area = document.createElement("textarea");
            area.value = code;
            area.style.position = "fixed";
            area.style.left = "-9999px";
            area.style.top = "0";
            document.body.appendChild(area);
            area.focus();
            area.select();
            area.setSelectionRange(0, area.value.length);
            document.execCommand("copy");
            area.remove();
        }

        // Keep the button visible permanently.
        button.textContent = "COPIED ✓";
        button.classList.add("copied");
    } catch (error) {
        console.error("Code copy failed:", error);
        button.textContent = "COPY FAILED";
        setTimeout(() => {
            button.textContent = "COPY";
        }, 1400);
    }
}

function addCodeCopyButtons(container) {
    container.querySelectorAll("pre").forEach(pre => {
        // Never add duplicate buttons.
        if (pre.querySelector(":scope > .code-copy")) return;

        const codeElement = pre.querySelector("code");
        const button = document.createElement("button");

        button.type = "button";
        button.className = "code-copy";
        button.textContent = "COPY";
        button.title = "Copy code";
        button.setAttribute("aria-label", "Copy code");

        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();

            const code = codeElement
                ? codeElement.textContent
                : pre.textContent.replace("COPY", "").trim();

            copyCode(code, button);
        });

        pre.appendChild(button);
    });
}

/* ADD MESSAGE */
function addMessage(role, content = "", imageUrl = null) {
    welcome.style.display = "none";

    const wrapper = document.createElement("div");
    wrapper.className = `message ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "role";
    avatar.textContent = role === "user" ? "You" : "AI";

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (role === "assistant") {
        bubble.innerHTML = DOMPurify.sanitize(marked.parse(content));
    } else {
        if (imageUrl) {
            const img = document.createElement("img");
            img.src = imageUrl;
            img.style.maxWidth = "100%";
            img.style.maxHeight = "300px";
            img.style.borderRadius = "8px";
            img.style.marginBottom = "10px";
            img.style.display = "block";
            bubble.appendChild(img);
        }
        const textSpan = document.createElement("span");
        textSpan.textContent = content;
        textSpan.style.whiteSpace = "pre-wrap";
        bubble.appendChild(textSpan);
    }

    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
    chat.appendChild(wrapper);
    chat.scrollTop = chat.scrollHeight;

    return bubble;
}

/* SEND */
composer.addEventListener("submit", async e => {
    e.preventDefault();

    const text = input.value.trim();
    if (!text && !attachedImageBase64 || generating) return;

    if (isLiveChat) {
        if (!text) return;
        if (socket) socket.emit("chat message", text);
        
        welcome.style.display = "none";
        const wrapper = document.createElement("div");
        wrapper.className = "message user";
        wrapper.innerHTML = `<div class="role">You</div><div class="bubble"><span style="white-space: pre-wrap">${escapeHtml(text)}</span></div>`;
        chat.appendChild(wrapper);
        chat.scrollTop = chat.scrollHeight;
        
        input.value = "";
        autoResize();
        return;
    }

    generating = true;
    send.disabled = true;

    let userContent;
    if (attachedImageBase64) {
        userContent = [
            { type: "text", text: text || "What's in this image?" },
            { type: "image_url", image_url: { url: attachedImageBase64 } }
        ];
    } else {
        userContent = text;
    }

    messages.push({
        role: "user",
        content: userContent
    });

    addMessage("user", text, attachedImageBase64);

    const savedImage = attachedImageBase64;
    
    input.value = "";
    autoResize();
    if (removeImageBtn) removeImageBtn.click();

    const assistantBubble = addMessage("assistant", "");

    try {
        // IMPORTANT: only send completed conversation messages to the API.
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: modelSelect.value,
                messages: [...messages]
            })
        });

        if (!response.ok) {
            let errorMessage = "Request failed";
            try {
                const error = await response.json();
                errorMessage = error.error || errorMessage;
            } catch {}
            throw new Error(errorMessage);
        }

        if (!response.body) {
            throw new Error("No response stream received from server");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (!line.startsWith("data:")) continue;

                const data = line.slice(5).trim();
                if (!data || data === "[DONE]") continue;

                try {
                    const json = JSON.parse(data);
                    const delta = json.choices?.[0]?.delta?.content;

                    if (delta) {
                        fullText += delta;
                        assistantBubble.innerHTML = DOMPurify.sanitize(
                            marked.parse(fullText)
                        );
                        chat.scrollTop = chat.scrollHeight;
                    }
                } catch {
                    // Ignore malformed SSE chunks.
                }
            }
        }

        // Store the completed assistant response only after streaming finishes.
        messages.push({
            role: "assistant",
            content: fullText
        });

        // Rebuild code-copy buttons after the stream is complete.
        addCodeCopyButtons(assistantBubble);

        saveCurrentChat();

    } catch (error) {
        assistantBubble.innerHTML = `<p><strong>Error:</strong> ${escapeHtml(error.message)}</p>`;
    } finally {
        generating = false;
        send.disabled = false;
        input.focus();
    }
});

/* HISTORY */
function makeChatId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function saveCurrentChat() {
    if (!messages.length) return;

    const first = messages.find(m => m.role === "user");
    if (!first) return;

    let titleText = typeof first.content === 'string' 
        ? first.content 
        : (first.content.find(c => c.type === 'text')?.text || "Image chat");
    
    const title = titleText.slice(0, 40);

    if (!currentChatId) {
        currentChatId = makeChatId();
    }

    const existingIndex = chats.findIndex(c => c.id === currentChatId);

    const chatData = {
        id: currentChatId,
        title,
        messages: [...messages]
    };

    if (existingIndex >= 0) {
        chats[existingIndex] = chatData;
    } else {
        chats.unshift(chatData);
    }

    chats = chats.slice(0, 20);

    localStorage.setItem("chats", JSON.stringify(chats));
    renderHistory();
}

function loadChat(chatData) {
    if (generating) return;

    currentChatId = chatData.id;
    messages = [...chatData.messages];

    chat.innerHTML = "";

    messages.forEach(message => {
        let text = "";
        let img = null;
        if (typeof message.content === 'string') {
            text = message.content;
        } else if (Array.isArray(message.content)) {
            text = message.content.find(c => c.type === 'text')?.text || "";
            img = message.content.find(c => c.type === 'image_url')?.image_url?.url || null;
        }
        addMessage(message.role, text, img);
    });

    renderHistory();
    sidebar.classList.remove("open");
    input.focus();
}

function deleteChat(id, event) {
    event.stopPropagation();

    const chatData = chats.find(c => c.id === id);
    if (!chatData) return;

    if (!confirm(`Delete "${chatData.title}"?`)) return;

    chats = chats.filter(c => c.id !== id);
    localStorage.setItem("chats", JSON.stringify(chats));

    if (currentChatId === id) {
        messages = [];
        currentChatId = null;

        chat.innerHTML = "";
        chat.appendChild(welcome);
        welcome.style.display = "block";
        input.value = "";
        autoResize();
    }

    renderHistory();
}

function renderHistory() {
    history.innerHTML = "";

    chats.forEach(chatData => {
        const item = document.createElement("div");
        item.className = "history-item";

        if (chatData.id === currentChatId) {
            item.classList.add("active");
        }

        const title = document.createElement("span");
        title.className = "history-title";
        title.textContent = chatData.title;

        const deleteButton = document.createElement("button");
        deleteButton.className = "history-delete";
        deleteButton.type = "button";
        deleteButton.title = "Delete chat";
        deleteButton.setAttribute("aria-label", "Delete chat");
        deleteButton.textContent = "×";

        deleteButton.addEventListener("click", event => {
            deleteChat(chatData.id, event);
        });

        item.addEventListener("click", () => {
            loadChat(chatData);
        });

        item.appendChild(title);
        item.appendChild(deleteButton);
        history.appendChild(item);
    });
}

/* SECURITY */
function escapeHtml(text) {
    return String(text)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* TEXT SELECTION ANALYSIS */
const selectionTooltip = document.createElement("button");
selectionTooltip.textContent = "Analyze Text";
selectionTooltip.style.position = "fixed";
selectionTooltip.style.display = "none";
selectionTooltip.style.zIndex = "1000";
selectionTooltip.style.padding = "6px 12px";
selectionTooltip.style.background = "var(--red)";
selectionTooltip.style.color = "#fff";
selectionTooltip.style.border = "none";
selectionTooltip.style.borderRadius = "6px";
selectionTooltip.style.cursor = "pointer";
selectionTooltip.style.fontSize = "12px";
selectionTooltip.style.fontWeight = "bold";
selectionTooltip.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
document.body.appendChild(selectionTooltip);

document.addEventListener("mouseup", (e) => {
    // Small delay to allow selection to update
    setTimeout(() => {
        const selection = window.getSelection();
        const text = selection.toString().trim();
        
        if (text.length > 0 && !generating) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            // Ensure tooltip stays within viewport
            let top = rect.top - 40;
            if (top < 10) top = rect.bottom + 10;
            
            selectionTooltip.style.top = `${top}px`;
            selectionTooltip.style.left = `${rect.left + rect.width / 2}px`;
            selectionTooltip.style.transform = "translateX(-50%)";
            selectionTooltip.style.display = "block";
            
            selectionTooltip.onclick = () => {
                selectionTooltip.style.display = "none";
                input.value = "Please analyze this text:\n\n" + text;
                composer.requestSubmit();
                window.getSelection().removeAllRanges();
            };
        } else {
            selectionTooltip.style.display = "none";
        }
    }, 10);
});

// Hide tooltip on mousedown so it doesn't stay if user clicks away
document.addEventListener("mousedown", (e) => {
    if (e.target !== selectionTooltip) {
        selectionTooltip.style.display = "none";
    }
});
