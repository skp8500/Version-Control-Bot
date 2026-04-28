#include "bot.hpp"
#include <curl/curl.h>
#include <iostream>
#include <sstream>
#include <string>
#include <cstdlib>
#include <algorithm>
#include <vector>

// ── libcurl write callback ────────────────────────────────────────────────────
static size_t writeCallback(char* ptr, size_t size, size_t nmemb, std::string* out) {
    out->append(ptr, size * nmemb);
    return size * nmemb;
}

// ── Minimal JSON string extractor ────────────────────────────────────────────
// Finds the value of "text": "..." in the Claude response body.
// Handles basic escape sequences.
static std::string extractTextField(const std::string& json) {
    const std::string key = "\"text\":";
    size_t pos = json.find(key);
    if (pos == std::string::npos) return "";

    pos += key.size();
    while (pos < json.size() && (json[pos] == ' ' || json[pos] == '\n')) pos++;
    if (pos >= json.size() || json[pos] != '"') return "";
    pos++; // skip opening quote

    std::string result;
    while (pos < json.size()) {
        char c = json[pos++];
        if (c == '\\' && pos < json.size()) {
            char esc = json[pos++];
            switch (esc) {
                case 'n': result += '\n'; break;
                case 't': result += '\t'; break;
                case '"': result += '"'; break;
                case '\\': result += '\\'; break;
                default:   result += esc; break;
            }
        } else if (c == '"') {
            break;
        } else {
            result += c;
        }
    }
    return result;
}

// ── Word-wrap a string to a given width ──────────────────────────────────────
static std::vector<std::string> wrapText(const std::string& text, int width) {
    std::vector<std::string> lines;
    std::istringstream iss(text);
    std::string word, current;

    auto flush = [&]() {
        if (!current.empty()) {
            lines.push_back(current);
            current.clear();
        }
    };

    while (iss >> word) {
        if (word == "\n" || word == "\\n") {
            flush();
            continue;
        }
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

// ── Repeat a UTF-8 string n times ────────────────────────────────────────────
static std::string repeatStr(const std::string& s, int n) {
    std::string result;
    result.reserve(s.size() * (size_t)n);
    for (int i = 0; i < n; i++) result += s;
    return result;
}

// Count visible (non-ASCII multi-byte) characters in a UTF-8 string.
// Each byte in [0x80,0xBF] is a continuation byte — skip it for width.
static int visWidth(const std::string& s) {
    int w = 0;
    for (unsigned char c : s) {
        if ((c & 0xC0) != 0x80) w++; // count only leading bytes
    }
    return w;
}

// ── Print the boxed output ────────────────────────────────────────────────────
static void printBox(const std::string& text) {
    const int BOX_WIDTH = 64; // inner text width in visible chars
    // Full inner width = BOX_WIDTH + 2 spaces on each side + 2 border chars = BOX_WIDTH + 4 visible
    const int INNER = BOX_WIDTH + 2; // padding between the │ borders

    // repeat-string helpers for UTF-8 box chars
    const std::string HBAR = "─";
    const std::string SPACE = " ";

    // "╭─ mygit-bot ──...──╮"
    //  visible: 1 + 1 + label + fill + 1 = INNER + 2
    std::string label = " mygit-bot ";
    int labelVis = visWidth(label) + 1; // +1 for the leading "─"
    int fillCount = INNER + 2 - 2 - labelVis; // total visible - two corner chars - label+leading dash
    if (fillCount < 0) fillCount = 0;

    std::string topLine = "╭" + HBAR + label + repeatStr(HBAR, fillCount) + "╮";
    std::string botLine  = "╰" + repeatStr(HBAR, INNER + 2 - 2) + "╯";
    std::string emptyRow = "│" + repeatStr(SPACE, INNER + 2 - 2) + "│";

    auto pad = [&](const std::string& s) {
        int spaces = BOX_WIDTH - visWidth(s);
        if (spaces < 0) spaces = 0;
        return repeatStr(SPACE, spaces);
    };

    std::cout << "\n" << topLine << "\n";
    std::cout << emptyRow << "\n";

    auto lines = wrapText(text, BOX_WIDTH);
    for (const auto& line : lines) {
        std::cout << "│  " << line << pad(line) << "  │\n";
    }

    std::cout << emptyRow << "\n";
    std::cout << botLine << "\n\n";
}

// ── Main entry point ──────────────────────────────────────────────────────────
void explainOperation(const std::string& command, const std::string& details) {
    const char* apiKey = std::getenv("ANTHROPIC_API_KEY");
    if (!apiKey || std::string(apiKey).empty()) {
        std::cerr << "[mygit-bot] ANTHROPIC_API_KEY not set — skipping explanation.\n";
        return;
    }

    // ── Build the prompt ─────────────────────────────────────────────────────
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

    // ── Build JSON body ───────────────────────────────────────────────────────
    // Manually escape the prompt for embedding in JSON
    std::string escaped;
    for (char c : prompt) {
        switch (c) {
            case '"':  escaped += "\\\""; break;
            case '\\': escaped += "\\\\"; break;
            case '\n': escaped += "\\n";  break;
            case '\r': escaped += "\\r";  break;
            case '\t': escaped += "\\t";  break;
            default:   escaped += c;      break;
        }
    }

    std::string body =
        "{"
        "\"model\":\"claude-sonnet-4-20250514\","
        "\"max_tokens\":512,"
        "\"messages\":[{\"role\":\"user\",\"content\":\"" + escaped + "\"}]"
        "}";

    // ── libcurl HTTP POST ────────────────────────────────────────────────────
    CURL* curl = curl_easy_init();
    if (!curl) {
        std::cerr << "[mygit-bot] Failed to initialize curl.\n";
        return;
    }

    std::string response;
    struct curl_slist* headers = nullptr;
    headers = curl_slist_append(headers, "Content-Type: application/json");
    headers = curl_slist_append(headers, ("x-api-key: " + std::string(apiKey)).c_str());
    headers = curl_slist_append(headers, "anthropic-version: 2023-06-01");

    curl_easy_setopt(curl, CURLOPT_URL, "https://api.anthropic.com/v1/messages");
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

    std::string text = extractTextField(response);
    if (text.empty()) {
        std::cerr << "[mygit-bot] Could not parse API response.\n";
        std::cerr << "Raw: " << response.substr(0, 300) << "\n";
        return;
    }

    printBox(text);
}
