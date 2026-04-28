#include "bot.hpp"
#include <curl/curl.h>
#include <iostream>
#include <sstream>
#include <string>
#include <cstdlib>
#include <vector>

// ── libcurl write callback ────────────────────────────────────────────────────
static size_t writeCallback(char* ptr, size_t size, size_t nmemb, std::string* out) {
    out->append(ptr, size * nmemb);
    return size * nmemb;
}

// ── JSON string value extractor ───────────────────────────────────────────────
// Finds the value of the given JSON key and returns the string content.
// Handles basic escape sequences. Searches from `startPos` onward.
static std::string extractJsonString(const std::string& json,
                                     const std::string& key,
                                     size_t startPos = 0) {
    std::string needle = "\"" + key + "\":";
    size_t pos = json.find(needle, startPos);
    if (pos == std::string::npos) return "";

    pos += needle.size();
    while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\n')) pos++;
    if (pos >= json.size() || json[pos] != '"') return "";
    pos++; // skip opening quote

    std::string result;
    while (pos < json.size()) {
        char c = json[pos++];
        if (c == '\\' && pos < json.size()) {
            char esc = json[pos++];
            switch (esc) {
                case 'n':  result += '\n'; break;
                case 't':  result += '\t'; break;
                case '"':  result += '"';  break;
                case '\\': result += '\\'; break;
                case 'r':  result += '\r'; break;
                default:   result += esc;  break;
            }
        } else if (c == '"') {
            break;
        } else {
            result += c;
        }
    }
    return result;
}

// ── Extract DeepSeek / OpenAI response text ───────────────────────────────────
// Response shape: {"choices":[{"message":{"role":"assistant","content":"..."}}]}
// We locate "message": then extract "content": from that position.
static std::string extractContent(const std::string& json) {
    // Find the first "message": block inside choices
    size_t msgPos = json.find("\"message\":");
    if (msgPos == std::string::npos) return "";
    return extractJsonString(json, "content", msgPos);
}

// ── Word-wrap a plain-text string to a given visible width ────────────────────
static std::vector<std::string> wrapText(const std::string& text, int width) {
    std::vector<std::string> lines;
    std::istringstream iss(text);
    std::string word, current;

    auto flush = [&]() {
        if (!current.empty()) { lines.push_back(current); current.clear(); }
    };

    while (iss >> word) {
        if (current.empty()) {
            current = word;
        } else if ((int)(current.size() + 1 + word.size()) <= width) {
            current += ' ';
            current += word;
        } else {
            flush();
            current = word;
        }
    }
    flush();
    return lines;
}

// ── UTF-8 helpers ─────────────────────────────────────────────────────────────
// Repeat a (possibly multi-byte) string n times.
static std::string repeatStr(const std::string& s, int n) {
    std::string r;
    r.reserve(s.size() * (size_t)n);
    for (int i = 0; i < n; i++) r += s;
    return r;
}

// Count visible characters: skip UTF-8 continuation bytes (0x80–0xBF).
static int visWidth(const std::string& s) {
    int w = 0;
    for (unsigned char c : s)
        if ((c & 0xC0) != 0x80) w++;
    return w;
}

// ── Boxed terminal output ─────────────────────────────────────────────────────
static void printBox(const std::string& text) {
    const int BOX_WIDTH = 64;   // visible chars per text line
    const int INNER     = BOX_WIDTH + 2; // space between │ borders (2 padding each side)

    const std::string H = "─";
    const std::string SP = " ";

    std::string label   = " mygit-bot ";
    int labelVis        = visWidth(label) + 1; // +1 for leading dash
    int fillCount       = INNER + 2 - 2 - labelVis;
    if (fillCount < 0) fillCount = 0;

    std::string topLine  = "╭" + H + label + repeatStr(H, fillCount) + "╮";
    std::string botLine  = "╰" + repeatStr(H, INNER)                 + "╯";
    std::string emptyRow = "│" + repeatStr(SP, INNER)                 + "│";

    auto pad = [&](const std::string& s) {
        int n = BOX_WIDTH - visWidth(s);
        return repeatStr(SP, n < 0 ? 0 : n);
    };

    std::cout << "\n" << topLine << "\n" << emptyRow << "\n";
    for (const auto& line : wrapText(text, BOX_WIDTH))
        std::cout << "│  " << line << pad(line) << "  │\n";
    std::cout << emptyRow << "\n" << botLine << "\n\n";
}

// ── JSON-escape a string for embedding in a JSON body ─────────────────────────
static std::string jsonEscape(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    for (char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:   out += c;      break;
        }
    }
    return out;
}

// ── Pick the model to use (alternates between the two on each call) ───────────
// Models: llama-3.3-70b-versatile, qwen/qwen3-32b
static const char* GROQ_MODELS[] = {
    "llama-3.3-70b-versatile",
    "qwen/qwen3-32b"
};
static int s_modelIdx = 0;

// ── Public entry point ────────────────────────────────────────────────────────
void explainOperation(const std::string& command, const std::string& details) {
    const char* apiKey = std::getenv("GROQ_API_KEY");
    if (!apiKey || std::string(apiKey).empty()) {
        std::cerr << "[mygit-bot] GROQ_API_KEY not set — skipping explanation.\n";
        return;
    }

    // Pick model and advance the index for next call
    std::string model = GROQ_MODELS[s_modelIdx % 2];
    s_modelIdx++;

    // ── Prompt ───────────────────────────────────────────────────────────────
    std::string prompt =
        "You are an embedded AI tutor inside a custom version control system called mygit.\n"
        "The user just ran: " + command + "\n"
        "Internal details: " + details + "\n\n"
        "Explain in exactly 4 sentences what happened INTERNALLY — "
        "what files were read or written, what data structures were used, "
        "what the C++ code actually did behind the scenes. "
        "Be specific. Use technical terms. Speak directly to the user. "
        "End your 4th sentence with one insight they would not have known otherwise. "
        "Do not use markdown, bullet points, or headers. Plain prose only.";

    // ── OpenAI-compatible request body (Groq) ────────────────────────────────
    std::string body =
        "{"
        "\"model\":\"" + model + "\","
        "\"max_tokens\":512,"
        "\"messages\":[{\"role\":\"user\",\"content\":\"" + jsonEscape(prompt) + "\"}]"
        "}";

    std::cerr << "[mygit-bot] Using model: " << model << "\n";

    // ── libcurl POST ──────────────────────────────────────────────────────────
    CURL* curl = curl_easy_init();
    if (!curl) {
        std::cerr << "[mygit-bot] Failed to initialize curl.\n";
        return;
    }

    std::string response;
    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    headers = curl_slist_append(headers,
        ("Authorization: Bearer " + std::string(apiKey)).c_str());

    curl_easy_setopt(curl, CURLOPT_URL, "https://api.groq.com/openai/v1/chat/completions");
    curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, body.c_str());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, (long)body.size());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, writeCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_setopt(curl, CURLOPT_TIMEOUT, 30L);

    CURLcode res = curl_easy_perform(curl);
    curl_slist_free_all(headers);
    curl_easy_cleanup(curl);

    if (res != CURLE_OK) {
        std::cerr << "[mygit-bot] curl error: " << curl_easy_strerror(res) << "\n";
        return;
    }

    std::string text = extractContent(response);
    if (text.empty()) {
        std::cerr << "[mygit-bot] Could not parse DeepSeek response.\n";
        std::cerr << "Raw: " << response.substr(0, 400) << "\n";
        return;
    }

    printBox(text);
}
