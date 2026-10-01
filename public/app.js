const chat = document.getElementById("chat");
const input = document.getElementById("input");
const composer = document.getElementById("composer");
const send = document.getElementById("send");
const modelSelect = document.getElementById("model");
const welcome = document.getElementById("welcome");
const historyList = document.getElementById("history");
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
const liveChatBtn = document.getElementById("liveChatBtn");
const composerArea = document.querySelector(".composer-area");
const globalChatView = document.getElementById("globalChatView");
const globalChatAuth = document.getElementById("globalChatAuth");
const globalChatRoom = document.getElementById("globalChatRoom");
const globalAuthForm = document.getElementById("globalAuthForm");
const globalLoginTab = document.getElementById("globalLoginTab");
const globalSignupTab = document.getElementById("globalSignupTab");
const globalDisplayNameField = document.getElementById("globalDisplayNameField");
const globalDisplayName = document.getElementById("globalDisplayName");
const globalEmail = document.getElementById("globalEmail");
const globalPassword = document.getElementById("globalPassword");
const globalAuthSubmit = document.getElementById("globalAuthSubmit");
const globalAuthStatus = document.getElementById("globalAuthStatus");
const globalChatIdentity = document.getElementById("globalChatIdentity");
const globalChatStatus = document.getElementById("globalChatStatus");
const globalChatConnectionLabel = document.getElementById("globalChatConnectionLabel");
const globalChatMessages = document.getElementById("globalChatMessages");
const globalSignOut = document.getElementById("globalSignOut");

let supabaseClient = null;
let globalChatSession = null;
let globalChatChannel = null;
let globalChatAuthMode = "login";
let globalChatUserId = null;
const renderedGlobalMessageIds = new Set();

/* THEME TOGGLE (LIGHT / DARK) */
const themeToggle = document.getElementById("themeToggle");

function initTheme() {
    const savedTheme = localStorage.getItem("texter_theme");
    const themes = ["light", "dark", "vscode"];
    applyTheme(themes.includes(savedTheme) ? savedTheme : "light");
}

function applyTheme(theme) {
    document.body.classList.remove("light", "dark", "vscode");
    document.body.classList.add(theme);
    localStorage.setItem("texter_theme", theme);
    if (themeToggle) {
        const themeNames = { light: "Light", dark: "Dark", vscode: "VS Code" };
        const themes = ["light", "dark", "vscode"];
        const nextTheme = themeNames[themes[(themes.indexOf(theme) + 1) % themes.length]];
        themeToggle.setAttribute("title", `Theme: ${themeNames[theme]} (click for ${nextTheme})`);
        themeToggle.setAttribute("aria-label", `Theme: ${themeNames[theme]}. Activate to switch to ${nextTheme}.`);
    }
}

if (themeToggle) {
    themeToggle.addEventListener("click", () => {
        const themes = ["light", "dark", "vscode"];
        const currentTheme = themes.find(theme => document.body.classList.contains(theme)) || "light";
        const nextTheme = themes[(themes.indexOf(currentTheme) + 1) % themes.length];
        applyTheme(nextTheme);
    });
}

initTheme();

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

/* MOBILE MENU & OVERLAY */
const closeSidebarBtn = document.getElementById("closeSidebarBtn");
const sidebarOverlay = document.getElementById("sidebarOverlay");

function openMobileSidebar() {
    sidebar.classList.add("open");
    if (sidebarOverlay) sidebarOverlay.classList.add("active");
}

function closeMobileSidebar() {
    sidebar.classList.remove("open");
    if (sidebarOverlay) sidebarOverlay.classList.remove("active");
}

if (menu) {
    menu.onclick = () => {
        if (sidebar.classList.contains("open")) {
            closeMobileSidebar();
        } else {
            openMobileSidebar();
        }
    };
}

if (closeSidebarBtn) {
    closeSidebarBtn.onclick = closeMobileSidebar;
}

if (sidebarOverlay) {
    sidebarOverlay.onclick = closeMobileSidebar;
}

