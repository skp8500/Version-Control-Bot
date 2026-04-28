#pragma once
#include <string>

// Calls Claude API and prints a boxed explanation of what just happened.
// command  : e.g. "mygit init"
// details  : internal details about what the command did (files written, etc.)
void explainOperation(const std::string& command, const std::string& details);
