const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

io.on("connection", (socket) => {
    console.log("A user connected");
    socket.on("chat message", (msg) => {
        // Broadcast the message to all connected clients except the sender
        socket.broadcast.emit("chat message", msg);
    });
    socket.on("disconnect", () => {
        console.log("A user disconnected");
    });
});

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Enable CORS for all routes (needed for Chrome extension)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.get("/api/download-extension", (req, res) => {
    const zipPath = path.join(__dirname, "public", "extension.zip");
    res.download(zipPath, "ai-teacher-extension.zip");
});

app.post("/api/chat", async (req, res) => {
    try {
        const { messages, model } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({
                error: "Invalid messages"
            });
        }

        const response = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "http://localhost:" + PORT,
                    "X-Title": "My OpenRouter Chat"
                },
                body: JSON.stringify({
                    model: model || "openrouter/free",
                    messages,
                    stream: true
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();

            return res.status(response.status).json({
                error: errorText
            });
        }

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();

            if (done) break;

            const chunk = decoder.decode(value, {
                stream: true
            });

            res.write(chunk);
        }

        res.end();

    } catch (error) {
        console.error(error);

        if (!res.headersSent) {
            res.status(500).json({
                error: error.message
            });
        } else {
            res.end();
        }
    }
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});
server.listen(PORT, "0.0.0.0", () => {
    console.log(`Chat running on http://0.0.0.0:${PORT}`);
});