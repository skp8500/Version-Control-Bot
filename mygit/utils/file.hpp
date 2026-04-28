#pragma once
#include <string>
#include <vector>

std::string readFile(const std::string& path);
void writeFile(const std::string& path, const std::string& content);
std::vector<std::string> readLines(const std::string& path);
void appendLine(const std::string& path, const std::string& line);
bool fileExists(const std::string& path);