/* NEW CHAT & URL ROUTING */
function switchToNewChat(updateUrl = true) {
    isLiveChat = false;
    leaveGlobalChat();
    messages = [];
    currentChatId = null;

    chat.innerHTML = "";
    chat.appendChild(welcome);
    const h1 = welcome.querySelector("h1");
    const p = welcome.querySelector("p");
    if (h1) h1.textContent = "How can I help?";
    if (p) p.textContent = "Ask anything, attach or paste screenshots with Ctrl+V for MCQs, and choose a free model above.";
    welcome.style.display = "block";
    composerArea.hidden = false;
    input.placeholder = "Message AI or paste screenshot (Ctrl+V)...";

    input.value = "";
    autoResize();
    if (removeImageBtn) removeImageBtn.click();
    input.focus();
    closeMobileSidebar();

    if (updateUrl && window.location.pathname !== "/chat") {
        window.history.pushState({ page: "chat" }, "", "/chat");
    }
}

if (newChat) {
    newChat.onclick = () => switchToNewChat(true);
}

/* LIVE CHAT & URL ROUTING */
function switchToLiveChat(updateUrl = true) {
    isLiveChat = true;
    chat.innerHTML = "";
    chat.appendChild(globalChatView);
    globalChatView.hidden = false;
    composerArea.hidden = true;
    input.value = "";
    autoResize();
    closeMobileSidebar();
    void initializeGlobalChat();

    if (updateUrl && window.location.pathname !== "/global-chat") {
        window.history.pushState({ page: "global-chat" }, "", "/global-chat");
    }
}

if (liveChatBtn) {
    liveChatBtn.onclick = () => switchToLiveChat(true);
}

function setGlobalAuthMode(mode) {
    globalChatAuthMode = mode;
    const isSignup = mode === "signup";
    globalDisplayNameField.hidden = !isSignup;
    globalDisplayName.required = isSignup;
    globalPassword.autocomplete = isSignup ? "new-password" : "current-password";
    globalAuthSubmit.textContent = isSignup ? "Create account" : "Sign in";
    globalLoginTab.classList.toggle("active", !isSignup);
    globalSignupTab.classList.toggle("active", isSignup);
    globalLoginTab.setAttribute("aria-selected", String(!isSignup));
    globalSignupTab.setAttribute("aria-selected", String(isSignup));
    globalAuthStatus.textContent = "";
    delete globalAuthStatus.dataset.state;
}

globalLoginTab.addEventListener("click", () => setGlobalAuthMode("login"));
globalSignupTab.addEventListener("click", () => setGlobalAuthMode("signup"));

async function initializeGlobalChat() {
    globalAuthStatus.textContent = "Connecting to Supabase...";

    try {
        if (!supabaseClient) {
            if (!window.supabase?.createClient) {
                throw new Error("Supabase client library could not be loaded.");
            }

            const response = await fetch("/api/supabase-config");
            const config = await response.json();
            if (!response.ok || !config.url || !config.anonKey) {
                throw new Error("Global chat is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to the server environment.");
            }

            supabaseClient = window.supabase.createClient(config.url, config.anonKey);
            supabaseClient.auth.onAuthStateChange((_event, session) => {
                globalChatSession = session;
                setTimeout(() => {
                    if (isLiveChat) void updateGlobalChatView();
                }, 0);
            });
        }

        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        globalChatSession = data.session;
        await updateGlobalChatView();
    } catch (error) {
        globalAuthStatus.textContent = error.message;
        globalAuthStatus.dataset.state = "error";
    }
}

async function updateGlobalChatView() {
    if (!isLiveChat) return;

    const session = globalChatSession;
    globalChatAuth.hidden = Boolean(session);
    globalChatRoom.hidden = !session;
    composerArea.hidden = !session;

    if (!session) {
        globalChatUserId = null;
        renderedGlobalMessageIds.clear();
        globalChatMessages.replaceChildren();
        input.placeholder = "Sign in to send a message...";
        if (globalChatChannel) {
            void supabaseClient.removeChannel(globalChatChannel);
            globalChatChannel = null;
        }
        return;
    }

    const user = session.user;
    const name = user.user_metadata?.display_name || user.email?.split("@")[0] || "Member";
    globalChatIdentity.textContent = `Signed in as ${name}`;
    input.placeholder = "Message the global chat...";

    if (globalChatUserId !== user.id) {
        globalChatUserId = user.id;
        renderedGlobalMessageIds.clear();
        globalChatMessages.replaceChildren();
        if (globalChatChannel) {
            void supabaseClient.removeChannel(globalChatChannel);
            globalChatChannel = null;
        }
    }

    subscribeToGlobalChat();
    await loadGlobalChatMessages();
}

