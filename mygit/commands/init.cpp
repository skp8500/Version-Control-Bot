#include "init.hpp"
#include "../utils/file.hpp"
#include <filesystem>
#include <iostream>
#include <string>

namespace fs = std::filesystem;

std::string runInit() {
    const std::string root = ".mygit";

    if (fs::exists(root)) {
        std::cerr << "Error: .mygit/ already exists. Repository already initialized.\n";
        return "";
    }

    // Create directory tree
    fs::create_directories(root + "/commits");
    fs::create_directories(root + "/refs/heads");

    // HEAD points at main branch ref (which doesn't exist yet — that's normal)
    writeFile(root + "/HEAD", "ref: refs/heads/main\n");

    // Empty staging index
    writeFile(root + "/index", "");

    std::cout << "Initialized empty mygit repository in .mygit/\n";

    return "Created .mygit/ directory tree: .mygit/commits/ (object store for commit snapshots), "
           ".mygit/refs/heads/ (branch tip pointers), "
           ".mygit/HEAD (set to 'ref: refs/heads/main' — a symbolic ref to the main branch, "
           "which does not exist yet because no commits have been made), "
           "and .mygit/index (empty staging area). "
           "djb2 hash function will be used to name commit folders. "
           "All subsequent commands require this directory to be present.";
}
