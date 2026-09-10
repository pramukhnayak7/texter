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

let messages = [];
let chats = [];
let currentChatId = null;
let generating = false;

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
        messages = [];
        currentChatId = null;

        chat.innerHTML = "";
        chat.appendChild(welcome);
        welcome.style.display = "block";

        input.value = "";
        autoResize();
        input.focus();
        sidebar.classList.remove("open");
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
function addMessage(role, content = "") {
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
        bubble.textContent = content;
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
    if (!text || generating) return;

    generating = true;
    send.disabled = true;

    messages.push({
        role: "user",
        content: text
    });

    addMessage("user", text);

    input.value = "";
    autoResize();

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

    const title = first.content.slice(0, 40);

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
        addMessage(message.role, message.content);
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