function subscribeToGlobalChat() {
    if (globalChatChannel || !supabaseClient) return;

    globalChatChannel = supabaseClient
        .channel("global-chat-room")
        .on("postgres_changes", {
            event: "INSERT",
            schema: "public",
            table: "global_chat_messages"
        }, payload => renderGlobalChatMessage(payload.new))
        .subscribe(status => {
            if (status === "SUBSCRIBED") {
                globalChatConnectionLabel.textContent = "Connected";
                globalChatStatus.textContent = "";
                delete globalChatStatus.dataset.state;
            } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                globalChatConnectionLabel.textContent = "Connection issue";
                globalChatStatus.textContent = "Realtime connection failed. Check that the SQL schema is installed and Realtime is enabled.";
                globalChatStatus.dataset.state = "error";
            }
        });
}

async function loadGlobalChatMessages() {
    globalChatStatus.textContent = "Loading recent messages...";
    const { data, error } = await supabaseClient
        .from("global_chat_messages")
        .select("id, user_id, display_name, content, created_at")
        .order("created_at", { ascending: false })
        .limit(100);

    if (error) {
        globalChatStatus.textContent = error.message;
        globalChatStatus.dataset.state = "error";
        return;
    }

    data.reverse().forEach(renderGlobalChatMessage);
    if (globalChatStatus.textContent === "Loading recent messages...") {
        globalChatStatus.textContent = "";
        delete globalChatStatus.dataset.state;
    }
}

function renderGlobalChatMessage(message) {
    if (!message || renderedGlobalMessageIds.has(message.id)) return;
    renderedGlobalMessageIds.add(message.id);

    const wrapper = document.createElement("article");
    wrapper.className = "global-chat-message";

    const avatar = document.createElement("div");
    avatar.className = "global-chat-message-avatar";
    avatar.textContent = (message.display_name || "M").slice(0, 1).toUpperCase();

    const body = document.createElement("div");
    body.className = "global-chat-message-body";

    const meta = document.createElement("div");
    meta.className = "global-chat-message-meta";
    const name = document.createElement("strong");
    name.textContent = message.display_name || "Member";
    const time = document.createElement("time");
    time.dateTime = message.created_at;
    time.textContent = new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    const text = document.createElement("p");
    text.className = "global-chat-message-text";
    text.textContent = message.content;

    meta.append(name, time);
    body.append(meta, text);
    wrapper.append(avatar, body);
    globalChatMessages.appendChild(wrapper);
    globalChatMessages.scrollTop = globalChatMessages.scrollHeight;
}

globalAuthForm.addEventListener("submit", async event => {
    event.preventDefault();
    globalAuthSubmit.disabled = true;
    globalAuthStatus.textContent = "";
    delete globalAuthStatus.dataset.state;

    const email = globalEmail.value.trim();
    const password = globalPassword.value;
    let result;

    try {
        if (!supabaseClient) throw new Error("Supabase is not configured. Add the project URL and anon key to the server environment.");

        if (globalChatAuthMode === "signup") {
            const displayName = globalDisplayName.value.trim().replace(/\s+/g, " ");
            if (!displayName) throw new Error("Enter a display name.");
            result = await supabaseClient.auth.signUp({
                email,
                password,
                options: { data: { display_name: displayName } }
            });
        } else {
            result = await supabaseClient.auth.signInWithPassword({ email, password });
        }

        if (result.error) throw result.error;
        if (globalChatAuthMode === "signup" && !result.data.session) {
            globalAuthStatus.textContent = "Check your email to confirm your account, then sign in.";
            return;
        }

        globalChatSession = result.data.session;
        await updateGlobalChatView();
    } catch (error) {
        globalAuthStatus.textContent = error.message || "Authentication failed.";
        globalAuthStatus.dataset.state = "error";
    } finally {
        globalAuthSubmit.disabled = false;
    }
});

