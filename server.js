const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

const ASHNA_API_URL = "https://api.ashna.ai/v1/api";
const TAVILY_API_URL = "https://api.tavily.com/search";

app.use(express.json());
app.use(express.static("public"));


// ========================================
// GET AVAILABLE MODELS
// ========================================

app.get("/api/models", async (req, res) => {

    try {

        const response = await fetch(
            `${ASHNA_API_URL}/models`,
            {
                headers: {
                    "Authorization":
                        `Bearer ${process.env.ASHNA_API_KEY}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {

            return res.status(response.status).json({
                error:
                    data.error?.message ||
                    "Could not load models."
            });

        }

        res.json(data);

    } catch (error) {

        console.error("Models error:", error);

        res.status(500).json({
            error: "Could not connect to AshnaAI."
        });

    }

});


// ========================================
// TAVILY SEARCH
// ========================================

async function searchWeb(query) {

    const response = await fetch(
        TAVILY_API_URL,
        {

            method: "POST",

            headers: {
                "Content-Type": "application/json",

                "Authorization":
                    `Bearer ${process.env.TAVILY_API_KEY}`
            },

            body: JSON.stringify({

                query: query,

                search_depth: "basic",

                max_results: 5,

                include_answer: false

            })

        }
    );


    const data = await response.json();


    if (!response.ok) {

        console.error(
            "Tavily error:",
            data
        );

        throw new Error(
            data.message ||
            "Tavily search failed."
        );

    }


    return data.results || [];

}


// ========================================
// CHAT - STREAMING
// ========================================

app.post("/api/chat", async (req, res) => {

    try {

        const {
            messages,
            model,
            webSearch
        } = req.body;


        if (!messages ||
            !Array.isArray(messages)) {

            return res.status(400).json({
                error: "Messages are required."
            });

        }


        if (!model) {

            return res.status(400).json({
                error: "Please select a model."
            });

        }


        let finalMessages = [

            {
                role: "system",

                content:
                    `You are My AI, a helpful,
                    friendly and intelligent AI assistant.

                    Give clear and useful answers.
                    Remember the conversation context.

                    When web search results are provided,
                    use them carefully and do not invent
                    information that isn't supported
                    by the sources.`
            }

        ];


        let sources = [];


        // ========================================
        // TAVILY
        // ========================================

        if (webSearch) {

            const lastUserMessage =
                messages
                    .filter(
                        message =>
                            message.role === "user"
                    )
                    .pop();


            if (lastUserMessage) {

                console.log(
                    "Searching web for:",
                    lastUserMessage.content
                );


                const results =
                    await searchWeb(
                        lastUserMessage.content
                    );


                sources =
                    results.map(result => ({

                        title:
                            result.title ||
                            "Untitled",

                        url:
                            result.url,

                        snippet:
                            result.content ||
                            ""

                    }));


                const webContext =
                    results
                        .map(
                            (result, index) => {

                                return `
SOURCE ${index + 1}

TITLE:
${result.title}

URL:
${result.url}

CONTENT:
${result.content}
`;

                            }
                        )
                        .join("\n");


                finalMessages.push({

                    role: "system",

                    content:
                        `The user has enabled web search.

Use the following search results to
answer the user's question.

Only use information supported by
these results.

WEB SEARCH RESULTS:

${webContext}`

                });

            }

        }


        finalMessages.push(
            ...messages
        );


        console.log(
            "Using model:",
            model
        );


        // ========================================
        // ASK ASHNAAI WITH STREAMING
        // ========================================

        const response =
            await fetch(
                `${ASHNA_API_URL}/chat/completions`,
                {

                    method: "POST",

                    headers: {

                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${process.env.ASHNA_API_KEY}`

                    },

                    body: JSON.stringify({

                        model: model,

                        messages:
                            finalMessages,

                        temperature: 0.7,

                        max_tokens: 1000,

                        stream: true

                    })

                }
            );


        if (!response.ok) {

            const errorData =
                await response.json();

            console.error(
                "AshnaAI error:",
                errorData
            );

            return res.status(
                response.status
            ).json({

                error:
                    errorData.error?.message ||
                    "AshnaAI request failed."

            });

        }


        // ========================================
        // STREAM RESPONSE
        // ========================================

        res.status(200);

        res.setHeader(
            "Content-Type",
            "text/event-stream"
        );

        res.setHeader(
            "Cache-Control",
            "no-cache"
        );

        res.setHeader(
            "Connection",
            "keep-alive"
        );


        // Send sources first

        res.write(
            `data: ${JSON.stringify({
                type: "sources",
                sources: sources
            })}\n\n`
        );


        const reader =
            response.body.getReader();


        const decoder =
            new TextDecoder();


        let buffer = "";


        while (true) {

            const {
                value,
                done
            } = await reader.read();


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


            const lines =
                buffer.split("\n");


            buffer =
                lines.pop();


            for (const line of lines) {

                const trimmed =
                    line.trim();


                if (!trimmed) {
                    continue;
                }


                if (!trimmed.startsWith("data:")) {
                    continue;
                }


                const data =
                    trimmed.substring(5).trim();


                if (data === "[DONE]") {

                    res.write(
                        `data: ${JSON.stringify({
                            type: "done"
                        })}\n\n`
                    );

                    continue;

                }


                try {

                    const parsed =
                        JSON.parse(data);


                    const content =
                        parsed
                            .choices?.[0]
                            ?.delta
                            ?.content;


                    if (content) {

                        res.write(
                            `data: ${JSON.stringify({
                                type: "content",
                                delta: content
                            })}\n\n`
                        );

                    }

                } catch (error) {

                    console.error(
                        "Stream parse error:",
                        error
                    );

                }

            }

        }


        res.end();


    } catch (error) {

        console.error(
            "Server error:",
            error
        );


        if (!res.headersSent) {

            return res.status(500).json({

                error:
                    error.message ||
                    "Something went wrong."

            });

        }


        res.end();

    }

});


// ========================================
// START
// ========================================

app.listen(PORT, () => {

    console.log(
        `My AI is running at http://localhost:${PORT}`
    );

});
