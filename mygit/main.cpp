#include <iostream>
#include <string>
#include <vector>
#include <filesystem>

#include "commands/init.hpp"
#include "ai/bot.hpp"

namespace fs = std::filesystem;

static void usage() {
    std::cerr
        << "Usage:\n"
        << "  mygit init\n"
        << "  mygit add <file>\n"
        << "  mygit commit \"<message>\"\n"
        << "  mygit log\n"
        << "  mygit checkout <commit-id>\n"
        << "  mygit merge <branch>\n"
        << "  mygit revert <commit-id>\n";
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        usage();
        return 1;
    }

    std::string cmd = argv[1];
    std::vector<std::string> args;
    for (int i = 2; i < argc; i++) args.push_back(argv[i]);

    // ── init ─────────────────────────────────────────────────────────────────
    if (cmd == "init") {
        std::string details = runInit();
        if (!details.empty()) {
            explainOperation("mygit init", details);
        }
        return 0;
    }

    // ── guard: all other commands require .mygit/ to exist ───────────────────
    if (!fs::exists(".mygit")) {
        std::cerr << "Error: not a mygit repository. Run 'mygit init' first.\n";
        return 1;
    }

    // ── placeholder stubs for commands to be added in future steps ───────────
    if (cmd == "add") {
        if (args.empty()) {
            std::cerr << "Usage: mygit add <file>\n";
            return 1;
        }
        std::cout << "[stub] mygit add — not yet implemented. Say 'next' to build it.\n";
        return 0;
    }

    if (cmd == "commit") {
        if (args.empty()) {
            std::cerr << "Usage: mygit commit \"<message>\"\n";
            return 1;
        }
        std::cout << "[stub] mygit commit — not yet implemented. Say 'next' to build it.\n";
        return 0;
    }

    if (cmd == "log") {
        std::cout << "[stub] mygit log — not yet implemented. Say 'next' to build it.\n";
        return 0;
    }

    if (cmd == "checkout") {
        if (args.empty()) {
            std::cerr << "Usage: mygit checkout <commit-id>\n";
            return 1;
        }
        std::cout << "[stub] mygit checkout — not yet implemented. Say 'next' to build it.\n";
        return 0;
    }

    if (cmd == "merge") {
        if (args.empty()) {
            std::cerr << "Usage: mygit merge <branch>\n";
            return 1;
        }
        std::cout << "[stub] mygit merge — not yet implemented. Say 'next' to build it.\n";
        return 0;
    }

    if (cmd == "revert") {
        if (args.empty()) {
            std::cerr << "Usage: mygit revert <commit-id>\n";
            return 1;
        }
        std::cout << "[stub] mygit revert — not yet implemented. Say 'next' to build it.\n";
        return 0;
    }

    std::cerr << "Unknown command: " << cmd << "\n";
    usage();
    return 1;
}
