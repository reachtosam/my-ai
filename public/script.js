const form =
    document.getElementById("chat-form");

const input =
    document.getElementById("user-input");

const chat =
    document.getElementById("chat");

const button =
    document.getElementById("send-button");

const modelSelect =
    document.getElementById("model-select");

const webSearch =
    document.getElementById("web-search");
const newChatButton =
    document.getElementById("new-chat-button");



// ========================================
// MEMORY
// ========================================

let conversation = [];

// ========================================
// NEW CHAT
// ========================================

newChatButton.addEventListener(
    "click",
    function() {

        conversation = [];

        chat.innerHTML = `
            <div class="message ai-message">

                <div class="avatar">
                    AI
                </div>

                <div class="bubble">
                    Hello! 👋<br>
                    I'm your AI assistant. How can I help you?
                </div>

            </div>
        `;

        input.value = "";

        input.focus();

    }
);



// ========================================
// DEFAULT MODEL
// ========================================

// Put the exact model ID you want here.
//
// Example:
// "gemini-2.5-flash"
// "claude-sonnet-4"
// "deepseek-chat"
//
// Use the exact ID shown in your model dropdown.

const DEFAULT_MODEL = "gpt-6-astra";


// ========================================
// LOAD MODELS
// ========================================

async function loadModels() {

    try {

        const response =
            await fetch("/api/models");

        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Could not load models."
            );

        }


        modelSelect.innerHTML = "";


        data.data.forEach(model => {

            const option =
                document.createElement("option");


            option.value =
                model.id;


            option.textContent =
                model.id;


            // Automatically select
            // your preferred model

            if (model.id === DEFAULT_MODEL) {

                option.selected = true;

            }


            modelSelect.appendChild(
                option
            );

        });


        console.log(
            "Loaded",
            data.data.length,
            "models"
        );


    } catch (error) {

        console.error(
            "Model loading error:",
            error
        );


        modelSelect.innerHTML = "";

        const option =
            document.createElement("option");


        option.textContent =
            "Failed to load models";


        modelSelect.appendChild(
            option
        );

    }

}


// ========================================
// ADD MESSAGE
// ========================================

function addMessage(text, type) {

    const message =
        document.createElement("div");


    message.classList.add(
        "message"
    );


    if (type === "user") {

        message.classList.add(
            "user-message"
        );


        message.innerHTML = `
            <div class="bubble"></div>
            <div class="avatar">YOU</div>
        `;

    } else {

        message.classList.add(
            "ai-message"
        );


        message.innerHTML = `
            <div class="avatar">AI</div>
            <div class="bubble"></div>
        `;

    }


    message.querySelector(
        ".bubble"
    ).textContent = text;


    chat.appendChild(
        message
    );


    chat.scrollTop =
        chat.scrollHeight;


    return message;

}


// ========================================
// ADD SOURCES
// ========================================

function addSources(sources) {

    if (!sources ||
        sources.length === 0) {

        return;

    }


    const container =
        document.createElement("div");


    container.classList.add(
        "sources"
    );


    const title =
        document.createElement("div");


    title.classList.add(
        "sources-title"
    );


    title.textContent =
        "Sources";


    container.appendChild(
        title
    );


    sources.forEach(
        (source, index) => {

            if (!source.url) {
                return;
            }


            const link =
                document.createElement("a");


            link.classList.add(
                "source-link"
            );


            link.href =
                source.url;


            link.target =
                "_blank";


            link.rel =
                "noopener noreferrer";


            link.textContent =
                `${index + 1}. ${
                    source.title ||
                    "Source"
                }`;


            container.appendChild(
                link
            );

        }
    );


    chat.appendChild(
        container
    );


    chat.scrollTop =
        chat.scrollHeight;

}


// ========================================
// SEND MESSAGE
// ========================================

form.addEventListener(
    "submit",
    async function(event) {

        event.preventDefault();


        const text =
            input.value.trim();


        const model =
            modelSelect.value;


        const useWebSearch =
            webSearch.checked;


        if (!text) {
            return;
        }


        if (!model) {

            addMessage(
                "Please select a model.",
                "ai"
            );

            return;

        }


        // =================================
        // MEMORY
        // =================================

        conversation.push({

            role: "user",

            content: text

        });


        addMessage(
            text,
            "user"
        );


        input.value = "";

        input.disabled = true;

        button.disabled = true;

        modelSelect.disabled = true;

        webSearch.disabled = true;

        button.textContent = "...";


        // =================================
        // AI MESSAGE
        // =================================

        const thinking =
            addMessage(
                useWebSearch
                    ? "🔎 Searching..."
                    : "Thinking...",
                "ai"
            );


        const bubble =
            thinking.querySelector(
                ".bubble"
            );


        let fullReply = "";


        try {

            const response =
                await fetch(
                    "/api/chat",
                    {

                        method: "POST",

                        headers: {

                            "Content-Type":
                                "application/json"

                        },

                        body: JSON.stringify({

                            messages:
                                conversation,

                            model:
                                model,

                            webSearch:
                                useWebSearch

                        })

                    }
                );


            if (!response.ok) {

                const errorData =
                    await response.json();


                throw new Error(
                    errorData.error ||
                    "AI request failed."
                );

            }


            const reader =
                response.body.getReader();


            const decoder =
                new TextDecoder();


            let buffer = "";


            while (true) {

                const {
                    value,
                    done
                } =
                    await reader.read();


                if (done) {
                    break;
                }


                buffer +=
                    decoder.decode(
                        value,
                        {
                            stream: true
                        }
                    );


                const events =
                    buffer.split("\n\n");


                buffer =
                    events.pop();


                for (const event of events) {

                    const line =
                        event
                            .split("\n")
                            .find(
                                line =>
                                    line.startsWith(
                                        "data:"
                                    )
                            );


                    if (!line) {
                        continue;
                    }


                    const jsonText =
                        line
                            .substring(5)
                            .trim();


                    try {

                        const data =
                            JSON.parse(
                                jsonText
                            );


                        // Sources

                        if (
                            data.type ===
                            "sources"
                        ) {

                            if (
                                data.sources &&
                                data.sources.length
                            ) {

                                addSources(
                                    data.sources
                                );

                            }

                        }


                        // Text

                        if (
                            data.type ===
                            "content"
                        ) {

                            fullReply +=
                                data.delta;


                            bubble.textContent =
                                fullReply;


                            chat.scrollTop =
                                chat.scrollHeight;

                        }


                    } catch (error) {

                        console.error(
                            "Client stream error:",
                            error
                        );

                    }

                }

            }


            // Save completed response

            if (fullReply) {

                conversation.push({

                    role:
                        "assistant",

                    content:
                        fullReply

                });

            }


        } catch (error) {

            console.error(
                error
            );


            conversation.pop();


            bubble.textContent =
                "Error: " +
                error.message;

        }


        input.disabled = false;

        button.disabled = false;

        modelSelect.disabled = false;

        webSearch.disabled = false;

        button.textContent = "➤";

        input.focus();

    }
);


// ========================================
// START
// ========================================

loadModels();