globalSignOut.addEventListener("click", async () => {
    if (!supabaseClient) return;
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        globalChatStatus.textContent = error.message;
        globalChatStatus.dataset.state = "error";
        return;
    }
    globalChatSession = null;
    await updateGlobalChatView();
});

async function sendGlobalChatMessage(text) {
    const user = globalChatSession?.user;
    if (!user || !supabaseClient) return;
    if (text.length > 1000) {
        globalChatStatus.textContent = "Messages must be 1,000 characters or fewer.";
        globalChatStatus.dataset.state = "error";
        return;
    }

    const displayName = user.user_metadata?.display_name || user.email?.split("@")[0] || "Member";
    const { data, error } = await supabaseClient
        .from("global_chat_messages")
        .insert({ user_id: user.id, display_name: displayName, content: text })
        .select("id, user_id, display_name, content, created_at")
        .single();

    if (error) {
        globalChatStatus.textContent = error.message;
        globalChatStatus.dataset.state = "error";
        return;
    }

    globalChatStatus.textContent = "";
    delete globalChatStatus.dataset.state;
    renderGlobalChatMessage(data);
    input.value = "";
    autoResize();
}

function leaveGlobalChat() {
    if (globalChatChannel && supabaseClient) {
        void supabaseClient.removeChannel(globalChatChannel);
        globalChatChannel = null;
    }
    globalChatView.hidden = true;
}

/* IMAGE HANDLING & PASTE */
function handleImageFile(file) {
    if (!file || !file.type.startsWith("image/")) return;

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
}

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
        if (file) handleImageFile(file);
    };
}

/* CLIPBOARD PASTE (Ctrl+V Screenshots) */
window.addEventListener("paste", (e) => {
    const clipboardData = e.clipboardData || window.clipboardData;
    if (!clipboardData) return;

    // Check clipboard items for image data (e.g. from PrintScreen, Win+Shift+S, Snipping Tool)
    const items = clipboardData.items;
    if (items) {
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf("image") !== -1) {
                const file = items[i].getAsFile();
                if (file) {
                    e.preventDefault();
                    handleImageFile(file);
                    return;
                }
            }
        }
    }

    // Fallback: check clipboard files
    const files = clipboardData.files;
    if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
            if (files[i].type.startsWith("image/")) {
                e.preventDefault();
                handleImageFile(files[i]);
                return;
            }
        }
    }
});

/* DRAG AND DROP IMAGES */
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
            if (e.dataTransfer.files[i].type.startsWith("image/")) {
                e.preventDefault();
                handleImageFile(e.dataTransfer.files[i]);
                return;
            }
        }
    }
});

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
        if (!text || !globalChatSession) return;
        await sendGlobalChatMessage(text);
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
        let reasoningText = "";

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
                    const reasoningDelta = json.choices?.[0]?.delta?.reasoning;

                    if (reasoningDelta) {
                        reasoningText += reasoningDelta;
                        if (!fullText) {
                            assistantBubble.innerHTML = '<span style="color: var(--subtext); font-style: italic;"><span class="dot-pulse"></span> Analyzing & reasoning...</span>';
                        }
                    }

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

        if (!fullText.trim() && reasoningText.trim()) {
            fullText = reasoningText;
            assistantBubble.innerHTML = DOMPurify.sanitize(marked.parse(fullText));
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
    closeMobileSidebar();
    if (window.location.pathname !== "/chat") {
        window.history.pushState({ page: "chat" }, "", "/chat");
    }
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
    historyList.innerHTML = "";

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
        historyList.appendChild(item);
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

/* URL ROUTER (/chat & /global-chat) */
function initRouter() {
    const path = window.location.pathname;
    if (path === "/global-chat") {
        switchToLiveChat(false);
    } else {
        switchToNewChat(false);
        if (path !== "/chat") {
            window.history.replaceState({ page: "chat" }, "", "/chat");
        }
    }
}

window.addEventListener("popstate", () => {
    const path = window.location.pathname;
    if (path === "/global-chat") {
        switchToLiveChat(false);
    } else {
        switchToNewChat(false);
    }
});

initRouter();
