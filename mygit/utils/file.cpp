#include "file.hpp"
#include <fstream>
#include <sstream>
#include <stdexcept>

std::string readFile(const std::string& path) {
    std::ifstream f(path);
    if (!f.is_open()) {
        throw std::runtime_error("Cannot open file: " + path);
    }
    std::ostringstream ss;
    ss << f.rdbuf();
    return ss.str();
}

void writeFile(const std::string& path, const std::string& content) {
    std::ofstream f(path, std::ios::trunc);
    if (!f.is_open()) {
        throw std::runtime_error("Cannot write file: " + path);
    }
    f << content;
}

std::vector<std::string> readLines(const std::string& path) {
    std::vector<std::string> lines;
    std::ifstream f(path);
    if (!f.is_open()) return lines;
    std::string line;
    while (std::getline(f, line)) {
        if (!line.empty()) lines.push_back(line);
    }
    return lines;
}

void appendLine(const std::string& path, const std::string& line) {
    std::ofstream f(path, std::ios::app);
    if (!f.is_open()) {
        throw std::runtime_error("Cannot append to file: " + path);
    }
    f << line << "\n";
}

bool fileExists(const std::string& path) {
    std::ifstream f(path);
    return f.good();
}
